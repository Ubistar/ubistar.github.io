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

首次读或推送时会自动把旧 `monitor_snapshots` 的完整历史迁入 `monitor_days`，然后将快照压缩为七条近期记录。历史入库与紧凑快照写入属于同一 D1 batch 事务，任一步失败则一起回滚。没有删除历史记录的语句；旧日期缺席新快照也会继续保留，较早的推送不会覆盖较新的结果。

Ubuntu 的现有推送脚本、定时器、密钥和本地监测数据库无需修改。Ubuntu → Cloudflare 仍按原协议推送完整快照，以保持现有服务器兼容；浏览器 → Cloudflare 已按需分页。后续若优化服务器上传量，可另行扩展增量推送协议。

概览和历史使用 15 秒公共缓存。源监测时间和接收时间都会用于三分钟过期判断；前端也检查时间，避免缓存或线路失败时持续外推。新前端使用独立 `/v1/overview` 路径，部署不同步时显示重试提示，不回退下载旧完整台账。

本次升级只需 GitHub 和 Cloudflare 的现有自动部署成功，不需要重新配置 D1 绑定或手动执行迁移。

实现依据：[D1 batch 事务](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)、[D1 JSON 查询](https://developers.cloudflare.com/d1/sql-api/query-json/)。
