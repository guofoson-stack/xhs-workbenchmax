import fs from "node:fs/promises";
import path from "node:path";
import { COVER_DIR } from "@/lib/db";

const MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };

/** 查看入库笔记的原封面（存在 data/covers 里） */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams.get("path") ?? "";
  const file = path.resolve(/*turbopackIgnore: true*/ COVER_DIR, p);
  if (!p || !file.startsWith(path.resolve(COVER_DIR) + path.sep)) return new Response("路径不对", { status: 400 });
  try {
    const buf = await fs.readFile(file);
    const ext = path.extname(file).slice(1).toLowerCase();
    return new Response(new Uint8Array(buf), { headers: { "Content-Type": MIME[ext] ?? "application/octet-stream" } });
  } catch {
    return new Response("找不到图片", { status: 404 });
  }
}
