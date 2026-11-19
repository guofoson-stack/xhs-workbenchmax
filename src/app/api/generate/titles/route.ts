import { NextResponse } from "next/server";
import { chatJson } from "@/lib/ai";
import { allRules } from "@/lib/sensitiveStore";
import { avoidList } from "@/lib/sensitive";
import { loadContext } from "@/lib/genContext";
import { pickSources, similarity } from "@/lib/imitate";

export const maxDuration = 120;

/** 换标题：用库里几篇不同爆款的标题模板，各写一个标题给你挑 */
export async function POST(req: Request) {
  try {
    const b = await req.json();
    const { exam, input, category, scenes, model } = loadContext(b);
    const seen = new Set<string>();
    const sources = pickSources({ category, scenes, count: 8 })
      .filter((s) => s.el.title && !seen.has(s.noteId) && seen.add(s.noteId))
      .slice(0, 5);
    if (!sources.length) return NextResponse.json({ error: "爆款库里还没有标题模板" }, { status: 400 });

    const out = await chatJson<{ titles: string[] }>(
      [
        {
          role: "system",
          content: `你在写小红书标题。我给你几个爆款标题模板，每个模板写一个新标题：保留模板里除了 {槽位} 以外的固定字词、句式和标点，只把槽位换成目标考试的信息；模板话题和选题场景对不上时，可以只替换话题词。不超过 20 个字。
这些词会被限流，不要用：
${avoidList(allRules())}
只输出 JSON：{"titles": ["..."]}，数量和顺序与模板一致。`,
        },
        {
          role: "user",
          content: `目标考试：${exam?.short_name || input}
选题场景：${scenes[0]}
这篇笔记正文的开头（标题要和内容对得上）：${String(b.body ?? "").slice(0, 300)}

模板：
${sources.map((s, i) => `${i + 1}. ${s.el.title!.template}`).join("\n")}`,
        },
      ],
      { model, temperature: 0.7 }
    );

    const titles = sources
      .map((s, i) => {
        const t = (out.titles?.[i] ?? "").trim();
        return t ? { title: t, template: s.el.title!.template, note_title: s.noteTitle, note_id: s.noteId, similarity: similarity(s.el.title!.template, t) } : null;
      })
      .filter(Boolean);
    return NextResponse.json({ titles });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
