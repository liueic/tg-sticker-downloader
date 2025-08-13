// 导入必要的依赖
const { Telegraf } = require('telegraf');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs-extra');
const { downloadStickers } = require('./services/stickerDownloader');
const { createStickerArchive } = require('./services/archiveCreator');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

// 加载环境变量
dotenv.config();

// 初始化机器人，配置代理
const botOptions = {
  // 增加超时设置
  telegram: {
    // 设置API请求超时为3分钟
    apiRequestTimeoutMs: 180000
  }
};

// 检查是否设置了代理
if (process.env.https_proxy || process.env.http_proxy) {
  const proxyUrl = process.env.https_proxy || process.env.http_proxy;
  console.log(`使用代理: ${proxyUrl}`);
  botOptions.telegram.agent = new HttpsProxyAgent(proxyUrl);
}

const bot = new Telegraf(process.env.BOT_TOKEN, botOptions);

// 配置全局错误处理
bot.catch((err, ctx) => {
  console.error('Telegraf错误:', err);
  if (ctx) {
    ctx.reply('机器人遇到了一个错误，请稍后再试。如果问题持续存在，请联系管理员。');
  }
});

// 确保下载目录存在
const downloadPath = process.env.DOWNLOAD_PATH || './downloads';
fs.ensureDirSync(downloadPath);

// 启动消息
bot.start((ctx) => {
  ctx.reply('欢迎使用贴纸下载机器人！\n\n请发送一个贴纸给我，我将为您下载整个贴纸包。');
});

// 帮助命令
bot.help((ctx) => {
  ctx.reply(
    '使用指南：\n' +
    '1. 发送一个贴纸给我\n' +
    '2. 我会自动下载整个贴纸包\n' +
    '3. 下载完成后，我会将贴纸包发送给您\n\n'
  );
});

/**
 * 使用Worker线程下载贴纸
 * @param {string} stickerSetName 贴纸包名称
 * @param {string} outputDir 输出目录
 * @returns {Promise<Object>} 下载结果
 */
function downloadStickersWithWorker(stickerSetName, outputDir) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(`${__dirname}/services/workerDownloader.js`, {
      workerData: {
        stickerSetName,
        outputDir,
        botToken: process.env.BOT_TOKEN,
        proxy: process.env.https_proxy || process.env.http_proxy
      }
    });

    worker.on('message', (result) => {
      resolve(result);
    });

    worker.on('error', (err) => {
      console.error('Worker错误:', err);
      reject({
        success: false,
        error: `下载线程错误: ${err.message}`
      });
    });

    worker.on('exit', (code) => {
      if (code !== 0) {
        reject({
          success: false,
          error: `Worker线程异常退出，退出码: ${code}`
        });
      }
    });
  });
}

