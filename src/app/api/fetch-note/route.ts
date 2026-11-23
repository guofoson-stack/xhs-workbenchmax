import { NextResponse } from "next/server";
import { dupMessage } from "@/lib/dup";
import { fetchNote } from "@/lib/xhs";

export const maxDuration = 60;

/** 粘贴链接 → 抓取笔记的标题、正文、点赞收藏评论、发布日期、封面 */
export async function POST(req: Request) {
  try {
    const { text } = await req.json();
    const note = await fetchNote(String(text ?? ""));
    const dup = dupMessage(note.url);
    return NextResponse.json({ note, duplicate: dup });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
