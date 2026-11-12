# 宝塔面板部署指南（保留完整联机）

本项目是 **一个 Node 进程同时提供网页和联机 WebSocket**，不需要单独部署前端和后端两个服务。

最终结构：

```text
浏览器 / 好友浏览器
        │  HTTPS + WSS
        ▼
宝塔 Nginx（域名、SSL、反向代理）
        │  http://127.0.0.1:3000
        ▼
Node / PM2（server.mjs）
  ├─ dist/ 网页
  └─ /ws 联机房间
```

> 关键点：Nginx 必须把 `/ws` 按 WebSocket 转发，否则页面能打开，但联机会一直显示“正在连接”。

---

## 0. 准备

- 一台有公网 IP 的服务器，已安装宝塔面板
- 一个域名，解析到服务器（例如 `game.example.com`）
- 宝塔「软件商店」安装 **Nginx**
- 宝塔「Node.js 版本管理器」安装 **Node 20 LTS**，并把命令行版本切到 20
- 安全组 / 宝塔防火墙放行 **80、443**
- **不要**对公网开放 3000；Node 只在 127.0.0.1 上给 Nginx 用

检查 Node：

```bash
node -v
npm -v
```

建议 Node 20；Node 18 也可以，但不建议更低。

---

## 1. 上传项目并构建

把项目上传到：

```text
/www/wwwroot/dandantang
```

不要上传 Windows 的 `node_modules`。可以在宝塔文件管理里上传 ZIP 后解压，或者用 Git。

SSH 进入服务器：

```bash
cd /www/wwwroot/dandantang

# 国内服务器建议先换 npm 镜像
npm config set registry https://registry.npmmirror.com

# 安装依赖（包括构建需要的 vite / typescript）
npm ci --include=dev

# 构建前端到 dist/
npm run build

# 构建完成后移除 devDependencies，只留下 ws 等运行依赖
npm prune --omit=dev
```

确认构建产物存在：

```bash
ls -lh dist/index.html
```

> 如果 `npm ci` 失败，确认当前 Node 是 20，或改用 `npm install` 后重新执行 `npm run build`。

---

## 2. 用 PM2 启动 Node 服务

项目根目录已经带好 [ecosystem.config.cjs](ecosystem.config.cjs)，其中固定了：

- `PORT=3000`
- `HOST=127.0.0.1`
- `instances=1`
- `args=--prod`

启动：

```bash
cd /www/wwwroot/dandantang
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 status
```

让 PM2 开机自启（执行它输出的那行命令）：

```bash
pm2 startup
# 按提示复制并执行输出的 sudo ... 命令
pm2 save
```

检查本地服务：

```bash
curl http://127.0.0.1:3000/healthz
# 应输出：ok

curl -I http://127.0.0.1:3000/
# 应返回 200
```

检查端口绑定（应该是 127.0.0.1，而不是 0.0.0.0）：

```bash
ss -lntp | grep 3000
```

查看日志：

```bash
pm2 logs dandantang --lines 100
```

> **不要用多个实例**。房间数据保存在 Node 进程内存里，`pm2 start ... -i 2` 或 cluster 模式会让不同玩家进入不同房间表。

---

## 3. 在宝塔创建网站

1. 「网站」→「添加站点」
2. 域名填 `game.example.com`
3. 选择「纯静态」，不需要 PHP / 数据库
4. 创建完成后进入站点设置

### 3.1 申请 SSL

「SSL」→「Let's Encrypt」→ 申请证书 → 开启「强制 HTTPS」。

HTTPS 后浏览器会自动把联机地址切到 `wss://game.example.com/ws`，不需要改代码。

### 3.2 配置反向代理

推荐用宝塔的「反向代理」先生成基础配置：

- 名称：`dandantang`
- 目标 URL：`http://127.0.0.1:3000`
- 发送域名：`$host`

然后进入「配置文件」，确认 `/ws` 的 WebSocket 转发。完整片段见 [deploy/nginx-ws.conf](deploy/nginx-ws.conf)。

