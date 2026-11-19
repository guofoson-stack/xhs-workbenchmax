import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json();
  const patch: Record<string, unknown> = {};
  if (body.rating !== undefined) patch.rating = Math.min(5, Math.max(1, Number(body.rating)));
  if (typeof body.template === "string") patch.template = body.template;
  if (typeof body.pattern === "string") patch.pattern = body.pattern;
  const { error } = await db().from("elements").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { error } = await db().from("elements").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
