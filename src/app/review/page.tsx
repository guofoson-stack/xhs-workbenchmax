"use client";
import { useCallback, useEffect, useState } from "react";
import { refreshMe, useMe } from "@/components/useMe";
import { ELEMENT_LABELS } from "@/lib/types";
import type { ElementType } from "@/lib/types";

type Status = "pending" | "ok" | "rejected";
interface Item {
  id: string;
  url: string | null;
  title: string;
  body: string | null;
  cover_path: string | null;
  likes: number;
  collects: number;
  comments: number;
  exam_name: string | null;
  exam_category: string | null;
  scene: string | null;
  created_at: string;
  review_note: string | null;
  reviewed_at: string | null;
  collector: string | null;
  reviewer: string | null;
  used: number;
  elements: { type: ElementType; template: string; pattern: string | null }[];
}

const TABS: { key: Status; label: string }[] = [
  { key: "pending", label: "待审核" },
  { key: "ok", label: "已通过" },
  { key: "rejected", label: "已退回" },
];
const REASONS = ["赞藏太低，不算爆款", "不是我们做的考试类型", "内容太水，没什么可学的", "和库里已有的重复", "拆解不准确"];
const fmtW = (n: number) => (n >= 10000 ? (n / 10000).toFixed(1) + "万" : String(n ?? 0));

export default function ReviewPage() {
  const me = useMe();
  const [status, setStatus] = useState<Status>("pending");
  const [by, setBy] = useState("");
  const [people, setPeople] = useState<{ id: string; name: string }[]>([]);
  const [items, setItems] = useState<Item[] | null>(null);
  const [counts, setCounts] = useState<Record<Status, number>>({ pending: 0, ok: 0, rejected: 0 });
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const r = await fetch(`/api/review?status=${status}&by=${by}`);
    const j = await r.json();
    if (!r.ok) return setErr(j.error);
    setErr("");
    setItems(j.items);
    setCounts(j.counts);
  }, [status, by]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    fetch("/api/users")
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((j) => setPeople(j.items));
  }, []);

  async function act(id: string, body: Record<string, unknown> | "delete") {
    const r =
      body === "delete"
        ? await fetch(`/api/notes/${id}`, { method: "DELETE" })
        : await fetch(`/api/notes/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) return alert((await r.json()).error);
    setItems((xs) => xs?.filter((x) => x.id !== id) ?? null);
    load();
    refreshMe();
  }

  async function passAll() {
    if (!items?.length || !confirm(`把这 ${items.length} 篇全部通过？`)) return;
    for (const it of items) await fetch(`/api/notes/${it.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ review: "ok" }) });
    load();
    refreshMe();
  }

  if (me && me.user.role !== "admin") return <div className="card text-sm text-muted">审核只有管理员能做。</div>;
  if (err) return <div className="card text-sm text-brand">{err}</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-3">
        <div className="h1">入库审核</div>
        <span className="text-sm text-muted">员工采的爆款先进「待审核」，可以照常用于生成。不合格就退回，退回的不进爆款库、不算当天指标，员工首页会看到原因，要重新找一篇。</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setStatus(t.key)}
            className={`rounded-lg px-3 py-1.5 text-sm ${status === t.key ? "bg-brand-soft font-medium text-brand" : "text-muted hover:text-ink"}`}
          >
            {t.label} {counts[t.key]}
          </button>
        ))}
        <select className="input ml-2 w-auto" value={by} onChange={(e) => setBy(e.target.value)}>
          <option value="">全部采集人</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {status === "pending" && !!items?.length && (
          <button className="btn-ghost ml-auto" onClick={passAll}>
            本页全部通过
          </button>
        )}
      </div>

      {!items && <div className="text-sm text-muted">加载中…</div>}
      {items && !items.length && (
        <div className="card text-sm text-muted">{status === "pending" ? "没有待审核的了 🎉" : "这里还没有内容"}</div>
      )}
      <div className="space-y-3">
        {items?.map((it) => (
          <ReviewCard key={it.id} it={it} status={status} onAct={(b) => act(it.id, b)} />
        ))}
      </div>
    </div>
  );
}

