import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CoverSpec } from "@/lib/types";
import { GB2312_HAN } from "@/lib/gb2312";

/**
 * 封面出图：GET /api/cover?s=<encodeURIComponent(JSON.stringify(CoverSpec))>
 * 输出 1080×1440（小红书 3:4）PNG。
 * 三套模板：bigword 大字报 / list 清单 / note 笔记纸感。想加新模板就在下面加一个函数。
 */

const W = 1080;
const H = 1440;

/**
 * 字体：优先用项目自带的 fonts/ 目录（思源黑体 GB2312 常用字子集，约 1.5MB）；
 * 遇到子集里没有的生僻字，再从 Google Fonts 按需补字（部署在 Vercel 上可用）。
 */
const LOCAL_FONTS: Record<number, string> = {
  900: "NotoSansSC-Black-GB2312.otf",
  500: "NotoSansSC-Medium-GB2312.otf",
};
const localCache = new Map<number, ArrayBuffer | null>();

async function loadLocalFont(weight: number): Promise<ArrayBuffer | null> {
  if (localCache.has(weight)) return localCache.get(weight)!;
  try {
    const buf = await readFile(path.join(/*turbopackIgnore: true*/ process.cwd(), "fonts", LOCAL_FONTS[weight]));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    localCache.set(weight, ab);
    return ab;
  } catch {
    localCache.set(weight, null);
    return null;
  }
}

