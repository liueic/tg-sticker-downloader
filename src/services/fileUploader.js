const fs = require('fs-extra');
const path = require('path');
const { HttpsProxyAgent } = require('https-proxy-agent');
const FormData = require('form-data');
const fetch = require('node-fetch');

/**
 * 发送文件到Telegram
 * @param {string} botToken Bot Token
 * @param {number} chatId 聊天ID
 * @param {string} filePath 文件路径
 * @param {Object} options 选项
 * @returns {Promise<Object>} 发送结果
 */
async function sendFileToTelegram(botToken, chatId, filePath, options = {}) {
  try {
    console.log(`开始发送文件: ${filePath}`);
    
    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      throw new Error(`文件不存在: ${filePath}`);
    }
    
    // 获取文件信息
    const stats = fs.statSync(filePath);
    const fileSizeInMB = stats.size / (1024 * 1024);
    console.log(`文件大小: ${fileSizeInMB.toFixed(2)} MB`);
    
    // 创建表单数据
    const form = new FormData();
    form.append('chat_id', chatId);
    form.append('document', fs.createReadStream(filePath));
    
    // 添加可选参数
    if (options.caption) {
      form.append('caption', options.caption);
    }
    
    // 配置请求选项
    const fetchOptions = {
      method: 'POST',
      body: form,
      timeout: 300000, // 5分钟超时
    };
    
    // 检查是否设置了代理
    if (process.env.https_proxy || process.env.http_proxy) {
      const proxyUrl = process.env.https_proxy || process.env.http_proxy;
      console.log(`使用代理发送文件: ${proxyUrl}`);
      fetchOptions.agent = new HttpsProxyAgent(proxyUrl);
    }
    
    // 发送请求
    console.log('正在发送文件到Telegram...');
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, fetchOptions);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Telegram API错误 (${response.status}): ${errorText}`);
    }
    
    const result = await response.json();
    console.log('文件发送成功');
    
    return {
      success: true,
      result
    };
  } catch (error) {
    console.error('发送文件时出错:', error);
    return {
      success: false,
      error: error.message || '发送文件时出错'
    };
  }
}

/**
 * 使用重试机制发送文件
 * @param {string} botToken Bot Token
 * @param {number} chatId 聊天ID
 * @param {string} filePath 文件路径
 * @param {Object} options 选项
 * @returns {Promise<Object>} 发送结果
 */
async function sendFileWithRetry(botToken, chatId, filePath, options = {}) {
  const MAX_RETRIES = 3;
  let retries = 0;
  
  while (retries < MAX_RETRIES) {
    try {
      console.log(`尝试发送文件 (${retries + 1}/${MAX_RETRIES})...`);
      const result = await sendFileToTelegram(botToken, chatId, filePath, options);
      
      if (result.success) {
        return result;
      }
      
      retries++;
      
      if (retries >= MAX_RETRIES) {
        return result;
      }
      
      // 使用指数退避策略
      const waitTime = 5000 * Math.pow(2, retries - 1); // 5秒, 10秒, 20秒
      console.log(`发送失败，等待 ${waitTime/1000} 秒后重试...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    } catch (error) {
      console.error(`发送文件尝试 ${retries + 1} 失败:`, error);
      retries++;
      
      if (retries >= MAX_RETRIES) {
        return {
          success: false,
          error: error.message || '发送文件失败，已达到最大重试次数'
        };
      }
      
      // 使用指数退避策略
      const waitTime = 5000 * Math.pow(2, retries - 1);
      console.log(`等待 ${waitTime/1000} 秒后重试...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
  
  return {
    success: false,
    error: '发送文件失败，已达到最大重试次数'
  };
}

module.exports = {
  sendFileToTelegram,
  sendFileWithRetry
};