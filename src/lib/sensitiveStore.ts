import "server-only";
import fs from "node:fs";
import path from "node:path";
import { WORKBENCH_HOME } from "@/lib/config";
import { DEFAULT_RULES, parseCustom, type Rule } from "@/lib/sensitive";

/** 自定义违禁词存在「爆款工作台数据\违禁词.txt」，自动更新不会覆盖 */
const FILE = path.join(/*turbopackIgnore: true*/ WORKBENCH_HOME, "违禁词.txt");

export function readCustomWords() {
  try {
    return fs.readFileSync(FILE, "utf8").replace(/^﻿/, "");
  } catch {
    return "";
  }
}

export function writeCustomWords(text: string) {
  fs.mkdirSync(WORKBENCH_HOME, { recursive: true });
  fs.writeFileSync(FILE, text, "utf8");
}

export function allRules(): Rule[] {
  return [...DEFAULT_RULES, ...parseCustom(readCustomWords())];
}
