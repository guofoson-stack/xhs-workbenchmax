/**
 * 结构化考情：时间线 / 笔试科目 / 关键信息 / 备考提示 分开存。
 * 时间线的「已结束 / 进行中 / 未开始」和「当前阶段」都按今天的日期实时计算，不会过期。
 * 这个文件前后端共用（不能引用服务端模块）。
 */

export interface TimelineRow {
  date: string; // 开始日期 YYYY-MM-DD，未公布留空
  end?: string; // 结束日期 YYYY-MM-DD（报名、确认这类时间段才有）
  event: string; // 事项：报名 / 笔试 / 查成绩 …
  note?: string; // 补充：具体时刻、地点、入口
  basis: string; // 依据：「本届」或「往年·2026年度」
}

export interface SubjectRow {
  name: string;
  detail?: string;
  basis: string;
}

export interface FactRow {
  label: string;
  value: string;
  basis: string;
}

export interface ExamInfo {
  cycle: string; // 届次，如「2027年度」
  stageHint?: string; // AI 写的阶段说明（时间线没有日期时才用）
  timeline: TimelineRow[];
  subjects: SubjectRow[];
  facts: FactRow[];
  tips: string[];
  missing: string[];
  warnings?: string;
  confidence?: string;
  sources?: { title: string; url: string; site?: string | null; date?: string | null; used_for?: string }[];
}

export type Status = "已结束" | "进行中" | "未开始" | "待公布";

export const todayStr = () => new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD（本地时区）

export const isCurrent = (basis: string) => !basis || basis.startsWith("本届");

export function statusOf(r: TimelineRow, today = todayStr()): Status {
  if (!r.date) return "待公布";
  const end = r.end || r.date;
  if (end < today) return "已结束";
  if (r.date <= today) return "进行中";
  return "未开始";
}

/** 「2026-11-14」→「11月14日」；不是今年的带上年份 */
export function fmtDate(d?: string) {
  if (!d) return "";
  const [y, m, day] = d.split("-").map(Number);
  if (!y || !m || !day) return d;
  return `${y !== new Date().getFullYear() ? y + "年" : ""}${m}月${day}日`;
}

export function fmtRange(r: TimelineRow) {
  if (!r.date) return "待公布";
  return r.end && r.end !== r.date ? `${fmtDate(r.date)}—${fmtDate(r.end)}` : fmtDate(r.date);
}

export function sortTimeline(rows: TimelineRow[]) {
  return [...rows].sort((a, b) => {
    if (isCurrent(a.basis) !== isCurrent(b.basis)) return isCurrent(a.basis) ? -1 : 1;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date.localeCompare(b.date);
  });
}

/** 按今天自动判断当前阶段 */
export function computeStage(info: Pick<ExamInfo, "timeline" | "stageHint">, today = todayStr()) {
  const cur = sortTimeline(info.timeline.filter((r) => isCurrent(r.basis)));
  const dated = cur.filter((r) => r.date);
  if (!dated.length) return { now: info.stageHint || "本届时间还没公布", next: "" };
  const ongoing = dated.filter((r) => statusOf(r, today) === "进行中");
  const past = dated.filter((r) => statusOf(r, today) === "已结束");
  const upcoming = dated.filter((r) => statusOf(r, today) === "未开始");
  const pending = cur.filter((r) => !r.date);

  const now = ongoing.length
    ? `正在进行：${ongoing.map((r) => `${r.event}（${fmtRange(r)}）`).join("、")}`
    : past.length
      ? `${past[past.length - 1].event}已结束（${fmtRange(past[past.length - 1])}）`
      : "还没开始报名";
  const next = upcoming.length
    ? `下一步：${fmtRange(upcoming[0])} ${upcoming[0].event}`
    : pending.length
      ? `下一步：${pending.map((r) => r.event).join("、")}（时间待公布）`
      : past.length
        ? "本届流程已基本结束，可以关注下一届"
        : "";
  return { now, next };
}

