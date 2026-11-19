import "server-only";
import { searchKey } from "@/lib/config";

/**
 * DeepSeek 联网搜索 / 网页抓取接口（2026 年 10 月开放）。
 * 用的是 DeepSeek 的 API Key，按成功请求计费，每 1000 次约 5 元。
 * 文档：https://api-docs.deepseek.com/zh-cn/guides/search
 */
const BASE = process.env.WORKBENCH_SEARCH_API || "https://api.deepseek.com/v1/tools"; // 测试时可指向模拟服务器

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  summary: string;
  content: string;
  site_name: string | null;
  date: string | null;
  authority: number; // 0~4，-1 未知，>=3 为极权威
  rerank_score: number; // 0~3，>=1.5 为优质
}

function errorText(status: number) {
  return status === 401
    ? "搜索接口 Key 不对（需要 DeepSeek 的 API Key，到「设置」检查）"
    : status === 402
      ? "DeepSeek 账户余额不足，请先充值"
      : status === 429
        ? "搜索太频繁，稍后再试"
        : `搜索接口出错（${status}）`;
}

async function call<T>(path: string, body: unknown, timeoutMs = 30000): Promise<T> {
  const key = searchKey();
  if (!key) throw new Error("还没有可用的搜索 Key：大模型用 DeepSeek 时会自动使用同一个 Key，否则请在「设置」里单独填 DeepSeek 搜索 Key");
  let res: Response;
  try {
    res = await fetch(`${BASE}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new Error("连不上 DeepSeek 搜索接口，请检查网络");
  }
  if (!res.ok) throw new Error(errorText(res.status));
  return (await res.json()) as T;
}

export async function webSearch(query: string, opts: { count?: number; needContent?: boolean; question?: string } = {}) {
  const r = await call<{ results?: SearchResult[] }>("search", {
    query: query.slice(0, 128),
    count: opts.count ?? 8,
    need_content: opts.needContent ?? false,
    ...(opts.question ? { ori_question: opts.question.slice(0, 128) } : {}),
  });
  return r.results ?? [];
}

export async function webFetch(url: string) {
  return call<{ title: string; content: string }>("fetch", { url }, 45000);
}
