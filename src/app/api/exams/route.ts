import { NextResponse, connection } from "next/server";
import { all, get, newId, run } from "@/lib/db";
import { errorResponse, requireUser } from "@/lib/session";

export async function GET() {
  await connection(); // 每次请求实时查库，不在构建时预渲染
  return NextResponse.json({ items: all("select * from exams order by updated_at desc") });
}

/** 新增或更新考情（按考试全称去重） */
export async function POST(req: Request) {
  let me;
  try {
    me = await requireUser();
  } catch (e) {
    return errorResponse(e);
  }
  const b = await req.json();
  if (!b.name || !b.category) return NextResponse.json({ error: "考试名称和类别必填" }, { status: 400 });
  const name = String(b.name).trim();
  const v = (x: unknown) => (x ? String(x) : null);
  const existing = get<{ id: string }>("select id from exams where name = ?", name);
  const id = existing?.id ?? newId();
  run(
    `insert into exams (id,name,short_name,category,subjects,exam_time,features,product,stage,sources,researched_at,info,created_by,updated_at)
     values (?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now','localtime'))
     on conflict(name) do update set short_name=excluded.short_name, category=excluded.category, subjects=excluded.subjects,
       exam_time=excluded.exam_time, features=excluded.features, product=excluded.product, stage=excluded.stage,
       sources=coalesce(excluded.sources, exams.sources), researched_at=coalesce(excluded.researched_at, exams.researched_at),
       info=excluded.info,
       updated_at=excluded.updated_at`,
    id,
    name,
    v(b.short_name),
    String(b.category),
    v(b.subjects),
    v(b.exam_time),
    v(b.features),
    v(b.product),
    v(b.stage),
    Array.isArray(b.sources) && b.sources.length ? JSON.stringify(b.sources) : null,
    b.researched ? new Date().toLocaleString("sv-SE") : null,
    b.info ? JSON.stringify(b.info) : null,
    me.id
  );
  return NextResponse.json({ item: get("select * from exams where id = ?", id) });
}
