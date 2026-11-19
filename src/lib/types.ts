export type ElementType = "title" | "cover" | "structure" | "hook" | "cta" | "tags";

export const ELEMENT_LABELS: Record<ElementType, string> = {
  title: "标题",
  cover: "封面",
  structure: "正文结构",
  hook: "开头钩子",
  cta: "结尾引导",
  tags: "话题标签",
};

/** 爆款笔记的「场景」：这篇是在考试哪个阶段、讲什么话题。生成时按考情阶段优先挑同场景的爆款模仿。 */
export const SCENES = ["公告解读", "报名指导", "备考方法", "资料推荐", "考前冲刺", "考后估分", "面试", "企业文化时政", "上岸经验", "其他"];

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
  scene: string;
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
  info?: string | null;
}

export interface ResearchSource {
  title: string;
  url: string;
  site?: string | null;
  date?: string | null;
  used_for?: string;
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
  refs: Partial<Record<ElementType, string>>;
  why?: string; // 旧版字段
  how?: string; // 怎么套的模板
  source?: {
    note_id: string;
    note_title: string;
    note_url: string | null;
    scene: string | null;
    title_template: string | null;
    similarity: number | null; // 标题借鉴度 0~1
    borrowed: string[];
  };
}
