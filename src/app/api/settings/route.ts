import { NextResponse, connection } from "next/server";
import { errorResponse, requireAdmin } from "@/lib/session";
import { WORKBENCH_HOME, isPlaceholderKey, readSettings, searchKey, writeSettings, type Settings } from "@/lib/config";

const SECRET_KEYS = ["aiApiKey", "xhsCookie", "searchApiKey", "updateToken", "appPassword", "radarToken"] as const;

function mask(v: string) {
  if (!v) return "";
  return v.length <= 8 ? "已填写" : `${v.slice(0, 3)}••••${v.slice(-4)}`;
}

/** 读取设置（密钥类只显示打码后的样子） */
export async function GET() {
  await connection();
  try {
    await requireAdmin();
  } catch (e) {
    return errorResponse(e);
  }
  const s = readSettings();
  const out: Record<string, unknown> = { ...s, home: WORKBENCH_HOME, keyReady: !isPlaceholderKey(s.aiApiKey), searchReady: !!searchKey(s) };
  for (const k of SECRET_KEYS) {
    out[k] = "";
    out[k + "Masked"] = mask(s[k]);
  }
  return NextResponse.json(out);
}

/** 保存设置：密钥类留空 = 不修改 */
export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch (e) {
    return errorResponse(e);
  }
  const b = (await req.json()) as Partial<Settings> & { clear?: string[] };
  const patch: Partial<Settings> = {};
  for (const k of ["aiBaseUrl", "aiModel", "aiTextModel", "updateRepo", "radarRepo", "opencliProfile", "opencliPath"] as const) {
    if (typeof b[k] === "string") patch[k] = b[k]!.trim();
  }
  if (typeof b.xhsSearch === "boolean") patch.xhsSearch = b.xhsSearch;
  for (const k of SECRET_KEYS) {
    if (typeof b[k] === "string" && b[k]!.trim()) patch[k] = b[k]!.trim();
    if (b.clear?.includes(k)) patch[k] = "";
  }
  for (const k of ["updateRepo", "radarRepo"] as const) {
    if (patch[k]) patch[k] = patch[k]!.replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/\/$/, "");
  }
  writeSettings(patch);
  return NextResponse.json({ ok: true });
}
