# Telegram 贴纸包下载机器人

这是一个 Telegram 机器人，可以帮助用户下载完整的贴纸包。用户只需发送一个贴纸给机器人，机器人就会下载整个贴纸包并以 ZIP 格式发送回来。

## 功能

- 下载完整的 Telegram 贴纸包
- 支持普通贴纸、动画贴纸和视频贴纸
- 将贴纸打包为 ZIP 文件发送给用户
- 提供文件服务器，当直接发送失败时可通过链接下载
- 多线程下载，提高下载速度
- 支持代理设置，解决网络访问问题
- 缓存功能，避免重复下载相同的贴纸包
- 统计功能，跟踪和展示下载数据

## 部署

推荐您使用 Docker 部署，这样就可以直接运行 `docker compose up -d` 来启动机器人。

```yml
services:
  tg-sticker-download:
    image: aicnal/tg-sticker-downloader:latest
    container_name: tg_sticker_download
    restart: unless-stopped
    ports:
      - "${FILE_SERVER_PORT:-3000}:3000"
    volumes:
      - ./downloads:/app/downloads
      - ./public:/app/public
    environment:
      - NODE_ENV=production
      - BOT_TOKEN=${BOT_TOKEN}
      - DOWNLOAD_PATH=/app/downloads
      - FILE_SERVER_PORT=3000
      # 如果需要代理，取消下面两行的注释并设置正确的代理地址
      # - http_proxy=${http_proxy}
      # - https_proxy=${https_proxy}
      # 如果有公共URL，取消下面一行的注释
      # - PUBLIC_URL=${PUBLIC_URL}
      # 缓存设置
      # - CACHE_MAX_AGE=${CACHE_MAX_AGE:-604800000}
      # - CACHE_DIR=/app/downloads/cache
```

创建 `.env` 文件，填入以下信息：

```
# Telegram Bot Token (从 @BotFather 获取)
BOT_TOKEN=7581719731:AAGWgc6oa6_-PGpD-BvqeUxocAAuge15AD0
```

之后启动：

```bash
docker compose up -d
```

## 安装

1. 克隆此仓库
```bash
git clone https://github.com/liueic/tg-sticker-downloader.git
cd tg-sticker-downloader
```

2. 安装依赖
```bash
npm install
```

3. 配置环境变量
```bash
cp .env.example .env
```
然后编辑 `.env` 文件，填入以下信息：
- `BOT_TOKEN`: 你的 Telegram 机器人 Token
- `DOWNLOAD_PATH`: 下载文件的临时存储路径（默认为 `./downloads`）
- `FILE_SERVER_PORT`: 文件服务器端口（默认为 `3000`）
- `PUBLIC_URL`: 如果你的服务器可以从互联网访问，设置此项为公共URL
- `http_proxy`/`https_proxy`: 如果需要使用代理，设置这些变量
- `CACHE_MAX_AGE`: 缓存最大保存时间（毫秒），默认为7天（604800000毫秒）
- `CACHE_DIR`: 缓存目录，默认为`DOWNLOAD_PATH/cache`
### 统计数据存储

统计数据会自动保存在 `config/statistics.json` 文件中，包含：
- 总下载数量
- 下载历史记录（最多保存100条）
- 最后更新时间

## 获取 Telegram 机器人 Token

1. 在 Telegram 中找到 [@BotFather](https://t.me/BotFather)
2. 发送 `/newbot` 命令创建一个新机器人
3. 按照提示设置机器人名称和用户名
4. 获取 API Token 并添加到 `.env` 文件中

## 使用方法

1. 启动机器人
```bash
npm start
```

2. 在 Telegram 中找到你的机器人并开始对话
3. 发送一个贴纸给机器人
4. 等待机器人下载并发送贴纸包

## 可用命令

- `/start` - 启动机器人，显示欢迎信息和统计概览
- `/help` - 显示帮助信息
- `/stats` - 查看详细的下载统计信息

## 统计功能

机器人现在包含简单的统计功能：

- **自动统计**：每次成功下载贴纸包时自动记录
- **数据展示**：通过 `/stats` 命令查看总下载数和最近下载记录
- **启动展示**：机器人启动时显示已帮助用户下载的贴纸包总数

## 文件服务器

机器人启动时会同时启动一个文件服务器，默认端口为3000。你可以通过以下方式访问：

- 本地访问：http://localhost:3000
- 如果配置了PUBLIC_URL，也可以通过公共URL访问

文件服务器提供了一个网页界面，列出所有可下载的贴纸包，方便用户下载。

## 缓存功能

机器人具有缓存功能，可以避免重复下载相同的贴纸包：

- 当用户请求已下载过的贴纸包时，机器人会直接从缓存中获取，无需重新下载
- 缓存的贴纸包会保存在缓存目录中（默认为`./downloads/cache`）
- 缓存有效期默认为7天，可通过`CACHE_MAX_AGE`环境变量配置
- 机器人启动时会自动清理过期的缓存
- 文件服务器会显示缓存的贴纸包信息，包括贴纸包名称、大小、创建时间等

## 注意事项

- 大型贴纸包可能需要较长时间下载
- Telegram 对文件大小有限制，非常大的贴纸包可能无法发送
- 如果遇到网络问题，机器人会自动重试发送，最多重试3次

## 免责声明

本软件仅供学习交流，请勿用于其他用途。

## 许可证

MIT