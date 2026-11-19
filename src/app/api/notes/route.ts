import { NextResponse } from "next/server";
import { get, newId, run, tx } from "@/lib/db";
import type { ElementDraft } from "@/lib/types";

const TYPES = new Set(["title", "cover", "structure", "hook", "cta", "tags"]);
const s = (v: unknown) => (v === undefined || v === null || v === "" ? null : String(v));

/** 入库：人工确认后的笔记 + 积木一起保存 */
export async function POST(req: Request) {
  try {
    const { note, elements } = (await req.json()) as {
      note: Record<string, unknown>;
      elements: ElementDraft[];
    };
    if (!note?.title) return NextResponse.json({ error: "缺少标题" }, { status: 400 });
    const url = s(note.url);
    if (url && get("select id from notes where url = ?", url)) {
      return NextResponse.json({ error: "这条链接已经入过库了" }, { status: 400 });
    }

    const id = newId();
    const rows = (elements ?? []).filter((e) => e.template?.trim() && TYPES.has(e.type));
    tx(() => {
      run(
        `insert into notes (id,url,title,body,cover_text,cover_path,likes,collects,comments,exam_name,exam_category,account_type,summary,published_at)
         values (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        id,
        url,
        String(note.title),
        s(note.body),
        s(note.cover_text),
        s(note.cover_path),
        Number(note.likes) || 0,
        Number(note.collects) || 0,
        Number(note.comments) || 0,
        s(note.exam_name),
        s(note.exam_category),
        s(note.account_type),
        s(note.summary),
        s(note.published_at)
      );
      for (const e of rows) {
        run(
          "insert into elements (id,note_id,type,template,pattern,detail,rating) values (?,?,?,?,?,?,?)",
          newId(),
          id,
          e.type,
          e.template.trim(),
          s(e.pattern),
          JSON.stringify(e.detail ?? {}),
          Math.min(5, Math.max(1, Number(e.rating) || 3))
        );
      }
    });
    return NextResponse.json({ id, count: rows.length });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
