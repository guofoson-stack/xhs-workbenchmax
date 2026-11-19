import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { DATA_DIR } from "@/lib/db";

/**
 * 小红书笔记抓取：读取笔记网页里自带的 window.__INITIAL_STATE__ 数据（和浏览器打开看到的一样）。
 * 支持：网页链接、带 xsec_token 的分享链接、xhslink.com 短链、整段分享口令（会自动找出里面的链接）。
 * 抓不到时可以在 .env.local 里填 XHS_COOKIE（自己浏览器登录小红书后的 cookie）提高成功率。
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export interface FetchedNote {
  url: string; // 规范化后的链接，用来去重
  noteId: string;
  title: string;
  body: string;
  likes: number | null;
  collects: number | null;
  comments: number | null;
  published_at: string | null;
  author: string | null;
  type: string | null; // normal 图文 / video 视频
  cover: { dataUrl: string; mime: string } | null;
  imageCount: number;
}

/** 从一段文字里找出小红书链接（支持直接粘贴整段分享口令） */
export function extractUrl(text: string): string | null {
  const m = text.match(/https?:\/\/(?:www\.)?(?:xiaohongshu\.com|xhslink\.com|rednote\.com)\/[^\s，。！"'<>【】]+/i);
  return m ? m[0] : null;
}

export function noteIdOf(url: string): string | null {
  return url.match(/\/(?:explore|discovery\/item|item)\/([0-9a-f]{24})/i)?.[1] ?? null;
}

/** 同一篇笔记不同分享链接（xsec_token 不同）统一成一个，入库去重用 */
export function canonicalUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const id = noteIdOf(url);
  return id ? `https://www.xiaohongshu.com/explore/${id}` : url.trim();
}

/** "1.2万" → 12000，"10万+" → 100000，"赞" → null */
export function parseCount(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return null;
  const m = v.replace(/[,+\s]/g, "").match(/^([\d.]+)(万|w|千|k)?$/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const unit = m[2]?.toLowerCase();
  return Math.round(unit === "万" || unit === "w" ? n * 10000 : unit === "千" || unit === "k" ? n * 1000 : n);
}

/** 正文里的话题 "#考公[话题]#" → "#考公"，表情 "[哭惹R]" 去掉 */
function cleanDesc(desc: string) {
  return desc
    .replace(/#([^#\[\n]+)\[话题\]#/g, "#$1 ")
    .replace(/\[[^\]\n]{1,6}R\]/g, "")
    .replace(/\n[ \t]+\n/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+$/gm, "")
    .trim();
}

function parseInitialState(html: string): Record<string, unknown> | null {
  const m = html.match(/window\.__INITIAL_STATE__\s*=\s*([\s\S]*?)<\/script>/);
  if (!m) return null;
  // 小红书的数据是 JS 不是纯 JSON：里面有 undefined 和 new Set([])，先转成 JSON 能认的写法
  const js = m[1]
    .trim()
    .replace(/;$/, "")
    .replace(/\bundefined\b/g, "null")
    .replace(/new (?:Set|Map)\(\s*(\[[^\]]*\])?\s*\)/g, (_m, arr) => arr || "[]");
  try {
    return JSON.parse(js);
  } catch {
    return null;
  }
}

type AnyObj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function findNote(state: AnyObj, noteId: string | null): AnyObj | null {
  const map: AnyObj | undefined = state?.note?.noteDetailMap;
  if (map) {
    if (noteId && map[noteId]?.note) return map[noteId].note;
    for (const v of Object.values(map)) if ((v as AnyObj)?.note?.noteId || (v as AnyObj)?.note?.title) return (v as AnyObj).note;
  }
  return state?.note?.note ?? null;
}

function meta(html: string, name: string) {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']*)["']`, "i");
  return html.match(re)?.[1]?.replace(/&amp;/g, "&").replace(/&quot;/g, '"') ?? null;
}

async function saveDebug(html: string) {
  try {
    const dir = path.join(/*turbopackIgnore: true*/ DATA_DIR, "debug");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "last-fetch.html"), html);
  } catch {}
}

async function downloadImage(url: string, referer = "https://www.xiaohongshu.com/"): Promise<{ dataUrl: string; mime: string } | null> {
  try {
    const res = await fetch(url.replace(/^\/\//, "https://").replace(/^http:/, "https:"), {
      headers: { "User-Agent": UA, Referer: referer },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const mime = (res.headers.get("content-type") || "image/jpeg").split(";")[0];
    if (!mime.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return { dataUrl: `data:${mime};base64,${buf.toString("base64")}`, mime };
  } catch {
    return null;
  }
}

export async function fetchNote(input: string): Promise<FetchedNote> {
  const link = extractUrl(input);
  if (!link) throw new Error("没找到小红书链接。请粘贴 xiaohongshu.com 或 xhslink.com 开头的链接，或者整段分享口令。");

  const headers: Record<string, string> = {
    "User-Agent": UA,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9",
  };
  if (process.env.XHS_COOKIE) headers.Cookie = process.env.XHS_COOKIE;

  let res: Response;
  try {
    res = await fetch(link, { headers, redirect: "follow", signal: AbortSignal.timeout(20000) });
  } catch {
    throw new Error("连不上小红书，请检查这台电脑的网络。");
  }
  const finalUrl = res.url || link;
  const html = await res.text();
  const noteId = noteIdOf(finalUrl) ?? noteIdOf(link);

  if (/website-login|captcha|verify|\/login/i.test(finalUrl)) {
    await saveDebug(html);
    throw new Error("小红书把这次抓取当成了机器人，要求登录验证。建议用「📌 存到爆款工作台」书签按钮：在浏览器里打开笔记后点一下就行（安装方法见页面上方）。");
  }

  const state = parseInitialState(html);
  const note = state ? findNote(state, noteId) : null;

  if (note && (note.title || note.desc)) {
    const images: AnyObj[] = note.imageList ?? [];
    const info = note.interactInfo ?? {};
    return normalizeRaw(
      {
        noteId: noteId ?? note.noteId,
        title: note.title,
        desc: note.desc,
        likedCount: info.likedCount,
        collectedCount: info.collectedCount,
        commentCount: info.commentCount,
        time: note.time,
        author: note.user?.nickname ?? note.user?.nickName,
        type: note.type,
        coverUrl: images[0]?.urlDefault || images[0]?.url || images[0]?.infoList?.find((i: AnyObj) => i.imageScene?.includes("DFT"))?.url,
        imageCount: images.length,
        url: link,
      },
      new URL(finalUrl).origin + "/"
    );
  }

  // 拿不到完整数据时，退一步用网页的分享信息（只有标题、简介、封面，没有点赞收藏）
  const ogTitle = meta(html, "og:title");
  const ogDesc = meta(html, "description") ?? meta(html, "og:description");
  const ogImage = meta(html, "og:image");
  if (ogTitle && ogDesc && !/你的生活(指南|兴趣社区)/.test(ogTitle)) {
    return {
      url: canonicalUrl(noteId ? `https://www.xiaohongshu.com/explore/${noteId}` : link)!,
      noteId: noteId ?? "",
      title: ogTitle.replace(/\s*-\s*(小红书|rednote)$/i, "").trim(),
      body: cleanDesc(ogDesc),
      likes: null,
      collects: null,
      comments: null,
      published_at: null,
      author: null,
      type: null,
      cover: ogImage ? await downloadImage(ogImage, new URL(finalUrl).origin + "/") : null,
      imageCount: ogImage ? 1 : 0,
    };
  }

  await saveDebug(html);
  throw new Error(
    "小红书这次没返回笔记内容（可能被限制了）。建议用「📌 存到爆款工作台」书签按钮：在浏览器里打开笔记后点一下就行（安装方法见页面上方）。"
  );
}

