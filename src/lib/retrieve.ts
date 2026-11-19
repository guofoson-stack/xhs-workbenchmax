import "server-only";
import type { Exam } from "@/lib/types";
import { examInfoToText, parseInfo } from "@/lib/examInfo";

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
