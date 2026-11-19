import { NextResponse } from "next/server";
import { chatJson } from "@/lib/ai";
import { generateSystem, generateUser } from "@/lib/prompts";
import { examBlock } from "@/lib/retrieve";
import { allRules } from "@/lib/sensitiveStore";
import { avoidList } from "@/lib/sensitive";
import { loadContext, repairTitles, toVersion, type RawVersion } from "@/lib/genContext";
import { pickSources, sourcesBlock } from "@/lib/imitate";
import type { GeneratedVersion } from "@/lib/types";

export const maxDuration = 180;

const SCOPE_TEXT = { all: "整版重写", title: "只改标题", cover: "只改封面文案", body: "只改正文和标签" } as const;
type Scope = keyof typeof SCOPE_TEXT;

/**
 * 重写单个版本：可以只改标题 / 封面 / 正文，可以带修改意见，也可以换一篇爆款来模仿。
 * 范围以外的部分保持不变。
 */
export async function POST(req: Request) {
  try {
    const b = await req.json();
    const old = b.version as GeneratedVersion;
    if (!old?.title && !old?.body) return NextResponse.json({ error: "缺少要重写的版本" }, { status: 400 });
    const scope: Scope = b.scope in SCOPE_TEXT ? b.scope : "all";
    const feedback = String(b.feedback ?? "").trim();
    const { exam, input, category, mode, scenes, sceneReason, model } = loadContext(b);

    // 模仿对象：换一篇（排除当前和其他版本用过的），或者沿用原来那篇
    const used = [old.source?.note_id, ...((b.used_notes as string[]) ?? [])].filter(Boolean) as string[];
    const [source] = b.swap
      ? pickSources({ category, scenes, count: 1, exclude: used })
      : pickSources({ category, scenes, count: 1, noteId: old.source?.note_id });
    if (!source) return NextResponse.json({ error: "爆款库里没有可模仿的笔记" }, { status: 400 });

    const current = `【当前这一版】（在它的基础上改）
标题：${old.title}
封面：${JSON.stringify(old.cover)}
正文：
${old.body}
标签：${(old.tags ?? []).join(" ")}

【这次要改】
范围：${SCOPE_TEXT[scope]}${scope === "all" ? "" : "（范围以外的部分原样照抄，不要动）"}
${b.swap ? "模仿对象：已经换成上面这篇新的爆款，按它的模板和结构来写。\n" : ""}修改意见：${feedback || "整体写得更好、更像爆款"}
只输出 1 个版本（versions 数组里放 1 个）。`;

    const out = await chatJson<{ versions: RawVersion[] }>(
      [
        { role: "system", content: await generateSystem() },
        {
          role: "user",
          content: generateUser({
            examBlock: examBlock(exam, input),
            scenes,
            sceneReason,
            sourcesBlock: sourcesBlock([source], false),
            mode,
            extra: current,
            avoid: avoidList(allRules()),
          }),
        },
      ],
      { model, temperature: 0.8 }
    );
    const fresh = out.versions?.[0];
    if (!fresh) return NextResponse.json({ error: "模型没有返回内容，再试一次" }, { status: 500 });

    // 按范围合并：范围外保留原样
    const merged: RawVersion = {
      title: scope === "all" || scope === "title" ? fresh.title : old.title,
      cover: scope === "all" || scope === "cover" ? fresh.cover : old.cover,
      body: scope === "all" || scope === "body" ? fresh.body : old.body,
      tags: scope === "all" || scope === "body" ? fresh.tags : old.tags,
      how: fresh.how || old.how,
    };
    if (mode === "imitate" && (scope === "all" || scope === "title")) {
      await repairTitles([merged], [source], exam?.short_name || input, scenes[0], model);
    }
    return NextResponse.json({ version: toVersion(merged, source, input) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
