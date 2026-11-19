"use client";
import { useEffect, useState } from "react";
import VersionCard from "@/components/VersionCard";
import type { GeneratedVersion } from "@/lib/types";

interface Gen {
  id: string;
  exam_input: string;
  versions: GeneratedVersion[];
  chosen: number | null;
  post_url: string | null;
  likes: number | null;
  collects: number | null;
  comments: number | null;
  created_at: string;
}

function Row({ g }: { g: Gen }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    post_url: g.post_url ?? "",
    likes: g.likes?.toString() ?? "",
    collects: g.collects?.toString() ?? "",
    comments: g.comments?.toString() ?? "",
  });
  const [msg, setMsg] = useState("");

  async function save() {
    const r = await fetch(`/api/generations/${g.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(f),
    });
    setMsg(r.ok ? "✅ 已保存" : "保存失败");
  }

  const v = g.chosen != null ? g.versions[g.chosen] : null;
  return (
    <div className="card space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-bold">{g.exam_input}</div>
          <div className="text-xs text-muted">
            {new Date(g.created_at).toLocaleString("zh-CN")} · {g.versions.length} 版 · {v ? `选用：${v.title}` : "未选用"}
          </div>
        </div>
        <button className="btn-ghost" onClick={() => setOpen(!open)}>{open ? "收起" : "查看版本"}</button>
      </div>
      {g.chosen != null && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-[1fr_90px_90px_90px_auto]">
          <input className="input col-span-2 md:col-span-1" placeholder="发布后的笔记链接" value={f.post_url} onChange={(e) => setF({ ...f, post_url: e.target.value })} />
          {(["likes", "collects", "comments"] as const).map((k) => (
            <input key={k} className="input" type="number" placeholder={{ likes: "点赞", collects: "收藏", comments: "评论" }[k]} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
          ))}
          <button className="btn" onClick={save}>回填</button>
        </div>
      )}
      {msg && <div className="text-xs text-muted">{msg}</div>}
      {open && g.versions.map((x, i) => <VersionCard key={i} v={x} index={i} chosen={g.chosen === i} />)}
    </div>
  );
}

export default function HistoryPage() {
  const [items, setItems] = useState<Gen[]>([]);
  useEffect(() => {
    fetch("/api/generations").then((r) => r.json()).then((j) => setItems(j.items ?? []));
  }, []);
  return (
    <div className="space-y-3">
      <div className="h1">生成记录</div>
      <p className="text-xs text-muted">发布一周左右回填数据。收藏过 100 的，被借鉴的积木自动 +1 分，以后会被优先选用。</p>
      {items.map((g) => <Row key={g.id} g={g} />)}
      {!items.length && <div className="card text-sm text-muted">还没有生成记录。</div>}
    </div>
  );
}
