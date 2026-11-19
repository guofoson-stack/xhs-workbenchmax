import { NextResponse } from "next/server";
import { run } from "@/lib/db";
import { SCENES } from "@/lib/types";

/** 修改爆款笔记的场景标签（同一篇笔记的所有积木一起生效） */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const b = await req.json();
  if (typeof b.scene === "string") {
    if (b.scene && !SCENES.includes(b.scene)) return NextResponse.json({ error: "场景不在列表里" }, { status: 400 });
    run("update notes set scene = ? where id = ?", b.scene || null, id);
  }
  return NextResponse.json({ ok: true });
}
