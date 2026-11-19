"use client";
import { useEffect, useState } from "react";
import { AFTER_LOGIN } from "@/components/useMe";

export default function LoginPage() {
  const [needSetup, setNeedSetup] = useState<boolean | null>(null);
  const [name, setName] = useState("");
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/setup")
      .then((r) => r.json())
      .then((j) => setNeedSetup(!!j.needSetup))
      .catch(() => setNeedSetup(false));
  }, []);

  function goNext() {
    let saved = "";
    try {
      saved = sessionStorage.getItem(AFTER_LOGIN) ?? "";
      sessionStorage.removeItem(AFTER_LOGIN);
    } catch {}
    const next = saved || new URLSearchParams(location.search).get("next") || "/";
    location.replace(next.startsWith("/") && !next.startsWith("//") ? next : "/");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (needSetup && pwd !== pwd2) return setErr("两次输入的密码不一样");
    setLoading(true);
    const r = await fetch(needSetup ? "/api/setup" : "/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, password: pwd }),
    });
    setLoading(false);
    if (r.ok) goNext();
    else setErr((await r.json()).error ?? "登录失败");
  }

  if (needSetup === null) return null;

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4">
        <div>
          <div className="text-lg font-bold text-brand">小红书爆款工作台</div>
          <div className="text-xs text-muted">
            {needSetup ? "第一次使用：先创建你的管理员账号。以后在「团队」页给员工开账号。" : "用管理员给你开的账号登录"}
          </div>
        </div>
        <div>
          <label className="label">姓名</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus autoComplete="username" />
        </div>
        <div>
          <label className="label">{needSetup ? "设置密码（至少 4 位）" : "密码"}</label>
          <input className="input" type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} autoComplete={needSetup ? "new-password" : "current-password"} />
        </div>
        {needSetup && (
          <div>
            <label className="label">再输一次密码</label>
            <input className="input" type="password" value={pwd2} onChange={(e) => setPwd2(e.target.value)} autoComplete="new-password" />
          </div>
        )}
        {err && <div className="text-sm text-brand">{err}</div>}
        <button className="btn w-full" disabled={loading || !name.trim() || !pwd}>
          {loading ? "请稍候…" : needSetup ? "创建管理员并进入" : "登录"}
        </button>
        {!needSetup && <p className="text-center text-xs text-muted">忘了密码？找管理员在「团队」页重置</p>}
      </form>
    </div>
  );
}
