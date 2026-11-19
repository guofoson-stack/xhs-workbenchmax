# 小红书爆款工作台（内部版）

把每天找到的小红书爆款拆成「积木」存进库里。做新考试时，从库里自动搭配标题、封面、正文，一次生成几版，封面直接出图。

```
入库拆解 → 爆款库 → 录考情 → 一键生成（标题 + 正文 + 封面图）→ 发布后回填数据 → 好积木自动加分
```

技术栈：Next.js 16 + Supabase + 任意 OpenAI 兼容大模型，部署在 Vercel。

---

## 一、第一次部署（约 30 分钟）

### 1. 建 Supabase 数据库
1. 在 [supabase.com](https://supabase.com) 新建一个项目。
2. 左侧菜单 **SQL Editor**，把 `supabase/schema.sql` 整段贴进去运行。它会建好 4 张表、1 个视图和一个 `covers` 存储桶。
3. 打开 **Project Settings → API**，记下 `Project URL` 和 `service_role` key。

### 2. 准备大模型 API
任何 OpenAI 兼容接口都可以，但**拆解用的模型必须能看图**，因为要识别封面。

| 模型 | AI_BASE_URL | AI_MODEL 示例 |
|---|---|---|
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-vl-max` |
| 豆包（火山方舟） | `https://ark.cn-beijing.volces.com/api/v3` | 填控制台里视觉模型的接入点 ID |
| Claude | `https://api.anthropic.com/v1` | `claude-sonnet-5-5` |

如果写文案想换一个更会写的模型，可以另外填 `AI_TEXT_MODEL`（必须是同一个 BASE_URL 下的模型）。

### 3. 本地跑起来
```bash
npm install
cp .env.example .env.local   # 把上面拿到的值填进去，再设一个团队密码
npm run dev                  # 打开 http://localhost:3000
```

### 4. 部署到 Vercel
1. 把这个文件夹推到 GitHub 的**私有仓库**。
2. 在 Vercel 导入这个仓库，到 **Settings → Environment Variables** 里把 `.env.example` 里的变量全部填上。
3. 部署完成。
4. ⚠️ `*.vercel.app` 域名在国内访问可能不稳定，建议在 Vercel 绑定一个自己的域名。

---

## 二、日常使用

1. **入库拆解**：看到爆款，把链接、标题、正文、点赞收藏数贴进来，封面截图直接 Ctrl+V。点「拆解」后 AI 会拆出 6 类积木：标题、封面、正文结构、开头钩子、结尾引导、话题标签。确认、打分、删掉不要的，再点「确认入库」。
2. **考情**：要做的考试先在这里录入真实考情（科目、时间、特点、我们卖的资料）。**生成时考试事实只从这里取。**没录考情的考试也能生成，但具体事实会全部模糊处理。
3. **一键生成**：选考试，填额外要求（比如人设、侧重点），一次出 1–5 版。每版都有标题、正文、标签和一张封面图（1080×1440）。可以直接改文字，封面会跟着重新出图。点封面能看大图、右键保存。
4. **生成记录**：笔记发布一周左右回填链接和数据。收藏超过 100 的，被借鉴的积木自动 +1 分，以后会被优先选用。

**库的冷启动**：前两周每天入库 5–10 篇，先攒到 50 篇以上，生成效果才会明显变好。

---

## 三、怎么调效果

| 想改什么 | 改哪个文件 |
|---|---|
| 拆解拆得不准，或者想多拆几个维度 | `src/lib/prompts.ts` 里的 `DECOMPOSE_SYSTEM` |
| 生成的文案风格、长度、禁用词 | `src/lib/prompts.ts` 里的 `GENERATE_SYSTEM` |
| 每次喂给模型多少条积木 | `src/lib/retrieve.ts` 里的 `QUOTA` |
| 封面模板的样式、或者新增模板 | `src/app/api/cover/route.tsx` |
| 考试类别列表 | `src/lib/types.ts` 里的 `CATEGORIES` |

**槽位**：拆解时会把具体信息换成占位符，比如 `{考试}` `{单位}` `{年份}` `{数字}` `{地区}` `{岗位}` `{科目}`，这样一条模板就能套到别的考试上。

---

## 四、文件结构

```
supabase/schema.sql          数据库结构
fonts/                       封面用的中文字体（思源黑体 GB2312 常用字子集，SIL OFL 开源协议）
src/proxy.ts                 内部密码保护
src/lib/prompts.ts           ★ 拆解 / 生成提示词
src/lib/retrieve.ts          积木检索
src/lib/ai.ts                大模型调用（OpenAI 兼容格式）
src/app/api/decompose        拆解接口
src/app/api/notes            入库接口
src/app/api/generate         生成接口
src/app/api/cover            封面出图接口
src/app/{ingest,library,generate,exams,history}   五个页面
```

---

## 五、后续可以加的

- **自动采集**：在本地电脑用 xiaohongshu-mcp 抓笔记，然后调用 `/api/decompose` 和 `/api/notes`，就不用手动粘贴了。xiaohongshu-mcp 要用登录过的浏览器，所以只能在本地跑，放不到 Vercel 上。
- **向量检索**：库超过几百条后，用 Supabase 的 pgvector 按语义相似度找积木，代替现在「按类别 + 打分」的检索方式。
- **多账号人设**：给笔记和生成都加一个账号字段，不同账号用不同的积木池。
- **更多封面模板**：参考库里数据最好的封面版式，照着做新模板。
