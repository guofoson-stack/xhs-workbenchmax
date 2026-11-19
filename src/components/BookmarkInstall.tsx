"use client";
import { useEffect, useRef, useState } from "react";
import { buildBookmarklet } from "@/lib/bookmarklet";

/**
 * 「📌 存到爆款工作台」书签的安装说明。
 * 书签里写的是当前打开工作台用的地址：主机上是 localhost，同事电脑上是主机的局域网 IP，各自拖各自的就行。
 */
export default function BookmarkInstall() {
  const ref = useRef<HTMLAnchorElement>(null);
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // React 不允许直接写 javascript: 链接，只能挂载后手动设置
    ref.current?.setAttribute("href", buildBookmarklet(window.location.origin));
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 读取本机记住的「已安装」状态，只执行一次
      if (localStorage.getItem("xhs-bookmark-installed") === "1") setOpen(false);
    } catch {}
  }, []);

  function done() {
    setOpen(false);
    try {
      localStorage.setItem("xhs-bookmark-installed", "1");
    } catch {}
  }

  async function copyCode() {
    await navigator.clipboard.writeText(buildBookmarklet(window.location.origin));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!open) {
    return (
      <button className="text-xs text-muted underline" onClick={() => setOpen(true)}>
        📌 采集书签安装说明
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border-2 border-dashed border-brand/40 bg-white p-4 text-sm">
      <div className="font-bold">📌 推荐：用书签一键采集（第一次用要先装一下）</div>
      <ol className="list-decimal space-y-1 pl-5 text-muted">
        <li>
          按 <b>Ctrl + Shift + B</b> 打开浏览器的书签栏
        </li>
        <li>
          用鼠标<b>按住</b>下面这个红色按钮，<b>拖到书签栏</b>上松开
        </li>
        <li>以后在小红书网页版看到爆款，点开笔记后点一下书签，工作台会自动打开、填好并开始拆解</li>
      </ol>
      <div className="flex flex-wrap items-center gap-3">
        <a
          ref={ref}
          onClick={(e) => {
            e.preventDefault();
            alert("不要点我，要按住拖到书签栏上 😊");
          }}
          className="cursor-grab rounded-lg bg-brand px-4 py-2 font-bold text-white shadow active:cursor-grabbing"
        >
          📌 存到爆款工作台
        </a>
        <button className="btn-ghost" onClick={done}>
          我装好了，收起说明
        </button>
      </div>
      <details className="text-xs text-muted">
        <summary className="cursor-pointer">拖不上去？手动添加</summary>
        <div className="mt-2 space-y-1">
          <div>1. 在书签栏上点右键 →「添加网页」/「添加书签」</div>
          <div>2. 名称填：存到爆款工作台</div>
          <div>
            3. 网址：
            <button className="btn-ghost ml-1 py-0.5" onClick={copyCode}>
              {copied ? "已复制" : "点这里复制"}
            </button>
            ，粘贴进去，保存
          </div>
        </div>
      </details>
    </div>
  );
}