**如果已经有 `location /`，不要再复制第二个 `location /`**，只添加 `/ws`：

```nginx
location /ws {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;

    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
    proxy_buffering off;
}
```

如果没有使用宝塔的反向代理，需要同时添加 `/ws` 和 `/` 两段，直接参考 [deploy/nginx-ws.conf](deploy/nginx-ws.conf)。

注意：

- 如果宝塔模板里有 `proxy_set_header Connection "";`，在 `/ws` 里要改成 `Connection "upgrade";`
- `proxy_pass http://127.0.0.1:3000;` 后面**不要加斜杠**
- 修改后检查并重载 Nginx：

```bash
nginx -t
nginx -s reload
```

---

## 4. 验证联机

打开：

```text
https://game.example.com
```

进入「联机对战」，状态应显示：

```text
已连接。创建房间，或输入好友的房间码。
```

然后：

1. 电脑 A 创建房间，得到 4 位房间码
2. 电脑 B（或手机）在同一域名下输入房间码加入
3. 房主点「开始对战」
4. 双方各开一炮，确认血量、地形、风向、回合能同步

建议两台设备都使用同一个域名访问，不要一台用 `localhost`、另一台用公网 IP。

### 可选检查

```bash
curl -I https://game.example.com
curl https://game.example.com/healthz
```

健康检查返回 `ok` 说明 Node 正常；如果返回 HTML 或 404，通常是 Node 没更新/没重启。

---

## 5. 更新版本

以后更新代码：

```bash
cd /www/wwwroot/dandantang

# 上传/拉取新代码后
npm ci --include=dev
npm run build
npm prune --omit=dev
pm2 restart dandantang --update-env
```

如果只改了 `server.mjs`，可以只执行 `pm2 restart dandantang`；但改过前端就必须重新 `npm run build`。

---

## 6. 常见问题

| 现象 | 原因 / 处理 |
| --- | --- |
| 502 Bad Gateway | Node 没启动、端口不对。`pm2 status`、`pm2 logs dandantang`、`curl 127.0.0.1:3000/healthz` |
| 页面能开，联机一直“正在连接” | `/ws` 没有 WebSocket 转发；检查 `Upgrade` / `Connection` 头和 Nginx 配置 |
| 控制台 WebSocket 404 | Nginx 的 `location /ws` 路径写错，或 `proxy_pass` 多了尾部 `/` |
| 联机提示“没有找到这个房间” | 双方不在同一个 Node 服务/域名；确认访问的是同一站点 |
| 开局后房间突然消失 | Node 被重启；当前房间只保存在内存，重启会清空 |
| 两台 PM2 实例互相看不到房间 | 必须 `instances: 1`，不要用 cluster |
| 页面资源 404 | 站点必须部署在域名根目录 `/`，不能放子目录；当前 Vite 资源按根路径构建 |
| 刷新后连接失败 | 检查 SSL 是否正常；HTTPS 页面必须用 `wss`，本项目会自动处理 |
| Cloudflare 下联机失败 | 开启 Cloudflare 的 WebSocket；SSL 模式建议 Full (strict) |
| 3000 端口能从外网访问 | 项目默认 `HOST=127.0.0.1`；检查 PM2 是否加载了新配置，并关闭安全组 3000 |
| `Cannot find package 'ws'` | 重新 `npm ci --include=dev && npm run build && npm prune --omit=dev` |

---

## 7. 说明

- 当前联机是 **单实例内存房间**，没有数据库。适合个人/朋友小规模使用。
- 服务器重启、PM2 重启、发布新版本都会清空正在进行的房间和对局。
- 如果要部署多台机器或做大规模匹配，需要把房间状态移到 Redis，并处理跨实例广播；当前版本没有实现。
- 如果只是自己单机玩，不需要公网服务器；本机运行即可。
- 宝塔的「Node 项目」功能也能启动本项目，但它的反向代理模板不一定带 WebSocket 头。用「PM2 + 网站反向代理」最可控。
