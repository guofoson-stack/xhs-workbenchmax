import "server-only";
import { chatJson } from "@/lib/ai";
import { paperSystem, researchSystem, supplementSystem } from "@/lib/prompts";
import { webFetch, webSearch, type SearchResult } from "@/lib/search";
import { todayStr, type ExamInfo, type FactRow, type PaperRow, type SubjectRow, type TimelineRow } from "@/lib/examInfo";

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
  const paperJob = researchPapers(q).catch((e: Error) => ({ papers: [] as PaperRow[], missing: [], warnings: "题型题量没搜成：" + e.message, sources: [], searched: 0, fetched: 0 }));
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

  const { timeline, subjects, facts } = cleanRows(out);

  const sources = (out.sources ?? [])
    .map((s) => {
      const r = ordered[Number(s.n) - 1];
      return r ? { title: r.title, url: r.url, site: r.site_name, date: r.date?.slice(0, 10) ?? null, used_for: s.used_for } : null;
    })
    .filter(Boolean) as ExamInfo["sources"];

  const paper = await paperJob;
  // 题型题量的「没找到」并进总的 missing；主搜索里笼统的「题型/题量」缺失，题型那边找到了就去掉
  const missing = [...(out.missing ?? []).map(str).filter(Boolean), ...paper.missing].filter(
    (m, i, arr) => arr.indexOf(m) === i && !(paper.papers.length && /题型|题量/.test(m))
  );
  return {
    name: str(out.name) || q,
    short_name: str(out.short_name),
    category: str(out.category) || "其他",
    info: {
      cycle: str(out.cycle),
      stageHint: str(out.stage_hint) || undefined,
      timeline,
      subjects,
      papers: paper.papers,
      facts,
      tips: (out.tips ?? []).map(str).filter(Boolean).slice(0, 6),
      missing,
      warnings: [str(out.warnings), paper.warnings].filter(Boolean).join("；") || undefined,
      confidence: str(out.confidence) || undefined,
      sources: [...(sources ?? []), ...paper.sources.filter((p) => !sources?.some((x) => x.url === p.url))],
    },
    searched: ordered.length + paper.searched,
    fetched: fulltext.size + paper.fetched,
  };
}

/* ---------------- 清洗 ---------------- */

const junk = /未提及|未找到|暂无|不详|未知/;
type RawRows = { timeline?: Record<string, unknown>[]; subjects?: Record<string, unknown>[]; facts?: Record<string, unknown>[]; papers?: Record<string, unknown>[] };

/** 去掉空行、「未提及」之类的废话，日期格式不对的当作待公布 */
function cleanRows(out: RawRows) {
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
  return { timeline, subjects, facts, papers: cleanPapers(out.papers) };
}

const opt = (v: unknown) => {
  const t = typeof v === "number" ? String(v) : str(v);
  return t && !junk.test(t) ? t : undefined;
};

function cleanPapers(raw: unknown): PaperRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p: Record<string, unknown>) => ({
      subject: str(p.subject),
      duration: opt(p.duration),
      total: opt(p.total),
      format: opt(p.format),
      parts: (Array.isArray(p.parts) ? p.parts : [])
        .map((x: Record<string, unknown>) => ({ type: str(x.type), count: opt(x.count), score: opt(x.score), note: opt(x.note) }))
        .filter((x) => x.type && !junk.test(x.type)),
      basis: basisOf(p.basis),
      source: opt(p.source),
    }))
    .filter((p) => p.subject && (p.parts.length || p.duration || p.total));
}

/* ---------------- 题型题量：专门的一轮搜索 ---------------- */

/** 去掉年份、「公开招聘」等字样，得到更容易搜到往年经验帖的说法，如「四川省事业单位」 */
export function examCore(name: string) {
  return (
    name
      .replace(/20\d{2}\s*(年度|年|届)?/g, "")
      .replace(/(上半年|下半年|第[一二三四五六七八九十\d]+批次?|第[一二三四]次)/g, "")
      .replace(/(公开)?(招聘|招考|考试录用)(工作人员|公告|简章|人员)?|校园招聘|秋季|春季|秋招|春招|应届(毕业)?生?/g, "")
      .replace(/[|｜·\s]+/g, " ")
      .trim() || name
  );
}

