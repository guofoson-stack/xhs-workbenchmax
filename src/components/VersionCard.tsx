"use client";
import { useMemo, useState } from "react";
import JSZip from "jszip";
import type { CoverSpec, GeneratedVersion } from "@/lib/types";
import { autoReplace, findHits, replacementOf, type Hit, type Rule } from "@/lib/sensitive";
import { useRules } from "@/components/useRules";

/** 把命中的违禁词标红 */
function Marked({ text, hits }: { text: string; hits: Hit[] }) {
  if (!hits.length) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let last = 0;
  hits.forEach((h, i) => {
    parts.push(text.slice(last, h.start));
    parts.push(
      <mark key={i} className="rounded bg-red-100 px-0.5 text-red-700" title={`${h.rule.category}：${h.rule.tip}`}>
        {h.text}
      </mark>
    );
    last = h.end;
  });
  parts.push(text.slice(last));
  return <>{parts}</>;
}

function coverText(c: CoverSpec) {
  return [c.main, c.sub, c.badge, ...(c.lines ?? [])].filter(Boolean).join(" ");
}

function checkVersion(v: GeneratedVersion, rules: Rule[]) {
  const fields = [
    { name: "标题", hits: findHits(v.title, rules) },
    { name: "封面", hits: findHits(coverText(v.cover), rules) },
    { name: "正文", hits: findHits(v.body, rules) },
    { name: "标签", hits: findHits((v.tags ?? []).join(" "), rules) },
  ];
  return fields.filter((f) => f.hits.length);
}

function fixVersion(v: GeneratedVersion, rules: Rule[]) {
  let count = 0;
  const fix = (t: string) => {
    const r = autoReplace(t, rules);
    count += r.count;
    return r.text;
  };
  const next: GeneratedVersion = {
    ...v,
    title: fix(v.title),
    body: fix(v.body),
    tags: (v.tags ?? []).map(fix),
    cover: { ...v.cover, main: fix(v.cover.main), sub: v.cover.sub ? fix(v.cover.sub) : v.cover.sub, badge: v.cover.badge ? fix(v.cover.badge) : v.cover.badge, lines: v.cover.lines?.map(fix) },
  };
  return { next, count };
}

