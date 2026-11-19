import { Suspense } from "react";
import { connection } from "next/server";
import ExamsClient from "./ExamsClient";

// 考情页要按「今天」计算时间线状态，所以每次打开时实时渲染，不在构建时预渲染
async function Dynamic() {
  await connection();
  return <ExamsClient />;
}

export default function ExamsPage() {
  return (
    <Suspense fallback={<div className="card text-sm text-muted">加载中…</div>}>
      <Dynamic />
    </Suspense>
  );
}
