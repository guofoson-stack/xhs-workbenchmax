import { NextResponse } from "next/server";
import { researchExam, researchPapers } from "@/lib/research";

export const maxDuration = 180;

/**
 * AI 搜索考情：返回草稿，人工确认后再由 /api/exams 保存。
 * { name }：完整搜索（公告、时间线、题型题量一起）；{ name, only: "papers" }：只补搜题型题量。
 */
export async function POST(req: Request) {
  try {
    const { name, only } = await req.json();
    if (!String(name ?? "").trim()) return NextResponse.json({ error: "请输入要搜索的考试名称" }, { status: 400 });
    if (only === "papers") return NextResponse.json({ papers: await researchPapers(String(name)) });
    return NextResponse.json({ result: await researchExam(String(name)) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
