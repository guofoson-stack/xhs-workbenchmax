import { NextResponse } from "next/server";
import { chat } from "@/lib/ai";
import { readSettings } from "@/lib/config";

export const maxDuration = 60;

/** 测试大模型：发一句话，看能不能正常回复；可选再测一次看图 */
export async function POST(req: Request) {
  const { vision } = await req.json().catch(() => ({ vision: false }));
  const s = readSettings();
  const started = Date.now();
  try {
    const reply = await chat([{ role: "user", content: "请只回复四个字：连接成功" }], { temperature: 0 });
    const result: Record<string, unknown> = { ok: true, model: s.aiModel, reply: reply.slice(0, 50), ms: Date.now() - started };
    if (vision) {
      // 一张 1×1 的红色小图，测试模型能不能接收图片
      const png =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";
      try {
        const r = await chat(
          [
            {
              role: "user",
              content: [
                { type: "text", text: "这张图片是什么颜色？只回答颜色。" },
                { type: "image_url", image_url: { url: png } },
              ],
            },
          ],
          { temperature: 0 }
        );
        result.vision = { ok: true, reply: r.slice(0, 30) };
      } catch (e) {
        result.vision = { ok: false, error: (e as Error).message.slice(0, 200) };
      }
    }
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
