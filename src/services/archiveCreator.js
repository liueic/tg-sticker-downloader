const archiver = require('archiver');
const fs = require('fs-extra');
const path = require('path');
const { promisify } = require('util');
const sleep = promisify(setTimeout);

/**
 * 创建贴纸包的压缩文件
 * @param {string} stickerSetName 贴纸包名称
 * @param {string} sourceDir 贴纸源目录
 * @returns {Promise<Object>} 压缩结果
 */
async function createStickerArchive(stickerSetName, sourceDir) {
  return new Promise((resolve, reject) => {
    try {
      console.log(`开始创建贴纸包压缩文件: ${stickerSetName}`);
      
      // 确保源目录存在
      if (!fs.existsSync(sourceDir)) {
        console.error(`源目录不存在: ${sourceDir}`);
        return reject({
          success: false,
          error: '源目录不存在'
        });
      }
      
      // 检查源目录中的文件
      const files = fs.readdirSync(sourceDir);
      console.log(`源目录中有 ${files.length} 个文件`);
      
      if (files.length === 0) {
        console.error('源目录为空，无法创建压缩包');
        return reject({
          success: false,
          error: '源目录为空，无法创建压缩包'
        });
      }
      
      // 检查源目录大小
      let totalSize = 0;
      files.forEach(file => {
        const filePath = path.join(sourceDir, file);
        const stats = fs.statSync(filePath);
        totalSize += stats.size;
      });
      
      const totalSizeMB = totalSize / (1024 * 1024);
      console.log(`源目录总大小: ${totalSizeMB.toFixed(2)} MB`);
      
      // 如果源文件总大小已经接近50MB，提前警告
      if (totalSizeMB > 45) {
        console.warn(`警告: 源文件总大小(${totalSizeMB.toFixed(2)} MB)接近Telegram的50MB限制`);
      }
      
      // 创建输出文件路径
      const archivePath = path.join(process.env.DOWNLOAD_PATH || './downloads', `${stickerSetName}.zip`);
      console.log(`压缩包将保存到: ${archivePath}`);
      
      // 如果文件已存在，先删除
      if (fs.existsSync(archivePath)) {
        console.log('压缩包文件已存在，正在删除...');
        fs.removeSync(archivePath);
      }
      
      // 创建写入流
      const output = fs.createWriteStream(archivePath);
      const archive = archiver('zip', {
        zlib: { level: 9 } // 最高压缩级别
      });
      
      console.log('创建压缩包写入流...');
      
      // 监听所有存档数据写入完成
      output.on('close', () => {
        const sizeInMB = (archive.pointer() / 1024 / 1024).toFixed(2);
        console.log(`压缩包创建完成，大小: ${sizeInMB} MB`);
        resolve({
          success: true,
          archivePath: archivePath,
          size: archive.pointer(),
          sizeFormatted: `${sizeInMB} MB`
        });
      });
      
      // 监听警告
      archive.on('warning', (err) => {
        if (err.code === 'ENOENT') {
          console.warn('压缩包警告:', err);
        } else {
          console.error('压缩包错误:', err);
          reject({
            success: false,
            error: `压缩包错误: ${err.message}`
          });
        }
      });
      
      // 监听错误
      archive.on('error', (err) => {
        console.error('压缩包错误:', err);
        reject({
          success: false,
          error: `压缩包错误: ${err.message}`
        });
      });
      
      // 监听进度
      archive.on('progress', (progress) => {
        const { entries, fs } = progress;
        if (entries && entries.processed % 10 === 0) { // 每处理10个文件记录一次日志
          console.log(`已处理 ${entries.processed}/${entries.total} 个文件`);
        }
      });
      
      // 将输出流与存档关联
      archive.pipe(output);
      
      // 将整个目录添加到存档
      console.log(`添加目录到压缩包: ${sourceDir}`);
      archive.directory(sourceDir, false);
      
      // 完成存档
      console.log('正在完成压缩包...');
      archive.finalize();
    } catch (error) {
      console.error('创建压缩包时出错:', error);
      reject({
        success: false,
        error: error.message || '创建压缩包时出错'
      });
    }
  });
}

module.exports = {
  createStickerArchive
};