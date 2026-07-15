# 蠡歪煮啵偷懒旷工监测站

GitHub Pages 静态前端。直播状态与统计数据来自 Cloudflare 数据桥，监测任务由 Ubuntu 服务器独立运行。

- 网站：<https://ubistar.github.io>
- 直播间：<https://live.bilibili.com/1863473244>
- API：`https://api.flyou.cc/v1/dashboard`

前端不包含任何写入密钥。服务器使用受保护的写入端点同步数据，浏览器只访问公开只读接口。