function ReviewCard({ it, status, onAct }: { it: Item; status: Status; onAct: (b: Record<string, unknown> | "delete") => void }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);
  const title = it.elements.find((e) => e.type === "title");

  return (
    <div className="card flex gap-4">
      <div className="w-24 shrink-0">
        {it.cover_path ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/cover-original?path=${encodeURIComponent(it.cover_path)}`} alt="" className="aspect-[3/4] w-full rounded-lg border border-line object-cover" />
        ) : (
          <div className="flex aspect-[3/4] w-full items-center justify-center rounded-lg border border-line bg-paper text-xs text-muted">无封面</div>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-baseline gap-x-2">
          {it.url ? (
            <a href={it.url} target="_blank" rel="noreferrer" className="font-bold hover:underline">
              {it.title}
            </a>
          ) : (
            <span className="font-bold">{it.title}</span>
          )}
        </div>
        <div className="flex flex-wrap gap-x-3 text-xs text-muted">
          <span className="font-medium text-ink">{it.collector ?? "未登记"}</span>
          <span>{it.created_at.slice(5, 16)} 采集</span>
          <span>{[it.exam_category, it.exam_name, it.scene].filter(Boolean).join(" · ")}</span>
          <span className="text-ink">
            赞 {fmtW(it.likes)} · 藏 {fmtW(it.collects)} · 评 {fmtW(it.comments)}
          </span>
          {it.used > 0 && <span>已被模仿 {it.used} 次</span>}
        </div>
        {title && (
          <div className="text-sm">
            <span className="mr-1 rounded bg-paper px-1.5 py-0.5 text-xs text-muted">标题套路</span>
            {title.template}
          </div>
        )}
        <button className="text-xs text-muted hover:text-ink" onClick={() => setOpen(!open)}>
          {open ? "收起 ▴" : `看正文和全部 ${it.elements.length} 个积木 ▾`}
        </button>
        {open && (
          <div className="space-y-2 rounded-lg bg-paper p-3 text-sm">
            {it.body && <div className="max-h-48 overflow-auto whitespace-pre-wrap text-muted">{it.body}</div>}
            {it.elements.map((e, i) => (
              <div key={i}>
                <span className="mr-1 rounded bg-white px-1.5 py-0.5 text-xs text-muted">{ELEMENT_LABELS[e.type] ?? e.type}</span>
                <span className="whitespace-pre-wrap">{e.template}</span>
              </div>
            ))}
          </div>
        )}
        {status !== "pending" && (
          <div className="text-xs text-muted">
            {it.reviewer ?? "管理员"} {it.reviewed_at?.slice(5, 16)} {status === "ok" ? "通过" : "退回"}
            {it.review_note && <span className="text-brand">：{it.review_note}</span>}
          </div>
        )}

        {rejecting ? (
          <div className="space-y-2 rounded-lg border border-line p-3">
            <div className="flex flex-wrap gap-1.5">
              {REASONS.map((r) => (
                <button key={r} className={`rounded-full border px-2.5 py-1 text-xs ${reason === r ? "border-brand text-brand" : "border-line text-muted"}`} onClick={() => setReason(r)}>
                  {r}
                </button>
              ))}
            </div>
            <input className="input" placeholder="退回原因（员工会看到），可以点上面的，也可以自己写" value={reason} onChange={(e) => setReason(e.target.value)} />
            <div className="flex gap-2">
              <button className="btn" disabled={!reason.trim()} onClick={() => onAct({ review: "rejected", note: reason })}>
                确认退回
              </button>
              <button className="btn-ghost" onClick={() => setRejecting(false)}>
                取消
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 pt-1">
            {status !== "ok" && (
              <button className="btn" onClick={() => onAct({ review: "ok" })}>
                {status === "rejected" ? "改为通过" : "✅ 通过"}
              </button>
            )}
            {status !== "rejected" && (
              <button className="btn-ghost" onClick={() => setRejecting(true)}>
                ↩️ 退回
              </button>
            )}
            <button
              className="btn-ghost text-muted"
              onClick={() => confirm(`彻底删除「${it.title}」和它的积木？删了不留记录，员工可以重新采这篇。`) && onAct("delete")}
            >
              🗑 删除
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
