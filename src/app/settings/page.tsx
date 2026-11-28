"use client";
import { useEffect, useState } from "react";
import { useMe } from "@/components/useMe";

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
  radarRepo: string;
  radarTokenMasked: string;
  appPasswordMasked: string;
  home: string;
  keyReady: boolean;
  xhsSearch: boolean;
  opencliProfile: string;
  opencliPath: string;
}

const PRESETS = [
  { name: "DeepSeek", aiBaseUrl: "https://api.deepseek.com", aiModel: "deepseek-flash", aiTextModel: "", site: "platform.deepseek.com" },
  { name: "通义千问", aiBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", aiModel: "qwen-vl-max", aiTextModel: "qwen-max", site: "阿里云百炼控制台" },
  { name: "豆包", aiBaseUrl: "https://ark.cn-beijing.volces.com/api/v3", aiModel: "", aiTextModel: "", site: "火山方舟控制台（模型名填接入点 ID）" },
];

function SensitiveWords() {
  const [custom, setCustom] = useState("");
  const [builtin, setBuiltin] = useState<{ label: string; category: string; tip: string }[]>([]);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    fetch("/api/sensitive")
      .then((r) => r.json())
      .then((j) => {
        setCustom(j.custom ?? "");
        setBuiltin((j.rules ?? []).filter((r: { category: string }) => r.category !== "自定义"));
      });
  }, []);
  async function save() {
    const r = await fetch("/api/sensitive", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ custom }) });
    const j = await r.json();
    setMsg(r.ok ? `✅ 已保存 ${j.count} 条，刷新生成页后生效` : "保存失败");
    setTimeout(() => setMsg(""), 3000);
  }
  return (
    <section className="card space-y-3">
      <div className="font-bold">违禁词（发布前检查用）</div>
      <p className="text-xs text-muted">
        生成结果会自动标出这些词，生成时也会提前告诉 AI 避开。内置了一份常见的导流、交易、极限词和承诺类词；你发现新的限流词，加在下面就行。
      </p>
      <details className="text-xs text-muted">
        <summary className="cursor-pointer">查看内置词库（{builtin.length} 组）</summary>
        <ul className="mt-1 space-y-0.5">
          {builtin.map((b, i) => (
            <li key={i}>
              <span className="chip mr-1">{b.category}</span>
              {b.label}　<span className="text-muted">→ {b.tip}</span>
            </li>
          ))}
        </ul>
      </details>
      <div>
        <label className="label">自定义违禁词：一行一个，格式「词|类别|替换成」，后两项可以不写</label>
        <textarea
          className="input h-32 font-mono"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder={"上岸率|承诺夸大\n速成|夸大|快速掌握\n# 正则写法（两边带空格的 | 分隔）：\nre:\\d+天(上岸|速成) | 承诺夸大"}
        />
      </div>
      <div className="flex items-center gap-2">
        <button className="btn-ghost" onClick={save}>
          保存
        </button>
        {msg && <span className="text-sm">{msg}</span>}
      </div>
    </section>
  );
}

