import "server-only";
import { readSettings } from "@/lib/config";
import { OpencliError, xhsComments, xhsNote, xhsSearch, type XhsSearchItem } from "@/lib/opencli";
import type { SearchResult } from "@/lib/search";

const DAY = 86400000;

export interface XhsResearch {
  items: SearchResult[]; // 转成和网页搜索一样的格式，方便一起交给模型
  searched: number;
  read: number;
  error?: string; // 没搜成的原因（没装、没登录…），不影响网页搜索
}

/** 标题像真实考情帖（回忆、题型、题量、考后…）、点赞高、发布不太久的排前面 */
function score(r: XhsSearchItem) {
  let n = Math.log10(r.likes + 1) * 2;
  if (/回忆|真题|考后|考完|题型|题量|分值|考情|笔试|笔经|经验|上岸/.test(r.title)) n += 3;
  if (/汇总|合集|资料|领取|免费|私信|蹲/.test(r.title)) n -= 2;
  if (r.published_at) {
    const age = (Date.now() - Date.parse(r.published_at)) / DAY;
    n += age < 400 ? 2 : age < 800 ? 0.5 : -1;
  }
  return n;
}

const noteId = (u: string) => u.match(/(?:explore|search_result|discovery\/item)\/([0-9a-f]{24})/i)?.[1] ?? u;

/**
 * 用本机 OpenCLI 搜小红书真实考生回忆：3 组搜索词 → 挑 4 篇读正文 → 前 2 篇再读评论（评论里常有人补真题、纠错）。
 * 一共约 9 次 OpenCLI 调用，每次间隔 2.5 秒，大约 1–2 分钟。
 */
export async function xhsResearch(core: string): Promise<XhsResearch> {
  if (!readSettings().xhsSearch) return { items: [], searched: 0, read: 0 }; // 设置里关掉了，静默跳过
  const started = Date.now();
  const words = [`${core} 笔试回忆`, `${core} 题型题量`, `${core} 笔试经验`];
  const found: XhsSearchItem[] = [];
  let searched = 0;
  try {
    for (const w of words) {
      const r = await xhsSearch(w);
      searched++;
      found.push(...r);
    }
  } catch (e) {
    if (!found.length) return { items: [], searched, read: 0, error: (e as Error).message };
  }
  const seen = new Set<string>();
  const top = found
    .filter((r) => !seen.has(noteId(r.url)) && seen.add(noteId(r.url)))
    .sort((a, b) => score(b) - score(a))
    .slice(0, 4);

  const items: SearchResult[] = [];
  let lastError = "";
  for (let i = 0; i < top.length; i++) {
    if (Date.now() - started > 150000) break; // 最多花两分半，剩下的交给网页搜索
    const r = top[i];
    try {
      const note = await xhsNote(r.url);
      let comments = "";
      if (i < 2 && note.comments > 0) {
        try {
          const cs = await xhsComments(r.url);
          comments = cs
            .sort((a, b) => b.likes - a.likes)
            .slice(0, 15)
            .map((c) => `- ${c.author}：${c.text}${c.likes ? `（赞${c.likes}）` : ""}`)
            .join("\n");
        } catch {}
      }
      const body = [
        `作者：${note.author || r.author}｜点赞 ${note.likes || r.likes}・收藏 ${note.collects}・评论 ${note.comments}${r.published_at ? `｜发布 ${r.published_at}` : ""}`,
        note.content,
        note.tags && `标签：${note.tags}`,
        comments && `【评论区】\n${comments}`,
      ]
        .filter(Boolean)
        .join("\n");
      items.push({
        title: note.title || r.title,
        url: r.url.replace(/[?&]xsec_source=$/, ""),
        snippet: note.content.slice(0, 120),
        summary: "",
        content: body,
        site_name: "小红书",
        date: r.published_at,
        authority: 1,
        rerank_score: 0,
      });
    } catch (e) {
      lastError = (e as Error).message;
      if (e instanceof OpencliError && ["missing", "auth", "bridge"].includes(e.code)) break;
    }
  }
  return { items, searched, read: items.length, error: items.length ? undefined : lastError || (found.length ? "" : "小红书没搜到相关帖子") };
}
