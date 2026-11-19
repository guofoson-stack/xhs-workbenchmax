"use client";
import { useState } from "react";

export default function LoginPage() {
  const [pwd, setPwd] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pwd }),
    });
    setLoading(false);
    if (res.ok) window.location.replace("/");
    else setErr((await res.json()).error ?? "登录失败");
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4">
        <div>
          <div className="text-lg font-bold text-brand">小红书爆款工作台</div>
          <div className="text-xs text-muted">内部使用，请输入团队密码</div>
        </div>
        <input className="input" type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="密码" autoFocus />
        {err && <div className="text-sm text-brand">{err}</div>}
        <button className="btn w-full" disabled={loading || !pwd}>
          {loading ? "登录中…" : "进入"}
        </button>
      </form>
    </div>
  );
}
