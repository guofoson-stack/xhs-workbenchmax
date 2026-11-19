import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { chatJson } from "@/lib/ai";
import { decomposeSystem, decomposeUser } from "@/lib/prompts";
import { COVER_DIR, db } from "@/lib/db";
import type { DecomposeResult } from "@/lib/types";

export const maxDuration = 120;

/** 拆解：接收笔记内容 + 封面图，返回 AI 拆出来的积木（还没入库，等人工确认） */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const title = String(form.get("title") ?? "").trim();
    const body = String(form.get("body") ?? "").trim();
    if (!title || !body) return NextResponse.json({ error: "标题和正文都要填" }, { status: 400 });

    const num = (k: string) => {
      const v = Number(form.get(k));
      return Number.isFinite(v) ? v : undefined;
    };
    const userText = decomposeUser({
      title,
      body,
      cover_text: String(form.get("cover_text") ?? ""),
      likes: num("likes"),
      collects: num("collects"),
      comments: num("comments"),
    });

    const file = form.get("cover");
    let coverPath: string | null = null;
    const parts: ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[] = [
      { type: "text", text: userText },
    ];

    if (file instanceof File && file.size > 0) {
      if (file.size > 8 * 1024 * 1024) return NextResponse.json({ error: "封面图超过 8MB" }, { status: 400 });
      const buf = Buffer.from(await file.arrayBuffer());
      const mime = file.type || "image/jpeg";
      parts.push({ type: "image_url", image_url: { url: `data:${mime};base64,${buf.toString("base64")}` } });

      // 原封面存到 data/covers/日期/xxx.jpg
      const ext = ((file.name.split(".").pop() || "jpg").toLowerCase().match(/^[a-z0-9]{2,5}$/)?.[0]) ?? "jpg";
      const day = new Date().toLocaleDateString("sv-SE");
      coverPath = `${day}/${crypto.randomUUID()}.${ext}`;
      db(); // 确保 data 目录已建好
      await fs.mkdir(path.join(/*turbopackIgnore: true*/ COVER_DIR, day), { recursive: true });
      await fs.writeFile(path.join(/*turbopackIgnore: true*/ COVER_DIR, coverPath), buf);
    }

    const result = await chatJson<DecomposeResult>(
      [
        { role: "system", content: await decomposeSystem() },
        { role: "user", content: parts },
      ],
      { temperature: 0.3 }
    );
    result.elements = (result.elements ?? []).map((e) => ({ ...e, rating: 3 }));
    return NextResponse.json({ result, coverPath });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
