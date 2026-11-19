import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";

/** 爆款库列表：可按类型、考试类别、关键词筛选 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  let q = db().from("element_view").select("*").limit(200);
  const type = sp.get("type");
  const category = sp.get("category");
  const kw = sp.get("q");
  if (type) q = q.eq("type", type);
  if (category) q = q.eq("exam_category", category);
  if (kw) q = q.or(`template.ilike.%${kw.replace(/[%,()]/g, "")}%,note_title.ilike.%${kw.replace(/[%,()]/g, "")}%`);
  const sort = sp.get("sort") === "new" ? "created_at" : "heat";
  q = q.order("rating", { ascending: false }).order(sort, { ascending: false });
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data });
}