/** 题量、分值这类信号词越多，越可能是讲卷面结构的 */
function paperSignal(r: SearchResult) {
  const text = `${r.title} ${r.snippet} ${r.summary} ${(r.content ?? "").slice(0, 6000)}`;
  let n = 0;
  n += Math.min(6, (text.match(/\d+\s*(道|题|小题)/g) ?? []).length);
  n += Math.min(4, (text.match(/单选|多选|判断题|不定项|案例分析|材料分析|申论|作文/g) ?? []).length * 0.5);
  if (/题量|题型/.test(text)) n += 2;
  if (/分钟|满分|每题\s*[\d.]+\s*分/.test(text)) n += 1.5;
  if (/真题回忆|考情回顾|笔经|面经|考后|考了什么/.test(text)) n += 1.5;
  if (/zhihu|nowcoder|bilibili|tieba|offershow|yingjiesheng/.test(r.url)) n += 1;
  if (r.date) {
    const age = (Date.now() - Date.parse(r.date)) / DAY;
    n += age < 400 ? 1.5 : age < 800 ? 0.5 : -1.5; // 太老的卷面结构可能变了
  }
  return n;
}

export interface PaperResult {
  papers: PaperRow[];
  missing: string[];
  warnings: string;
  sources: NonNullable<ExamInfo["sources"]>;
  searched: number;
  fetched: number;
}

/**
 * 题型题量专项：官方大纲 + 往年真题回忆 + 知乎 / 牛客 / B 站经验帖 + 机构整理，5 个角度搜，
 * 挑「题量信号」最强的 3 篇抓全文，再让模型按科目整理成卷面结构。约 5 次搜索 + 3 次抓取 + 1 次模型调用。
 */
export async function researchPapers(name: string): Promise<PaperResult> {
  const q = name.trim();
  const core = examCore(q);
  const queries = [
    `${q} 笔试 题型 题量`,
    `${core} 笔试题型 题量 分值`,
    `${core} 笔试真题回忆 考了什么`,
    `${core} 笔试经验 知乎 牛客`,
    `${core} 考试大纲 题型 分值 考试时长`,
  ];
  const settled = await Promise.allSettled(queries.map((query) => webSearch(query, { count: 8, needContent: true, question: `${core} 笔试考几道题、什么题型` })));
  const all = settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []));
  if (!all.length) {
    const err = settled.find((s) => s.status === "rejected") as PromiseRejectedResult | undefined;
    if (err) throw err.reason;
    return { papers: [], missing: ["题型题量"], warnings: "", sources: [], searched: 0, fetched: 0 };
  }
  const seen = new Set<string>();
  const ranked = all
    .filter((r) => r.url && !seen.has(r.url) && seen.add(r.url))
    .map((r) => ({ r, s: paperSignal(r) }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.r);

  // 信号最强的 3 篇抓全文（搜索给的正文常常截断，题型表在后半段）
  const top = ranked.slice(0, 3);
  const fulltext = new Map<string, string>();
  await Promise.all(
    top.map(async (r) => {
      try {
        const page = await webFetch(r.url);
        if (page.content && page.content.length > (r.content?.length ?? 0)) fulltext.set(r.url, page.content);
      } catch {}
    })
  );
  const ordered = ranked.slice(0, 12);
  const materials = ordered
    .map((r, i) => {
      const full = fulltext.get(r.url) ?? r.content;
      const body = i < 3 ? (full || r.summary).slice(0, 8000) : r.content ? r.content.slice(0, 2500) : r.summary || r.snippet;
      return `【资料${i + 1}】${r.title}\n来源：${r.site_name ?? ""} ${r.url}\n发布日期：${r.date ? r.date.slice(0, 10) : "未知"}\n${body}`;
    })
    .join("\n\n");

  const out = await chatJson<{ papers?: unknown; missing?: unknown[]; warnings?: string; sources?: { n: number; used_for?: string }[] }>(
    [
      { role: "system", content: await paperSystem() },
      { role: "user", content: `【要研究的考试】${q}\n【今天】${todayStr()}\n\n【搜索到的资料】\n${materials}` },
    ],
    { temperature: 0.1 }
  );
  const papers = cleanPapers(out.papers);
  return {
    papers,
    missing: (out.missing ?? []).map(str).filter(Boolean).map((m) => (/题/.test(m) ? m : `${m}（题型题量）`)),
    warnings: str(out.warnings),
    sources: (out.sources ?? [])
      .map((s) => {
        const r = ordered[Number(s.n) - 1];
        return r ? { title: r.title, url: r.url, site: r.site_name, date: r.date?.slice(0, 10) ?? null, used_for: s.used_for ? `题型：${s.used_for}` : "题型题量" } : null;
      })
      .filter(Boolean) as NonNullable<ExamInfo["sources"]>,
    searched: ordered.length,
    fetched: fulltext.size,
  };
}

