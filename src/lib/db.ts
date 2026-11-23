import "server-only";
import fs from "node:fs";
import path from "node:path";
import { WORKBENCH_HOME } from "@/lib/config";

/**
 * 本地数据库：用 Node.js 自带的 SQLite（Node 22.13+ 内置），不用装任何数据库软件。
 * 所有数据都在「用户目录\爆款工作台数据\data」里（不在程序文件夹，换版本不丢）：
 *   data/workbench.db   数据库
 *   data/covers/        入库笔记的原封面
 *   data/backups/       每天自动备份一次，保留最近 30 份
 * 换电脑时把整个「爆款工作台数据」文件夹拷走就行。
 */

type Value = string | number | null;
interface Stmt {
  run(...params: Value[]): { changes: number | bigint };
  get(...params: Value[]): Record<string, unknown> | undefined;
  all(...params: Value[]): Record<string, unknown>[];
}
interface Database {
  exec(sql: string): void;
  prepare(sql: string): Stmt;
}

export const DATA_DIR = path.join(/*turbopackIgnore: true*/ WORKBENCH_HOME, "data");
export const COVER_DIR = path.join(DATA_DIR, "covers");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const DB_FILE = path.join(DATA_DIR, "workbench.db");

const SCHEMA = `
create table if not exists exams (
  id text primary key,
  name text not null unique,
  short_name text,
  category text not null,
  subjects text,
  exam_time text,
  features text,
  product text,
  updated_at text not null default (datetime('now','localtime'))
);

create table if not exists notes (
  id text primary key,
  url text unique,
  title text not null,
  body text,
  cover_text text,
  cover_path text,
  likes integer default 0,
  collects integer default 0,
  comments integer default 0,
  exam_name text,
  exam_category text,
  account_type text,
  summary text,
  published_at text,
  created_at text not null default (datetime('now','localtime'))
);

create table if not exists elements (
  id text primary key,
  note_id text not null references notes(id) on delete cascade,
  type text not null check (type in ('title','cover','structure','hook','cta','tags')),
  template text not null,
  pattern text,
  detail text default '{}',
  rating integer default 3 check (rating between 1 and 5),
  use_count integer default 0,
  created_at text not null default (datetime('now','localtime'))
);
create index if not exists elements_type_idx on elements(type);
create index if not exists elements_note_idx on elements(note_id);

create table if not exists users (
  id text primary key,
  name text not null unique,
  password_hash text not null,
  role text not null default 'staff' check (role in ('admin','staff')),
  active integer not null default 1,
  created_at text not null default (datetime('now','localtime'))
);

create table if not exists generations (
  id text primary key,
  exam_id text references exams(id) on delete set null,
  exam_input text not null,
  versions text not null,
  chosen integer,
  post_url text,
  likes integer,
  collects integer,
  comments integer,
  created_at text not null default (datetime('now','localtime'))
);

`;

declare global {
  var __workbenchDb: Database | undefined;
}

function open(): Database {
  fs.mkdirSync(COVER_DIR, { recursive: true });
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  // 用 getBuiltinModule 加载，避免打包工具去解析 node:sqlite
  const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as {
    DatabaseSync: new (file: string) => Database;
  };
  const d = new DatabaseSync(DB_FILE);
  d.exec("pragma journal_mode = WAL; pragma foreign_keys = ON; pragma busy_timeout = 5000;");
  d.exec(SCHEMA);
  migrate(d);
  backup(d);
  return d;
}

const ELEMENT_VIEW = `
create view element_view as
select e.*,
       n.title as note_title,
       n.url as note_url,
       n.exam_category,
       n.exam_name,
       n.account_type,
       n.scene,
       n.created_by as collector_id,
       n.review,
       (select name from users u where u.id = n.created_by) as collector,
       n.likes as note_likes,
       n.collects as note_collects,
       coalesce(n.likes,0) + coalesce(n.collects,0) + 2*coalesce(n.comments,0) as heat
from elements e join notes n on n.id = e.note_id
where n.review != 'rejected';
`;

/** 旧版数据库补字段（新版本加的列） */
function migrate(d: Database) {
  const colsOf = (t: string) => new Set(d.prepare(`pragma table_info(${t})`).all().map((r) => String(r.name)));
  const noteCols = colsOf("notes");
  if (!noteCols.has("scene")) d.exec("alter table notes add column scene text");
  // 记录是谁做的（旧数据为空，看板里显示「未登记」）
  for (const t of ["notes", "generations", "exams"]) {
    if (!colsOf(t).has("created_by")) d.exec(`alter table ${t} add column created_by text`);
  }
  // 入库审核：ok 通过（旧数据默认通过）/ pending 待审核 / rejected 退回（不进爆款库、不算指标）
  if (!noteCols.has("review")) d.exec("alter table notes add column review text not null default 'ok'");
  for (const c of ["review_note", "reviewed_by", "reviewed_at"]) if (!noteCols.has(c)) d.exec(`alter table notes add column ${c} text`);
  // 视图每次启动重建，保证带上新字段
  d.exec("drop view if exists element_view;" + ELEMENT_VIEW);
  const cols = new Set(d.prepare("pragma table_info(exams)").all().map((r) => String(r.name)));
  const add: Record<string, string> = {
    stage: "text", // 当前阶段：如「笔试已结束，等出成绩」
    sources: "text", // AI 搜索考情时用到的来源（JSON）
    researched_at: "text",
    info: "text", // 结构化考情（时间线 / 科目 / 关键信息，JSON）
  };
  for (const [c, t] of Object.entries(add)) if (!cols.has(c)) d.exec(`alter table exams add column ${c} ${t}`);
}

/** 每天第一次启动时备份一份，保留 30 份 */
function backup(d: Database) {
  try {
    const today = new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD
    const file = path.join(BACKUP_DIR, `workbench-${today}.db`);
    if (fs.existsSync(file)) return;
    d.exec(`vacuum into '${file.replace(/'/g, "''")}'`);
    const old = fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith(".db")).sort();
    old.slice(0, Math.max(0, old.length - 30)).forEach((f) => fs.rmSync(path.join(BACKUP_DIR, f)));
  } catch (e) {
    console.warn("自动备份失败：", e);
  }
}

export function db(): Database {
  if (!globalThis.__workbenchDb) globalThis.__workbenchDb = open();
  return globalThis.__workbenchDb;
}

export const newId = () => crypto.randomUUID();

export function all<T = Record<string, unknown>>(sql: string, ...params: Value[]): T[] {
  return db().prepare(sql).all(...params) as T[];
}
export function get<T = Record<string, unknown>>(sql: string, ...params: Value[]): T | undefined {
  return db().prepare(sql).get(...params) as T | undefined;
}
export function run(sql: string, ...params: Value[]) {
  return db().prepare(sql).run(...params);
}
/** 事务：中途出错整体回滚 */
export function tx<T>(fn: () => T): T {
  db().exec("begin");
  try {
    const r = fn();
    db().exec("commit");
    return r;
  } catch (e) {
    db().exec("rollback");
    throw e;
  }
}

export function parseJsonCol<T>(v: unknown, fallback: T): T {
  if (typeof v !== "string") return fallback;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
}
