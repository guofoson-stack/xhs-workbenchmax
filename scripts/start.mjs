// 小红书爆款工作台 · 一键启动
// Windows 双击「启动工作台.bat」，Mac 双击「启动工作台.command」，都会调用这个脚本：
// 自动更新 → 第一次自动安装依赖 → 代码有改动自动重新构建 → 启动 → 打开浏览器 → 显示同事访问地址
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkUpdate } from "./update.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT);
const PORT = Number(process.env.PORT) || 3000;
const isWin = process.platform === "win32";
const NEXT = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");

// 配置和数据的固定位置（不在程序文件夹里，换版本不会丢）
const HOME = process.env.WORKBENCH_HOME || path.join(os.homedir(), "爆款工作台数据");
const SETTINGS = path.join(HOME, "设置.json");

const say = (s = "") => console.log(s);
const fail = (s) => {
  console.log("\n❌ " + s + "\n");
  if (isWin) spawnSync("cmd", ["/c", "pause"], { stdio: "inherit" });
  process.exit(1);
};

say("========================================");
say("        小红书爆款工作台 · 启动中");
say("========================================\n");

// 1. Node 版本：需要 22.13+（内置 SQLite 数据库）
const [maj, min] = process.versions.node.split(".").map(Number);
if (maj < 22 || (maj === 22 && min < 13)) {
  fail(`Node.js 版本太旧（当前 ${process.versions.node}），请到 https://nodejs.org/zh-cn 下载安装最新的 LTS 版本后再双击启动。`);
}

// 2. 把旧版放在程序文件夹里的配置（.env.local）和数据（data）搬到固定位置，只搬一次
fs.mkdirSync(HOME, { recursive: true });
const oldEnv = path.join(ROOT, ".env.local");
if (!fs.existsSync(SETTINGS) && fs.existsSync(oldEnv)) {
  const env = Object.fromEntries(
    fs.readFileSync(oldEnv, "utf8").split(/\r?\n/).map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean).map((m) => [m[1], m[2]])
  );
  const key = env.AI_API_KEY && !/在这里填/.test(env.AI_API_KEY) ? env.AI_API_KEY : "";
  fs.writeFileSync(
    SETTINGS,
    JSON.stringify(
      {
        aiBaseUrl: env.AI_BASE_URL || "https://api.deepseek.com",
        aiApiKey: key,
        aiModel: env.AI_MODEL || "deepseek-flash",
        aiTextModel: env.AI_TEXT_MODEL || "",
        xhsCookie: env.XHS_COOKIE || "",
        appPassword: env.APP_PASSWORD || "",
        updateRepo: "",
        updateToken: "",
      },
      null,
      2
    )
  );
  say("📦 已把原来的 API 配置搬到「" + HOME + "」，以后换版本不用再填。");
}
const oldData = path.join(ROOT, "data");
const newData = path.join(HOME, "data");
if (fs.existsSync(path.join(oldData, "workbench.db")) && !fs.existsSync(path.join(newData, "workbench.db"))) {
  fs.cpSync(oldData, newData, { recursive: true });
  fs.renameSync(oldData, path.join(ROOT, "data-已搬走-可删除"));
  say("📦 已把原来的数据搬到「" + newData + "」。");
}
let settings = {};
try {
  settings = JSON.parse(fs.readFileSync(SETTINGS, "utf8").replace(/^﻿/, ""));
} catch {}

// 3. 自动更新（在设置页填了更新源才会检查）
if (!process.env.WORKBENCH_SKIP_UPDATE && settings.updateRepo) {
  say("🔄 检查更新…");
  const before = fs.readFileSync(path.join(ROOT, "scripts", "start.mjs"), "utf8");
  const r = await checkUpdate(ROOT, settings);
  if (r.message) say("   " + r.message + "\n");
  // 启动脚本自己也更新了：用新脚本重新跑一遍
  if (r.updated && fs.readFileSync(path.join(ROOT, "scripts", "start.mjs"), "utf8") !== before) {
    const again = spawnSync(process.execPath, [path.join(ROOT, "scripts", "start.mjs")], {
      stdio: "inherit",
      env: { ...process.env, WORKBENCH_SKIP_UPDATE: "1" },
    });
    process.exit(again.status ?? 0);
  }
}

