/**
 * 登录凭证：cookie 里放「用户id + 过期时间 + 签名」，服务器用密钥验签，不用每次查库。
 * 密钥由启动脚本生成，存在「爆款工作台数据\.secret」，通过环境变量 WORKBENCH_SECRET 传进来。
 * 这个文件在 proxy 和接口里都会用到，只用 Web Crypto，不引用数据库。
 */

export const AUTH_COOKIE = "xhs_wb_session";
export const SESSION_DAYS = 30;

const enc = new TextEncoder();

function b64url(bytes: Uint8Array) {
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s: string) {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmac(data: string) {
  const secret = process.env.WORKBENCH_SECRET || "xhs-workbench-dev-secret";
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data))));
}

export async function signSession(uid: string) {
  const payload = b64url(enc.encode(JSON.stringify({ uid, exp: Date.now() + SESSION_DAYS * 86400000 })));
  return `${payload}.${await hmac(payload)}`;
}

/** 验签成功返回用户 id，否则 null */
export async function verifySession(token: string | undefined | null): Promise<string | null> {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  if ((await hmac(payload)) !== sig) return null;
  try {
    const { uid, exp } = JSON.parse(new TextDecoder().decode(fromB64url(payload)));
    return typeof uid === "string" && exp > Date.now() ? uid : null;
  } catch {
    return null;
  }
}