/** 浏览器书签（或服务器抓取）拿到的原始笔记数据 */
export interface RawNote {
  noteId?: string;
  url?: string;
  title?: string;
  desc?: string;
  likedCount?: unknown;
  collectedCount?: unknown;
  commentCount?: unknown;
  time?: unknown;
  author?: string;
  type?: string;
  coverUrl?: string;
  coverData?: string; // 书签在浏览器里直接取到的封面（data:image/...;base64,...）
  imageCount?: number;
}

/** 统一整理成工作台要的格式，并下载封面 */
export async function normalizeRaw(raw: RawNote, referer?: string): Promise<FetchedNote> {
  const id = (raw.noteId && /^[0-9a-f]{24}$/i.test(raw.noteId) ? raw.noteId : null) ?? (raw.url ? noteIdOf(raw.url) : null);
  const ts = Number(raw.time);
  const given = typeof raw.coverData === "string" ? raw.coverData.match(/^data:(image\/[a-z0-9.+-]+);base64,/i) : null;
  const cover = given
    ? { dataUrl: raw.coverData as string, mime: given[1] }
    : raw.coverUrl
      ? await downloadImage(raw.coverUrl, referer ?? (raw.url ? new URL(raw.url).origin + "/" : undefined))
      : null;
  return {
    url: id ? `https://www.xiaohongshu.com/explore/${id}` : (canonicalUrl(raw.url) ?? ""),
    noteId: id ?? "",
    title: String(raw.title ?? "").trim(),
    body: cleanDesc(String(raw.desc ?? "")),
    likes: parseCount(raw.likedCount),
    collects: parseCount(raw.collectedCount),
    comments: parseCount(raw.commentCount),
    published_at: ts ? new Date(ts).toLocaleDateString("sv-SE") : null,
    author: raw.author ?? null,
    type: raw.type ?? null,
    cover,
    imageCount: Number(raw.imageCount) || 0,
  };
}
