/**
 * 「📌 存到爆款工作台」书签按钮的代码。
 * 在小红书笔记页面点这个书签：直接读取页面里已经加载好的笔记数据（和你看到的一样），
 * 然后打开工作台的入库页，自动填好并开始拆解。用的是你自己的浏览器，小红书不会当成机器人拦截。
 *
 * 写成纯字符串而不是函数，避免打包工具改写代码导致书签里缺东西。
 */
const COLLECTOR = String.raw`
(async () => {
  const un = (x) => (x && typeof x === "object" && ("_rawValue" in x || "_value" in x)) ? (x._rawValue ?? x._value) : x;
  const id = (location.pathname.match(/[0-9a-f]{24}/) || [])[0];
  let n = null;
  try {
    const nt = un(un(window.__INITIAL_STATE__)?.note);
    const map = un(nt?.noteDetailMap) || {};
    const key = id || un(nt?.currentNoteId);
    n = un(un(map[key])?.note);
  } catch (e) {}
  if (!n || !(n.title || n.desc)) {
    try {
      const html = await (await fetch(location.href, { credentials: "include" })).text();
      const raw = (html.match(/window\.__INITIAL_STATE__\s*=\s*([\s\S]*?)<\/script>/) || [])[1] || "";
      const st = JSON.parse(raw.trim().replace(/;$/, "").replace(/\bundefined\b/g, "null").replace(/new (?:Set|Map)\(\s*(\[[^\]]*\])?\s*\)/g, (a, b) => b || "[]"));
      const m = st.note.noteDetailMap;
      n = (m[id] || Object.values(m)[0]).note;
    } catch (e) {}
  }
  if (!n || !(n.title || n.desc)) {
    alert("没读到笔记内容：请先点开一篇笔记（能看到正文的页面），再点这个书签。");
    return;
  }
  const info = n.interactInfo || {};
  const imgs = n.imageList || [];
  const data = {
    noteId: n.noteId || id,
    url: location.href,
    title: n.title || "",
    desc: n.desc || "",
    likedCount: info.likedCount,
    collectedCount: info.collectedCount,
    commentCount: info.commentCount,
    time: n.time,
    author: n.user && (n.user.nickname || n.user.nickName),
    type: n.type,
    coverUrl: imgs[0] && (imgs[0].urlDefault || imgs[0].url),
    imageCount: imgs.length
  };
  try {
    if (data.coverUrl) {
      const r = await fetch(data.coverUrl.replace(/^http:/, "https:"));
      const b = await r.blob();
      if (r.ok && b.type.startsWith("image/") && b.size < 1500000) {
        data.coverData = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); });
      }
    }
  } catch (e) {}
  const target = WORKBENCH + "/ingest#xhs=" + encodeURIComponent(JSON.stringify(data));
  const w = window.open(target, "_blank");
  if (!w) location.href = target;
})();
`;

/** 生成书签链接；origin 是工作台地址（本机 http://localhost:3000，同事是 http://192.168.x.x:3000） */
export function buildBookmarklet(origin: string) {
  const code = `(() => { const WORKBENCH = ${JSON.stringify(origin)}; ${COLLECTOR} })()`;
  return "javascript:" + encodeURIComponent(code.replace(/\n\s*/g, " "));
}
