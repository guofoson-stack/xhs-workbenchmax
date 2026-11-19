export type ElementType = "title" | "cover" | "structure" | "hook" | "cta" | "tags";

export const ELEMENT_LABELS: Record<ElementType, string> = {
  title: "标题",
  cover: "封面",
  structure: "正文结构",
  hook: "开头钩子",
  cta: "结尾引导",
  tags: "话题标签",
};

export const CATEGORIES = ["事业单位", "国企", "银行", "公务员", "教师", "军队文职", "医疗卫生", "其他"];

export interface ElementDraft {
  type: ElementType;
  template: string;
  pattern?: string;
  detail?: Record<string, unknown>;
  rating?: number;
}

export interface DecomposeResult {
  exam_name: string;
  exam_category: string;
  account_type: string;
  cover_text: string;
  summary: string;
  elements: ElementDraft[];
}

export interface Exam {
  id: string;
  name: string;
  short_name: string | null;
  category: string;
  subjects: string | null;
  exam_time: string | null;
  features: string | null;
  product: string | null;
  stage?: string | null;
  sources?: string | null;
  researched_at?: string | null;
}

export interface ResearchSource {
  title: string;
  url: string;
  site?: string | null;
  date?: string | null;
  used_for?: string;
}

export interface ExamResearch {
  name: string;
  short_name: string;
  category: string;
  subjects: string;
  exam_time: string;
  features: string;
  stage: string;
  confidence: string;
  warnings: string;
  sources: ResearchSource[];
}

export type CoverLayout = "bigword" | "list" | "note";

export interface CoverSpec {
  layout: CoverLayout;
  main: string;
  sub?: string;
  lines?: string[];
  badge?: string;
  color?: string;
}

export interface GeneratedVersion {
  title: string;
  cover: CoverSpec;
  body: string;
  tags: string[];
  refs: { title?: string; cover?: string; structure?: string; hook?: string; cta?: string };
  why: string;
}