/** 生成笔记时给模型看的文字版（状态按今天实时算） */
export function examInfoToText(name: string, info: ExamInfo) {
  const today = todayStr();
  const { now, next } = computeStage(info, today);
  const lines: string[] = [`考试：${name}${info.cycle ? `（${info.cycle}）` : ""}`, `当前阶段（按今天 ${today} 自动判断）：${now}${next ? "；" + next : ""}`];
  const tl = sortTimeline(info.timeline);
  if (tl.length) {
    lines.push("时间线：");
    for (const r of tl) lines.push(`- [${isCurrent(r.basis) ? statusOf(r, today) : r.basis}] ${fmtRange(r)} ${r.event}${r.note ? `（${r.note}）` : ""}`);
  }
  if (info.subjects.length) {
    lines.push("笔试科目：");
    for (const s of info.subjects) lines.push(`- ${s.name}${s.detail ? `：${s.detail}` : ""}${isCurrent(s.basis) ? "" : `〔${s.basis}〕`}`);
  }
  if (info.facts.length) {
    lines.push("关键信息：");
    for (const f of info.facts) lines.push(`- ${f.label}：${f.value}${isCurrent(f.basis) ? "" : `〔${f.basis}〕`}`);
  }
  if (info.tips.length) {
    lines.push("备考提示：");
    for (const t of info.tips) lines.push(`- ${t}`);
  }
  lines.push("注意：标〔往年〕的内容只能当参考，写进笔记时要说明是往年情况，不能说成本届。");
  return lines.join("\n");
}

export function emptyInfo(): ExamInfo {
  return { cycle: "", timeline: [], subjects: [], facts: [], tips: [], missing: [] };
}

export function parseInfo(v: unknown): ExamInfo | null {
  if (!v) return null;
  try {
    const o = typeof v === "string" ? JSON.parse(v) : v;
    return {
      ...emptyInfo(),
      ...o,
      timeline: o.timeline ?? [],
      subjects: o.subjects ?? [],
      facts: o.facts ?? [],
      tips: o.tips ?? [],
      missing: o.missing ?? [],
    };
  } catch {
    return null;
  }
}

/* ================= 1. 按考情阶段推断「该写什么场景」 ================= */

const DAY = 86400000;
const days = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / DAY);

export function targetScenes(info: ExamInfo | null, today = todayStr()): { scenes: string[]; reason: string } {
  const general = { scenes: ["备考方法", "资料推荐", "上岸经验"], reason: "没有时间线，按通用备考选题" };
  if (!info) return general;
  const rows = info.timeline.filter((r) => isCurrent(r.basis) && r.date);
  if (!rows.length) return general;
  const find = (re: RegExp, not?: RegExp) => rows.find((r) => re.test(r.event) && !(not && not.test(r.event)));
  const signup = find(/报名/, /确认|缴费/);
  const written = find(/笔试/, /确认|成绩|准考证|大纲/);
  const interview = find(/面试/, /确认|名单/);

  if (signup && today <= (signup.end || signup.date)) {
    if (today >= signup.date) return { scenes: ["报名指导", "公告解读", "备考方法"], reason: "正在报名" };
    const d = days(signup.date, today);
    return d <= 7
      ? { scenes: ["报名指导", "公告解读", "备考方法"], reason: `${d} 天后开始报名` }
      : { scenes: ["公告解读", "报名指导", "备考方法"], reason: `公告已出，${d} 天后开始报名` };
  }
  if (written && today < written.date) {
    const d = days(written.date, today);
    return d <= 14
      ? { scenes: ["考前冲刺", "备考方法", "资料推荐"], reason: `离笔试还有 ${d} 天` }
      : { scenes: ["备考方法", "资料推荐", "考前冲刺"], reason: `离笔试还有 ${d} 天` };
  }
  if (written && today >= written.date) {
    if (interview && today >= interview.date) return { scenes: ["面试", "上岸经验"], reason: "面试阶段" };
    return { scenes: ["考后估分", "面试", "上岸经验"], reason: "笔试已考完，等成绩 / 准备面试" };
  }
  if (signup) return { scenes: ["备考方法", "资料推荐", "考前冲刺"], reason: "报名已结束，等笔试" };
  return general;
}

