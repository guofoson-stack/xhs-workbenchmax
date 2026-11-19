import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";

/** 查看入库笔记的原封面（私有存储，临时签名链接） */
export async function GET(req: Request) {
  const path = new URL(req.url).searchParams.get("path");
  if (!path) return new Response("缺少 path", { status: 400 });
  const { data, error } = await db().storage.from("covers").createSignedUrl(path, 600);
  if (error || !data) return new Response("找不到图片", { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
