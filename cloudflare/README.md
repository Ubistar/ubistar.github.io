# Cloudflare 数据桥

本目录由 Cloudflare Pages 从 GitHub 自动部署。GitHub Pages 负责前端；Cloudflare Pages Functions + D1 接收并保存 Ubuntu 主动推送的真实监测快照。

## Cloudflare Pages 构建设置

在 Cloudflare 控制台连接 GitHub 仓库 `Ubistar/ubistar.github.io`：

```text
Project name: liwai-monitor-bridge
Production branch: main
Framework preset: None
Root directory: cloudflare
Build command: 留空
Build output directory: public
```

部署完成后，在项目 Settings 中配置：

1. Bindings → Add → D1 database。
2. Variable name 填 `DB`，选择数据库 `liwai-monitor-bridge-db`。
3. Variables and Secrets → Production，添加加密 Secret `INGEST_TOKEN`。
4. 触发一次新部署，使生产环境取得绑定和 Secret。

## 自定义域名

先在 Pages 项目 Custom domains 添加 `api.flyou.cc`，然后在阿里云 DNS：

1. 删除 `api.flyou.cc` 指向 `47.107.148.189` 的旧 A 记录。
2. 新增 CNAME：主机记录 `api`，记录值使用 Cloudflare 项目页面显示的 `liwai-monitor-bridge.pages.dev` 域名。

不要同时保留同名 A 和 CNAME。

## API

- `POST /v1/ingest`：Ubuntu 写入，必须携带 `Authorization: Bearer <INGEST_TOKEN>`。
- `GET /v1/dashboard`：前端公开只读接口。
- `GET /api/dashboard`：兼容只读接口。
- `GET /health`：数据桥健康状态。

D1 表会在第一次成功推送时自动创建，不需要手动执行 `schema.sql`。

## Ubuntu 推送

Ubuntu 每分钟读取本机：

```text
http://127.0.0.1:9999/v1/dashboard
```

并主动推送到：

```text
https://api.flyou.cc/v1/ingest
```

写入密钥只保存在 Cloudflare Secret 与 Ubuntu 的 `/etc/liwai-cloudflare-push.env`，不得写入 GitHub。

## 2026-09 界面与历史查询升级

新增接口：

- `GET /v1/overview`：紧凑概览，包含今日、本周和最多七条历史，`historyTotal` 为归档总数。
- `GET /v1/history?page=1&limit=10&from=2026-07-01&to=2026-07-31`：日期倒序、闭区间筛选。`from` 和 `to` 可省略；`limit` 只接受 10、20、50。
- 原 `/v1/dashboard` 与 `/api/dashboard` 保留，但均返回紧凑概览。需要完整历史的调用方应逐页读取 `/v1/history`。

返回历史页结构：`{ items, total, page, limit, pages, stale, snapshotSavedAt }`。日期列的主键索引用于范围过滤与排序；查询使用 SQL 参数绑定和 `LIMIT/OFFSET`。分页与计数在同一事务完成。

首次读或推送时会自动把旧 `monitor_snapshots` 当时包含的历史迁入 `monitor_days`，然后将快照压缩为七条近期记录。原始 Ubuntu 安装版只输出最近 31 天，旧数据桥仅保存最新快照，因此自动迁移不能找回此前已经离开窗口的日期；它们需要从 Ubuntu 原始场次补传。历史入库与紧凑快照写入属于同一 D1 batch 事务，任一步失败则一起回滚。旧日期缺席新快照也会继续保留，较早的推送不会覆盖较新的结果；常规新快照仍可更新其包含的日期，归档不是版本备份。

Ubuntu 的现有推送脚本、定时器、密钥和本地监测数据库无需修改。Ubuntu → Cloudflare 仍按原协议推送本机仪表盘快照（原版包含最近 31 天），以保持现有服务器兼容；浏览器 → Cloudflare 已按需分页。

概览和历史使用 15 秒公共缓存。源监测时间和接收时间都会用于三分钟过期判断；前端也检查时间，避免缓存或线路失败时持续外推。新前端使用独立 `/v1/overview` 路径，部署不同步时显示重试提示，不回退下载旧完整台账。

本次升级只需 GitHub 和 Cloudflare 的现有自动部署成功，不需要重新配置 D1 绑定或手动执行迁移。

实现依据：[D1 batch 事务](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)、[D1 JSON 查询](https://developers.cloudflare.com/d1/sql-api/query-json/)。

## 从 Ubuntu 补回窗口以外的历史

`public/deploy/backfill-history.py` 是一次性工具，使用 Python 标准库及服务器已有的 `/usr/bin/curl`。默认只读检查，`--apply` 才向现有数据桥补传。SQLite 使用只读连接，不更改监测源码、定时器、数据库或其他服务，也不创建新服务。工具从原有环境文件读取推送配置，不打印密钥，不执行配置文件中的 shell 表达式，不跟随携带密钥的 HTTP 重定向。上传凭据及请求体通过 curl 标准输入传递，不放入进程命令行；使用正常证书校验及 HTTPS。

版本 `2026-09-12.2` 的云端上传改用与定时推送一致的 curl 客户端，失败时输出状态码、Content-Type、Server、CF-Ray、CF-Mitigated 和简短响应说明，隐藏凭据。接口代码不返回 403，403 的实际来源需结合这些诊断或 Cloudflare 请求日志判断，不能仅凭状态码认定为密钥错误或某条安全规则。工具不会自动切换域名、重试验证挑战或更改安全设置。

Cloudflare 部署完成后，在 Ubuntu 执行：

```sh
curl -fsSL --max-time 30 https://api.flyou.cc/deploy/backfill-history.py -o /tmp/liwai-backfill-history.py &&
python3 /tmp/liwai-backfill-history.py --apply
```

工具按北京时间把 SQLite 中的直播场次拆到各天，合并重叠区间，只提交最后核验日之前的已结束日期。未闭合的旧场次影响到的日期会跳过并输出；当天仍由正常监测处理。无原始场次的时长无法重建，不会凭空补成曾经开播。

新接口 `POST /v1/backfill` 沿用 `INGEST_TOKEN`，每批最多 100 个日期，只执行 `ON CONFLICT(date) DO NOTHING`。已有日期（包括已有零值）保持原值。入库及归档计数同一事务完成，不更新当前监测状态或新鲜度时间；返回 `inserted`（新增日期数）、`present`（本批已在库日期数）和 `historyTotal`，可安全重复执行。后续的常规 31 天快照不会删除补回的旧日期。

补传记录标明“历史重算”。未开播时长沿用原版口径：监测起始日之后的日历时长减去已记录直播时长。场次表没有完整的在线覆盖日志，无法从中证明空白期间一直监测正常，也不能确定当时确实未开播。若现有零值本身有误，需核查原始场次或备份，不能由本工具覆盖猜测。

补传逻辑验证：

```sh
node --test tests/archive.test.mjs
python3 -m unittest discover -s tests -p 'test_backfill.py' -v
```
