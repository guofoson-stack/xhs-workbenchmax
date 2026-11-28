import { NextResponse } from "next/server";
import { parseInfo } from "@/lib/examInfo";
import { supplementInfo } from "@/lib/research";

export const maxDuration = 120;

/** 粘贴资料补充：{ name, info, text } → 合并后的考情（不直接保存，前端确认后再存） */
export async function POST(req: Request) {
  try {
    const { name, info, text } = await req.json();
    const cur = parseInfo(info);
    if (!cur) return NextResponse.json({ error: "现有考情读不出来" }, { status: 400 });
    if (!String(text ?? "").trim()) return NextResponse.json({ error: "请先贴入资料" }, { status: 400 });
    return NextResponse.json(await supplementInfo(String(name ?? ""), cur, String(text).slice(0, 30000)));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