const safeName = (s: string) => s.replace(/[\\/:*?"<>|\s]/g, "").slice(0, 16) || "笔记";

export function coverUrl(spec: CoverSpec) {
  return "/api/cover?s=" + encodeURIComponent(JSON.stringify(spec));
}

export default function VersionCard({
  v,
  index,
  chosen,
  onChoose,
  onChange,
}: {
  v: GeneratedVersion;
  index: number;
  chosen?: boolean;
  onChoose?: () => void;
  onChange?: (v: GeneratedVersion) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState("");
  const [exporting, setExporting] = useState(false);
  const rules = useRules();
  const problems = useMemo(() => checkVersion(v, rules), [v, rules]);
  const fixable = problems.some((p) => p.hits.some((h) => replacementOf(h) !== null));
  const full = `${v.title}\n\n${v.body}\n\n${(v.tags ?? []).join(" ")}`;

  /** 发布包：封面 PNG + 标题正文标签 txt，打成一个 zip */
  async function exportZip() {
    setExporting(true);
    try {
      const zip = new JSZip();
      const name = `${index + 1}-${safeName(v.title)}`;
      const png = await (await fetch(coverUrl(v.cover))).blob();
      zip.file(`${name}-封面.png`, png);
      zip.file(`${name}-标题正文.txt`, "\ufeff" + full.replace(/\n/g, "\r\n"));
      const blob = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${name}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } finally {
      setExporting(false);
    }
  }

  function copy(text: string, what: string) {
    navigator.clipboard.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied(""), 1200);
  }

  return (
    <div className={`card space-y-3 ${chosen ? "border-brand ring-2 ring-brand/20" : ""}`}>
      <div className="flex items-center justify-between">
        <span className="chip">版本 {index + 1}</span>
        <div className="flex gap-2">
          {onChange && (
            <button className="btn-ghost" onClick={() => setEditing(!editing)}>{editing ? "完成" : "修改"}</button>
          )}
          {onChoose && (
            <button className={chosen ? "btn" : "btn-ghost"} onClick={onChoose}>{chosen ? "已选用" : "选用这版"}</button>
          )}
        </div>
      </div>

      {v.source && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-900">
          <span>
            📎 模仿：
            {v.source.note_url ? (
              <a href={v.source.note_url} target="_blank" rel="noreferrer" className="font-bold underline">
                {v.source.note_title}
              </a>
            ) : (
              <b>{v.source.note_title}</b>
            )}
            {v.source.scene && <span className="ml-1 rounded bg-white/70 px-1.5">{v.source.scene}</span>}
          </span>
          {v.source.title_template && (
            <span>
              标题模板：<span className="font-mono">{v.source.title_template}</span>
            </span>
          )}
          {v.source.similarity != null && (
            <span
              className={`rounded px-1.5 py-0.5 ${v.source.similarity >= 0.5 ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}
              title="新标题保留了模板里多少固定字词"
            >
              标题借鉴度 {Math.round(v.source.similarity * 100)}%{v.source.similarity < 0.5 ? "（偏低）" : ""}
            </span>
          )}
          {v.source.borrowed?.length > 0 && <span className="text-blue-700/70">（原篇没有的部分从同场景爆款补：{v.source.borrowed.join("、")}）</span>}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
        <a href={coverUrl(v.cover)} target="_blank" rel="noreferrer" title="点开看大图 / 右键保存">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={coverUrl(v.cover)} alt="封面" className="w-full rounded-lg border border-line" />
        </a>

        <div className="min-w-0 space-y-2">
          {editing && onChange ? (
            <>
              <input className="input font-bold" value={v.title} onChange={(e) => onChange({ ...v, title: e.target.value })} />
              <div className="grid grid-cols-3 gap-2">
                <select className="input" value={v.cover.layout} onChange={(e) => onChange({ ...v, cover: { ...v.cover, layout: e.target.value as CoverSpec["layout"] } })}>
                  <option value="bigword">大字报</option>
                  <option value="list">清单</option>
                  <option value="note">笔记纸</option>
                </select>
                <input className="input col-span-2" value={v.cover.main} onChange={(e) => onChange({ ...v, cover: { ...v.cover, main: e.target.value } })} placeholder="封面主文案（\n 换行）" />
                <input className="input col-span-2" value={v.cover.sub ?? ""} onChange={(e) => onChange({ ...v, cover: { ...v.cover, sub: e.target.value } })} placeholder="副文案" />
                <input className="input" value={v.cover.badge ?? ""} onChange={(e) => onChange({ ...v, cover: { ...v.cover, badge: e.target.value } })} placeholder="角标" />
              </div>
              {v.cover.layout === "list" && (
                <textarea className="input h-20" value={(v.cover.lines ?? []).join("\n")} onChange={(e) => onChange({ ...v, cover: { ...v.cover, lines: e.target.value.split("\n") } })} placeholder="清单，每行一条" />
              )}
              <textarea className="input h-64" value={v.body} onChange={(e) => onChange({ ...v, body: e.target.value })} />
              <input className="input" value={(v.tags ?? []).join(" ")} onChange={(e) => onChange({ ...v, tags: e.target.value.split(/\s+/).filter(Boolean) })} />
            </>
          ) : (
            <>
              <div className="font-bold">
                <Marked text={v.title} hits={findHits(v.title, rules)} />
                {[...v.title].length > 20 && <span className="ml-2 rounded bg-amber-100 px-1.5 text-xs font-normal text-amber-800">{[...v.title].length} 字，超过小红书 20 字限制，点「修改」删几个字</span>}
              </div>
              <div className="max-h-64 overflow-y-auto whitespace-pre-wrap text-sm">
                <Marked text={v.body} hits={findHits(v.body, rules)} />
              </div>
              <div className="text-sm text-blue-600">
                <Marked text={(v.tags ?? []).join(" ")} hits={findHits((v.tags ?? []).join(" "), rules)} />
              </div>
            </>
          )}
          {(v.how || v.why) && <div className="rounded-lg bg-paper p-2 text-xs text-muted">💡 {v.how || v.why}</div>}
          {problems.length ? (
            <div className="space-y-1 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <b>⚠️ 发布前检查：{problems.reduce((n, p) => n + p.hits.length, 0)} 处可能被限流</b>
                {onChange && fixable && (
                  <button className="rounded bg-white px-2 py-0.5 text-red-700 ring-1 ring-red-200 hover:bg-red-100" onClick={() => onChange(fixVersion(v, rules).next)}>
                    一键替换能自动改的
                  </button>
                )}
              </div>
              {problems.map((p) => (
                <div key={p.name}>
                  <span className="text-red-600">{p.name}：</span>
                  {p.hits.map((h, i) => {
                    const rep = replacementOf(h);
                    return (
                      <span key={i} className="mr-2">
                        「{h.text}」<span className="text-red-500">{h.rule.category}</span>
                        {rep !== null ? ` → ${rep || "删掉"}` : `，${h.rule.tip}`}
                      </span>
                    );
                  })}
                </div>
              ))}
              {problems.some((p) => p.name === "封面") && <div className="text-red-600">封面上的词要点「修改」改封面文案。</div>}
            </div>
          ) : (
            <div className="text-xs text-green-700">✅ 发布前检查：没发现常见限流词</div>
          )}
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost" onClick={() => copy(v.title, "标题")}>复制标题</button>
            <button className="btn-ghost" onClick={() => copy(`${v.body}\n\n${(v.tags ?? []).join(" ")}`, "正文")}>复制正文</button>
            <button className="btn-ghost" onClick={() => copy(full, "全部")}>复制全部</button>
            <button className="btn-ghost" onClick={exportZip} disabled={exporting} title="封面图 + 标题正文 txt，打包下载">
              {exporting ? "打包中…" : "📦 下载发布包"}
            </button>
            {copied && <span className="self-center text-xs text-muted">已复制{copied}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
