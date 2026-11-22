import "server-only";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * 配置和数据放在固定位置（不在程序文件夹里），换版本、自动更新都不会丢：
 *   Windows：C:\Users\你的用户名\爆款工作台数据\
 *     设置.json        —— 在网页「设置」页里改，不用手动编辑
 *     data\            —— 数据库、封面、备份
 *     自定义提示词\     —— 想改提示词时把文件放这里，会优先使用
 */
export const WORKBENCH_HOME =
  process.env.WORKBENCH_HOME || path.join(/*turbopackIgnore: true*/ os.homedir(), "爆款工作台数据");
const SETTINGS_FILE = path.join(/*turbopackIgnore: true*/ WORKBENCH_HOME, "设置.json");

export interface Settings {
  aiBaseUrl: string;
  aiApiKey: string;
  aiModel: string;
  aiTextModel: string;
  xhsCookie: string;
  searchApiKey: string; // DeepSeek 搜索接口的 Key；大模型用的就是 DeepSeek 时不用填
  appPassword: string;
  dailyQuota: number; // 每人每天至少采集几篇
  quotaDays: number[]; // 哪几天计入指标：0=周日 1=周一 … 6=周六
  updateRepo: string; // 自动更新：GitHub 仓库，格式 用户名/仓库名
  updateToken: string; // 私有仓库需要的 GitHub token
  radarRepo: string; // 销量雷达：手机上传数据的 GitHub 仓库，格式 用户名/仓库名
  radarToken: string; // 销量雷达：能读这个仓库的 GitHub 令牌
}

const DEFAULTS: Settings = {
  aiBaseUrl: "https://api.deepseek.com",
  aiApiKey: "",
  aiModel: "deepseek-flash",
  aiTextModel: "",
  xhsCookie: "",
  searchApiKey: "",
  appPassword: "",
  dailyQuota: 1,
  quotaDays: [1, 2, 3, 4, 5],
  updateRepo: "",
  updateToken: "",
  radarRepo: "guofoson-stack/xhs-radar",
  radarToken: "",
};

/** 每次调用都重新读文件：在设置页改完立即生效，不用重启 */
export function readSettings(): Settings {
  let saved: Partial<Settings> = {};
  try {
    saved = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8").replace(/^\uFEFF/, ""));
  } catch {}
  const env = process.env;
  return {
    aiBaseUrl: saved.aiBaseUrl || env.AI_BASE_URL || DEFAULTS.aiBaseUrl,
    aiApiKey: saved.aiApiKey || env.AI_API_KEY || "",
    aiModel: saved.aiModel || env.AI_MODEL || DEFAULTS.aiModel,
    aiTextModel: saved.aiTextModel ?? env.AI_TEXT_MODEL ?? "",
    xhsCookie: saved.xhsCookie || env.XHS_COOKIE || "",
    searchApiKey: saved.searchApiKey || "",
    appPassword: saved.appPassword ?? env.APP_PASSWORD ?? "",
    dailyQuota: Number.isFinite(Number(saved.dailyQuota)) && Number(saved.dailyQuota) >= 0 ? Number(saved.dailyQuota) : DEFAULTS.dailyQuota,
    quotaDays: Array.isArray(saved.quotaDays) ? saved.quotaDays.map(Number).filter((d) => d >= 0 && d <= 6) : DEFAULTS.quotaDays,
    updateRepo: saved.updateRepo ?? "",
    updateToken: saved.updateToken ?? "",
    radarRepo: saved.radarRepo || DEFAULTS.radarRepo,
    radarToken: saved.radarToken ?? "",
  };
}

export function writeSettings(patch: Partial<Settings>) {
  const next = { ...readSettings(), ...patch };
  fs.mkdirSync(WORKBENCH_HOME, { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2), "utf8");
  return next;
}

export function isPlaceholderKey(k: string) {
  return !k || /在这里填|your[-_ ]?key/i.test(k);
}

/** 联网搜索用的 Key：单独填了就用单独的；否则大模型是 DeepSeek 时直接用同一个 Key */
export function searchKey(s = readSettings()): string {
  if (s.searchApiKey) return s.searchApiKey;
  if (/deepseek\.com/i.test(s.aiBaseUrl) && !isPlaceholderKey(s.aiApiKey)) return s.aiApiKey;
  return "";
}
