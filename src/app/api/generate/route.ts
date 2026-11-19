import { NextResponse } from "next/server";
import { chatJson } from "@/lib/ai";
import { readSettings } from "@/lib/config";
import { MODES, generateSystem, generateUser, type Mode } from "@/lib/prompts";
import { get, newId, run } from "@/lib/db";
import { examBlock } from "@/lib/retrieve";
import { parseInfo } from "@/lib/examInfo";
import { allRules } from "@/lib/sensitiveStore";
import { avoidList } from "@/lib/sensitive";
import { pickSources, similarity, sourcesBlock, targetScenes, type Source } from "@/lib/imitate";
import { ELEMENT_LABELS, SCENES, type Exam, type GeneratedVersion } from "@/lib/types";

export const maxDuration = 240;

/** 高度模仿时，标题保留模板固定字词低于这个比例，就让模型返工一次 */
const MIN_SIMILARITY = 0.5;

interface RawVersion {
  title?: string;
  cover?: GeneratedVersion["cover"];
  body?: string;
  tags?: string[];
  how?: string;
}

/**
 * 生成：考情 → 按阶段定选题场景 → 每一版指定一篇爆款去模仿 → 模型按模板填空 → 检查标题借鉴度，不够就返工
 */
export async function POST(req: Request) {
  try {
    const b = await req.json();
    const exam = b.exam_id ? (get<Exam>("select * from exams where id = ?", b.exam_id) ?? null) : null;
    const input = exam?.name ?? String(b.exam_input ?? "").trim();
    if (!input) return NextResponse.json({ error: "请选择或输入考试" }, { status: 400 });
    const category = exam?.category ?? b.category ?? "事业单位";
    const mode: Mode = b.mode in MODES ? b.mode : "imitate";
    const n = Math.min(5, Math.max(1, Number(b.count) || 3));

    // 1. 选题场景：手动指定优先，否则按考情阶段自动判断
    const auto = targetScenes(exam ? parseInfo(exam.info) : null);
    const manual = b.scene && SCENES.includes(b.scene);
    const scenes: string[] = manual ? [b.scene, ...auto.scenes.filter((s) => s !== b.scene)] : auto.scenes;
    const sceneReason = manual ? "手动指定" : auto.reason;

    // 2. 每一版要模仿的爆款
    const sources: Source[] = pickSources({ category, scenes, count: n, noteId: b.note_id || undefined });
    if (!sources.length) return NextResponse.json({ error: "爆款库里还没有带标题的积木，先去「入库拆解」攒几篇爆款" }, { status: 400 });

    // 3. 生成
    const model = readSettings().aiTextModel || undefined;
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

    // 4. 高度模仿：检查标题有没有真的套模板，不够的返工一次
    const simOf = (i: number) => {
      const tpl = sources[i]?.el.title?.template;
      return tpl ? similarity(tpl, raw[i]?.title ?? "") : null;
    };
    if (mode === "imitate") {
      const weak = raw.map((_, i) => i).filter((i) => {
        const s = simOf(i);
        return s !== null && s < MIN_SIMILARITY;
      });
      if (weak.length) {
        try {
          const fix = await chatJson<{ titles: string[] }>(
            [
              {
                role: "system",
                content:
                  '你在改小红书标题。要求：保留模板里除了 {槽位} 以外的所有固定字词、句式和标点，只把槽位换成目标考试的信息；模板话题和场景对不上时，可以只替换话题词。不超过 20 个字。只输出 JSON：{"titles": ["..."]}，顺序与输入一致。',
              },
              {
                role: "user",
                content: `目标考试：${exam?.short_name || input}\n选题场景：${scenes[0]}\n\n${weak
                  .map((i, k) => `${k + 1}. 模板：${sources[i].el.title!.template}\n   现在的标题（没套模板）：${raw[i].title}`)
                  .join("\n")}`,
              },
            ],
            { model, temperature: 0.4 }
          );
          weak.forEach((i, k) => {
            const t = fix.titles?.[k];
            if (t && (similarity(sources[i].el.title!.template, t) ?? 0) > (simOf(i) ?? 0)) raw[i].title = t;
          });
        } catch {
          // 返工失败就保留原标题，页面上会显示借鉴度低
        }
      }
    }

    // 5. 整理结果
    const versions: GeneratedVersion[] = raw.map((v, i) => {
      const s = sources[i];
      const refs = Object.fromEntries(Object.entries(s.el).map(([t, e]) => [t, e!.id]));
      const title = (v.title ?? "").trim(); // 不硬截断，超过 20 字在页面上提示
      return {
        title,
        cover: v.cover?.main ? v.cover : { layout: "bigword", main: title || input },
        body: v.body ?? "",
        tags: v.tags ?? [],
        how: v.how ?? "",
        refs,
        source: {
          note_id: s.noteId,
          note_title: s.noteTitle,
          note_url: s.noteUrl,
          scene: s.scene,
          title_template: s.el.title?.template ?? null,
          similarity: s.el.title ? similarity(s.el.title.template, title) : null,
          borrowed: s.borrowed.map((t) => ELEMENT_LABELS[t]),
        },
      };
    });

    const id = newId();
    run("insert into generations (id,exam_id,exam_input,versions) values (?,?,?,?)", id, exam?.id ?? null, input, JSON.stringify(versions));
    return NextResponse.json({ id, versions, hasExam: !!exam, scenes, sceneReason, mode });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
