import { NextResponse } from "next/server";
import { writeSettings } from "@/lib/config";
import { errorResponse, requireAdmin } from "@/lib/session";

/** 修改每日指标（管理员） */
export async function POST(req: Request) {
  try {
    await requireAdmin();
    const b = await req.json();
    const daily = Math.max(0, Math.min(50, Math.round(Number(b.daily))));
    const days = Array.isArray(b.days) ? [...new Set(b.days.map(Number).filter((d: number) => d >= 0 && d <= 6))] : undefined;
    writeSettings({ dailyQuota: Number.isFinite(daily) ? daily : 1, ...(days ? { quotaDays: days as number[] } : {}) });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
