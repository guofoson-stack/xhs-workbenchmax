import "server-only";
import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { readSettings } from "@/lib/config";

/**
 * 调用本机的 OpenCLI（github.com/jackwener/opencli）搜小红书。
 * OpenCLI 通过 Chrome 里的 Browser Bridge 扩展，用这台电脑 Chrome 里已经登录的小红书去搜，所以：
 *   - 工作台所在的电脑要装好 opencli，并且 Chrome 开着、扩展已连接、小红书已登录
 *   - 只用只读命令（search / note / comments），相邻两次间隔 2.5 秒，避免账号被风控
 */

export class OpencliError extends Error {
  constructor(
    message: string,
    public code: string
  ) {
    super(message);
  }
}

const EXIT_HINT: Record<number, [string, string]> = {
  66: ["empty", "没有结果"],
  69: ["bridge", "Chrome 的 OpenCLI 扩展没连上：打开 Chrome，确认 Browser Bridge 扩展已启用"],
  75: ["timeout", "小红书响应超时"],
  77: ["auth", "Chrome 里的小红书没登录（或登录过期），请在 Chrome 打开小红书重新登录"],
  78: ["config", "OpenCLI 配置有问题，在命令行运行 opencli doctor 看看"],
};

/* ---------- 找到 opencli 程序 ---------- */

let cachedEntry: { cmd: string; pre: string[] } | null | undefined;

function npmRootGlobal(): Promise<string> {
  return new Promise((resolve) => {
    // 只在启动后第一次调用，参数固定，不含用户输入
    execFile(process.platform === "win32" ? "npm.cmd" : "npm", ["root", "-g"], { timeout: 15000, shell: process.platform === "win32" }, (err, out) =>
      resolve(err ? "" : String(out).trim())
    );
  });
}

/** node_modules 目录里找 @jackwener/opencli 的入口文件 */
function fromRoot(root: string): { cmd: string; pre: string[] } | null {
  const pkgFile = path.join(/*turbopackIgnore: true*/ root, "@jackwener", "opencli", "package.json");
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgFile, "utf8"));
    const bin = typeof pkg.bin === "string" ? pkg.bin : (pkg.bin?.opencli ?? Object.values(pkg.bin ?? {})[0]);
    return bin ? { cmd: process.execPath, pre: [path.join(path.dirname(pkgFile), String(bin))] } : null;
  } catch {
    return null;
  }
}

async function entry(): Promise<{ cmd: string; pre: string[] }> {
  const custom = readSettings().opencliPath.trim().replace(/^"|"$/g, "");
  if (custom) {
    if (!fs.existsSync(custom)) throw new OpencliError(`设置里填的 opencli 位置不存在：${custom}`, "missing");
    if (/\.(c|m)?js$/i.test(custom)) return { cmd: process.execPath, pre: [custom] };
    // 填的是 opencli.cmd / opencli.ps1 / npm 文件夹：找旁边 node_modules 里的入口文件
    const dir = fs.statSync(custom).isDirectory() ? custom : path.dirname(custom);
    const found = fromRoot(path.join(dir, "node_modules")) ?? fromRoot(dir);
    if (found) return found;
    if (process.platform !== "win32") return { cmd: custom, pre: [] };
    throw new OpencliError("设置里填的 opencli 位置找不到入口文件，请填 opencli.cmd 所在的文件夹", "missing");
  }
  if (cachedEntry !== undefined) {
    if (cachedEntry) return cachedEntry;
    throw new OpencliError("这台电脑没装 OpenCLI（命令行运行 npm install -g @jackwener/opencli 安装）", "missing");
  }
  // 直接用 node 运行 opencli 的入口文件，不经过命令行解释器，关键词里有空格、引号也不会出错
  const roots = [await npmRootGlobal()];
  if (process.env.APPDATA) roots.push(path.join(process.env.APPDATA, "npm", "node_modules"));
  for (const root of roots.filter(Boolean)) {
    const found = fromRoot(root);
    if (found) {
      cachedEntry = found;
      return found;
    }
  }
  if (process.platform !== "win32") {
    cachedEntry = { cmd: "opencli", pre: [] };
    return cachedEntry;
  }
  cachedEntry = null;
  throw new OpencliError("这台电脑没装 OpenCLI（命令行运行 npm install -g @jackwener/opencli 安装）", "missing");
}

/* ---------- 运行命令（排队，一次只跑一个） ---------- */

let queue: Promise<unknown> = Promise.resolve();
let lastRun = 0;
const GAP_MS = 2500;

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

function exec(args: string[], timeoutMs: number): Promise<{ code: number; out: string; err: string }> {
  return entry().then(
    (e) =>
      new Promise((resolve, reject) => {
        const profile = readSettings().opencliProfile.trim();
        const child = spawn(e.cmd, [...e.pre, ...args], {
          env: { ...process.env, ...(profile ? { OPENCLI_PROFILE: profile } : {}), NO_COLOR: "1", FORCE_COLOR: "0" },
          windowsHide: true,
        });
        let out = "";
        let err = "";
        child.stdout.setEncoding("utf8"); // 按 UTF-8 拼接，中文不会在分块处被截断
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", (d) => (out += d));
        child.stderr.on("data", (d) => (err += d));
        const timer = setTimeout(() => {
          child.kill();
          reject(new OpencliError("OpenCLI 运行超时", "timeout"));
        }, timeoutMs);
        child.on("error", (x: NodeJS.ErrnoException) => {
          clearTimeout(timer);
          reject(new OpencliError(x.code === "ENOENT" ? "这台电脑没装 OpenCLI" : `OpenCLI 启动失败：${x.message}`, "missing"));
        });
        child.on("close", (code) => {
          clearTimeout(timer);
          resolve({ code: code ?? 1, out: stripAnsi(out), err: stripAnsi(err) });
        });
      })
  );
}