// 处理贴纸消息
bot.on('sticker', async (ctx) => {
  try {
    console.log('收到贴纸消息:', JSON.stringify(ctx.message.sticker, null, 2));
    
    const sticker = ctx.message.sticker;
    const stickerSetName = sticker.set_name;
    
    if (!stickerSetName) {
      return ctx.reply('这个贴纸似乎不属于任何贴纸包。');
    }
    
    // 发送处理中的消息
    const statusMessage = await ctx.reply(`正在处理贴纸包 "${stickerSetName}"，请稍候...`);
    
    // 创建贴纸包专属的下载目录
    const stickerDir = path.join(downloadPath, stickerSetName);
    fs.ensureDirSync(stickerDir);
    
    try {
      // 下载贴纸包中的所有贴纸
      await ctx.reply('正在使用多线程下载贴纸，这可能需要一些时间，请耐心等待...');
      console.log(`开始下载贴纸包: ${stickerSetName}`);
      
      // 使用Worker线程下载贴纸
      const downloadResult = await Promise.race([
        downloadStickersWithWorker(stickerSetName, stickerDir),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('下载超时，请稍后再试')), 300000) // 5分钟超时
        )
      ]);
      
      if (!downloadResult.success) {
        fs.removeSync(stickerDir); // 清理临时文件
        return ctx.reply(`下载失败: ${downloadResult.error}`);
      }
      
      // 创建压缩包
      await ctx.reply('下载完成，正在创建压缩包...');
      console.log('创建压缩包...');
      
      const archiveResult = await Promise.race([
        createStickerArchive(stickerSetName, stickerDir),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('创建压缩包超时')), 60000) // 1分钟超时
        )
      ]);
      
      if (!archiveResult.success) {
        fs.removeSync(stickerDir); // 清理临时文件
        return ctx.reply(`创建压缩包失败: ${archiveResult.error}`);
      }
      
      // 检查文件大小
      console.log('检查压缩包大小...');
      const stats = fs.statSync(archiveResult.archivePath);
      const fileSizeInMB = stats.size / (1024 * 1024);
      console.log(`压缩包大小: ${fileSizeInMB.toFixed(2)} MB`);
      
      // Telegram Bot API 文件大小限制为50MB
      const MAX_FILE_SIZE_MB = 50;
      
      if (fileSizeInMB > MAX_FILE_SIZE_MB) {
        await ctx.reply(`警告: 贴纸包太大 (${fileSizeInMB.toFixed(2)} MB)，超过了Telegram的50MB限制。`);
        await ctx.reply('正在尝试压缩文件...');
        
        // 这里可以添加更高级的压缩方法
        // 但目前我们只能告知用户文件太大
        fs.removeSync(stickerDir); // 清理临时文件
        fs.removeSync(archiveResult.archivePath); // 清理压缩包
        return ctx.reply('很抱歉，贴纸包太大，无法通过Telegram发送。');
      }
      
      // 发送压缩包
      await ctx.reply('压缩包创建完成，正在发送...');
      console.log('发送压缩包...');
      
      try {
        // 添加重试机制
        let retries = 0;
        const MAX_RETRIES = 3;
        let success = false;
        
        while (!success && retries < MAX_RETRIES) {
          try {
            await ctx.replyWithDocument({ source: archiveResult.archivePath });
            success = true;
            await ctx.reply('贴纸包发送成功！');
          } catch (sendError) {
            retries++;
            console.error(`发送压缩包失败 (尝试 ${retries}/${MAX_RETRIES}):`, sendError);
            
            if (retries >= MAX_RETRIES) {
              throw sendError;
            }
            
            // 等待一段时间后重试
            await new Promise(resolve => setTimeout(resolve, 3000 * retries));
            await ctx.reply(`发送失败，正在进行第${retries}次重试...`);
          }
        }
      } catch (sendError) {
        console.error('发送压缩包时出错:', sendError);
        await ctx.reply('发送压缩包失败，请稍后再试。');
      } finally {
        // 清理临时文件
        console.log('清理临时文件...');
        fs.removeSync(stickerDir);
        fs.removeSync(archiveResult.archivePath);
      }
      
      // 清理临时文件
      console.log('清理临时文件...');
      fs.removeSync(stickerDir);
      fs.removeSync(archiveResult.archivePath);
      
    } catch (innerError) {
      console.error('处理贴纸包时出错:', innerError);
      
      // 清理临时文件
      if (fs.existsSync(stickerDir)) {
        fs.removeSync(stickerDir);
      }
      
      ctx.reply(`处理贴纸包时出错: ${innerError.message || '未知错误'}`);
    }
    
  } catch (error) {
    console.error('处理贴纸消息时出错:', error);
    ctx.reply('处理贴纸时出错，请稍后再试。');
  }
});

// 处理其他消息
bot.on('message', (ctx) => {
  ctx.reply('请发送一个贴纸给我，我将为您下载整个贴纸包。');
});

// 启动机器人
bot.launch()
  .then(() => {
    console.log('机器人已启动！');
  })
  .catch((err) => {
    console.error('启动机器人时出错:', err);
  });

// 优雅地处理退出
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));