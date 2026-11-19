import { NextResponse, connection } from "next/server";
import { all, get, newId, run } from "@/lib/db";

export async function GET() {
  await connection(); // 每次请求实时查库，不在构建时预渲染
  return NextResponse.json({ items: all("select * from exams order by updated_at desc") });
}

/** 新增或更新考情（按考试全称去重） */
export async function POST(req: Request) {
  const b = await req.json();
  if (!b.name || !b.category) return NextResponse.json({ error: "考试名称和类别必填" }, { status: 400 });
  const name = String(b.name).trim();
  const v = (x: unknown) => (x ? String(x) : null);
  const existing = get<{ id: string }>("select id from exams where name = ?", name);
  const id = existing?.id ?? newId();
  run(
    `insert into exams (id,name,short_name,category,subjects,exam_time,features,product,updated_at)
     values (?,?,?,?,?,?,?,?,datetime('now','localtime'))
     on conflict(name) do update set short_name=excluded.short_name, category=excluded.category, subjects=excluded.subjects,
       exam_time=excluded.exam_time, features=excluded.features, product=excluded.product, updated_at=excluded.updated_at`,
    id,
    name,
    v(b.short_name),
    String(b.category),
    v(b.subjects),
    v(b.exam_time),
    v(b.features),
    v(b.product)
  );
  return NextResponse.json({ item: get("select * from exams where id = ?", id) });
}
