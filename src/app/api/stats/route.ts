import { NextResponse, connection } from "next/server";
import { db } from "@/lib/supabase";

export async function GET() {
  await connection(); // 每次请求实时查库，不在构建时预渲染
  try {
    const count = async (t: string) => (await db().from(t).select("id", { count: "exact", head: true })).count ?? 0;
    const [notes, elements, exams, generations] = await Promise.all([
      count("notes"),
      count("elements"),
      count("exams"),
      count("generations"),
    ]);
    return NextResponse.json({ notes, elements, exams, generations });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
