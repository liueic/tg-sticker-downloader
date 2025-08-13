const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { convertDirectoryWebmToWebp } = require('./formatConverter');

// 创建axios实例，配置代理
const createAxiosInstance = () => {
  const instance = axios.create({
    // 移除超时限制，避免大型贴纸包下载时超时
    timeout: 0, // 0 表示无超时限制
    // 添加重试配置
    retry: 3,
    retryDelay: 2000
  });
  
  // 检查是否设置了代理
  if (process.env.https_proxy || process.env.http_proxy) {
    const proxyUrl = process.env.https_proxy || process.env.http_proxy;
    instance.defaults.httpsAgent = new HttpsProxyAgent(proxyUrl);
    console.log(`Axios使用代理: ${proxyUrl}`);
  }
  
  // 添加请求重试拦截器
  instance.interceptors.response.use(undefined, async (err) => {
    const config = err.config;
    
    // 如果已经重试了最大次数，则抛出错误
    if (config && config.retryCount >= config.maxRetries) {
      return Promise.reject(err);
    }
    
    // 初始化重试计数
    config.retryCount = config.retryCount || 0;
    config.retryCount += 1;
    
    console.log(`请求失败，正在进行第 ${config.retryCount} 次重试...`);
    
    // 延迟一段时间后重试
    return new Promise(resolve => {
      setTimeout(() => resolve(instance(config)), config.retryDelay);
    });
  });
  
  return instance;
};

const axiosInstance = createAxiosInstance();

/**
 * 从Telegram API获取贴纸包信息
 * @param {string} stickerSetName 贴纸包名称
 * @returns {Promise<Object>} 贴纸包信息
 */
async function getStickerSet(stickerSetName) {
  try {
    const response = await axiosInstance.get(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/getStickerSet`, {
      params: {
        name: stickerSetName
      }
    });
    
    if (response.data.ok) {
      return {
        success: true,
        stickerSet: response.data.result
      };
    } else {
      return {
        success: false,
        error: response.data.description || '获取贴纸包信息失败'
      };
    }
  } catch (error) {
    console.error('获取贴纸包信息时出错:', error);
    return {
      success: false,
      error: error.message || '获取贴纸包信息时出错'
    };
  }
}

/**
 * 获取贴纸文件
 * @param {string} fileId 贴纸文件ID
 * @returns {Promise<Object>} 贴纸文件信息
 */
async function getFile(fileId) {
  try {
    const response = await axiosInstance.get(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/getFile`, {
      params: {
        file_id: fileId
      }
    });
    
    if (response.data.ok) {
      return {
        success: true,
        file: response.data.result
      };
    } else {
      return {
        success: false,
        error: response.data.description || '获取文件信息失败'
      };
    }
  } catch (error) {
    console.error('获取文件信息时出错:', error);
    return {
      success: false,
      error: error.message || '获取文件信息时出错'
    };
  }
}

/**
 * 下载贴纸文件
 * @param {string} filePath Telegram文件路径
 * @param {string} outputPath 输出路径
 * @returns {Promise<Object>} 下载结果
 */
async function downloadFile(filePath, outputPath) {
  try {
    const url = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${filePath}`;
    const response = await axiosInstance({
      method: 'GET',
      url: url,
      responseType: 'stream'
    });
    
    const writer = fs.createWriteStream(outputPath);
    
    return new Promise((resolve, reject) => {
      response.data.pipe(writer);
      
      writer.on('finish', () => {
        resolve({ success: true });
      });
      
      writer.on('error', (err) => {
        reject({ success: false, error: err.message });
      });
    });
  } catch (error) {
    console.error('下载文件时出错:', error);
    return {
      success: false,
      error: error.message || '下载文件时出错'
    };
  }
}

/**
 * 下载整个贴纸包
 * @param {string} stickerSetName 贴纸包名称
 * @param {string} outputDir 输出目录
 * @returns {Promise<Object>} 下载结果
 */
async function downloadStickers(stickerSetName, outputDir) {
  try {
    console.log(`开始下载贴纸包: ${stickerSetName}`);
    
    // 获取贴纸包信息
    console.log('正在获取贴纸包信息...');
    const stickerSetResult = await getStickerSet(stickerSetName);
    
    if (!stickerSetResult.success) {
      console.error('获取贴纸包信息失败:', stickerSetResult.error);
      return stickerSetResult;
    }
    
    const stickerSet = stickerSetResult.stickerSet;
    const stickers = stickerSet.stickers;
    
    console.log(`贴纸包信息获取成功，共有 ${stickers.length} 个贴纸`);
    
    // 创建输出目录
    fs.ensureDirSync(outputDir);
    
    // 保存贴纸包信息
    fs.writeJsonSync(path.join(outputDir, 'info.json'), stickerSet);
    
    // 下载每个贴纸
    let successCount = 0;
    let failCount = 0;
    
    for (let i = 0; i < stickers.length; i++) {
      const sticker = stickers[i];
      
      console.log(`正在处理贴纸 ${i + 1}/${stickers.length}...`);
      
      // 获取文件信息
      console.log(`获取贴纸 ${i + 1} 的文件信息...`);
      const fileResult = await getFile(sticker.file_id);
      
      if (!fileResult.success) {
        console.error(`获取贴纸 ${i + 1}/${stickers.length} 的文件信息失败:`, fileResult.error);
        failCount++;
        continue;
      }
      
      // 确定文件扩展名
      let extension = 'webp';
      if (sticker.is_animated) {
        extension = 'tgs';
      } else if (sticker.is_video) {
        extension = 'webm';
      }
      
      // 下载文件
      const outputPath = path.join(outputDir, `sticker_${i + 1}.${extension}`);
      console.log(`下载贴纸 ${i + 1} 到 ${outputPath}...`);
      
      try {
        const downloadResult = await downloadFile(fileResult.file.file_path, outputPath);
        
        if (!downloadResult.success) {
          console.error(`下载贴纸 ${i + 1}/${stickers.length} 失败:`, downloadResult.error);
          failCount++;
        } else {
          console.log(`贴纸 ${i + 1} 下载成功`);
          successCount++;
        }
      } catch (error) {
        console.error(`下载贴纸 ${i + 1}/${stickers.length} 时发生异常:`, error);
        failCount++;
      }
    }
    
    console.log(`贴纸包下载完成，成功: ${successCount}，失败: ${failCount}`);
    
    // 转换webm文件为webp格式
    console.log('开始将webm文件转换为webp格式...');
    try {
      const conversionResult = await convertDirectoryWebmToWebp(outputDir, false);
      if (conversionResult.success) {
        console.log(`格式转换完成，成功转换了 ${conversionResult.converted} 个文件`);
      } else {
        console.error('格式转换过程中出错:', conversionResult.error);
      }
    } catch (conversionError) {
      console.error('格式转换过程中出现异常:', conversionError);
    }
    
    return {
      success: true,
      count: stickers.length,
      stickerSetName: stickerSet.name,
      stickerSetTitle: stickerSet.title
    };
  } catch (error) {
    console.error('下载贴纸包时出错:', error);
    return {
      success: false,
      error: error.message || '下载贴纸包时出错'
    };
  }
}

module.exports = {
  downloadStickers
};