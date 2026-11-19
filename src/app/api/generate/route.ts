import { NextResponse } from "next/server";
import { chatJson } from "@/lib/ai";
import { generateSystem, generateUser } from "@/lib/prompts";
import { get, newId, run } from "@/lib/db";
import { elementsBlock, examBlock, pickElements } from "@/lib/retrieve";
import type { Exam, GeneratedVersion } from "@/lib/types";

export const maxDuration = 180;

/** 生成：输入考试 → 取考情 + 检索积木 → 模型搭配改写 → 多个版本 */
export async function POST(req: Request) {
  try {
    const { exam_id, exam_input, category, count = 3, extra } = await req.json();

    const exam = exam_id ? (get<Exam>("select * from exams where id = ?", exam_id) ?? null) : null;
    const input = exam?.name ?? String(exam_input ?? "").trim();
    if (!input) return NextResponse.json({ error: "请选择或输入考试" }, { status: 400 });
    const cat = exam?.category ?? category ?? "事业单位";

    const rows = pickElements(cat);
    const n = Math.min(5, Math.max(1, Number(count) || 3));

    const out = await chatJson<{ versions: GeneratedVersion[] }>(
      [
        { role: "system", content: await generateSystem() },
        {
          role: "user",
          content: generateUser({ examBlock: examBlock(exam, input), elementsBlock: elementsBlock(rows), count: n, extra }),
        },
      ],
      { model: process.env.AI_TEXT_MODEL || undefined, temperature: 0.9 }
    );

    // 只保留真实存在的积木 id，防止模型乱填
    const valid = new Set(rows.map((r) => r.id));
    const versions = (out.versions ?? []).map((v) => {
      const refs = Object.fromEntries(
        Object.entries(v.refs ?? {}).filter(([, id]) => typeof id === "string" && valid.has(id))
      );
      const cover = v.cover?.main ? v.cover : { layout: "bigword" as const, main: v.title ?? input };
      return { ...v, cover, refs, tags: v.tags ?? [], title: (v.title ?? "").slice(0, 20) };
    });

    const id = newId();
    run(
      "insert into generations (id,exam_id,exam_input,versions) values (?,?,?,?)",
      id,
      exam?.id ?? null,
      input,
      JSON.stringify(versions)
    );
    return NextResponse.json({ id, versions, used: rows.length, hasExam: !!exam });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
