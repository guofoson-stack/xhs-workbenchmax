import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import type { GeneratedVersion } from "@/lib/types";

/**
 * 选用某个版本 / 回填发布后的数据。
 * 选用时给被借鉴的积木 use_count +1；回填数据后，如果效果好（收藏 ≥ 100），给借鉴的积木评分 +1。
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const b = await req.json();
  const { data: gen, error } = await db().from("generations").select("*").eq("id", id).single();
  if (error || !gen) return NextResponse.json({ error: "记录不存在" }, { status: 404 });

  const patch: Record<string, unknown> = {};
  if (b.chosen !== undefined) patch.chosen = Number(b.chosen);
  for (const k of ["likes", "collects", "comments"]) if (b[k] !== undefined && b[k] !== "") patch[k] = Number(b[k]);
  if (b.post_url !== undefined) patch.post_url = b.post_url || null;
  if (Array.isArray(b.versions)) patch.versions = b.versions; // 保存人工修改后的版本
  await db().from("generations").update(patch).eq("id", id);

  const chosen = (patch.chosen ?? gen.chosen) as number | null;
  const version: GeneratedVersion | undefined = chosen != null ? gen.versions?.[chosen] : undefined;
  const refIds = Object.values(version?.refs ?? {}).filter(Boolean) as string[];

  if (refIds.length && b.chosen !== undefined && gen.chosen == null) {
    const { data: els } = await db().from("elements").select("id,use_count").in("id", refIds);
    for (const el of els ?? []) {
      await db().from("elements").update({ use_count: (el.use_count ?? 0) + 1 }).eq("id", el.id);
    }
  }

  const collects = Number(patch.collects ?? gen.collects ?? 0);
  if (refIds.length && b.collects !== undefined && collects >= 100 && (gen.collects ?? 0) < 100) {
    const { data: els } = await db().from("elements").select("id,rating").in("id", refIds);
    for (const el of els ?? []) {
      await db().from("elements").update({ rating: Math.min(5, (el.rating ?? 3) + 1) }).eq("id", el.id);
    }
  }
  return NextResponse.json({ ok: true });
}
