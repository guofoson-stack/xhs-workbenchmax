"use client";
import { useEffect, useState } from "react";
import { CATEGORIES, type Exam } from "@/lib/types";

const EMPTY = { name: "", short_name: "", category: "事业单位", subjects: "", exam_time: "", features: "", product: "" };

export default function ExamsPage() {
  const [items, setItems] = useState<Exam[]>([]);
  const [f, setF] = useState(EMPTY);
  const [msg, setMsg] = useState("");

  const load = () => fetch("/api/exams").then((r) => r.json()).then((j) => setItems(j.items ?? []));
  useEffect(() => {
    load();
  }, []);

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });

  async function save() {
    const r = await fetch("/api/exams", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    const j = await r.json();
    if (!r.ok) return setMsg(j.error);
    setMsg("✅ 已保存");
    setF(EMPTY);
    load();
  }

  async function remove(id: string) {
    if (!confirm("删除这条考情？")) return;
    await fetch(`/api/exams/${id}`, { method: "DELETE" });
    load();
  }

  function edit(x: Exam) {
    setF({
      name: x.name,
      short_name: x.short_name ?? "",
      category: x.category,
      subjects: x.subjects ?? "",
      exam_time: x.exam_time ?? "",
      features: x.features ?? "",
      product: x.product ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
      <section className="card h-fit space-y-3">
        <div className="h1">录入考情</div>
        <p className="text-xs text-muted">生成笔记时，考试事实只从这里取。没核实的信息先别填。同名考试会覆盖更新。</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <label className="label">考试全称 *</label>
            <input className="input" value={f.name} onChange={set("name")} placeholder="如：2026 中国地震局事业单位公开招聘" />
          </div>
          <div>
            <label className="label">简称</label>
            <input className="input" value={f.short_name} onChange={set("short_name")} placeholder="地震局" />
          </div>
          <div>
            <label className="label">类别 *</label>
            <select className="input" value={f.category} onChange={set("category")}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="label">笔试科目 / 题型</label>
          <textarea className="input h-16" value={f.subjects} onChange={set("subjects")} />
        </div>
        <div>
          <label className="label">考试时间</label>
          <input className="input" value={f.exam_time} onChange={set("exam_time")} />
        </div>
        <div>
          <label className="label">考情特点 / 常考内容 / 坑点</label>
          <textarea className="input h-24" value={f.features} onChange={set("features")} />
        </div>
        <div>
          <label className="label">我们对应的资料</label>
          <textarea className="input h-16" value={f.product} onChange={set("product")} placeholder="如：真题 5 套 + 地震局专项常识 + 面试题本" />
        </div>
        <button className="btn w-full" onClick={save} disabled={!f.name}>保存</button>
        {msg && <div className="text-sm">{msg}</div>}
      </section>

      <section className="space-y-3">
        {items.map((x) => (
          <div key={x.id} className="card space-y-1">
            <div className="flex items-center justify-between">
              <div className="font-bold">
                {x.name} <span className="chip ml-1">{x.category}</span>
              </div>
              <div className="flex gap-2 text-xs text-muted">
                <button className="hover:text-ink" onClick={() => edit(x)}>编辑</button>
                <button className="hover:text-brand" onClick={() => remove(x.id)}>删除</button>
              </div>
            </div>
            {x.subjects && <div className="text-sm"><span className="text-muted">科目：</span>{x.subjects}</div>}
            {x.exam_time && <div className="text-sm"><span className="text-muted">时间：</span>{x.exam_time}</div>}
            {x.features && <div className="text-sm"><span className="text-muted">特点：</span>{x.features}</div>}
            {x.product && <div className="text-sm"><span className="text-muted">资料：</span>{x.product}</div>}
          </div>
        ))}
        {!items.length && <div className="card text-sm text-muted">还没有考情。</div>}
      </section>
    </div>
  );
}
