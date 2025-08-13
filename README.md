# Telegram 贴纸包下载机器人

这是一个 Telegram 机器人，可以帮助用户下载完整的贴纸包。用户只需发送一个贴纸给机器人，机器人就会下载整个贴纸包并以 ZIP 格式发送回来。

## 功能

- 下载完整的 Telegram 贴纸包
- 支持普通贴纸、动画贴纸和视频贴纸
- 将贴纸打包为 ZIP 文件发送给用户

## 安装

1. 克隆此仓库
```bash
git clone https://github.com/yourusername/tg-sticker-downloader.git
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
然后编辑 `.env` 文件，填入你的 Telegram 机器人 Token

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

## 注意事项

- 大型贴纸包可能需要较长时间下载
- Telegram 对文件大小有限制，非常大的贴纸包可能无法发送

## 许可证

MIT