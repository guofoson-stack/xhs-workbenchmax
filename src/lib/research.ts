import "server-only";
import { chatJson } from "@/lib/ai";
import { researchSystem } from "@/lib/prompts";
import { webFetch, webSearch, type SearchResult } from "@/lib/search";
import { todayStr, type ExamInfo, type FactRow, type SubjectRow, type TimelineRow } from "@/lib/examInfo";

const DAY = 86400000;

/** 排序打分：权威（gov.cn、招聘系统）+ 新（近一年）优先 */
function weight(r: SearchResult) {
  let w = Math.max(0, r.authority) * 2 + (r.rerank_score ?? 0);
  if (/\.gov\.cn/i.test(r.url)) w += 4;
  if (/edu\.cn/i.test(r.url)) w += 1.5;
  if (/zhihu|tieba|douban|xiaohongshu|weibo/i.test(r.url)) w -= 1;
  if (r.date) {
    const age = (Date.now() - Date.parse(r.date)) / DAY;
    w += age < 120 ? 3 : age < 365 ? 1.5 : -2;
  }
  return w;
}

/** 像公告原文的页面：标题带「公告/招聘」、近一年发布 */
function looksLikeNotice(r: SearchResult) {
  const recent = !r.date || Date.now() - Date.parse(r.date) < 400 * DAY;
  return recent && /公告|招聘|简章/.test(r.title) && !/汇总|合集|盘点/.test(r.title);
}

const isDate = (s: unknown) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const str = (s: unknown) => (typeof s === "string" ? s.trim() : "");
const basisOf = (s: unknown) => str(s) || "本届";

export interface ResearchResult {
  name: string;
  short_name: string;
  category: string;
  info: ExamInfo;
  searched: number;
  fetched: number;
}

/**
 * AI 搜索考情：4 个角度联网搜索 → 去重排序 → 抓 2 篇公告全文 → 模型按结构整理。
 * 每次约 4 次搜索 + 2 次抓取（合计约 3 分钱）+ 1 次模型调用。
 */
export async function researchExam(name: string): Promise<ResearchResult> {
  const q = name.trim();
  const queries = [`${q} 公开招聘公告`, `${q} 笔试大纲 考试科目`, `${q} 笔试时间 成绩查询 面试`, `${q} 报考条件 招聘人数`];

  const settled = await Promise.allSettled(queries.map((query) => webSearch(query, { count: 8, needContent: true, question: `${q} 考情` })));
  const firstError = settled.find((s) => s.status === "rejected") as PromiseRejectedResult | undefined;
  const all = settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []));
  if (!all.length) throw firstError?.reason ?? new Error("没搜到相关资料，换个说法再试（比如加上年份或单位全称）");

  const seen = new Set<string>();
  const ranked = all.filter((r) => r.url && !seen.has(r.url) && seen.add(r.url)).sort((a, b) => weight(b) - weight(a));

  // 抓 2 篇最像公告原文的页面全文（搜索结果里的正文经常不全）
  const notices = ranked.filter(looksLikeNotice).slice(0, 2);
  const fulltext = new Map<string, string>();
  await Promise.all(
    notices.map(async (r) => {
      try {
        const page = await webFetch(r.url);
        if (page.content && page.content.length > (r.content?.length ?? 0)) fulltext.set(r.url, page.content);
      } catch {}
    })
  );

  const ordered = [...notices, ...ranked.filter((r) => !notices.includes(r))].slice(0, 14);
  const materials = ordered
    .map((r, i) => {
      const full = fulltext.get(r.url) ?? r.content;
      const body = i < notices.length ? (full || r.summary).slice(0, 9000) : i < 5 && r.content ? r.content.slice(0, 2500) : r.summary || r.snippet;
      return `【资料${i + 1}】${r.title}\n来源：${r.site_name ?? ""} ${r.url}\n发布日期：${r.date ? r.date.slice(0, 10) : "未知"}　权威度：${r.authority}${i < notices.length ? "　（公告全文）" : ""}\n${body}`;
    })
    .join("\n\n");

  type Raw = {
    name?: string;
    short_name?: string;
    category?: string;
    cycle?: string;
    timeline?: Record<string, unknown>[];
    subjects?: Record<string, unknown>[];
    facts?: Record<string, unknown>[];
    tips?: unknown[];
    missing?: unknown[];
    stage_hint?: string;
    confidence?: string;
    warnings?: string;
    sources?: { n: number; used_for?: string }[];
  };
  const out = await chatJson<Raw>(
    [
      { role: "system", content: await researchSystem() },
      { role: "user", content: `【要研究的考试】${q}\n【今天】${todayStr()}\n\n【搜索到的资料】\n${materials}` },
    ],
    { temperature: 0.1 }
  );

  // 清洗：去掉空行、「未提及」之类的废话，日期格式不对的当作待公布
  const junk = /未提及|未找到|暂无|不详|未知/;
  const timeline: TimelineRow[] = (out.timeline ?? [])
    .map((r) => ({
      date: isDate(r.date) ? (r.date as string) : "",
      end: isDate(r.end) ? (r.end as string) : undefined,
      event: str(r.event),
      note: str(r.note) || undefined,
      basis: basisOf(r.basis),
    }))
    .filter((r) => r.event && !junk.test(r.event));
  const subjects: SubjectRow[] = (out.subjects ?? [])
    .map((r) => ({ name: str(r.name), detail: str(r.detail) || undefined, basis: basisOf(r.basis) }))
    .filter((r) => r.name && !junk.test(r.name));
  const facts: FactRow[] = (out.facts ?? [])
    .map((r) => ({ label: str(r.label), value: str(r.value), basis: basisOf(r.basis) }))
    .filter((r) => r.label && r.value && !junk.test(r.value));

  const sources = (out.sources ?? [])
    .map((s) => {
      const r = ordered[Number(s.n) - 1];
      return r ? { title: r.title, url: r.url, site: r.site_name, date: r.date?.slice(0, 10) ?? null, used_for: s.used_for } : null;
    })
    .filter(Boolean) as ExamInfo["sources"];

  return {
    name: str(out.name) || q,
    short_name: str(out.short_name),
    category: str(out.category) || "其他",
    info: {
      cycle: str(out.cycle),
      stageHint: str(out.stage_hint) || undefined,
      timeline,
      subjects,
      facts,
      tips: (out.tips ?? []).map(str).filter(Boolean).slice(0, 6),
      missing: (out.missing ?? []).map(str).filter(Boolean),
      warnings: str(out.warnings) || undefined,
      confidence: str(out.confidence) || undefined,
      sources,
    },
    searched: ordered.length,
    fetched: fulltext.size,
  };
}