// 4. 依赖：第一次运行，或者新版本的依赖有变化时自动安装（1–3 分钟）
const lockFile = path.join(ROOT, "package-lock.json");
const lockHash = fs.existsSync(lockFile) ? createHash("md5").update(fs.readFileSync(lockFile)).digest("hex") : "none";
const lockStamp = path.join(ROOT, "node_modules", ".workbench-lock-hash");
const installedHash = fs.existsSync(lockStamp) ? fs.readFileSync(lockStamp, "utf8") : "";
if (!fs.existsSync(NEXT) || installedHash !== lockHash) {
  say(fs.existsSync(NEXT) ? "📦 新版本的依赖有变化，正在更新依赖…\n" : "📦 第一次运行，正在安装依赖（1–3 分钟，只需要一次）…\n");
  const r = spawnSync("npm", ["install", "--no-audit", "--no-fund"], { stdio: "inherit", shell: true });
  if (r.status !== 0) fail("依赖安装失败，请检查网络后重试。");
  fs.writeFileSync(lockStamp, lockHash);
}

// 5. 构建：第一次运行，或者代码有改动时自动重新构建（改提示词不需要）
function latestMtime(p) {
  const st = fs.statSync(p);
  if (!st.isDirectory()) return st.mtimeMs;
  return Math.max(st.mtimeMs, ...fs.readdirSync(p).map((f) => latestMtime(path.join(p, f))));
}
const stampFile = path.join(ROOT, ".next", "workbench-build-stamp");
const srcStamp = String(
  Math.max(latestMtime(path.join(ROOT, "src")), ...["package.json", "next.config.ts"].map((f) => latestMtime(path.join(ROOT, f))))
);
const built = fs.existsSync(stampFile) ? fs.readFileSync(stampFile, "utf8") : "";
if (built !== srcStamp) {
  say("🔨 正在构建（第一次或更新后需要，约 1 分钟）…\n");
  const r = spawnSync(process.execPath, [NEXT, "build"], {
    stdio: "inherit",
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", WORKBENCH_HOME: HOME },
  });
  if (r.status !== 0) fail("构建失败，把上面的报错截图发给技术同事。");
  fs.writeFileSync(stampFile, srcStamp);
}

// 6. 启动服务（监听局域网，同事也能访问）
const server = spawn(process.execPath, [NEXT, "start", "-H", "0.0.0.0", "-p", String(PORT)], {
  stdio: ["ignore", "pipe", "inherit"],
  env: {
    ...process.env,
    NODE_NO_WARNINGS: "1",
    NEXT_TELEMETRY_DISABLED: "1",
    WORKBENCH_HOME: HOME,
    APP_PASSWORD: settings.appPassword || "",
  },
});
server.stdout.on("data", () => {}); // Next 自己的启动信息不显示，免得看花眼

const lanIps = Object.values(os.networkInterfaces())
  .flat()
  .filter((n) => n && n.family === "IPv4" && !n.internal && !n.address.startsWith("169.254."))
  .map((n) => n.address);

async function waitReady() {
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(`http://127.0.0.1:${PORT}/login`);
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return false;
}

if (!(await waitReady())) fail(`启动失败：${PORT} 端口可能被占用了。关掉其他已经打开的工作台窗口再试。`);

say("\n✅ 工作台已启动！\n");
say(`   本机打开：  http://localhost:${PORT}`);
for (const ip of lanIps) say(`   同事打开：  http://${ip}:${PORT}`);
say("\n   · 同事要和这台电脑连同一个 Wi-Fi / 网络");
say("   · 同事打不开？Windows 第一次启动会弹「防火墙」提示，要勾选「专用网络」并点允许；");
say("     错过了的话，右键「允许局域网访问.bat」→ 以管理员身份运行");
say(`   · 配置和数据在：${HOME}（每天自动备份）`);
if (!settings.aiApiKey) say("   · 第一次使用：在网页的「⚙️ 设置」里填大模型 API Key");
say("\n   ⚠️  这个窗口不要关，关掉工作台就停了。\n");

const url = `http://localhost:${PORT}${settings.aiApiKey ? "" : "/settings"}`;
if (isWin) spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
else if (process.platform === "darwin") spawn("open", [url], { detached: true, stdio: "ignore" }).unref();

server.on("exit", (code) => fail(`工作台意外停止了（代码 ${code}），重新双击启动即可。`));
