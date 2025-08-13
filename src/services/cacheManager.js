const fs = require('fs-extra');
const path = require('path');

/**
 * 缓存管理器
 * 用于管理贴纸包的缓存，避免重复下载
 */
class CacheManager {
  /**
   * 构造函数
   * @param {string} cacheDir 缓存目录
   */
  constructor(cacheDir) {
    this.cacheDir = cacheDir || process.env.CACHE_DIR || path.join(process.env.DOWNLOAD_PATH || './downloads', 'cache');
    this.cacheInfoFile = path.join(this.cacheDir, 'cache_info.json');
    this.cacheInfo = {};
    this.maxAge = parseInt(process.env.CACHE_MAX_AGE) || 7 * 24 * 60 * 60 * 1000; // 默认7天
    this.init();
  }

  /**
   * 初始化缓存管理器
   */
  init() {
    try {
      // 确保缓存目录存在
      fs.ensureDirSync(this.cacheDir);
      
      // 加载缓存信息
      if (fs.existsSync(this.cacheInfoFile)) {
        this.cacheInfo = fs.readJsonSync(this.cacheInfoFile);
        console.log(`已加载缓存信息，共有 ${Object.keys(this.cacheInfo).length} 个缓存项`);
      } else {
        this.cacheInfo = {};
        this.saveCache();
        console.log('缓存信息文件不存在，已创建新的缓存信息');
      }
    } catch (error) {
      console.error('初始化缓存管理器时出错:', error);
      this.cacheInfo = {};
    }
  }

  /**
   * 保存缓存信息到文件
   */
  saveCache() {
    try {
      fs.writeJsonSync(this.cacheInfoFile, this.cacheInfo);
    } catch (error) {
      console.error('保存缓存信息时出错:', error);
    }
  }

  /**
   * 检查贴纸包是否已缓存
   * @param {string} stickerSetName 贴纸包名称
   * @returns {boolean} 是否已缓存
   */
  isCached(stickerSetName) {
    return !!this.cacheInfo[stickerSetName] && 
           fs.existsSync(path.join(this.cacheDir, `${stickerSetName}.zip`));
  }

  /**
   * 获取缓存的贴纸包路径
   * @param {string} stickerSetName 贴纸包名称
   * @returns {string|null} 缓存的贴纸包路径，如果不存在则返回null
   */
  getCachePath(stickerSetName) {
    if (this.isCached(stickerSetName)) {
      return path.join(this.cacheDir, `${stickerSetName}.zip`);
    }
    return null;
  }

  /**
   * 添加贴纸包到缓存
   * @param {string} stickerSetName 贴纸包名称
   * @param {string} filePath 贴纸包文件路径
   * @param {Object} metadata 贴纸包元数据
   * @returns {Promise<string>} 缓存后的文件路径
   */
  async addToCache(stickerSetName, filePath, metadata = {}) {
    try {
      const cachePath = path.join(this.cacheDir, `${stickerSetName}.zip`);
      
      // 复制文件到缓存目录
      await fs.copy(filePath, cachePath);
      
      // 更新缓存信息
      this.cacheInfo[stickerSetName] = {
        timestamp: Date.now(),
        metadata: metadata
      };
      
      // 保存缓存信息
      this.saveCache();
      
      console.log(`贴纸包 ${stickerSetName} 已添加到缓存`);
      return cachePath;
    } catch (error) {
      console.error(`添加贴纸包 ${stickerSetName} 到缓存时出错:`, error);
      return null;
    }
  }

  /**
   * 从缓存中删除贴纸包
   * @param {string} stickerSetName 贴纸包名称
   * @returns {boolean} 是否删除成功
   */
  removeFromCache(stickerSetName) {
    try {
      const cachePath = path.join(this.cacheDir, `${stickerSetName}.zip`);
      
      // 删除缓存文件
      if (fs.existsSync(cachePath)) {
        fs.removeSync(cachePath);
      }
      
      // 更新缓存信息
      delete this.cacheInfo[stickerSetName];
      
      // 保存缓存信息
      this.saveCache();
      
      console.log(`贴纸包 ${stickerSetName} 已从缓存中删除`);
      return true;
    } catch (error) {
      console.error(`从缓存中删除贴纸包 ${stickerSetName} 时出错:`, error);
      return false;
    }
  }

  /**
   * 清理过期的缓存
   * @param {number} customMaxAge 自定义最大缓存时间（毫秒），如果不提供则使用默认值
   * @returns {number} 清理的缓存数量
   */
  cleanExpiredCache(customMaxAge) {
    try {
      const maxAge = customMaxAge || this.maxAge;
      const now = Date.now();
      let cleanCount = 0;
      
      console.log(`开始清理过期缓存，最大缓存时间: ${maxAge / (24 * 60 * 60 * 1000)} 天`);
      
      Object.keys(this.cacheInfo).forEach(stickerSetName => {
        const cacheItem = this.cacheInfo[stickerSetName];
        
        // 检查是否过期
        if (now - cacheItem.timestamp > maxAge) {
          console.log(`缓存项 ${stickerSetName} 已过期，上次更新时间: ${new Date(cacheItem.timestamp).toLocaleString()}`);
          this.removeFromCache(stickerSetName);
          cleanCount++;
        }
      });
      
      console.log(`清理了 ${cleanCount} 个过期的缓存项`);
      return cleanCount;
    } catch (error) {
      console.error('清理过期缓存时出错:', error);
      return 0;
    }
  }

  /**
   * 获取所有缓存的贴纸包信息
   * @returns {Object} 所有缓存的贴纸包信息
   */
  getAllCacheInfo() {
    return this.cacheInfo;
  }
}

// 创建单例实例
const cacheManager = new CacheManager();

module.exports = cacheManager;