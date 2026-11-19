import { NextResponse } from "next/server";
import { run } from "@/lib/db";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json();
  if (body.rating !== undefined) run("update elements set rating = ? where id = ?", Math.min(5, Math.max(1, Number(body.rating))), id);
  if (typeof body.template === "string") run("update elements set template = ? where id = ?", body.template, id);
  if (typeof body.pattern === "string") run("update elements set pattern = ? where id = ?", body.pattern, id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  run("delete from elements where id = ?", id);
  return NextResponse.json({ ok: true });
}