/* ---------------- 粘贴资料补充 ---------------- */

const URL_RE = /https?:\/\/[^\s<>"'，。）)]+/g;

/**
 * 同事贴进来的经验帖、大纲、真题回忆、公告片段（或链接）合并进现有考情，返回合并后的完整考情给人确认。
 * 贴的是链接就先抓网页正文（小红书抓不到，要复制正文贴进来）。
 */
export async function supplementInfo(name: string, info: ExamInfo, text: string): Promise<{ info: ExamInfo; fetched: number; failed: string[] }> {
  const urls = [...new Set(text.match(URL_RE) ?? [])].slice(0, 3);
  const failed: string[] = [];
  const pages: string[] = [];
  await Promise.all(
    urls.map(async (u) => {
      if (/xiaohongshu|xhslink|rednote/.test(u)) return failed.push(u + "（小红书要登录才能看，请直接复制正文贴进来）");
      try {
        const p = await webFetch(u);
        if (p.content) pages.push(`【网页】${p.title}\n${u}\n${p.content.slice(0, 9000)}`);
        else failed.push(u);
      } catch {
        failed.push(u);
      }
    })
  );
  const pasted = text.replace(URL_RE, "").trim();
  if (!pasted && !pages.length) throw new Error(failed.length ? `链接没抓到内容：${failed.join("、")}` : "请先贴入资料");

  const { sources, ...rest } = info;
  const out = await chatJson<RawRows & { cycle?: string; stage_hint?: string; tips?: unknown[]; missing?: unknown[]; warnings?: string; confidence?: string }>(
    [
      { role: "system", content: await supplementSystem() },
      {
        role: "user",
        content: `【考试】${name}\n【今天】${todayStr()}\n\n【现有考情】\n${JSON.stringify(rest)}\n\n【新贴进来的资料】\n${[pasted && "【同事粘贴】\n" + pasted.slice(0, 12000), ...pages].filter(Boolean).join("\n\n")}`,
      },
    ],
    { temperature: 0.1 }
  );
  const rows = cleanRows(out);
  // 模型偶尔会漏抄：某一类整段丢了就保留原来的
  const keep = <T,>(next: T[], prev: T[]) => (next.length >= Math.min(prev.length, 1) && next.length >= prev.length * 0.6 ? next : prev);
  return {
    info: {
      cycle: str(out.cycle) || info.cycle,
      stageHint: str(out.stage_hint) || info.stageHint,
      timeline: keep(rows.timeline, info.timeline),
      subjects: keep(rows.subjects, info.subjects),
      // 题型按科目合并：新资料没提到的科目原样保留
      papers: [...rows.papers, ...(info.papers ?? []).filter((old) => !rows.papers.some((n) => n.subject === old.subject))],
      facts: keep(rows.facts, info.facts),
      tips: keep((out.tips ?? []).map(str).filter(Boolean).slice(0, 8), info.tips),
      missing: (out.missing ?? []).map(str).filter(Boolean),
      warnings: str(out.warnings) || undefined,
      confidence: str(out.confidence) || info.confidence,
      sources: [...(sources ?? []), ...pages.map((p) => ({ title: p.split("\n")[0].replace("【网页】", ""), url: p.split("\n")[1], used_for: "同事补充" }))],
    },
    fetched: pages.length,
    failed,
  };
}
