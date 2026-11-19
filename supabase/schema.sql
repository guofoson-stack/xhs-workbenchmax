-- 小红书爆款工作台 · 数据库结构
-- 在 Supabase 控制台 → SQL Editor 里整段运行一次即可

-- 1. 考情表：生成内容时，考试相关的事实只从这里取，不让 AI 编
create table if not exists exams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,          -- 例：中国地震局事业单位招聘
  short_name text,                    -- 例：地震局
  category text not null,             -- 例：事业单位 / 国企 / 银行 / 公务员 / 教师
  subjects text,                      -- 笔试科目
  exam_time text,                     -- 考试时间（文字描述即可）
  features text,                      -- 考情特点、常考内容、坑点
  product text,                       -- 我们对应卖的资料
  updated_at timestamptz default now()
);

-- 2. 原始笔记表：从小红书收集的爆款
create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  url text unique,
  title text not null,
  body text,
  cover_text text,                    -- 封面上的文字（AI 识别 + 人工确认）
  cover_path text,                    -- 封面图在 Storage 里的路径
  likes int default 0,
  collects int default 0,
  comments int default 0,
  exam_name text,                     -- 原笔记讲的是哪个考试
  exam_category text,                 -- 事业单位 / 国企 / 银行 ...
  account_type text,                  -- 账号人设：学姐 / 机构 / 上岸经验 ...
  summary text,                       -- AI 总结的爆款原因
  published_at date,
  created_at timestamptz default now()
);

-- 3. 积木表：拆出来的元素，整个工作台的核心
create table if not exists elements (
  id uuid primary key default gen_random_uuid(),
  note_id uuid references notes(id) on delete cascade,
  type text not null check (type in ('title','cover','structure','hook','cta','tags')),
  template text not null,             -- 带槽位的模板，如「{考试}上岸的人都在背这{数字}页」
  pattern text,                       -- 公式类型，如 数字型 / 身份型 / 反差型 / 避坑型
  detail jsonb default '{}'::jsonb,   -- 其他细节：封面版式配色、正文段落作用等
  rating int default 3 check (rating between 1 and 5),  -- 人工打分
  use_count int default 0,
  created_at timestamptz default now()
);
create index if not exists elements_type_idx on elements(type);
create index if not exists elements_note_idx on elements(note_id);

-- 4. 生成记录：每次生成的版本，以及发布后的数据回流
create table if not exists generations (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid references exams(id) on delete set null,
  exam_input text not null,
  versions jsonb not null,            -- 生成的多个版本
  chosen int,                         -- 最终选用第几版
  post_url text,                      -- 发布后的链接
  likes int,
  collects int,
  comments int,
  created_at timestamptz default now()
);

-- 方便检索：积木 + 来源笔记的数据
create or replace view element_view as
select e.*,
       n.title as note_title,
       n.url as note_url,
       n.exam_category,
       n.exam_name,
       n.account_type,
       coalesce(n.likes,0) + coalesce(n.collects,0) + 2*coalesce(n.comments,0) as heat
from elements e join notes n on n.id = e.note_id;

-- 封面图存储桶（私有）
insert into storage.buckets (id, name, public)
values ('covers', 'covers', false)
on conflict (id) do nothing;

-- 内部工具：只通过服务端 service_role key 访问，开启 RLS 且不开放任何匿名策略
alter table exams enable row level security;
alter table notes enable row level security;
alter table elements enable row level security;
alter table generations enable row level security;
