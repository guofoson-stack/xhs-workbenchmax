import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { COVER_DIR, get, run } from "@/lib/db";
import { HttpError, errorResponse, requireAdmin, requireUser } from "@/lib/session";
import { SCENES } from "@/lib/types";

/** 修改场景标签；管理员审核：{ review: "ok" | "rejected" | "pending", note?: 退回原因 } */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const b = await req.json();
    if (typeof b.scene === "string") {
      await requireUser();
      if (b.scene && !SCENES.includes(b.scene)) return NextResponse.json({ error: "场景不在列表里" }, { status: 400 });
      run("update notes set scene = ? where id = ?", b.scene || null, id);
    }
    if (typeof b.review === "string") {
      const me = await requireAdmin();
      if (!["ok", "rejected", "pending"].includes(b.review)) throw new HttpError(400, "审核状态不对");
      const reason = b.review === "rejected" ? String(b.note ?? "").trim().slice(0, 200) || null : null;
      run(
        "update notes set review = ?, review_note = ?, reviewed_by = ?, reviewed_at = datetime('now','localtime') where id = ?",
        b.review,
        reason,
        b.review === "pending" ? null : me.id,
        id
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

/** 彻底删除一篇（连同积木和封面）。管理员随时可删；员工只能删自己还没审核的 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const me = await requireUser();
    const n = get<{ created_by: string | null; review: string; cover_path: string | null }>(
      "select created_by, review, cover_path from notes where id = ?",
      id
    );
    if (!n) throw new HttpError(404, "这篇已经不在了");
    if (me.role !== "admin" && !(n.created_by === me.id && n.review === "pending"))
      throw new HttpError(403, "只能删除自己采集、还没审核的笔记");
    run("delete from notes where id = ?", id);
    if (n.cover_path) {
      const file = path.resolve(/*turbopackIgnore: true*/ COVER_DIR, n.cover_path);
      if (file.startsWith(path.resolve(COVER_DIR) + path.sep)) await fs.rm(file, { force: true });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
