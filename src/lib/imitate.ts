import "server-only";
import { all, parseJsonCol } from "@/lib/db";
import type { ElementType } from "@/lib/types";

export { targetScenes } from "@/lib/examInfo";

/* ================= 2. 给每一版挑一篇要模仿的爆款 ================= */

interface El {
  id: string;
  note_id: string;
  type: ElementType;
  template: string;
  pattern: string | null;
  detail: string | null;
  rating: number;
  use_count: number;
  heat: number;
  scene: string | null;
  exam_category: string | null;
  note_title: string;
  note_url: string | null;
  note_likes: number | null;
  note_collects: number | null;
}

export interface Source {
  noteId: string;
  noteTitle: string;
  noteUrl: string | null;
  scene: string | null;
  likes: number | null;
  collects: number | null;
  el: Partial<Record<ElementType, El & { detailObj: Record<string, unknown> }>>;
  borrowed: ElementType[]; // 这篇自己没有、从别的爆款补的积木
}

const TYPES: ElementType[] = ["title", "cover", "structure", "hook", "cta", "tags"];

export function pickSources(opts: { category: string; scenes: string[]; count: number; noteId?: string; exclude?: string[] }): Source[] {
  const rows = all<El>(
    "select id,note_id,type,template,pattern,detail,rating,use_count,heat,scene,exam_category,note_title,note_url,note_likes,note_collects from element_view where rating >= 2"
  );
  if (!rows.length) return [];

  const byNote = new Map<string, El[]>();
  for (const r of rows) byNote.set(r.note_id, [...(byNote.get(r.note_id) ?? []), r]);

  const sceneScore = (sc: string | null) => {
    if (!sc) return 1;
    const i = opts.scenes.indexOf(sc);
    return i === 0 ? 10 : i === 1 ? 6 : i === 2 ? 4 : 0; // 场景是第一优先，权重要大过类别和热度
  };
  const noteScore = (els: El[]) => {
    const f = els[0];
    const avgRating = els.reduce((s, e) => s + e.rating, 0) / els.length;
    const uses = els.reduce((s, e) => s + (e.use_count ?? 0), 0);
    return sceneScore(f.scene) + (f.exam_category === opts.category ? 2 : 0) + avgRating + Math.log10((f.heat ?? 0) + 1) * 1.5 - uses * 0.3;
  };

  let notes: El[][];
  if (opts.noteId && byNote.has(opts.noteId)) {
    notes = Array(opts.count).fill(byNote.get(opts.noteId)!);
  } else {
    const excluded = new Set(opts.exclude ?? []);
    let ranked = [...byNote.values()].filter((els) => els.some((e) => e.type === "title")).sort((a, b) => noteScore(b) - noteScore(a));
    // 换一篇模仿时排除已经用过的；全都用过了就不排除
    if (ranked.some((els) => !excluded.has(els[0].note_id))) ranked = ranked.filter((els) => !excluded.has(els[0].note_id));
    if (!ranked.length) return [];
    notes = Array.from({ length: opts.count }, (_, i) => ranked[i % ranked.length]);
  }

  // 某类积木这篇没有时，从同场景里评分高的爆款补；不同版本轮流用不同的，避免几版长得一样
  const bestOf = (type: ElementType, excludeNote: string, k: number) => {
    const list = rows
      .filter((r) => r.type === type && r.note_id !== excludeNote)
      .sort((a, b) => sceneScore(b.scene) - sceneScore(a.scene) || b.rating - a.rating || b.heat - a.heat)
      .slice(0, 3);
    return list.length ? list[k % list.length] : undefined;
  };

  return notes.map((els, k) => {
    const f = els[0];
    const src: Source = {
      noteId: f.note_id,
      noteTitle: f.note_title,
      noteUrl: f.note_url,
      scene: f.scene,
      likes: f.note_likes,
      collects: f.note_collects,
      el: {},
      borrowed: [],
    };
    for (const t of TYPES) {
      let e: El | undefined = els.filter((x) => x.type === t).sort((a, b) => b.rating - a.rating)[0];
      if (!e) {
        e = bestOf(t, f.note_id, k);
        if (e) src.borrowed.push(t);
      }
      if (e) src.el[t] = { ...e, detailObj: parseJsonCol<Record<string, unknown>>(e.detail, {}) };
    }
    return src;
  });
}

/* ================= 3. 写给模型的「每版模仿任务」 ================= */

const LAYOUT_MAP: Record<string, string> = { bigword: "bigword", list: "list", note: "note", 大字报: "bigword", 清单: "list", 手写笔记: "note" };

export function sourcesBlock(sources: Source[], sameNote: boolean) {
  return sources
    .map((s, i) => {
      const e = s.el;
      const lines = [`### 第${i + 1}版：模仿这篇爆款`, `原笔记：「${s.noteTitle}」（场景：${s.scene ?? "未分类"}｜赞 ${s.likes ?? "?"}｜藏 ${s.collects ?? "?"}）`];
      if (e.title) lines.push(`- 标题模板：${e.title.template}　〔公式：${e.title.pattern ?? "-"}〕`);
      if (e.cover) {
        const d = e.cover.detailObj;
        const layout = LAYOUT_MAP[String(d.suggest_layout ?? "")] ?? LAYOUT_MAP[String(e.cover.pattern ?? "")] ?? "bigword";
        lines.push(`- 封面：用 ${layout} 版式；文案模板：${e.cover.template}${d.visual ? `；原封面元素：${JSON.stringify(d.visual)}` : ""}`);
      }
      if (e.structure) {
        const paras = Array.isArray(e.structure.detailObj.paragraphs) ? (e.structure.detailObj.paragraphs as { role?: string; sample?: string }[]) : [];
        lines.push(`- 正文结构：${e.structure.template}`);
        if (paras.length) lines.push(`  段落句式：${paras.map((p, k) => `${k + 1}.${p.role ?? ""}「${p.sample ?? ""}」`).join("　")}`);
        if (e.structure.detailObj.length) lines.push(`  原文长度：${e.structure.detailObj.length}`);
      }
      if (e.hook) lines.push(`- 开头句式：${e.hook.template}`);
      if (e.cta) lines.push(`- 结尾引导：${e.cta.template}`);
      if (e.tags) lines.push(`- 标签组合：${e.tags.template}`);
      return lines.join("\n");
    })
    .join("\n\n")
    .concat(sameNote ? "\n\n（这几版都模仿同一篇爆款，但每版的切入角度、开头和例子要不同。）" : "");
}

/* ================= 4. 借鉴度：新标题保留了模板多少固定字词 ================= */

const strip = (s: string) => s.replace(/\{[^}]*\}/g, "").replace(/[\s，,。.！!？?、：:；;「」『』“”"'（）()【】\[\]·…—\-~～|｜]/g, "");

function lcs(a: string, b: string) {
  const A = [...a];
  const B = [...b];
  const dp = Array(B.length + 1).fill(0);
  for (let i = 1; i <= A.length; i++) {
    let prev = 0;
    for (let j = 1; j <= B.length; j++) {
      const tmp = dp[j];
      dp[j] = A[i - 1] === B[j - 1] ? prev + 1 : Math.max(dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[B.length];
}

/** 0~1：模板里的固定字（去掉槽位和标点）按顺序在新标题里出现了多少 */
export function similarity(template: string, title: string) {
  const fixed = strip(template);
  if (fixed.length < 3) return null; // 模板几乎全是槽位，没法比
  return Math.round((lcs(fixed, strip(title)) / [...fixed].length) * 100) / 100;
}
