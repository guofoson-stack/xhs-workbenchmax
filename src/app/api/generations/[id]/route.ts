import { NextResponse } from "next/server";
import { get, parseJsonCol, run, tx } from "@/lib/db";
import type { GeneratedVersion } from "@/lib/types";

interface Gen {
  id: string;
  versions: string;
  chosen: number | null;
  collects: number | null;
}

/**
 * 选用某个版本 / 保存修改 / 回填发布后的数据。
 * 第一次选用时，给被借鉴的积木「用过次数」+1；
 * 回填数据后，收藏第一次达到 100，给被借鉴的积木评分 +1（这就是「越用越准」）。
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const b = await req.json();
  const gen = get<Gen>("select id,versions,chosen,collects from generations where id = ?", id);
  if (!gen) return NextResponse.json({ error: "记录不存在" }, { status: 404 });

  const num = (v: unknown) => (v === undefined || v === "" || v === null ? null : Number(v));

  tx(() => {
    if (Array.isArray(b.versions)) run("update generations set versions = ? where id = ?", JSON.stringify(b.versions), id);
    if (b.chosen !== undefined) run("update generations set chosen = ? where id = ?", Number(b.chosen), id);
    if (b.post_url !== undefined) run("update generations set post_url = ? where id = ?", b.post_url || null, id);
    for (const k of ["likes", "collects", "comments"] as const) {
      if (b[k] !== undefined) run(`update generations set ${k} = ? where id = ?`, num(b[k]), id);
    }

    const versions = Array.isArray(b.versions) ? (b.versions as GeneratedVersion[]) : parseJsonCol<GeneratedVersion[]>(gen.versions, []);
    const chosen = b.chosen !== undefined ? Number(b.chosen) : gen.chosen;
    const refIds = Object.values(versions[chosen ?? -1]?.refs ?? {}).filter(Boolean) as string[];
    if (!refIds.length) return;
    const marks = refIds.map(() => "?").join(",");

    if (b.chosen !== undefined && gen.chosen === null) {
      run(`update elements set use_count = use_count + 1 where id in (${marks})`, ...refIds);
    }
    const collects = num(b.collects);
    if (collects !== null && collects >= 100 && (gen.collects ?? 0) < 100) {
      run(`update elements set rating = min(5, rating + 1) where id in (${marks})`, ...refIds);
    }
  });
  return NextResponse.json({ ok: true });
}
