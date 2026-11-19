import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { WORKBENCH_HOME } from "@/lib/config";

/**
 * 提示词读取顺序：
 *   1. 爆款工作台数据/自定义提示词/拆解提示词.md、生成提示词.md —— 你自己改的版本，自动更新不会覆盖
 *   2. 程序文件夹 prompts/ —— 随版本更新
 * 用记事本改完保存，下一次请求立即生效，不用重启。
 */
const DIR = path.join(/*turbopackIgnore: true*/ process.cwd(), "prompts");

async function readPrompt(name: string) {
  const candidates = [
    path.join(/*turbopackIgnore: true*/ WORKBENCH_HOME, "自定义提示词", name), // 自己改过的版本优先，更新不会覆盖
    path.join(/*turbopackIgnore: true*/ DIR, name),
    path.join(/*turbopackIgnore: true*/ DIR, "默认", name),
  ];
  for (const file of candidates) {
    try {
      const text = await fs.readFile(file, "utf8");
      return text.replace(/^\uFEFF/, "").replace(/<!--[\s\S]*?-->/g, "").trim(); // 去掉记事本可能加的 BOM 和注释
    } catch {}
  }
  throw new Error(`找不到提示词文件 prompts/${name}`);
}

export const decomposeSystem = () => readPrompt("拆解提示词.md");
export const generateSystem = () => readPrompt("生成提示词.md");

export function decomposeUser(input: {
  title: string;
  body: string;
  cover_text?: string;
  likes?: number;
  collects?: number;
  comments?: number;
}) {
  return `请拆解这篇爆款笔记：

【标题】${input.title}
【数据】点赞 ${input.likes ?? "?"}，收藏 ${input.collects ?? "?"}，评论 ${input.comments ?? "?"}
【封面文字（人工填写，可能为空）】${input.cover_text || "（见图片）"}
【正文】
${input.body}`;
}

export function generateUser(input: {
  examBlock: string;
  elementsBlock: string;
  count: number;
  extra?: string;
}) {
  return `【目标考情】
${input.examBlock}

【可用积木】
${input.elementsBlock}

${input.extra ? `【本次额外要求】\n${input.extra}\n\n` : ""}请生成 ${input.count} 个版本。`;
}
