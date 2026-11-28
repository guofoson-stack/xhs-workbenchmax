import { NextResponse } from "next/server";
import { opencliCheck, xhsSearch } from "@/lib/opencli";
import { errorResponse, requireAdmin } from "@/lib/session";

export const maxDuration = 120;

/** 设置页「检测小红书搜索」：opencli doctor + 真搜一次 */
export async function POST() {
  try {
    await requireAdmin();
  } catch (e) {
    return errorResponse(e);
  }
  const doctor = await opencliCheck();
  let search: { ok: boolean; text: string };
  try {
    const r = await xhsSearch("事业单位 笔试回忆");
    search = r.length ? { ok: true, text: `搜到 ${r.length} 篇，第一篇：${r[0].title}` } : { ok: false, text: "能运行但没搜到结果，检查 Chrome 里小红书是否已登录" };
  } catch (e) {
    search = { ok: false, text: (e as Error).message };
  }
  return NextResponse.json({ ok: search.ok, doctor, search });
}
