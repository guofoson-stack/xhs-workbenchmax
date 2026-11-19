export const AUTH_COOKIE = "xhs_wb_auth";

/** cookie 里存的是密码的哈希，不直接存密码 */
export async function expectedToken(): Promise<string> {
  const pwd = process.env.APP_PASSWORD ?? "";
  const data = new TextEncoder().encode("xhs-workbench:" + pwd);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
