import "server-only";
import { chatJson } from "@/lib/ai";
import { readSettings } from "@/lib/config";
import { get } from "@/lib/db";
import { parseInfo, targetScenes } from "@/lib/examInfo";
import { MODES, type Mode } from "@/lib/prompts";
import { similarity, type Source } from "@/lib/imitate";
import { ELEMENT_LABELS, SCENES, type Exam, type GeneratedVersion } from "@/lib/types";

export interface GenRequest {
  exam_id?: string;
  exam_input?: string;
  category?: string;
  mode?: string;
  scene?: string;
  extra?: string;
}

/** 生成 / 重写共用：考试、类别、模仿强度、选题场景 */
export function loadContext(b: GenRequest) {
  const exam = b.exam_id ? (get<Exam>("select * from exams where id = ?", b.exam_id) ?? null) : null;
  const input = exam?.name ?? String(b.exam_input ?? "").trim();
  const category = exam?.category ?? b.category ?? "事业单位";
  const mode: Mode = b.mode && b.mode in MODES ? (b.mode as Mode) : "imitate";
  const auto = targetScenes(exam ? parseInfo(exam.info) : null);
  const manual = !!b.scene && SCENES.includes(b.scene);
  const scenes: string[] = manual ? [b.scene!, ...auto.scenes.filter((s) => s !== b.scene)] : auto.scenes;
  const sceneReason = manual ? "手动指定" : auto.reason;
  const model = readSettings().aiTextModel || undefined;
  return { exam, input, category, mode, scenes, sceneReason, model };
}

export interface RawVersion {
  title?: string;
  cover?: GeneratedVersion["cover"];
  body?: string;
  tags?: string[];
  how?: string;
}

/** 模型输出 + 模仿来源 → 存库的版本格式 */
export function toVersion(v: RawVersion, s: Source, input: string): GeneratedVersion {
  const refs = Object.fromEntries(Object.entries(s.el).map(([t, e]) => [t, e!.id]));
  const title = (v.title ?? "").trim();
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
}

/** 高度模仿时，标题保留模板固定字词低于这个比例，就让模型返工一次 */
const MIN_SIMILARITY = 0.5;

export async function repairTitles(raw: RawVersion[], sources: Source[], examShort: string, scene: string, model?: string) {
  const simOf = (i: number) => {
    const tpl = sources[i]?.el.title?.template;
    return tpl ? similarity(tpl, raw[i]?.title ?? "") : null;
  };
  const weak = raw.map((_, i) => i).filter((i) => {
    const s = simOf(i);
    return s !== null && s < MIN_SIMILARITY;
  });
  if (!weak.length) return;
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
          content: `目标考试：${examShort}\n选题场景：${scene}\n\n${weak
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
