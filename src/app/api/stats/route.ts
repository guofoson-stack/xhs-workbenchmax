import { NextResponse, connection } from "next/server";
import { get } from "@/lib/db";
import { isPlaceholderKey, readSettings } from "@/lib/config";

export async function GET() {
  await connection(); // 每次请求实时查库，不在构建时预渲染
  try {
    const c = (t: string) => get<{ n: number }>(`select count(*) as n from ${t}`)?.n ?? 0;
    return NextResponse.json({ notes: c("notes"), elements: c("elements"), exams: c("exams"), generations: c("generations"), keyReady: !isPlaceholderKey(readSettings().aiApiKey) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
