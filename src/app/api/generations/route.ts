import { NextResponse, connection } from "next/server";
import { all, parseJsonCol } from "@/lib/db";

export async function GET() {
  await connection(); // 每次请求实时查库，不在构建时预渲染
  const items = all<Record<string, unknown>>("select * from generations order by created_at desc limit 50").map((g) => ({
    ...g,
    versions: parseJsonCol(g.versions, []),
  }));
  return NextResponse.json({ items });
}
