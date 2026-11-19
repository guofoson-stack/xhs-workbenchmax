// 小红书爆款工作台 · 一键启动
// Windows 双击「启动工作台.bat」，Mac 双击「启动工作台.command」，都会调用这个脚本：
// 检查环境 → 第一次自动安装依赖 → 代码有改动自动重新构建 → 启动 → 打开浏览器 → 显示同事访问地址
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT);
const PORT = Number(process.env.PORT) || 3000;
const isWin = process.platform === "win32";
const NEXT = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");

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

// 2. 配置文件
const envFile = path.join(ROOT, ".env.local");
if (!fs.existsSync(envFile)) {
  fs.copyFileSync(path.join(ROOT, ".env.example"), envFile);
  say("📝 第一次运行：已经生成配置文件 .env.local，正在用记事本打开。");
  say("   请填好大模型的 API Key，保存关闭后，再双击启动一次。\n");
  if (isWin) spawn("notepad", [envFile], { detached: true, stdio: "ignore" }).unref();
  else spawn("open", ["-e", envFile], { detached: true, stdio: "ignore" }).unref();
  fail("请先填写配置文件 .env.local");
}
const envText = fs.readFileSync(envFile, "utf8");
if (/AI_API_KEY=\s*(sk-在这里填你的key)?\s*$/m.test(envText)) {
  if (isWin) spawn("notepad", [envFile], { detached: true, stdio: "ignore" }).unref();
  fail("配置文件 .env.local 里的 AI_API_KEY 还没填，已用记事本打开，填好保存后再启动。");
}

// 3. 依赖：第一次运行时自动安装（大约 1–3 分钟）
if (!fs.existsSync(NEXT)) {
  say("📦 第一次运行，正在安装依赖（1–3 分钟，只需要一次）…\n");
  const r = spawnSync("npm", ["install", "--no-audit", "--no-fund"], { stdio: "inherit", shell: true });
  if (r.status !== 0) fail("依赖安装失败，请检查网络后重试。");
}

// 4. 构建：第一次运行，或者代码有改动时自动重新构建（改 prompts/ 里的提示词不需要）
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
  say("🔨 正在构建（第一次或代码更新后需要，约 1 分钟）…\n");
  const r = spawnSync(process.execPath, [NEXT, "build"], { stdio: "inherit", env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" } });
  if (r.status !== 0) fail("构建失败，把上面的报错截图发给技术同事。");
  fs.writeFileSync(stampFile, srcStamp);
}

// 5. 启动服务（监听局域网，同事也能访问）
const server = spawn(process.execPath, [NEXT, "start", "-H", "0.0.0.0", "-p", String(PORT)], {
  stdio: ["ignore", "pipe", "inherit"],
  env: { ...process.env, NODE_NO_WARNINGS: "1", NEXT_TELEMETRY_DISABLED: "1" },
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
say("   · 数据都在 data 文件夹里，每天自动备份到 data/backups");
say("\n   ⚠️  这个窗口不要关，关掉工作台就停了。\n");

const url = `http://localhost:${PORT}`;
if (isWin) spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
else if (process.platform === "darwin") spawn("open", [url], { detached: true, stdio: "ignore" }).unref();

server.on("exit", (code) => fail(`工作台意外停止了（代码 ${code}），重新双击启动即可。`));
