"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useMe } from "@/components/useMe";

const LINKS = [
  { href: "/ingest", label: "入库拆解" },
  { href: "/library", label: "爆款库" },
  { href: "/generate", label: "一键生成" },
  { href: "/exams", label: "考情" },
  { href: "/history", label: "生成记录" },
  { href: "/radar", label: "📈 销量雷达" },
  { href: "/team", label: "👥 团队", admin: true },
  { href: "/settings", label: "⚙️ 设置", admin: true },
];

export default function Nav() {
  const path = usePathname();
  const me = useMe();
  const [menu, setMenu] = useState(false);
  if (path === "/login") return null;
  const isAdmin = me?.user.role === "admin";

  async function changePassword() {
    setMenu(false);
    const old = prompt("原密码");
    if (old === null) return;
    const next = prompt("新密码（至少 4 位）");
    if (!next) return;
    const r = await fetch("/api/me/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ old, next }) });
    alert(r.ok ? "密码改好了" : (await r.json()).error);
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    location.replace("/login");
  }

  const t = me?.task;
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-1 px-4 py-3">
        <Link href="/" className="mr-4 shrink-0 font-bold text-brand">
          小红书爆款工作台
        </Link>
        <nav className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
          {LINKS.filter((l) => !l.admin || isAdmin).map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-sm ${path.startsWith(l.href) ? "bg-brand-soft font-medium text-brand" : "text-muted hover:text-ink"}`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        {me && (
          <div className="relative flex shrink-0 items-center gap-2">
            {t && t.workday && t.target > 0 && me.user.role === "staff" && (
              <Link href="/ingest" className={`rounded-full px-2.5 py-1 text-xs ${t.done >= t.target ? "bg-green-100 text-green-800" : "bg-red-100 text-red-700"}`}>
                今日采集 {t.done}/{t.target}
              </Link>
            )}
            <button className="rounded-lg px-2 py-1 text-sm hover:bg-paper" onClick={() => setMenu(!menu)}>
              {me.user.name}
              {isAdmin && <span className="ml-1 text-xs text-muted">管理员</span>} ▾
            </button>
            {menu && (
              <div className="absolute right-0 top-9 w-32 overflow-hidden rounded-lg border border-line bg-white text-sm shadow-lg">
                <button className="block w-full px-3 py-2 text-left hover:bg-paper" onClick={changePassword}>
                  改密码
                </button>
                <button className="block w-full px-3 py-2 text-left hover:bg-paper" onClick={logout}>
                  退出登录
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
