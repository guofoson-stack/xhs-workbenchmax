"use client";
import { useEffect, useState } from "react";

interface S {
  aiBaseUrl: string;
  aiModel: string;
  aiTextModel: string;
  updateRepo: string;
  aiApiKeyMasked: string;
  xhsCookieMasked: string;
  searchApiKeyMasked: string;
  searchReady: boolean;
  updateTokenMasked: string;
  appPasswordMasked: string;
  home: string;
  keyReady: boolean;
}

const PRESETS = [
  { name: "DeepSeek", aiBaseUrl: "https://api.deepseek.com", aiModel: "deepseek-flash", aiTextModel: "", site: "platform.deepseek.com" },
  { name: "通义千问", aiBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", aiModel: "qwen-vl-max", aiTextModel: "qwen-max", site: "阿里云百炼控制台" },
  { name: "豆包", aiBaseUrl: "https://ark.cn-beijing.volces.com/api/v3", aiModel: "", aiTextModel: "", site: "火山方舟控制台（模型名填接入点 ID）" },
];

export default function SettingsPage() {
  const [s, setS] = useState<S | null>(null);
  const [form, setForm] = useState({ aiBaseUrl: "", aiModel: "", aiTextModel: "", updateRepo: "", aiApiKey: "", xhsCookie: "", searchApiKey: "", updateToken: "", appPassword: "" });
  const [msg, setMsg] = useState("");
  const [test, setTest] = useState("");
  const [testing, setTesting] = useState(false);

  async function load() {
    const j: S = await (await fetch("/api/settings")).json();
    setS(j);
    setForm((f) => ({ ...f, aiBaseUrl: j.aiBaseUrl, aiModel: j.aiModel, aiTextModel: j.aiTextModel, updateRepo: j.updateRepo, aiApiKey: "", xhsCookie: "", searchApiKey: "", updateToken: "", appPassword: "" }));
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 打开页面时读取一次设置
    load();
  }, []);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  async function save(extra: Record<string, unknown> = {}) {
    const r = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, ...extra }) });
    setMsg(r.ok ? "✅ 已保存，立即生效" : "保存失败");
    await load();
    setTimeout(() => setMsg(""), 2500);
    return r.ok;
  }

  async function runTest() {
    setTesting(true);
    setTest("测试中…");
    if (form.aiApiKey || form.aiBaseUrl !== s?.aiBaseUrl || form.aiModel !== s?.aiModel) await save();
    const r = await fetch("/api/settings/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vision: true }) });
    const j = await r.json();
    setTesting(false);
    if (!j.ok) return setTest("❌ " + j.error);
    const v = j.vision;
    const sr = j.search;
    setTest(
      `✅ 文字正常（${j.model}，${(j.ms / 1000).toFixed(1)} 秒，回复：${j.reply}）\n` +
        (v?.ok ? `✅ 看图正常（回复：${v.reply}）——拆封面可以用` : `⚠️ 这个模型不能看图：拆解时请手动填封面文字。${v?.error ?? ""}`) +
        "\n" +
        (sr?.ok ? `✅ 联网搜索正常——「AI 搜索考情」可以用` : `⚠️ 联网搜索不可用：${sr?.error ?? "未配置"}`)
    );
  }

  if (!s) return <div className="card text-sm text-muted">加载中…</div>;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="h1">设置</div>
      {!s.keyReady && <div className="card border-brand bg-brand-soft text-sm">👋 第一次使用：选一个大模型，填上 API Key，点「保存并测试」。</div>}

      <section className="card space-y-3">
        <div className="font-bold">大模型</div>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button key={p.name} className="btn-ghost" onClick={() => setForm({ ...form, aiBaseUrl: p.aiBaseUrl, aiModel: p.aiModel || form.aiModel, aiTextModel: p.aiTextModel })} title={`Key 在 ${p.site} 申请`}>
              用 {p.name}
            </button>
          ))}
        </div>
        <div>
          <label className="label">API Key {s.aiApiKeyMasked && <span className="text-ink">（当前：{s.aiApiKeyMasked}，不改就留空）</span>}</label>
          <input className="input" type="password" value={form.aiApiKey} onChange={set("aiApiKey")} placeholder={s.aiApiKeyMasked ? "留空 = 不修改" : "sk-..."} autoComplete="off" />
        </div>
        <div>
          <label className="label">接口地址</label>
          <input className="input" value={form.aiBaseUrl} onChange={set("aiBaseUrl")} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">模型（拆解用，要能看图）</label>
            <input className="input" value={form.aiModel} onChange={set("aiModel")} />
          </div>
          <div>
            <label className="label">写文案的模型（可空，空 = 同左边）</label>
            <input className="input" value={form.aiTextModel} onChange={set("aiTextModel")} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn" onClick={runTest} disabled={testing}>
            {testing ? "测试中…" : "保存并测试"}
          </button>
          <button className="btn-ghost" onClick={() => save()}>只保存</button>
          {msg && <span className="text-sm">{msg}</span>}
        </div>
        {test && <pre className="whitespace-pre-wrap rounded-lg bg-paper p-3 text-sm">{test}</pre>}
      </section>

      <section className="card space-y-3">
        <div className="font-bold">自动更新</div>
        <p className="text-xs text-muted">填了更新源以后，每次双击「启动工作台」都会自动检查并下载新版本，不用再手动下载安装包。配置和数据不受影响。</p>
        <div>
          <label className="label">更新源（GitHub 仓库，格式：用户名/仓库名）</label>
          <input className="input" value={form.updateRepo} onChange={set("updateRepo")} placeholder="例如 youliao/xhs-workbench" />
        </div>
        <div>
          <label className="label">访问令牌（私有仓库才需要）{s.updateTokenMasked && <span className="text-ink">（当前：{s.updateTokenMasked}）</span>}</label>
          <input className="input" type="password" value={form.updateToken} onChange={set("updateToken")} placeholder="留空 = 不修改" autoComplete="off" />
        </div>
        <button className="btn-ghost" onClick={() => save()}>保存</button>
      </section>

      <section className="card space-y-3">
        <div className="font-bold">其他（一般不用动）</div>
        <div>
          <label className="label">
            DeepSeek 搜索 Key（「AI 搜索考情」用）{s.searchReady ? <span className="text-green-700">（已可用{s.searchApiKeyMasked ? "：单独填的 Key" : "：自动用上面的 DeepSeek Key"}）</span> : <span className="text-brand">（大模型不是 DeepSeek 时要单独填）</span>}
          </label>
          <input className="input" type="password" value={form.searchApiKey} onChange={set("searchApiKey")} placeholder="大模型用 DeepSeek 就不用填" autoComplete="off" />
        </div>
        <div>
          <label className="label">小红书 Cookie（粘贴链接抓取被拦时才需要）{s.xhsCookieMasked && <span className="text-ink">（当前：已填写）</span>}</label>
          <input className="input" type="password" value={form.xhsCookie} onChange={set("xhsCookie")} placeholder="留空 = 不修改" autoComplete="off" />
        </div>
        <div>
          <label className="label">登录密码（留空 = 局域网内不用登录；改完要重启工作台才生效）{s.appPasswordMasked && <span className="text-ink">（当前：已设置）</span>}</label>
          <input className="input" type="password" value={form.appPassword} onChange={set("appPassword")} placeholder="留空 = 不修改" autoComplete="new-password" />
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={() => save()}>保存</button>
          {s.xhsCookieMasked && <button className="btn-ghost" onClick={() => save({ clear: ["xhsCookie"] })}>清除 Cookie</button>}
          {s.searchApiKeyMasked && <button className="btn-ghost" onClick={() => save({ clear: ["searchApiKey"] })}>清除搜索 Key</button>}
          {s.appPasswordMasked && <button className="btn-ghost" onClick={() => save({ clear: ["appPassword"] })}>取消登录密码</button>}
        </div>
      </section>

      <p className="text-xs text-muted">
        配置和数据都存在：<code className="rounded bg-white px-1">{s.home}</code>
        <br />
        换版本、自动更新都不会动这个文件夹；换电脑时把它整个拷过去就行。
      </p>
    </div>
  );
}
