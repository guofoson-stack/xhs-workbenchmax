import "server-only";
import { all, parseJsonCol } from "@/lib/db";
import type { ElementType, Exam } from "@/lib/types";
import { ELEMENT_LABELS } from "@/lib/types";
import { examInfoToText, parseInfo } from "@/lib/examInfo";

/** 每种积木取多少条喂给模型 */
const QUOTA: Record<ElementType, number> = {
  title: 10,
  cover: 6,
  structure: 4,
  hook: 6,
  cta: 5,
  tags: 3,
};

interface Row {
  id: string;
  type: ElementType;
  template: string;
  pattern: string | null;
  detail: Record<string, unknown> | null;
  rating: number;
  heat: number;
  exam_category: string | null;
}

/**
 * 检索积木：先取同类考试里「人工打分高 + 原笔记数据好」的，
 * 不够再用其他类别的高分积木补齐。早期这样就够用，库大了再加向量检索。
 */
export function pickElements(category: string): Row[] {
  const picked: Row[] = [];
  const cols = "id,type,template,pattern,detail,rating,heat,exam_category";
  for (const type of Object.keys(QUOTA) as ElementType[]) {
    const n = QUOTA[type];
    const rows = all<Row>(
      `select ${cols} from element_view where type = ? and exam_category = ? and rating >= 2
       order by rating desc, heat desc limit ?`,
      type, category, n
    );
    if (rows.length < n) {
      rows.push(
        ...all<Row>(
          `select ${cols} from element_view where type = ? and coalesce(exam_category,'') <> ? and rating >= 3
           order by rating desc, heat desc limit ?`,
          type, category, n - rows.length
        )
      );
    }
    picked.push(...rows.map((r) => ({ ...r, detail: parseJsonCol<Record<string, unknown>>(r.detail, {}) })));
  }
  return picked;
}

export function elementsBlock(rows: Row[]) {
  if (!rows.length) return "（素材库还是空的，请按小红书考试资料赛道的常见爆款打法写）";
  const groups = new Map<ElementType, Row[]>();
  rows.forEach((r) => groups.set(r.type, [...(groups.get(r.type) ?? []), r]));
  return [...groups.entries()]
    .map(([type, list]) => {
      const lines = list.map((r) => {
        const extra =
          r.type === "cover" && r.detail
            ? ` 〔版式建议:${(r.detail as Record<string, unknown>).suggest_layout ?? "-"}〕`
            : r.type === "structure" && r.detail?.paragraphs
              ? ` 〔段落:${JSON.stringify(r.detail.paragraphs).slice(0, 400)}〕`
              : "";
        return `- id=${r.id} [${r.pattern ?? "-"}] [${r.exam_category ?? "-"}·热度${r.heat}·评分${r.rating}] ${r.template}${extra}`;
      });
      return `## ${ELEMENT_LABELS[type]}\n${lines.join("\n")}`;
    })
    .join("\n\n");
}

export function examBlock(exam: Exam | null, input: string) {
  if (!exam) {
    return `考试：${input}
（注意：这个考试还没有录入考情，所有具体事实——科目、时间、题型——一律不要写，用泛化表述。）`;
  }
  const info = parseInfo(exam.info);
  if (info && (info.timeline.length || info.subjects.length || info.facts.length)) {
    return examInfoToText(exam.name, info) + (exam.product ? `\n我们对应的资料：${exam.product}` : "");
  }
  return [
    `考试全称：${exam.name}`,
    exam.short_name && `简称：${exam.short_name}`,
    `类别：${exam.category}`,
    exam.subjects && `笔试科目：${exam.subjects}`,
    exam.stage && `当前阶段：${exam.stage}`,
    exam.exam_time && `时间节点：${exam.exam_time}`,
    exam.features && `考情特点：${exam.features}`,
    exam.product && `我们对应的资料：${exam.product}`,
  ]
    .filter(Boolean)
    .join("\n");
}
