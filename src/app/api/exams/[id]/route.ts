import { NextResponse } from "next/server";
import { run } from "@/lib/db";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  run("delete from exams where id = ?", id);
  return NextResponse.json({ ok: true });
}