function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastRun + GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    try {
      return await job();
    } finally {
      lastRun = Date.now();
    }
  });
  queue = run.catch(() => {});
  return run;
}

/** 跑一条 opencli 命令，返回 data；扩展没连上时自动重启一次后台再试 */
async function runJson<T>(args: string[], timeoutMs = 60000, retried = false): Promise<T> {
  const r = await enqueue(() => exec([...args, "-f", "json"], timeoutMs));
  let env: { ok?: boolean; data?: T; error?: { code?: string; message?: string; hint?: string } } | null = null;
  try {
    env = JSON.parse(r.out.slice(r.out.indexOf("{")).trim());
  } catch {
    try {
      env = { ok: r.code === 0, data: JSON.parse(r.out.slice(r.out.indexOf("[")).trim()) as T };
    } catch {}
  }
  if (r.code === 0 && env?.ok !== false) return (env?.data ?? (env as unknown as T)) as T;
  if (r.code === 66) return [] as unknown as T;
  if (r.code === 69 && !retried) {
    await enqueue(() => exec(["daemon", "restart"], 30000)).catch(() => {});
    await new Promise((res) => setTimeout(res, 4000));
    return runJson<T>(args, timeoutMs, true);
  }
  const [code, hint] = EXIT_HINT[r.code] ?? ["error", ""];
  const msg = env?.error?.message || r.err.split("\n").find((l) => l.trim() && !/Update available|Run: npm/.test(l)) || `退出码 ${r.code}`;
  throw new OpencliError(hint ? `${hint}（${msg.trim().slice(0, 120)}）` : `OpenCLI 出错：${msg.trim().slice(0, 160)}`, code);
}

/* ---------- 小红书 ---------- */

export interface XhsSearchItem {
  title: string;
  url: string;
  author: string;
  likes: number;
  published_at: string | null;
}

export interface XhsNote {
  url: string;
  title: string;
  author: string;
  content: string;
  likes: number;
  collects: number;
  comments: number;
  tags: string;
}

export interface XhsComment {
  author: string;
  text: string;
  likes: number;
  time: string;
}

/** 「1.2万」「赞」「356」→ 数字 */
export function num(v: unknown): number {
  const t = String(v ?? "").trim();
  const m = t.match(/([\d.]+)\s*(万|w|k|千)?/i);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const unit = m[2]?.toLowerCase();
  return Math.round(unit === "万" || unit === "w" ? n * 10000 : unit === "k" || unit === "千" ? n * 1000 : n);
}

const s = (v: unknown) => (v == null ? "" : String(v).trim());
const list = (d: unknown): Record<string, unknown>[] =>
  Array.isArray(d) ? d : Array.isArray((d as { items?: unknown })?.items) ? (d as { items: Record<string, unknown>[] }).items : [];

export async function xhsSearch(keyword: string): Promise<XhsSearchItem[]> {
  const data = await runJson<unknown>(["xiaohongshu", "search", keyword]);
  return list(data)
    .map((r) => ({
      title: s(r.title),
      url: s(r.url),
      author: s(r.author),
      likes: num(r.likes),
      published_at: s(r.published_at) || null,
    }))
    .filter((r) => r.url);
}

export async function xhsNote(url: string): Promise<XhsNote> {
  const data = await runJson<unknown>(["xiaohongshu", "note", url]);
  // 可能是 [{field, value}] 也可能是对象
  const o: Record<string, unknown> = Array.isArray(data)
    ? Object.fromEntries((data as { field?: string; value?: unknown }[]).map((r) => [s(r.field), r.value]))
    : ((data ?? {}) as Record<string, unknown>);
  return {
    url,
    title: s(o.title),
    author: s(o.author),
    content: s(o.content ?? o.desc),
    likes: num(o.likes),
    collects: num(o.collects),
    comments: num(o.comments),
    tags: Array.isArray(o.tags) ? o.tags.join(" ") : s(o.tags),
  };
}

export async function xhsComments(url: string): Promise<XhsComment[]> {
  const data = await runJson<unknown>(["xiaohongshu", "comments", url]);
  return list(data)
    .map((r) => ({ author: s(r.author), text: s(r.text ?? r.content), likes: num(r.likes), time: s(r.time) }))
    .filter((c) => c.text);
}

/** 设置页「检测」：opencli doctor 的结果 + 能不能真的搜 */
export async function opencliCheck(): Promise<{ ok: boolean; text: string }> {
  try {
    const r = await enqueue(() => exec(["doctor"], 60000));
    const text = (r.out + "\n" + r.err)
      .split("\n")
      .filter((l) => l.trim() && !/Update available|Run: npm|所在位置|CategoryInfo|FullyQualifiedErrorId|~~~|& "node/.test(l))
      .join("\n")
      .trim();
    const ok = /Extension:\s*connected/i.test(text) && !/\[FAIL\]/.test(text);
    return { ok, text: text.slice(0, 2000) };
  } catch (e) {
    return { ok: false, text: (e as Error).message };
  }
}
