import "server-only";

type Part =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

interface Message {
  role: "system" | "user" | "assistant";
  content: string | Part[];
}

/**
 * 调用任意 OpenAI 兼容的大模型接口（通义千问 / 豆包 / DeepSeek / Claude 等）。
 * 换模型只需要改环境变量，不用改代码。
 */
export async function chat(
  messages: Message[],
  opts: { model?: string; temperature?: number } = {}
): Promise<string> {
  const base = process.env.AI_BASE_URL;
  const key = process.env.AI_API_KEY;
  const model = opts.model || process.env.AI_MODEL;
  if (!base || !key || !model) throw new Error("缺少 AI_BASE_URL / AI_API_KEY / AI_MODEL 环境变量");

  const res = await fetch(base.replace(/\/$/, "") + "/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages, temperature: opts.temperature ?? 0.7 }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`模型接口报错 ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((c: { text?: string }) => c.text ?? "").join("");
  throw new Error("模型没有返回内容");
}

/** 从模型回复里取出 JSON（兼容包了 ```json 代码块或前后有废话的情况） */
export function parseJson<T>(raw: string): T {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const text = fenced ? fenced[1] : raw;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("模型没有返回 JSON：" + raw.slice(0, 200));
  return JSON.parse(text.slice(start, end + 1)) as T;
}

export async function chatJson<T>(messages: Message[], opts: { model?: string; temperature?: number } = {}): Promise<T> {
  const raw = await chat(messages, opts);
  try {
    return parseJson<T>(raw);
  } catch {
    // 格式不对时让模型自己修一次
    const fixed = await chat(
      [
        ...messages,
        { role: "assistant", content: raw },
        { role: "user", content: "上面的输出不是合法 JSON。请只输出修正后的 JSON，不要任何解释。" },
      ],
      { ...opts, temperature: 0 }
    );
    return parseJson<T>(fixed);
  }
}