export default function SettingsPage() {
  const me = useMe();
  const [s, setS] = useState<S | null>(null);
  const [form, setForm] = useState({ aiBaseUrl: "", aiModel: "", aiTextModel: "", updateRepo: "", aiApiKey: "", xhsCookie: "", searchApiKey: "", updateToken: "", radarRepo: "", radarToken: "" });
  const [radarMsg, setRadarMsg] = useState("");
  const [msg, setMsg] = useState("");
  const [test, setTest] = useState("");
  const [testing, setTesting] = useState(false);

  async function load() {
    const j: S = await (await fetch("/api/settings")).json();
    setS(j);
    setForm((f) => ({ ...f, aiBaseUrl: j.aiBaseUrl, aiModel: j.aiModel, aiTextModel: j.aiTextModel, updateRepo: j.updateRepo, aiApiKey: "", xhsCookie: "", searchApiKey: "", updateToken: "", radarRepo: j.radarRepo, radarToken: "" }));
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

  async function saveRadar() {
    if (!(await save())) return;
    setRadarMsg("同步中…");
    const r = await fetch("/api/radar?sync=1");
    const j = await r.json();
    setRadarMsg(!r.ok ? "❌ " + j.error : j.syncError ? "❌ " + j.syncError : `✅ 连上了，已有 ${j.days.length} 天的数据`);
  }

  if (me && me.user.role !== "admin") return <div className="card text-sm text-muted">设置只有管理员能改，有需要请找管理员。</div>;
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
        <div className="font-bold">📈 销量雷达</div>
        <p className="text-xs text-muted">安卓手机每晚把小红书销量数据传到这个 GitHub 仓库，工作台每 30 分钟拉一次，同事在「销量雷达」页就能看。</p>
        <div>
          <label className="label">数据仓库（格式：用户名/仓库名）</label>
          <input className="input" value={form.radarRepo} onChange={set("radarRepo")} placeholder="guofoson-stack/xhs-radar" />
        </div>
        <div>
          <label className="label">GitHub 令牌（github_pat_ 开头）{s.radarTokenMasked && <span className="text-ink">（当前：{s.radarTokenMasked}）</span>}</label>
          <input className="input" type="password" value={form.radarToken} onChange={set("radarToken")} placeholder="留空 = 不修改" autoComplete="off" />
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-ghost" onClick={saveRadar}>保存并同步</button>
          {radarMsg && <span className="text-sm">{radarMsg}</span>}
        </div>
      </section>

      <XhsSearchCard s={s} onSaved={load} />

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
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={() => save()}>保存</button>
          {s.xhsCookieMasked && <button className="btn-ghost" onClick={() => save({ clear: ["xhsCookie"] })}>清除 Cookie</button>}
          {s.searchApiKeyMasked && <button className="btn-ghost" onClick={() => save({ clear: ["searchApiKey"] })}>清除搜索 Key</button>}
        </div>
      </section>

      <SensitiveWords />

      <p className="text-xs text-muted">
        配置和数据都存在：<code className="rounded bg-white px-1">{s.home}</code>
        <br />
        换版本、自动更新都不会动这个文件夹；换电脑时把它整个拷过去就行。
      </p>
    </div>
  );
}

function XhsSearchCard({ s, onSaved }: { s: S; onSaved: () => void }) {
  const [on, setOn] = useState(s.xhsSearch);
  const [profile, setProfile] = useState(s.opencliProfile);
  const [bin, setBin] = useState(s.opencliPath);
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);

  async function saveAnd(check: boolean) {
    setBusy(true);
    await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ xhsSearch: on, opencliProfile: profile, opencliPath: bin }) });
    onSaved();
    if (!check) {
      setBusy(false);
      return setResult("✅ 已保存");
    }
    setResult("检测中，大约 10–40 秒…");
    const j = await (await fetch("/api/settings/opencli", { method: "POST" })).json();
    setBusy(false);
    setResult(`${j.search?.ok ? "✅ 小红书搜索可以用：" : "❌ 小红书搜索不可用："}${j.search?.text ?? j.error}\n\n—— opencli doctor ——\n${j.doctor?.text ?? ""}`);
  }

  return (
    <section className="card space-y-3">
      <div className="font-bold">🔎 小红书搜索（OpenCLI）</div>
      <p className="text-xs text-muted">
        搜考情时，用这台电脑上的 OpenCLI 去小红书搜真实考生的笔试回忆（题型、题量、怎么考），和网页资料交叉核对。需要：这台电脑装了 OpenCLI，Chrome 开着、Browser Bridge 扩展已连接、Chrome 里小红书已登录（建议用小号）。
        没装或没连上也不影响，只是只搜网页。
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} />
        搜考情时同时搜小红书
      </label>
      <div className="grid gap-2 md:grid-cols-2">
        <div>
          <label className="label">浏览器 profile（只连了一个 Chrome 就留空）</label>
          <input className="input" value={profile} onChange={(e) => setProfile(e.target.value)} placeholder="如 rvzt5kx5，命令行 opencli profile list 可查" />
        </div>
        <div>
          <label className="label">opencli 位置（自动找不到时才填）</label>
          <input className="input" value={bin} onChange={(e) => setBin(e.target.value)} placeholder="如 C:\Users\你\AppData\Roaming\npm" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-ghost" disabled={busy} onClick={() => saveAnd(true)}>
          {busy ? "检测中…" : "保存并检测"}
        </button>
        <button className="btn-ghost" disabled={busy} onClick={() => saveAnd(false)}>
          只保存
        </button>
      </div>
      {result && <pre className="whitespace-pre-wrap rounded-lg bg-paper p-3 text-xs">{result}</pre>}
    </section>
  );
}
