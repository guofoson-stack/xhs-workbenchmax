import "server-only";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * 提示词放在项目根目录的 prompts/ 文件夹里，用记事本就能改，保存后下一次请求立即生效，不用重启、不用重新构建。
 *   prompts/拆解提示词.md   —— 拆解爆款时给 AI 的规则
 *   prompts/生成提示词.md   —— 生成新笔记时给 AI 的规则
 *   prompts/默认/           —— 原版备份，改坏了可以从这里拷回去
 */
const DIR = path.join(/*turbopackIgnore: true*/ process.cwd(), "prompts");

async function readPrompt(name: string) {
  for (const file of [path.join(/*turbopackIgnore: true*/ DIR, name), path.join(/*turbopackIgnore: true*/ DIR, "默认", name)]) {
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
