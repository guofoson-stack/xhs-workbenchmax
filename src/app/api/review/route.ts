import { NextResponse, connection } from "next/server";
import { all } from "@/lib/db";
import { errorResponse, requireAdmin } from "@/lib/session";

/** 审核列表：?status=pending|ok|rejected  &by=采集人 */
export async function GET(req: Request) {
  await connection();
  try {
    await requireAdmin();
    const sp = new URL(req.url).searchParams;
    const status = ["pending", "ok", "rejected"].includes(sp.get("status") ?? "") ? sp.get("status")! : "pending";
    const by = sp.get("by") ?? "";
    const notes = all<Record<string, unknown> & { id: string }>(
      `select n.id, n.url, n.title, n.body, n.cover_path, n.likes, n.collects, n.comments, n.exam_name, n.exam_category, n.scene,
              n.created_at, n.review, n.review_note, n.reviewed_at, n.created_by,
              u.name as collector, r.name as reviewer,
              (select coalesce(sum(use_count),0) from elements e where e.note_id = n.id) as used
       from notes n left join users u on u.id = n.created_by left join users r on r.id = n.reviewed_by
       where n.review = ? and (? = '' or n.created_by = ?)
       order by ${status === "pending" ? "n.created_at asc" : "coalesce(n.reviewed_at, n.created_at) desc"}
       limit 200`,
      status,
      by,
      by
    );
    const els = notes.length
      ? all<{ note_id: string; type: string; template: string; pattern: string | null }>(
          `select note_id, type, template, pattern from elements where note_id in (${notes.map(() => "?").join(",")})`,
          ...notes.map((n) => n.id)
        )
      : [];
    const counts = Object.fromEntries(
      all<{ review: string; n: number }>("select review, count(*) as n from notes group by review").map((r) => [r.review, r.n])
    );
    return NextResponse.json({
      items: notes.map((n) => ({ ...n, elements: els.filter((e) => e.note_id === n.id) })),
      counts: { pending: counts.pending ?? 0, ok: counts.ok ?? 0, rejected: counts.rejected ?? 0 },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
