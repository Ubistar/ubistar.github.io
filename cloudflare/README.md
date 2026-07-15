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