async function loadGoogleFont(text: string, weight: number): Promise<ArrayBuffer | null> {
  try {
    const css = await (
      await fetch(
        `https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@${weight}&text=${encodeURIComponent(text)}`,
        { signal: AbortSignal.timeout(5000) }
      )
    ).text();
    const url = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1];
    if (!url) return null;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

function hasRareChars(text: string) {
  // GB2312 以外的汉字（生僻字）
  return [...text].some((ch) => /\p{Script=Han}/u.test(ch) && !GB2312_HAN.has(ch));
}

function lines(s: string) {
  return s.split(/\\n|\n/).filter(Boolean);
}

/** 按最长一行的字数自动缩小字号，保证一行放得下、不出现单字掉行 */
function fit(text: string, width: number, max: number) {
  const longest = Math.max(...lines(text).map((l) => [...l].reduce((n, ch) => n + (/[\x00-\x7f]/.test(ch) ? 0.6 : 1), 0)), 1);
  return Math.min(max, Math.floor(width / (longest * 1.04)));
}

function BigWord({ spec }: { spec: CoverSpec }) {
  const color = spec.color || "#FF2E4D";
  return (
    <div style={{ width: W, height: H, display: "flex", flexDirection: "column", background: color, padding: 90, color: "#fff" }}>
      {spec.badge ? (
        <div style={{ display: "flex", alignSelf: "flex-start", background: "#FFE45C", color: "#222", fontSize: 48, fontWeight: 900, padding: "12px 32px", borderRadius: 16 }}>
          {spec.badge}
        </div>
      ) : (
        <div style={{ display: "flex", height: 72 }} />
      )}
      <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }}>
        {lines(spec.main).map((l, i) => (
          <div key={i} style={{ display: "flex", fontSize: fit(spec.main, W - 180, 150), fontWeight: 900, lineHeight: 1.2 }}>
            {l}
          </div>
        ))}
        {spec.sub ? (
          <div style={{ display: "flex", marginTop: 60, fontSize: 56, fontWeight: 500, background: "rgba(0,0,0,0.18)", padding: "18px 30px", borderRadius: 14, alignSelf: "flex-start" }}>
            {spec.sub}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function List({ spec }: { spec: CoverSpec }) {
  const color = spec.color || "#2D6BFF";
  return (
    <div style={{ width: W, height: H, display: "flex", flexDirection: "column", background: "#F7F4EE", padding: 80 }}>
      <div style={{ display: "flex", flexDirection: "column", background: color, color: "#fff", borderRadius: 28, padding: "50px 56px" }}>
        {spec.badge ? <div style={{ display: "flex", fontSize: 44, fontWeight: 500, opacity: 0.9, marginBottom: 12 }}>{spec.badge}</div> : null}
        {lines(spec.main).map((l, i) => (
          <div key={i} style={{ display: "flex", fontSize: fit(spec.main, W - 160 - 112, 104), fontWeight: 900, lineHeight: 1.2 }}>{l}</div>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center", marginTop: 40 }}>
        {(spec.lines ?? []).slice(0, 5).map((l, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", marginBottom: 34, background: "#fff", borderRadius: 20, padding: "28px 36px", fontSize: 58, fontWeight: 900, color: "#222" }}>
            <div style={{ display: "flex", width: 76, height: 76, borderRadius: 38, background: color, color: "#fff", alignItems: "center", justifyContent: "center", fontSize: 44, marginRight: 30 }}>
              {i + 1}
            </div>
            {l}
          </div>
        ))}
      </div>
      {spec.sub ? <div style={{ display: "flex", justifyContent: "center", fontSize: 48, fontWeight: 500, color: "#555" }}>{spec.sub}</div> : null}
    </div>
  );
}

function Note({ spec }: { spec: CoverSpec }) {
  const color = spec.color || "#FFE45C";
  return (
    <div style={{ width: W, height: H, display: "flex", background: "#EDE6D8", padding: 70 }}>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, background: "#FFFDF7", borderRadius: 24, padding: "90px 80px", boxShadow: "0 12px 40px rgba(0,0,0,0.12)" }}>
        {spec.badge ? (
          <div style={{ display: "flex", alignSelf: "flex-start", border: "4px solid #E5484D", color: "#E5484D", fontSize: 46, fontWeight: 900, padding: "8px 26px", borderRadius: 12, transform: "rotate(-4deg)" }}>
            {spec.badge}
          </div>
        ) : null}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }}>
          {lines(spec.main).map((l, i) => (
            <div key={i} style={{ display: "flex", alignSelf: "flex-start", fontSize: fit(spec.main, W - 140 - 160, 128), fontWeight: 900, color: "#1F1F1F", lineHeight: 1.25, backgroundImage: `linear-gradient(transparent 58%, ${color} 58%)`, marginBottom: 10 }}>
              {l}
            </div>
          ))}
          {spec.sub ? <div style={{ display: "flex", marginTop: 56, fontSize: 54, fontWeight: 500, color: "#444", lineHeight: 1.5 }}>{spec.sub}</div> : null}
        </div>
      </div>
    </div>
  );
}

export async function GET(req: Request) {
  let spec: CoverSpec;
  try {
    spec = JSON.parse(new URL(req.url).searchParams.get("s") || "");
  } catch {
    return new Response("参数 s 不是合法 JSON", { status: 400 });
  }
  if (!spec?.main) return new Response("缺少主文案", { status: 400 });

  const allText = [spec.main, spec.sub, spec.badge, ...(spec.lines ?? []), "0123456789"].join("");
  const fonts: { name: string; data: ArrayBuffer; weight: 900 | 500; style: "normal" }[] = [];
  for (const weight of [900, 500] as const) {
    const local = await loadLocalFont(weight);
    if (local) fonts.push({ name: "Noto Sans SC", data: local, weight, style: "normal" });
    if (!local || hasRareChars(allText)) {
      const remote = await loadGoogleFont(allText, weight);
      if (remote) fonts.push({ name: "Noto Sans SC", data: remote, weight, style: "normal" });
    }
  }
  if (!fonts.length) return new Response("没有可用的中文字体：请确认 fonts/ 目录已上传", { status: 500 });

  const el = spec.layout === "list" ? <List spec={spec} /> : spec.layout === "note" ? <Note spec={spec} /> : <BigWord spec={spec} />;
  return new ImageResponse(
    <div style={{ display: "flex", fontFamily: "Noto Sans SC" }}>{el}</div>,
    { width: W, height: H, fonts, headers: { "Cache-Control": "public, max-age=86400" } }
  );
}
