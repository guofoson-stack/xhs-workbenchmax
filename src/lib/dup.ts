import "server-only";
import { get } from "@/lib/db";

/** 这篇是否已经采过；采过就返回给员工看的提示，没采过返回 null */
export function dupMessage(url: string | null | undefined): string | null {
  if (!url) return null;
  const d = get<{ who: string | null; review: string; review_note: string | null }>(
    "select u.name as who, n.review, n.review_note from notes n left join users u on u.id = n.created_by where n.url = ?",
    url
  );
  if (!d) return null;
  if (d.review === "rejected") return `这篇之前被管理员退回过${d.review_note ? `（${d.review_note}）` : ""}，换一篇吧`;
  return `这篇已经入过库了${d.who ? `（${d.who} 采集的）` : ""}，换一篇吧`;
}
