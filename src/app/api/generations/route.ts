import { NextResponse, connection } from "next/server";
import { db } from "@/lib/supabase";

export async function GET() {
  await connection(); // 每次请求实时查库，不在构建时预渲染
  const { data, error } = await db()
    .from("generations")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data });
}
