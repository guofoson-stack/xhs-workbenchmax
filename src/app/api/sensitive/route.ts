import { NextResponse, connection } from "next/server";
import { readCustomWords, writeCustomWords } from "@/lib/sensitiveStore";
import { DEFAULT_RULES, parseCustom } from "@/lib/sensitive";
import { errorResponse, requireAdmin } from "@/lib/session";

/** 违禁词：内置词库 + 自定义词表 */
export async function GET() {
  await connection();
  const custom = readCustomWords();
  return NextResponse.json({ custom, rules: [...DEFAULT_RULES, ...parseCustom(custom)] });
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch (e) {
    return errorResponse(e);
  }
  const { custom } = await req.json();
  writeCustomWords(String(custom ?? ""));
  return NextResponse.json({ ok: true, count: parseCustom(String(custom ?? "")).length });
}
