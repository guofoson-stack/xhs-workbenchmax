// 自动更新：从 GitHub 仓库下载最新版本，覆盖程序文件（不碰配置、数据、依赖）。
// 在「设置」页填了更新源后，每次双击启动都会先跑一遍；没填就直接跳过。
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SKIP = new Set(["node_modules", ".next", ".git", "data", ".env.local"]);
const API = process.env.WORKBENCH_UPDATE_API || "https://api.github.com"; // 测试时可以指向本地模拟服务器

function extract(zipFile, dest) {
  fs.mkdirSync(dest, { recursive: true });
  // Windows 10+ 和 Mac 自带的 tar 能解压 zip；Linux 用 unzip
  const tries =
    process.platform === "win32"
      ? [["tar", ["-xf", zipFile, "-C", dest]], ["powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${zipFile}' -DestinationPath '${dest}' -Force`]]]
      : [["tar", ["-xf", zipFile, "-C", dest]], ["unzip", ["-q", "-o", zipFile, "-d", dest]]];
  for (const [cmd, args] of tries) {
    const r = spawnSync(cmd, args, { stdio: "ignore" });
    if (r.status === 0 && fs.readdirSync(dest).length) return true;
  }
  return false;
}

/**
 * @returns {Promise<{updated: boolean, version?: string, message: string}>}
 */
export async function checkUpdate(root, settings) {
  const repo = (settings.updateRepo || "").trim();
  if (!repo) return { updated: false, message: "" };
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return { updated: false, message: `更新源格式不对：${repo}（应该是 用户名/仓库名）` };

  const headers = { "User-Agent": "xhs-workbench", Accept: "application/vnd.github+json" };
  if (settings.updateToken) headers.Authorization = `Bearer ${settings.updateToken}`;
  const versionFile = path.join(root, ".workbench-version");
  const current = fs.existsSync(versionFile) ? fs.readFileSync(versionFile, "utf8").trim() : "";

  let sha, msg;
  try {
    const r = await fetch(`${API}/repos/${repo}/commits/HEAD`, { headers, signal: AbortSignal.timeout(15000) });
    if (r.status === 404) return { updated: false, message: "找不到更新源仓库（私有仓库需要在设置里填访问令牌）" };
    if (!r.ok) return { updated: false, message: `检查更新失败（GitHub 返回 ${r.status}），先用当前版本` };
    const j = await r.json();
    sha = j.sha;
    msg = (j.commit?.message || "").split("\n")[0];
  } catch {
    return { updated: false, message: "检查更新失败（连不上 GitHub），先用当前版本" };
  }
  if (!sha || sha === current) return { updated: false, version: sha, message: "已经是最新版本" };

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "xhs-wb-update-"));
  try {
    const zipFile = path.join(tmp, "update.zip");
    const r = await fetch(`${API}/repos/${repo}/zipball/${sha}`, { headers, redirect: "follow", signal: AbortSignal.timeout(120000) });
    if (!r.ok) return { updated: false, message: `下载新版本失败（${r.status}），先用当前版本` };
    fs.writeFileSync(zipFile, Buffer.from(await r.arrayBuffer()));

    const out = path.join(tmp, "x");
    if (!extract(zipFile, out)) return { updated: false, message: "新版本解压失败，先用当前版本" };
    const [top] = fs.readdirSync(out);
    const src = path.join(out, top);
    if (!fs.existsSync(path.join(src, "package.json"))) return { updated: false, message: "下载的新版本不完整，先用当前版本" };

    for (const name of fs.readdirSync(src)) {
      if (SKIP.has(name)) continue;
      fs.cpSync(path.join(src, name), path.join(root, name), { recursive: true, force: true });
    }
    fs.writeFileSync(versionFile, sha);
    return { updated: true, version: sha, message: `已更新到最新版本${msg ? "：" + msg : ""}` };
  } catch (e) {
    return { updated: false, message: "更新过程出错，先用当前版本：" + (e?.message || e) };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
