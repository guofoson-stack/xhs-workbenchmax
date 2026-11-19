import "server-only";
import { chatJson } from "@/lib/ai";
import { researchSystem } from "@/lib/prompts";
import { webSearch, type SearchResult } from "@/lib/search";
import type { ExamResearch, ResearchSource } from "@/lib/types";

/** 官方 / 权威来源加分：gov.cn、招聘系统、高校就业网 */
function sourceWeight(r: SearchResult) {
  let w = Math.max(0, r.authority) * 2 + (r.rerank_score ?? 0);
  if (/\.gov\.cn/i.test(r.url)) w += 4;
  if (/edu\.cn/i.test(r.url)) w += 1.5;
  if (/zhihu|tieba|douban|xiaohongshu|weibo/i.test(r.url)) w -= 1;
  return w;
}

/**
 * AI 搜索考情：多角度联网搜索 → 去重排序 → 交给模型按「考情研究提示词」整理。
 * 每次大约 4 次搜索（约 2 分钱）+ 1 次模型调用。
 */
export async function researchExam(name: string): Promise<ExamResearch & { searched: number }> {
  const q = name.trim();
  const year = new Date().getFullYear();
  const queries = [
    `${q} 公开招聘公告`,
    `${q} 笔试 考试大纲 科目`,
    `${q} 笔试时间 成绩查询 面试`,
    `${q} ${year} 真题 题型 备考经验`,
  ];

  const settled = await Promise.allSettled(queries.map((query) => webSearch(query, { count: 8, needContent: true, question: `${q} 考情` })));
  const firstError = settled.find((s) => s.status === "rejected") as PromiseRejectedResult | undefined;
  const all = settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []));
  if (!all.length) throw firstError?.reason ?? new Error("没搜到相关资料，换个说法再试（比如加上年份或单位全称）");

  // 去重，按权威度排序，取前 14 条
  const seen = new Set<string>();
  const ranked = all
    .filter((r) => r.url && !seen.has(r.url) && seen.add(r.url))
    .sort((a, b) => sourceWeight(b) - sourceWeight(a))
    .slice(0, 14);

  // 前 4 条给较长正文，其余给长摘要，控制总长度
  const materials = ranked
    .map((r, i) => {
      const body = i < 4 && r.content ? r.content.slice(0, 3500) : r.summary || r.snippet;
      return `【资料${i + 1}】${r.title}\n来源：${r.site_name ?? ""} ${r.url}\n发布日期：${r.date ? r.date.slice(0, 10) : "未知"}　权威度：${r.authority}\n${body}`;
    })
    .join("\n\n");

  const today = new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" });
  const out = await chatJson<Omit<ExamResearch, "sources"> & { sources?: { n: number; used_for?: string }[] }>(
    [
      { role: "system", content: await researchSystem() },
      { role: "user", content: `【要研究的考试】${q}\n【今天】${today}\n\n【搜索到的资料】\n${materials}` },
    ],
    { temperature: 0.1 }
  );

  const sources: ResearchSource[] = (out.sources ?? [])
    .map((s) => {
      const r = ranked[Number(s.n) - 1];
      return r ? { title: r.title, url: r.url, site: r.site_name, date: r.date?.slice(0, 10) ?? null, used_for: s.used_for } : null;
    })
    .filter(Boolean) as ResearchSource[];

  return {
    name: out.name || q,
    short_name: out.short_name || "",
    category: out.category || "其他",
    subjects: out.subjects || "",
    exam_time: out.exam_time || "",
    features: out.features || "",
    stage: out.stage || "",
    confidence: out.confidence || "",
    warnings: out.warnings || "",
    sources,
    searched: ranked.length,
  };
}
