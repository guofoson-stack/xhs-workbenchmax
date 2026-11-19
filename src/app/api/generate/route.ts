import { NextResponse } from "next/server";
import { chatJson } from "@/lib/ai";
import { generateSystem, generateUser } from "@/lib/prompts";
import { newId, run } from "@/lib/db";
import { examBlock } from "@/lib/retrieve";
import { allRules } from "@/lib/sensitiveStore";
import { avoidList } from "@/lib/sensitive";
import { loadContext, repairTitles, toVersion, type RawVersion } from "@/lib/genContext";
import { pickSources, sourcesBlock, type Source } from "@/lib/imitate";
import { errorResponse, requireUser } from "@/lib/session";

export const maxDuration = 240;

/**
 * 生成：考情 → 按阶段定选题场景 → 每一版指定一篇爆款去模仿 → 模型按模板填空 → 检查标题借鉴度，不够就返工
 */
export async function POST(req: Request) {
  try {
    const me = await requireUser();
    const b = await req.json();
    const { exam, input, category, mode, scenes, sceneReason, model } = loadContext(b);
    if (!input) return NextResponse.json({ error: "请选择或输入考试" }, { status: 400 });
    const n = Math.min(5, Math.max(1, Number(b.count) || 3));

    const sources: Source[] = pickSources({ category, scenes, count: n, noteId: b.note_id || undefined });
    if (!sources.length) return NextResponse.json({ error: "爆款库里还没有带标题的积木，先去「入库拆解」攒几篇爆款" }, { status: 400 });

    const out = await chatJson<{ versions: RawVersion[] }>(
      [
        { role: "system", content: await generateSystem() },
        {
          role: "user",
          content: generateUser({
            examBlock: examBlock(exam, input),
            scenes,
            sceneReason,
            sourcesBlock: sourcesBlock(sources, !!b.note_id),
            mode,
            extra: b.extra,
            avoid: avoidList(allRules()),
          }),
        },
      ],
      { model, temperature: mode === "free" ? 0.9 : 0.7 }
    );
    const raw = (out.versions ?? []).slice(0, sources.length);

    // 高度模仿：检查标题有没有真的套模板，不够的返工一次
    if (mode === "imitate") await repairTitles(raw, sources, exam?.short_name || input, scenes[0], model);

    const versions = raw.map((v, i) => toVersion(v, sources[i], input));
    const id = newId();
    run("insert into generations (id,exam_id,exam_input,versions,created_by) values (?,?,?,?,?)", id, exam?.id ?? null, input, JSON.stringify(versions), me.id);
    return NextResponse.json({ id, versions, hasExam: !!exam, scenes, sceneReason, mode });
  } catch (e) {
    return errorResponse(e);
  }
}
