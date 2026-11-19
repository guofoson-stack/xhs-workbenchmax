"use client";
import {
  computeStage,
  fmtRange,
  isCurrent,
  sortTimeline,
  statusOf,
  type ExamInfo,
  type FactRow,
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
