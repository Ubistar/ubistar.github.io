# 蠡歪监测站 Cloudflare 免费数据桥

GitHub Pages 负责前端；Cloudflare Pages Functions + D1 接收并保存 Ubuntu 主动推送的真实监测快照。浏览器只读取公开接口，写入密钥仅保存在 Cloudflare 和 Ubuntu。

## 1. 在电脑上部署 Cloudflare

安装 Node.js 20 或更新版本，解压后在本目录运行：

```bash
npm install
npx wrangler login
npx wrangler pages project create liwai-monitor-bridge
npx wrangler d1 create liwai-monitor-bridge-db
npm run deploy
```

在 Cloudflare 控制台进入 Workers & Pages → `liwai-monitor-bridge`：

1. Settings → Bindings → Add → D1 database。
2. Variable name 填 `DB`，数据库选择 `liwai-monitor-bridge-db`。
3. Settings → Variables and Secrets，添加加密 Secret `INGEST_TOKEN`。
4. 再运行一次 `npm run deploy`，使绑定进入新部署。

## 2. 将 api.flyou.cc 切换到 Cloudflare

先在 Pages 项目 Custom domains 添加 `api.flyou.cc`。然后在阿里云 DNS：

1. 删除 `api.flyou.cc` 指向 `47.107.148.189` 的旧 A 记录。
2. 新增 CNAME：主机记录 `api`，记录值 `liwai-monitor-bridge.pages.dev`。

不要同时保留同名 A 和 CNAME。无需迁移 `flyou.cc` 的 DNS 服务商。

## 3. 配置 Ubuntu 主动推送

把本压缩包上传到服务器 `/tmp/liwai-cloudflare-bridge.zip`，执行：

```bash
mkdir -p /tmp/liwai-cloudflare-bridge
unzip -o /tmp/liwai-cloudflare-bridge.zip -d /tmp/liwai-cloudflare-bridge
install -m 755 /tmp/liwai-cloudflare-bridge/deploy/push-snapshot.sh /usr/local/bin/liwai-cloudflare-push
install -m 644 /tmp/liwai-cloudflare-bridge/deploy/liwai-cloudflare-push.service /etc/systemd/system/
install -m 644 /tmp/liwai-cloudflare-bridge/deploy/liwai-cloudflare-push.timer /etc/systemd/system/
```

创建 `/etc/liwai-cloudflare-push.env`：

```text
CLOUDFLARE_INGEST_URL=https://api.flyou.cc
CLOUDFLARE_INGEST_TOKEN=与Cloudflare中完全相同的密钥
```

权限和启动：

```bash
chmod 600 /etc/liwai-cloudflare-push.env
systemctl daemon-reload
systemctl enable --now liwai-cloudflare-push.timer
systemctl start liwai-cloudflare-push.service
journalctl -u liwai-cloudflare-push.service -n 20 --no-pager
```

## 4. 验证

```bash
curl -sS https://api.flyou.cc/health | python3 -m json.tool
curl -sS https://api.flyou.cc/v1/dashboard | python3 -m json.tool | head -30
```

## 5. 验证成功后清理旧公网路线

保留监测程序和数据库，只把 Uvicorn 攂为本机监听：

```bash
mkdir -p /etc/systemd/system/liwai-monitor.service.d
systemctl edit liwai-monitor.service
```

编辑器中加入：

```ini
[Service]
ExecStart=
ExecStart=/opt/liwai-monitor/venv/bin/uvicorn app:app --host 127.0.0.1 --port 9999 --workers 1
```

然后：

```bash
systemctl daemon-reload
systemctl restart liwai-monitor.service
curl -sS http://127.0.0.1:9999/health
systemctl disable --now caddy
apt purge -y caddy
rm -rf /etc/caddy /var/lib/caddy /var/log/caddy
```

最后在阿里云安全组删除 TCP 80、443、9999 的入方向规则。不要操作 Yunzai、PM2、screen 或 SSH 端口。
