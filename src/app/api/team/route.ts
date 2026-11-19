import { NextResponse } from "next/server";
import { errorResponse, requireAdmin } from "@/lib/session";
import { teamStats } from "@/lib/team";

/** 团队看板数据（管理员） */
export async function GET(req: Request) {
  try {
    await requireAdmin();
    return NextResponse.json(teamStats(new URL(req.url).searchParams.get("week") ?? undefined));
  } catch (e) {
    return errorResponse(e);
  }
}
