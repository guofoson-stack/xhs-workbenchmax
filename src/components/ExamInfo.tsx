"use client";
import {
  computeStage,
  fmtRange,
  isCurrent,
  sortTimeline,
  statusOf,
  type ExamInfo,
  type FactRow,
  type PaperPart,
  type PaperRow,
  type Status,
  type SubjectRow,
  type TimelineRow,
} from "@/lib/examInfo";

const STATUS_STYLE: Record<Status, string> = {
  已结束: "bg-gray-100 text-gray-500",
  进行中: "bg-green-100 text-green-700",
  未开始: "bg-blue-50 text-blue-700",
  待公布: "bg-amber-50 text-amber-700",
};

function Basis({ basis }: { basis: string }) {
  return isCurrent(basis) ? null : <span className="ml-1 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-500">{basis}</span>;
}

export function StageBanner({ info }: { info: ExamInfo }) {
  const { now, next } = computeStage(info);
  return (
    <div className="rounded-lg bg-brand-soft px-3 py-2 text-sm">
      <div className="font-bold text-brand">📍 {now}</div>
      {next && <div className="mt-0.5 text-ink">👉 {next}</div>}
    </div>
  );
}

/** 只读展示 */
export function ExamInfoView({ info, compact = false }: { info: ExamInfo; compact?: boolean }) {
  const tl = sortTimeline(info.timeline);
  return (
    <div className="space-y-3 text-sm">
      <StageBanner info={info} />

      {tl.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-bold text-muted">🗓 时间线</div>
          <div className="divide-y divide-line rounded-lg border border-line">
            {tl.map((r, i) => {
              const cur = isCurrent(r.basis);
              const st = statusOf(r);
              return (
                <div key={i} className={`flex items-start gap-2 px-3 py-1.5 ${cur ? "" : "opacity-60"}`}>
                  <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[11px] ${cur ? STATUS_STYLE[st] : "bg-gray-100 text-gray-500"}`}>
                    {cur ? st : "往年"}
                  </span>
                  <span className="w-40 shrink-0 text-muted">{fmtRange(r)}</span>
                  <span className="min-w-0">
                    <b>{r.event}</b>
                    {r.note && <span className="text-muted">　{r.note}</span>}
                    <Basis basis={r.basis} />
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {info.subjects.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-bold text-muted">📝 笔试科目</div>
          <ul className="space-y-0.5">
            {info.subjects.map((s, i) => (
              <li key={i} className={isCurrent(s.basis) ? "" : "opacity-70"}>
                • <b>{s.name}</b>
                {s.detail && <span className="text-muted">：{s.detail}</span>}
                <Basis basis={s.basis} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <PapersView papers={info.papers ?? []} />

      {info.facts.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-bold text-muted">📌 关键信息</div>
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            {info.facts.map((f, i) => (
              <div key={i} className="contents">
                <span className="text-muted">{f.label}</span>
                <span className={isCurrent(f.basis) ? "" : "opacity-70"}>
                  {f.value}
                  <Basis basis={f.basis} />
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!compact && info.tips.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-bold text-muted">💡 备考提示</div>
          <ul className="space-y-0.5">
            {info.tips.map((t, i) => (
              <li key={i}>• {t}</li>
            ))}
          </ul>
        </div>
      )}

      {(info.missing.length > 0 || info.warnings) && (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {info.missing.length > 0 && <div>❓ 还没找到：{info.missing.join("、")}</div>}
          {info.warnings && <div className="mt-0.5">⚠️ 需要核实：{info.warnings}</div>}
        </div>
      )}

      {!!info.sources?.length && (
        <details className="text-xs text-muted">
          <summary className="cursor-pointer">来源 {info.sources.length} 条</summary>
          <ul className="mt-1 space-y-0.5">
            {info.sources.map((s, i) => (
              <li key={i}>
                <a href={s.url} target="_blank" rel="noreferrer" className="text-blue-600 underline">
                  {s.title}
                </a>
                {s.site ? ` · ${s.site}` : ""}
                {s.date ? ` · ${s.date}` : ""}
                {s.used_for ? ` · ${s.used_for}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

const SOURCE_STYLE: Record<string, string> = {
  官方大纲: "bg-green-50 text-green-700",
  考生回忆: "bg-blue-50 text-blue-700",
  机构整理: "bg-amber-50 text-amber-700",
};

/** 题型题量：每个科目一张小表 */
export function PapersView({ papers, empty }: { papers: PaperRow[]; empty?: React.ReactNode }) {
  if (!papers.length) return empty ? <div>{empty}</div> : null;
  return (
    <div>
      <div className="mb-1 text-xs font-bold text-muted">🧮 题型题量</div>
      <div className="space-y-2">
        {papers.map((p, i) => (
          <div key={i} className={`overflow-hidden rounded-lg border border-line ${isCurrent(p.basis) ? "" : "opacity-80"}`}>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 bg-paper px-3 py-1.5">
              <b>{p.subject}</b>
              <span className="text-xs text-muted">{[p.duration, p.total && `满分 ${p.total.replace(/^满分/, "")}`, p.format].filter(Boolean).join(" · ")}</span>
              <span className="ml-auto flex gap-1">
                {p.source && <span className={`rounded px-1.5 py-0.5 text-[11px] ${SOURCE_STYLE[p.source] ?? "bg-gray-100 text-gray-500"}`}>{p.source}</span>}
                <Basis basis={p.basis} />
              </span>
            </div>
            {p.parts.length > 0 && (
              <table className="w-full text-sm">
                <tbody>
                  {p.parts.map((x, j) => (
                    <tr key={j} className="border-t border-line">
                      <td className="w-28 px-3 py-1 font-medium">{x.type}</td>
                      <td className="w-20 px-2 py-1">{x.count ? (/\d$/.test(x.count) ? `${x.count} 题` : x.count) : <span className="text-muted">-</span>}</td>
                      <td className="w-28 px-2 py-1 text-muted">{x.score}</td>
                      <td className="px-2 py-1 text-muted">{x.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- 编辑 ---------- */

const BASIS_OPTIONS = ["本届", `往年·${new Date().getFullYear()}年度`, `往年·${new Date().getFullYear() - 1}年度`];

function Rows<T>({
  title,
  hint,
  rows,
  onChange,
  blank,
  render,
}: {
  title: string;
  hint?: string;
  rows: T[];
  onChange: (rows: T[]) => void;
  blank: T;
  render: (row: T, set: (patch: Partial<T>) => void) => React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-muted">
          {title}
          {hint && <span className="ml-1 font-normal">{hint}</span>}
        </span>
        <button type="button" className="text-xs text-brand" onClick={() => onChange([...rows, { ...blank }])}>
          ＋ 加一行
        </button>
      </div>
      {rows.map((r, i) => (
        <div key={i} className="flex items-start gap-1.5">
          <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">{render(r, (patch) => onChange(rows.map((x, j) => (j === i ? { ...x, ...patch } : x))))}</div>
          <button type="button" className="mt-1.5 shrink-0 text-xs text-muted hover:text-brand" onClick={() => onChange(rows.filter((_, j) => j !== i))} title="删除这一行">
            ✕
          </button>
        </div>
      ))}
      {!rows.length && <div className="text-xs text-muted">（空）</div>}
    </div>
  );
}

const cell = "rounded-md border border-line bg-white px-2 py-1 text-sm outline-none focus:border-brand";

function BasisInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <>
      <input className={`${cell} w-28`} list="basis-options" value={value} onChange={(e) => onChange(e.target.value)} title="本届 / 往年·xxxx年度" />
      <datalist id="basis-options">
        {BASIS_OPTIONS.map((b) => (
          <option key={b} value={b} />
        ))}
      </datalist>
    </>
  );
}

export function ExamInfoEditor({ info, onChange }: { info: ExamInfo; onChange: (info: ExamInfo) => void }) {
  const set = (patch: Partial<ExamInfo>) => onChange({ ...info, ...patch });
  return (
    <div className="space-y-4">
      <StageBanner info={info} />

      <Rows<TimelineRow>
        title="🗓 时间线"
        hint="（状态按今天自动算；只知道「某日起」就不填结束日期）"
        rows={info.timeline}
        onChange={(timeline) => set({ timeline })}
        blank={{ date: "", event: "", basis: "本届" }}
        render={(r, s) => (
          <>
            <input type="date" className={`${cell} w-36`} value={r.date} onChange={(e) => s({ date: e.target.value })} title="开始日期" />
            <input type="date" className={`${cell} w-36`} value={r.end ?? ""} onChange={(e) => s({ end: e.target.value || undefined })} title="结束日期（可空）" />
            <input className={`${cell} w-28`} value={r.event} onChange={(e) => s({ event: e.target.value })} placeholder="事项" />
            <input className={`${cell} min-w-32 flex-1`} value={r.note ?? ""} onChange={(e) => s({ note: e.target.value || undefined })} placeholder="补充（时刻、入口…）" />
            <BasisInput value={r.basis} onChange={(basis) => s({ basis })} />
          </>
        )}
      />

      <Rows<SubjectRow>
        title="📝 笔试科目"
        rows={info.subjects}
        onChange={(subjects) => set({ subjects })}
        blank={{ name: "", basis: "本届" }}
        render={(r, s) => (
          <>
            <input className={`${cell} w-36`} value={r.name} onChange={(e) => s({ name: e.target.value })} placeholder="科目" />
            <input className={`${cell} min-w-40 flex-1`} value={r.detail ?? ""} onChange={(e) => s({ detail: e.target.value || undefined })} placeholder="考什么、题型、分值" />
            <BasisInput value={r.basis} onChange={(basis) => s({ basis })} />
          </>
        )}
      />

      <PapersEditor papers={info.papers ?? []} onChange={(papers) => set({ papers })} />

      <Rows<FactRow>
        title="📌 关键信息"
        rows={info.facts}
        onChange={(facts) => set({ facts })}
        blank={{ label: "", value: "", basis: "本届" }}
        render={(r, s) => (
          <>
            <input className={`${cell} w-28`} value={r.label} onChange={(e) => s({ label: e.target.value })} placeholder="项目" />
            <input className={`${cell} min-w-40 flex-1`} value={r.value} onChange={(e) => s({ value: e.target.value })} placeholder="内容" />
            <BasisInput value={r.basis} onChange={(basis) => s({ basis })} />
          </>
        )}
      />

      <div>
        <div className="mb-1 text-xs font-bold text-muted">💡 备考提示（一行一条）</div>
        <textarea className="input h-20" value={info.tips.join("\n")} onChange={(e) => set({ tips: e.target.value.split("\n") })} />
      </div>

      {(info.missing.length > 0 || info.warnings) && (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {info.missing.length > 0 && <div>❓ 还没找到：{info.missing.join("、")}</div>}
          {info.warnings && <div className="mt-0.5">⚠️ 需要核实：{info.warnings}</div>}
        </div>
      )}
    </div>
  );
}

function PapersEditor({ papers, onChange }: { papers: PaperRow[]; onChange: (p: PaperRow[]) => void }) {
  const setP = (i: number, patch: Partial<PaperRow>) => onChange(papers.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-muted">
          🧮 题型题量<span className="ml-1 font-normal">（一个科目一块；题量写数字就行，不确定写「约20」）</span>
        </span>
        <button
          type="button"
          className="text-xs text-brand"
          onClick={() => onChange([...papers, { subject: "", parts: [{ type: "单选题" }], basis: "本届", source: "人工录入" }])}
        >
          ＋ 加一个科目
        </button>
      </div>
      {papers.map((p, i) => (
        <div key={i} className="space-y-1.5 rounded-lg border border-line p-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <input className={`${cell} w-32 font-bold`} value={p.subject} onChange={(e) => setP(i, { subject: e.target.value })} placeholder="科目" />
            <input className={`${cell} w-24`} value={p.duration ?? ""} onChange={(e) => setP(i, { duration: e.target.value || undefined })} placeholder="时长" />
            <input className={`${cell} w-20`} value={p.total ?? ""} onChange={(e) => setP(i, { total: e.target.value || undefined })} placeholder="满分" />
            <input className={`${cell} w-20`} value={p.format ?? ""} onChange={(e) => setP(i, { format: e.target.value || undefined })} placeholder="机考/纸笔" />
            <select className={`${cell} w-24`} value={p.source ?? ""} onChange={(e) => setP(i, { source: e.target.value || undefined })} title="依据">
              <option value="">依据</option>
              {["官方大纲", "考生回忆", "机构整理", "人工录入"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
            <BasisInput value={p.basis} onChange={(basis) => setP(i, { basis })} />
            <button type="button" className="ml-auto text-xs text-muted hover:text-brand" onClick={() => onChange(papers.filter((_, j) => j !== i))}>
              删除科目
            </button>
          </div>
          <Rows<PaperPart>
            title="题型"
            rows={p.parts}
            onChange={(parts) => setP(i, { parts })}
            blank={{ type: "" }}
            render={(r, s) => (
              <>
                <input className={`${cell} w-24`} list="part-types" value={r.type} onChange={(e) => s({ type: e.target.value })} placeholder="题型" />
                <input className={`${cell} w-16`} value={r.count ?? ""} onChange={(e) => s({ count: e.target.value || undefined })} placeholder="题量" />
                <input className={`${cell} w-24`} value={r.score ?? ""} onChange={(e) => s({ score: e.target.value || undefined })} placeholder="分值" />
                <input className={`${cell} min-w-32 flex-1`} value={r.note ?? ""} onChange={(e) => s({ note: e.target.value || undefined })} placeholder="考什么" />
              </>
            )}
          />
        </div>
      ))}
      <datalist id="part-types">
        {["单选题", "多选题", "判断题", "不定项选择", "填空题", "简答题", "案例分析", "材料分析", "公文写作", "申论", "作文", "计算题"].map((x) => (
          <option key={x} value={x} />
        ))}
      </datalist>
      {!papers.length && <div className="text-xs text-muted">（空）</div>}
    </div>
  );
}
