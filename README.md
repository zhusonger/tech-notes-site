# Tech Notes · 个人技术主页

![License](https://img.shields.io/badge/license-MIT-green) ![Node](https://img.shields.io/badge/node-%E2%89%A5%2026-blue) ![React](https://img.shields.io/badge/React-18.3-61dafb) ![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6) ![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v4-38bdf8)

暖米白 + 橙色的个人技术主页，前台 5 个页面（首页、博客列表、博客详情、项目、简历），
外加一套 `/admin` 内容管理后台。前端工程按一份界面设计稿实现，采用响应式重排。

前台本身是纯静态产物；后台需要服务端（httpOnly 会话、SQLite、TOTP）。因此整站由
**同一个 Express 进程**同时提供 API 与静态文件 —— 同源才不必处理跨站凭证与 CORS。

## 预览

**前台**

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/home.jpg" alt="首页"></td>
    <td width="50%"><img src="docs/screenshots/blog.jpg" alt="博客列表"></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/article.jpg" alt="文章详情"></td>
    <td><img src="docs/screenshots/projects.jpg" alt="项目"></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/resume.jpg" alt="简历"></td>
    <td><img src="docs/screenshots/admin-login.jpg" alt="后台登录"></td>
  </tr>
</table>

**后台**

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/admin-dashboard.jpg" alt="仪表盘"></td>
    <td width="50%"><img src="docs/screenshots/admin-posts.jpg" alt="文章列表"></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/admin-post-editor.jpg" alt="文章编辑器"></td>
    <td><img src="docs/screenshots/admin-projects.jpg" alt="项目管理"></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/admin-home.jpg" alt="首页内容编辑"></td>
    <td><img src="docs/screenshots/admin-resume.jpg" alt="简历编辑"></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/admin-media.jpg" alt="媒体库"></td>
    <td><img src="docs/screenshots/admin-taxonomy.jpg" alt="分类与标签"></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/admin-visitors.jpg" alt="访客记录"></td>
    <td><img src="docs/screenshots/admin-audit.jpg" alt="操作日志"></td>
  </tr>
  <tr>
    <td colspan="2"><img src="docs/screenshots/admin-settings.jpg" alt="站点设置"></td>
  </tr>
</table>

## 特性

- **前台 5 页 + 后台 14 屏**：仪表盘、文章列表与编辑器、项目卡片墙、首页内容、简历编辑、
  媒体库、分类与标签、访客记录、操作日志、站点设置、账号设置与安全、TOTP 两步验证。
- **内容只有一个来源**：后台数据库。种子内容与前台兜底同源（`shared/content.mjs`），
  接口挂掉时前台照常渲染并明示降级，不会白屏也不会展示过期内容。
- **安全默认值**：helmet、CSRF 同源校验、登录限流、TOTP 两步验证与恢复码、
  白名单式审计日志；正文渲染走 React 节点，不拼 HTML 字符串，注入面为零。
- **访客统计不送数据**：归属地用离线库解析（不出网、不调第三方），明文明细仅登录可见、
  30 天自动清理，匿名趋势只存哈希。
- **零外部服务依赖**：Node 26 原生 `node:sqlite`，无 ORM、无对象存储、无第三方数据库，
  一个容器（或一个进程）即可完整运行。

## 部署方式

| 方式 | 适合场景 | 命令 |
| --- | --- | --- |
| **Docker（推荐）** | VPS / NAS，长期运行 | `docker build -t tech-notes-site .` → 见[容器化部署](#容器化部署) |
| **Node 直跑** | 已装 Node ≥ 26 的机器 | `npm ci && npm run build && npm start` |
| **静态预览** | 只看前台、不起后台 | `npm run serve`（零依赖，无 `/api`） |

三种方式的详细展开见下方[容器化部署](#容器化部署)、[本机快速预览（不建容器）](#本机快速预览不建容器)两节。

### 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` | `18007` | 监听端口 |
| `HOST` | 仅本机可访问的绑定地址 | 对外服务时改为 `0.0.0.0` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | 未提供则随机生成（只打印一次） | 首次启动创建管理员 |
| `DB_PATH` | `data/tech-notes.db` | SQLite 库路径，指向持久目录 |
| `UPLOAD_DIR` | `data/uploads` | 媒体上传目录，随 `/uploads/*` 托管 |
| `APP_SECRET` / `APP_SECRET_FILE` | 自动生成 `data/.app-secret` | 2FA 主密钥，丢了已绑定的两步验证解不开 |
| `TRUST_PROXY` | `1` | 反向代理层数，设错会把所有访客 IP 记成代理地址 |
| `IP2REGION_XDB` | 自动按需获取 | 离线地区库路径（约 11 MB，可 `npm run fetch:geo` 预热） |

### 数据持久化

首次启动会在项目根创建 `data/`（SQLite 库、2FA 主密钥、媒体上传）。**换一次目录就换一份数据**，
部署时务必把它挂载/固定到持久卷；它已被 `.gitignore` 按 `/data/` 排除，绝不入库。

## 技术栈

前台：React 18.3 · TypeScript（strict）· Vite 5 · Tailwind CSS v4 · react-router-dom 6

后台：Express 5 · `node:sqlite`（Node 26 原生，无 ORM）· otplib（TOTP）· qrcode · helmet · express-rate-limit

## 数据归属

**内容只有一个来源：后台数据库。** 前台不再维护自己那份 `src/data/site.ts` 内容副本。

```
SQLite（后台写入）
  └─ server/content.mjs  readContentDoc()  ──┐
                                             ├─→ shared/derive.mjs  presentContent()
shared/content.mjs（种子 / 前台兜底）─────────┘        │
                                                    ├─→ GET /api/content   → 前台页面
                                                    └─→ DEFAULT_CONTENT    → 接口不可用时兜底
```

三条约束，缺一条就会出现「后台改了、前台没变」或「断网时页面变样」：

1. **`shared/content.mjs` 是唯一的内容源**：服务端首次启动用它灌库（`db.mjs` 的
   `seedIfEmpty`），前台也用它生成兜底内容。种子与兜底同源，结构上不可能分叉。
   这个一致性由 `api-smoke` 的「库内容与前台兜底内容结构一致」断言守着。
2. **展示串只在 `shared/derive.mjs` 生成一次**：`1.8k 阅读`、`2026.08.24`、`约 5 分钟`
   这类字符串由 `presentContent()` 统一产出，服务端与前台调用同一个函数。分成两处写，
   就一定有对不上的那天，而且只在断网时才暴露。
3. **正文渲染走 React 节点，不拼 HTML 字符串**（`src/lib/markdown.tsx`）：正文由作者自由撰写，
   渲染路径一旦变成 `dangerouslySetInnerHTML` 就是一个存储型 XSS。不做转义白名单，
   而是从结构上不给它出现的机会 —— `check:routes` 里有一条注入断言锁着这件事。

对外接口（匿名可读，无需会话）：

| 接口 | 说明 |
| --- | --- |
| `GET /api/content` | 整站内容：`site` / `home` / `resume` / `projects` / `posts` / `filters` / `stats` |
| `GET /api/content/posts/:slug` | 单篇详情：正文、目录、上下篇、相关文章、作者卡 |

两个接口都只返回 `published` 的文章 —— 草稿与回收站里的内容**不会**离开服务端。
响应带 `Cache-Control: no-store`，所以后台一保存，前台刷新即变。

前台侧的配合：`src/data/SiteContent.tsx` 在挂载时取 `/api/content`，失败则回落到
`shared/content.mjs` 的兜底内容，并在页面顶部挂一条「内容服务暂时不可用」的提示 ——
宁可明说降级，也不让人对着一份过期内容做判断。

### 访客明细与隐私边界

后台的「访客记录」是本站**唯一**落明文的地方，值得单独说明：

```
访客请求（页面外壳）
  ├─ page_views   visitor = hash(ip|UA|日)   → 仪表盘的长期趋势，永不落明文
  └─ visitor_logs ip + UA + 路径 + 时间       → 后台「访客记录」屏（IP / 地区 / 设备）
```

两条链路同一时刻写入、互不依赖，删掉明文那条**不影响**匿名统计的历史（这是刻意的：
匿名趋势的价值在长期，明文明细的价值在近期排查，保留期本来就不同）。

| 项 | 口径 |
| --- | --- |
| 写入范围 | 只写页面外壳请求，且**排除 `/admin/*`** —— 否则天天泡在后台的管理员会变成最活跃的访客 |
| 保留期 | 30 天（`VISITOR_RETENTION_DAYS`），独立的清理定时器，与审计日志的保留期互不影响 |
| 可见范围 | 仅在登录态下可读（`/api/admin/visitors` 未登录返回 401）；**公开内容接口一律不含它** |
| 地区解析 | 离线库 ip2region（`server/geo.mjs`）—— **解析过程不出网**：拿访客 IP 去调第三方 API，等于把访客的 IP 送给那个第三方。（库文件本身首次会联网获取一次，但那不涉及任何访客数据） |
| 设备解析 | `server/ua.mjs`，只做「浏览器 / 系统 / 设备类型」的粗归类，不落指纹 |
| 降级 | 地区库缺失时地区一列留空，**不阻塞请求，界面也不额外弹提示**（库几秒后自己到位） |

地区库本身约 11 MB，**既不进版本库也不进镜像** —— 它是一份可重新获取的公开数据。
改为按需获取：首次有人打开访客列表时，服务端在后台拉一次（不阻塞当次请求），
落到持久化目录，下次访问即可看到。想预热也可以手工 `npm run fetch:geo`。

## 本地开发

```bash
npm install
npm run fetch:geo    # 可选：预热离线地区库到 data/（约 11 MB；不跑也行，首次看访客页会自动拉）
npm run dev          # 前台 http://localhost:5173，热更新（只有前端，无 API）
npm start            # 完整应用（API + 静态产物）→ http://127.0.0.1:18007/admin
```

`npm run dev` 起的是 vite dev server，**不带后台 API**。前台页面本身不依赖 API，所以它照常可用；
要在开发态点后台，用 `npm start`（需先 `npm run build` 出 `dist/`）。

后台首次启动会创建管理员：给了 `ADMIN_EMAIL` / `ADMIN_PASSWORD` 就用它们；没给则随机生成
一个口令并**只打印这一次**（终端或 `docker logs` 里能看到），同时置 `must_change_password`。

### 首次启动产生的目录

后台跑起来会在项目根建 `data/`，里面是 SQLite 库（含 WAL）与 2FA 主密钥 `.app-secret`。
两者都不能进版本库 —— `.gitignore` 按 **`/data/`** 根锚定排除（写成 `data/` 会连带把
`src/data/` 一起忽略掉，这个坑踩过一次）。离线地区库（约 11 MB）也落在这里：
`data/ip2region_v4.xdb` —— 它同样不入库，那是可重新获取的公开数据，不是本站源码。

地区库的落点是**持久化目录**，与数据库放在一起。这不是随手选的：容器根文件系统是
`read_only`，`/app/data` 是那里唯一可写的挂载点，而且它跨容器重建保留 ——
「只需要拉一次」才成立。探测顺序 `IP2REGION_XDB` → 持久化目录 → `vendor/`
（最后一个是旧镜像的内置位置，仅为兼容保留）。

## 容器化部署

仓库自带 `Dockerfile`，镜像里跑的是 `server/index.mjs` —— 静态资源与后台 API 在同一个进程，
因此不需要额外的反向代理就能直接访问 `/admin`。

```bash
docker build -t tech-notes-site .

# 数据目录必须挂出来，原因见下
mkdir -p data
docker run -d --name tech-notes-site \
  --read-only \
  -p 127.0.0.1:18007:18007 \
  -v "$PWD/data:/app/data" \
  tech-notes-site
```

容器把宿主机的 `./data` **bind mount** 到 `/app/data`（SQLite 库 + 2FA 主密钥 + 媒体上传）。
这是**必须**的，两个原因：

- 容器根文件系统是 `read_only`，不挂载的话进程直接起不来；
- 就算起来了，每次重建都会换一份数据与一把新主密钥，已绑定的两步验证会全部解不开。

镜像里**不带**离线地区库（约 11 MB）：构建期不为它联网，运行期首次打开访客列表时
在后台拉一次，落到 `/app/data`。所以第一次打开那一页地区列是空的，刷新一下就有。
想省掉这一次等待，可以在宿主机先跑 `npm run fetch:geo` 预热 —— 它落 `./data`，
正好就是上面挂进容器的那个目录。

`/healthz` 是健康端点。接反向代理时注意 `TRUST_PROXY` 默认为 1（信任一层代理头），
设错会让所有访客 IP 都记成 `127.0.0.1`，地区解析与限流随之失准。

## 本机快速预览（不建容器）

不依赖 Docker，直接在本机把构建产物跑起来：

```bash
npm run deploy:local # 构建 + 起完整应用（含后台），http://127.0.0.1:18007
npm start            # 同上但跳过构建，直接跑已有的 dist/
```

只想看一眼前台、不愿意起后台进程时，还有个零依赖的纯静态服务：

```bash
npm run serve        # 零依赖静态服务 dist/，带 SPA 回退与 /healthz
PORT=9000 npm run serve          # 换端口
HOST=0.0.0.0 npm run serve       # 换绑定地址（默认只绑 127.0.0.1，仅本机可访问）
```

两者分工要说清楚：`scripts/serve.mjs` **只发静态文件，没有 `/api`**，所以从它的端口进去
点 `/admin` 是一个永远登不上的空壳；`server/index.mjs` 才是正式运行路径（静态文件 + 后台 API
同一个进程），容器里跑的也是它。

`scripts/serve.mjs` 的行为：深链接刷新回退到 `index.html`、带 hash 的 `/assets/*` 长缓存、
`index.html` 不缓存。缺失的静态资源仍如实返回 404，不会被伪装成 200。

### 可选：开机自启

不想走容器、想让它在开发机上常驻时，用系统自带的进程管理器托管 `npm start` 即可：
macOS 用 launchd（`~/Library/LaunchAgents/*.plist`），Linux 用 systemd。

两件事必须注意：进程的工作目录要设成项目根（否则读不到 `dist/` 与 `data/`），
`DB_PATH` 要指向一个持久目录 —— 否则换一次启动就换一份库，内容看起来像「丢了」。

日志落在 `logs/serve.log` 与 `logs/serve.err.log`。plist 里 node 路径写的是
`/opt/homebrew/bin/node`（Homebrew 装的 v26），换过 Node 就要改这一行。

注意这份 plist 起的是**纯静态**的 `scripts/serve.mjs`（8080），因此它只服务前台；
要在这台 Mac 上常驻带后台的版本，把 plist 里的
`scripts/serve.mjs` 换成 `server/index.mjs` 即可 —— 但别再和 `npm start` 用同一个端口。

## 校验

```bash
npm run typecheck    # tsc --noEmit
# 渲染校验：前台 7 条路由 + 后台 12 条路由，另加 13 个组件直渲断言（脚本结尾会打印总数）
npm run check:routes

# 地区解析断言需要离线库在位（缺库时会跳过那一条，不判失败）
npm run fetch:geo              # 加 --check 则只校验现有文件、不联网

# 后台 API 端到端冒烟（覆盖登录/2FA/内容/设置/日志/维护模式/公开内容接口/访客记录，条数以输出为准）
node scripts/api-smoke.mjs admin@test.local '口令' http://127.0.0.1:18007

# 「彻底删除文章」不可逆，默认跳过，需要时显式打开
SMOKE_ALLOW_DELETE=1 node scripts/api-smoke.mjs admin@test.local '口令' http://127.0.0.1:18007
```

本脚本会真的改数据（绑定 2FA、重置恢复码、改显示名、切换文章状态、建删一篇测试文章与
一个测试项目、打乱再还原项目顺序），**只应指向一次性实例**。

脚本开头那组内容是**匿名**请求（此时还没有任何会话 Cookie），因此它同时证明了
「前台不依赖登录态」和「草稿不外泄」；其中一条是端到端闭环判据 ——
后台把文章移入回收站后，再去读 `/api/content`，该文章必须**当场**不在列表里。
只断言后台自己的列表变了，是证明不了前台跟着变的。

`check:routes` 里 `/admin*` 那几条断言值得留意：SSR 下 `useEffect` 不执行，守卫会停在
「正在校验会话…」。这恰好是有意义的断言 —— 未登录时后台内容一个字都不该出现在首屏 HTML 里。

前台那几条断言跑的是**兜底内容**（校验环境里没有 `SiteContentProvider`，也没有网络），
所以它们锁的是「接口挂掉时前台仍然渲染得完整、不白屏」。库侧与兜底侧的一致性由
`api-smoke` 那条结构比对断言负责 —— 两边各测一半，合起来才是完整的。

代价是**走路由断言不到任何后台页面的正文**（守卫先短路了）。要验页面自身，用脚本里
`pages` 那组：绕开路由与守卫直接渲染组件（SSR 不跑 effect，因此不会发请求），
在其中断言页头文案与加载态骨架。此前「待开发」占位页那条自述清单，随占位页一起删除了 ——
后台 14 屏全部落地后，已不存在「未落地的入口」这一说。

## 目录

```
src/
  data/site.ts        前台**类型与兜底内容**（不再持有正文；内容源见 shared/content.mjs）
  data/SiteContent.tsx 内容上下文：取 /api/content，失败回落到兜底并标记降级
  data/admin.ts       后台文案与导航结构
  lib/markdown.tsx    Markdown → React 节点（不拼 HTML 字符串，注入面为零）
  components/         前台通用组件：Header Footer Layout Container SectionHeader PageHead Chip Button ArticleCard ProjectCard Icons
  pages/              前台页面：Home Blog Article Projects Resume
  admin/              后台：Layout / Auth 守卫 / API 客户端 / 通用原子 / pages/
  routes.tsx          路由表（前台挂在 Layout 下，后台挂在 RequireAdmin 下）
  index.css           设计令牌（:root 变量）+ 字体工具类
shared/               前后台共用（Node 与 Vite 都能直接 import）
  content.mjs         唯一内容源：种子内容 + 前台兜底内容
  sections.mjs        可编辑区块的**约束**规格：字段上限 / 必填 / 类型 / 联合计数 / 取值枚举 / 嵌套列表（校验与界面共用一份）
  media.mjs           媒体库的**上传策略**：白名单 / 体积上限 / 类型分组判定（界面提示与后端拒收共用一份）
  taxonomy.mjs        分类与标签的**名字规则与近重复判定**（名称上限 / 归一化 / 重复分组，界面提示与后端拒收共用一份）
  derive.mjs          纯函数呈现层：展示串、目录、上下篇、精选项目
  markdown.mjs        极简 Markdown 解析（块模型 + 行内），不产出 HTML
server/               后台服务端（Node 26 原生 ESM，无 ORM）
  index.mjs           进程入口：helmet / CSRF 同源校验 / 静态托管 + SPA 回退 / /uploads 媒体托管 / 维护模式 / 优雅退出
  content.mjs         公开内容接口 /api/content（匿名、no-store、只出已发布）
  api.mjs             /api/admin 路由：登录、2FA、账号、会话、仪表盘、文章读写、项目读写与排序、内容区块读写、媒体库读写、分类与标签读写、访客记录、操作日志、站点设置 + 三段限流
  sections.mjs        内容区块的读写：按规格递归校验、整份提交、逐字段比对后只记真实改动
  media.mjs           媒体库的读写：磁盘真值、引用扫描、上传落盘与类型白名单
  taxonomy.mjs        分类与标签的读写：分类改名连带文章、近重复分组与合并、顺序整份提交
  auth.mjs            口令哈希、TOTP 密钥加解密、恢复码、会话与登录票据、审计写入
  audit.mjs           操作日志的动作码目录（码 → 中文句式）与保留策略
  geo.mjs             离线地区查询（IPv4 xdb 自实现：向量索引定位分区 + 14 字节步长二分；解析不出网）
  geo-fetch.mjs       地区库的获取与校验（多镜像回退、结构自检）—— 命令行与运行期共用同一份
  ua.mjs              User-Agent 归类：浏览器 / 系统 / 设备类型（爬虫单独识别，不落指纹）
  settings.mjs        站点设置的声明式字段规格（读写校验只写一遍）与运行期只读事实
  maintenance.mjs     维护模式的自包含页面（构建期也能存活：不引外部资源）
  db.mjs              node:sqlite 数据层：16 张表、PRAGMA、隐私哈希的访问统计与明文的访客明细
scripts/
  serve.mjs           零依赖静态服务器（前台预览专用，不含 /api）
  api-smoke.mjs       后台 API 端到端冒烟 + 公开内容接口一致性断言
  ssr-check.tsx       路由与后台页面渲染校验
  fetch-geo.mjs       拉取离线地区库（幂等；--check 只校验不下载；实现见 server/geo-fetch.mjs）
Dockerfile            两段式：vite build + prune --omit=dev → 带 dist + server + shared + 运行期依赖的 runtime
public/images/        配图
```

## 已实现功能

**前台（5 页）**：首页（首屏 / 关于我 / 技术栈 / 精选项目 / 最新博客）、博客列表（分类筛选与搜索）、
文章详情（目录、上下篇、相关文章、作者卡）、项目、简历（五节结构）。响应式布局，内容取自
`/api/content`；接口不可用时回落兜底内容，并在页头明示降级。

**后台内容管理（14 屏）**：

| 屏 | 能做什么 |
| --- | --- |
| 仪表盘 | 内容概览与访问趋势 |
| 文章列表 | 筛选、批量发布 / 下架 / 移入回收站 / 还原 / 删除 |
| 文章编辑器 | Markdown 正文、封面、摘要、分类与标签、草稿与发布 |
| 项目 | 卡片墙、拖拽排序、上下架与精选、批量操作 |
| 首页内容 | 首屏 / 关于我 / 技术栈三个模块整份编辑 |
| 简历编辑 | 五节内容编辑，模块顺序与显隐独立控制 |
| 媒体库 | 上传、替代文本、按磁盘真值显示体积与尺寸、删除前扫描引用 |
| 分类与标签 | 分类改名连带文章与排序；标签近重复分组与合并 |
| 访客记录 | 按 IP 聚合的地区 / 设备 / 访问明细，时间筛选与分页 |
| 操作日志 | 白名单式动作目录（码 → 中文句式），只记真实改动 |
| 站点设置 | 品牌、页脚、社交链接、作者资料等声明式字段 |
| 账号设置 / 账号安全 | 改密、改邮箱、TOTP 两步验证与恢复码 |
| 两步验证 | TOTP 绑定与校验 |

**安全与隐私**：helmet 与 CSP、CSRF 同源校验、三段登录限流、httpOnly 会话、TOTP 与恢复码；
正文渲染成 React 节点而非 HTML 字符串（无 `dangerouslySetInnerHTML`）；
访客归属地用离线库解析、解析过程不出网，明文明细仅登录可见且 30 天清理，匿名趋势只存哈希
（详见「访客明细与隐私边界」）。

**运维**：单容器运行、`/healthz` 健康端点、优雅退出、维护模式页。

## 当前限制

- 媒体文件落本地目录，未接对象存储；多实例部署需换共享存储或 CDN 回源，否则各实例看到的媒体不一致。
- 媒体不做重命名、移动与缩略图：网格与详情面板用的是同一个文件，靠 `object-fit` 缩放。
- 后台产物未做路由级 `lazy()` 拆包，当前整块打进主包。
- 只做浅色主题，无暗色。
- 纯 SPA，`dist/index.html` 不含正文，未做预渲染 / SEO。
- 项目页区块标题仍写作「开源项目」，与首页 `/ Projects` 的口径不一致。
- 仓库内的文章、项目、简历与配图均为演示内容，需按自己的情况替换。

## 许可

代码以 [MIT 许可证](LICENSE) 发布。

仓库内的示例内容（文章正文、项目条目、简历示例、`public/images/` 下的配图）只用于演示。
替换成你自己的内容即可 —— 沿用与否随你，不构成任何担保。
