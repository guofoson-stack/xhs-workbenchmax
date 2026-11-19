"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/ingest", label: "入库拆解" },
  { href: "/library", label: "爆款库" },
  { href: "/generate", label: "一键生成" },
  { href: "/exams", label: "考情" },
  { href: "/history", label: "生成记录" },
  { href: "/settings", label: "⚙️ 设置" },
];

export default function Nav() {
  const path = usePathname();
  if (path === "/login") return null;
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-4 py-3">
        <Link href="/" className="mr-4 shrink-0 font-bold text-brand">
          小红书爆款工作台
        </Link>
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-sm ${
              path.startsWith(l.href) ? "bg-brand-soft font-medium text-brand" : "text-muted hover:text-ink"
            }`}
          >
            {l.label}
          </Link>
        ))}
      </div>
    </header>
  );
}
