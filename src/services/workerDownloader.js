const { workerData, parentPort } = require('worker_threads');
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { convertDirectoryWebmToWebp } = require('./formatConverter');

// 从主线程获取数据
const { stickerSetName, outputDir, botToken, proxy } = workerData;

// 创建axios实例，配置代理
const createAxiosInstance = () => {
  const instance = axios.create({
    // 增加超时时间到3分钟
    timeout: 180000
  });
  
  // 检查是否设置了代理
  if (proxy) {
    instance.defaults.httpsAgent = new HttpsProxyAgent(proxy);
    console.log(`Worker线程使用代理: ${proxy}`);
  }
  
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
    const response = await axiosInstance.get(`https://api.telegram.org/bot${botToken}/getStickerSet`, {
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
    const response = await axiosInstance.get(`https://api.telegram.org/bot${botToken}/getFile`, {
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
    const url = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
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
 * 并行下载多个贴纸
 * @param {Array} stickers 贴纸数组
 * @param {string} outputDir 输出目录
 * @returns {Promise<Array>} 下载结果数组
 */
async function downloadStickersInParallel(stickers, outputDir) {
  // 将贴纸分成多个批次，每批次并行下载
  const BATCH_SIZE = 10; // 每批次下载5个贴纸
  const results = [];
  
  for (let i = 0; i < stickers.length; i += BATCH_SIZE) {
    const batch = stickers.slice(i, Math.min(i + BATCH_SIZE, stickers.length));
    console.log(`正在并行下载第 ${i + 1} 到 ${Math.min(i + BATCH_SIZE, stickers.length)} 个贴纸...`);
    
    const batchPromises = batch.map(async (sticker, index) => {
      const stickerIndex = i + index + 1;
      
      try {
        // 获取文件信息
        console.log(`获取贴纸 ${stickerIndex}/${stickers.length} 的文件信息...`);
        const fileResult = await getFile(sticker.file_id);
        
        if (!fileResult.success) {
          console.error(`获取贴纸 ${stickerIndex}/${stickers.length} 的文件信息失败:`, fileResult.error);
          return {
            success: false,
            index: stickerIndex,
            error: fileResult.error
          };
        }
        
        // 确定文件扩展名
        let extension = 'webp';
        if (sticker.is_animated) {
          extension = 'tgs';
        } else if (sticker.is_video) {
          extension = 'webm';
        }
        
        // 下载文件
        const outputPath = path.join(outputDir, `sticker_${stickerIndex}.${extension}`);
        console.log(`下载贴纸 ${stickerIndex} 到 ${outputPath}...`);
        
        const downloadResult = await downloadFile(fileResult.file.file_path, outputPath);
        
        if (!downloadResult.success) {
          console.error(`下载贴纸 ${stickerIndex}/${stickers.length} 失败:`, downloadResult.error);
          return {
            success: false,
            index: stickerIndex,
            error: downloadResult.error
          };
        }
        
        console.log(`贴纸 ${stickerIndex} 下载成功`);
        return {
          success: true,
          index: stickerIndex
        };
      } catch (error) {
        console.error(`处理贴纸 ${stickerIndex}/${stickers.length} 时出错:`, error);
        return {
          success: false,
          index: stickerIndex,
          error: error.message || '未知错误'
        };
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }
  
  return results;
}

/**
 * 下载整个贴纸包
 * @param {string} stickerSetName 贴纸包名称
 * @param {string} outputDir 输出目录
 * @returns {Promise<Object>} 下载结果
 */
async function downloadStickers() {
  try {
    console.log(`Worker线程开始下载贴纸包: ${stickerSetName}`);
    
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
    
    // 并行下载贴纸
    const downloadResults = await downloadStickersInParallel(stickers, outputDir);
    
    // 统计下载结果
    const successCount = downloadResults.filter(result => result.success).length;
    const failCount = downloadResults.filter(result => !result.success).length;
    
    console.log(`贴纸包下载完成，成功: ${successCount}，失败: ${failCount}`);
    
    if (failCount > 0) {
      console.warn(`有 ${failCount} 个贴纸下载失败`);
    }
    
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
      successCount,
      failCount,
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

// 开始下载贴纸并将结果发送回主线程
downloadStickers().then(result => {
  parentPort.postMessage(result);
}).catch(error => {
  parentPort.postMessage({
    success: false,
    error: error.message || '下载贴纸包时出错'
  });
});