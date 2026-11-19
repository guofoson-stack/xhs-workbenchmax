import { NextResponse, connection } from "next/server";
import { db } from "@/lib/supabase";

export async function GET() {
  await connection(); // 每次请求实时查库，不在构建时预渲染
  const { data, error } = await db().from("exams").select("*").order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data });
}

/** 新增或更新考情（按 name 去重） */
export async function POST(req: Request) {
  const b = await req.json();
  if (!b.name || !b.category) return NextResponse.json({ error: "考试名称和类别必填" }, { status: 400 });
  const row = {
    name: String(b.name).trim(),
    short_name: b.short_name || null,
    category: b.category,
    subjects: b.subjects || null,
    exam_time: b.exam_time || null,
    features: b.features || null,
    product: b.product || null,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await db().from("exams").upsert(row, { onConflict: "name" }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ item: data });
}
