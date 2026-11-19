import { NextResponse, connection } from "next/server";
import { chatJson } from "@/lib/ai";
import { all, get, run } from "@/lib/db";
import { SCENES } from "@/lib/types";

export const maxDuration = 300;

interface N {
  id: string;
  title: string;
  body: string | null;
  summary: string | null;
}

/** 还没标场景的爆款有几篇 */
export async function GET() {
  await connection();
  return NextResponse.json({ untagged: get<{ n: number }>("select count(*) as n from notes where scene is null or scene = ''")?.n ?? 0 });
}

/** 给旧素材一键补场景标签：每次最多处理 40 篇，每 10 篇问一次模型 */
export async function POST() {
  const notes = all<N>("select id, title, body, summary from notes where scene is null or scene = '' limit 40");
  let tagged = 0;
  for (let i = 0; i < notes.length; i += 10) {
    const batch = notes.slice(i, i + 10);
    const list = batch.map((n, k) => `${k + 1}. 标题：${n.title}\n   爆款原因：${n.summary ?? ""}\n   正文开头：${(n.body ?? "").slice(0, 200).replace(/\n/g, " ")}`).join("\n");
    try {
      const out = await chatJson<{ scenes: string[] }>(
        [
          {
            role: "system",
            content: `你在给小红书「招聘考试资料」赛道的爆款笔记分类。每篇笔记只选一个最贴切的场景，只能从这些里选：${SCENES.join(" / ")}。
场景含义：公告解读=刚出公告、解读招多少人和条件；报名指导=怎么报名、选岗、避坑；备考方法=怎么复习、学习规划；资料推荐=推荐/展示备考资料；考前冲刺=临考重点、押题、考场注意；考后估分=对答案、估分、等成绩；面试=面试形式、真题、技巧；企业文化时政=单位文化、时政热点背诵；上岸经验=上岸/在职人员分享经历。
只输出 JSON：{"scenes": ["第1篇的场景", "第2篇的场景", ...]}，数量和顺序与输入一致。`,
          },
          { role: "user", content: list },
        ],
        { temperature: 0 }
      );
      batch.forEach((n, k) => {
        const sc = out.scenes?.[k];
        if (sc && SCENES.includes(sc)) {
          run("update notes set scene = ? where id = ?", sc, n.id);
          tagged++;
        }
      });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message, tagged }, { status: 500 });
    }
  }
  const left = get<{ n: number }>("select count(*) as n from notes where scene is null or scene = ''")?.n ?? 0;
  return NextResponse.json({ tagged, left });
}
