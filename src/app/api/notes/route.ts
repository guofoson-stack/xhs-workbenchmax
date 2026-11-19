import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import type { ElementDraft } from "@/lib/types";

/** 入库：人工确认后的笔记 + 积木一起保存 */
export async function POST(req: Request) {
  try {
    const { note, elements } = (await req.json()) as {
      note: Record<string, unknown>;
      elements: ElementDraft[];
    };
    if (!note?.title) return NextResponse.json({ error: "缺少标题" }, { status: 400 });

    const row = {
      url: note.url || null,
      title: note.title,
      body: note.body ?? null,
      cover_text: note.cover_text ?? null,
      cover_path: note.cover_path ?? null,
      likes: Number(note.likes) || 0,
      collects: Number(note.collects) || 0,
      comments: Number(note.comments) || 0,
      exam_name: note.exam_name ?? null,
      exam_category: note.exam_category ?? null,
      account_type: note.account_type ?? null,
      summary: note.summary ?? null,
      published_at: note.published_at || null,
    };

    const { data: saved, error } = await db().from("notes").insert(row).select("id").single();
    if (error) {
      const msg = error.code === "23505" ? "这条链接已经入过库了" : error.message;
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const rows = (elements ?? [])
      .filter((e) => e.template?.trim())
      .map((e) => ({
        note_id: saved.id,
        type: e.type,
        template: e.template.trim(),
        pattern: e.pattern ?? null,
        detail: e.detail ?? {},
        rating: Math.min(5, Math.max(1, Number(e.rating) || 3)),
      }));
    if (rows.length) {
      const { error: e2 } = await db().from("elements").insert(rows);
      if (e2) return NextResponse.json({ error: e2.message }, { status: 400 });
    }
    return NextResponse.json({ id: saved.id, count: rows.length });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
