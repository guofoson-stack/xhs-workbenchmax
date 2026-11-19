"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useMe } from "@/components/useMe";

type Stats = { notes: number; elements: number; exams: number; generations: number; keyReady?: boolean; error?: string };

const STEPS = [
  { href: "/ingest", n: "1", title: "入库拆解", desc: "每天看到爆款，把标题、正文、封面贴进来，AI 拆成积木，你确认后入库。" },
  { href: "/exams", n: "2", title: "录考情", desc: "要做的考试先录入真实考情，生成时考试事实只从这里取，不让 AI 编。" },
  { href: "/generate", n: "3", title: "一键生成", desc: "选考试，自动从爆款库搭配标题、封面、正文，一次出几版。" },
  { href: "/history", n: "4", title: "数据回流", desc: "发布后回填数据，效果好的积木自动加分，越用越准。" },
];

export default function Home() {
  const [s, setS] = useState<Stats | null>(null);
  const me = useMe();
  const isAdmin = me?.user.role === "admin";
  const task = me?.task;
  useEffect(() => {
    fetch("/api/stats").then((r) => r.json()).then(setS).catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      {me && !isAdmin && task && task.target > 0 && (
        <Link
          href="/ingest"
          className={`card flex items-center justify-between gap-3 hover:opacity-90 ${task.done >= task.target ? "border-green-300 bg-green-50" : "border-brand bg-brand-soft"}`}
        >
          <div>
            <div className="font-bold">
              {task.workday ? "今日任务" : "今天不考核"}：采集爆款 {task.done}/{task.target}
              {task.workday && task.done >= task.target && " ✅"}
            </div>
            <div className="mt-0.5 text-sm text-muted">
              {task.done >= task.target ? "今天的指标完成了，多采也算数。" : "去小红书找一篇点赞高的同类笔记，用书签一键采集。"}
            </div>
          </div>
          <span className="btn shrink-0">{task.done >= task.target ? "再采一篇" : "去采集"}</span>
        </Link>
      )}
      {isAdmin && me.team && me.team.size > 0 && task?.workday && task.target > 0 && (
        <Link href="/team" className="card flex items-center justify-between gap-3 hover:border-brand">
          <div>
            <div className="font-bold">
              今天团队采集：<span className={me.team.done >= me.team.size ? "text-green-700" : "text-brand"}>{me.team.done}/{me.team.size} 人完成</span>
            </div>
            <div className="mt-0.5 text-sm text-muted">点开看谁还没完成、本周和本月情况</div>
          </div>
          <span className="btn-ghost shrink-0">团队看板 ›</span>
        </Link>
      )}
      {isAdmin && me.team && me.team.size === 0 && (
        <Link href="/team" className="card block text-sm hover:border-brand">
          👥 还没给员工开账号：到 <b>团队</b> 页添加成员，每个人登录后采集的爆款都会记在 TA 名下。
        </Link>
      )}
      {isAdmin && s && s.keyReady === false && (
        <Link href="/settings" className="card block border-brand bg-brand-soft text-sm hover:opacity-90">
          👋 第一次使用：先到 <b>⚙️ 设置</b> 填大模型的 API Key（点这里）
        </Link>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["爆款笔记", s?.notes],
          ["积木元素", s?.elements],
          ["已录考情", s?.exams],
          ["生成次数", s?.generations],
        ].map(([label, v]) => (
          <div key={label as string} className="card">
            <div className="text-xs text-muted">{label}</div>
            <div className="mt-1 text-2xl font-bold">{v ?? "–"}</div>
          </div>
        ))}
      </div>
      {s?.error && <div className="card text-sm text-brand">数据库连接有问题：{s.error}</div>}
      <div className="grid gap-3 md:grid-cols-2">
        {STEPS.map((st) => (
          <Link key={st.href} href={st.href} className="card flex gap-4 hover:border-brand">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-white font-bold">{st.n}</div>
            <div>
              <div className="font-bold">{st.title}</div>
              <div className="mt-1 text-sm text-muted">{st.desc}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
