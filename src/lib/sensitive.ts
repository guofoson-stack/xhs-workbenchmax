/**
 * 发布前违禁词检查（前后端共用）。
 * 内置一份小红书「考试资料」赛道常见的限流词，另外可以在「设置 → 违禁词」里加自己的词。
 * 自定义格式：一行一个，「词|类别|替换成」，后两项可省略。
 * 以 re: 开头表示正则，正则行用「 | 」（两边空格）分隔，如：re:\d+天(上岸|速成) | 承诺夸大
 */

export interface Rule {
  pattern: string; // 字面词，或 re: 开头的正则
  label: string; // 给人看的说明，如「微信 / VX / 加V」
  category: string; // 导流 / 交易 / 极限词 / 承诺夸大 / 自定义
  tip: string; // 怎么改
  replace?: Record<string, string> | string; // 一键替换：统一替换成某个词，或按命中词分别替换
}

export const DEFAULT_RULES: Rule[] = [
  {
    pattern: "re:微信|威信|薇信|[Vv]信|[Vv][Xx]|[Ww][Xx]|加[Vv]|[➕＋+][Vv]|wei信",
    label: "微信 / VX / 加V",
    category: "导流",
    tip: "站外联系方式，最容易限流。删掉，改成在评论区互动",
  },
  {
    pattern: "re:私信我?|私我|私聊我?|滴滴我|[dD]{2}我|戳我",
    label: "私信 / 私我 / 滴滴我",
    category: "导流",
    tip: "改成「评论区留言」",
    replace: "评论区留言",
  },
  {
    pattern: "re:(看|见|戳|点)我?的?(主页|简介|置顶)|(主页|简介|置顶)(有|见|自取|领)",
    label: "看主页 / 简介自取",
    category: "导流",
    tip: "引导去主页拿东西会被判导流，删掉或改成「收藏这篇」",
  },
  {
    pattern: "re:二维码|扫码|进群|加群|社群|粉丝群|[Qq]{2}群|公众号|百度网盘|夸克网盘|阿里云盘|网盘|淘宝|闲鱼|拼多多|链接自取",
    label: "二维码 / 进群 / 网盘 / 淘宝",
    category: "导流",
    tip: "站外渠道，删掉",
  },
  {
    pattern: "re:免费领|免费送|送资料|白嫖|(评论区|留言)?自取|领取",
    label: "免费领 / 自取 / 领取",
    category: "导流",
    tip: "「领资料」类说法容易被判导流，改成「收藏」「评论区交流」",
  },
  {
    pattern: "re:价格|多少钱|收费|付费|有偿|下单|拍下|出售|售卖|转卖|代理|￥|¥|\\d+\\s*(元|块钱?)",
    label: "价格 / 收费 / 下单 / X元",
    category: "交易",
    tip: "笔记里不要出现交易信息，删掉",
  },
  {
    pattern: "re:全网最|史上最|最(全|好|强|佳|准|权威|靠谱|有效|牛|划算|便宜)",
    label: "最全 / 最好 / 全网最",
    category: "极限词",
    tip: "广告法极限词，改成「超」「很」",
    replace: { 全网最: "超", 史上最: "超", 最全: "超全", 最好: "很好", 最强: "超强", 最佳: "很好", 最准: "很准", 最权威: "很权威", 最靠谱: "很靠谱", 最有效: "很有效", 最牛: "超牛", 最划算: "很划算", 最便宜: "很便宜" },
  },
  {
    pattern: "re:排名第一|全网第一|行业第一|第一(名|品牌)|[Nn][Oo]\\.?1|TOP\\s?1|顶级|独家|百分百|100%",
    label: "第一名 / 独家 / 顶级 / 100%",
    category: "极限词",
    tip: "广告法极限词，删掉或换成具体描述",
  },
  {
    pattern: "re:保过|包过|必过|稳过|[包保稳必]上岸|一定(能)?上岸|不过退款|过不了退",
    label: "保过 / 包上岸 / 不过退款",
    category: "承诺夸大",
    tip: "考试类承诺，平台和法规都不允许，删掉",
  },
  {
    pattern: "re:押题|押中|命中率|原题|泄题|内部(资料|渠道|消息|整理)",
    label: "押题 / 原题 / 内部资料",
    category: "承诺夸大",
    tip: "暗示有特殊渠道，容易被判违规",
    replace: { 押题: "高频考点", 押中: "覆盖到", 内部资料: "整理资料", 内部整理: "自己整理", 内部渠道: "公开渠道", 内部消息: "公开信息" },
  },
];

/** 解析用户自定义词表 */
export function parseCustom(text: string): Rule[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      // 正则里本身有 |，所以正则行只认「 | 」（两边带空格）或全角「｜」做分隔
      const parts = l.startsWith("re:") ? l.split(/\s+\|\s+|｜/) : l.split(/[|｜]/);
      const [word, category, rep] = parts.map((s) => s.trim());
      return {
        pattern: word,
        label: word.replace(/^re:/, ""),
        category: category || "自定义",
        tip: rep ? `改成「${rep}」` : "自定义的违禁词，删掉或换个说法",
        replace: rep || undefined,
      } as Rule;
    })
    .filter((r) => r.pattern && r.pattern !== "re:");
}

function toRegex(r: Rule): RegExp | null {
  try {
    if (r.pattern.startsWith("re:")) return new RegExp(r.pattern.slice(3), "g");
    return new RegExp(r.pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
  } catch {
    return null;
  }
}

export interface Hit {
  start: number;
  end: number;
  text: string;
  rule: Rule;
}

export function findHits(text: string, rules: Rule[]): Hit[] {
  const hits: Hit[] = [];
  for (const rule of rules) {
    const re = toRegex(rule);
    if (!re) continue;
    for (const m of text.matchAll(re)) {
      if (!m[0]) continue;
      hits.push({ start: m.index!, end: m.index! + m[0].length, text: m[0], rule });
    }
  }
  // 去掉重叠的（保留先出现、更长的）
  hits.sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Hit[] = [];
  for (const h of hits) if (!out.length || h.start >= out[out.length - 1].end) out.push(h);
  return out;
}

export function replacementOf(h: Hit): string | null {
  const r = h.rule.replace;
  if (r === undefined) return null;
  if (typeof r === "string") return r;
  return r[h.text] ?? null;
}

/** 把能自动替换的都换掉，返回新文本和替换了几处 */
export function autoReplace(text: string, rules: Rule[]) {
  const hits = findHits(text, rules).filter((h) => replacementOf(h) !== null);
  let out = "";
  let last = 0;
  for (const h of hits) {
    out += text.slice(last, h.start) + replacementOf(h);
    last = h.end;
  }
  return { text: out + text.slice(last), count: hits.length };
}

/** 写给模型的「不要用这些词」 */
export function avoidList(rules: Rule[]) {
  const byCat = new Map<string, string[]>();
  for (const r of rules) byCat.set(r.category, [...(byCat.get(r.category) ?? []), r.label]);
  return [...byCat.entries()].map(([c, ls]) => `${c}：${ls.join("；")}`).join("\n");
}
