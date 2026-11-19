import { NextResponse } from "next/server";
import { all } from "@/lib/db";

/** 爆款库列表：可按类型、考试类别、关键词筛选 */
export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const where: string[] = [];
    const params: string[] = [];
    const type = sp.get("type");
    const category = sp.get("category");
    const kw = sp.get("q")?.trim();
    const by = sp.get("by");
    if (by) {
      where.push("collector_id = ?");
      params.push(by);
    }
    const scene = sp.get("scene");
    if (scene) {
      if (scene === "未分类") where.push("(scene is null or scene = '')");
      else {
        where.push("scene = ?");
        params.push(scene);
      }
    }
    if (type) {
      where.push("type = ?");
      params.push(type);
    }
    if (category) {
      where.push("exam_category = ?");
      params.push(category);
    }
    if (kw) {
      where.push("(template like ? or note_title like ? or pattern like ?)");
      params.push(`%${kw}%`, `%${kw}%`, `%${kw}%`);
    }
    const order = sp.get("sort") === "new" ? "created_at desc" : "rating desc, heat desc";
    const items = all(
      `select * from element_view ${where.length ? "where " + where.join(" and ") : ""} order by ${order} limit 300`,
      ...params
    );
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
