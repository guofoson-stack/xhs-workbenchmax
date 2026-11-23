import { NextResponse } from "next/server";
import { dupMessage } from "@/lib/dup";
import { normalizeRaw, type RawNote } from "@/lib/xhs";

export const maxDuration = 60;

/** 浏览器书签采集过来的笔记：整理格式、下载封面、检查是否已入库 */
export async function POST(req: Request) {
  try {
    const raw = (await req.json()) as RawNote;
    if (!raw?.title && !raw?.desc) return NextResponse.json({ error: "没收到笔记内容" }, { status: 400 });
    const note = await normalizeRaw(raw);
    const dup = dupMessage(note.url);
    return NextResponse.json({ note, duplicate: dup });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
