import { NextResponse, connection } from "next/server";
import { errorResponse, requireUser } from "@/lib/session";
import { radarDay, radarDays, radarRuns, syncRadar, syncStatus } from "@/lib/radar";

/**
 * 销量雷达数据（所有登录的人都能看）。
 * ?sync=1 立即去 GitHub 拉新数据；不带时距上次超过 30 分钟才拉。
 * ?day=YYYY-MM-DD 看某一天，不带就看最新一天。
 */
export async function GET(req: Request) {
  await connection();
  try {
    await requireUser();
    const q = new URL(req.url).searchParams;
    await syncRadar(q.get("sync") === "1");
    const days = radarDays();
    const want = q.get("day") ?? "";
    const day = days.some((d) => d.day === want) ? want : days[0]?.day ?? null;
    return NextResponse.json({ ...syncStatus(), days, day, rows: day ? radarDay(day) : [], runs: radarRuns() });
  } catch (e) {
    return errorResponse(e);
  }
}
