const fs = require('fs-extra');
const path = require('path');
const ffmpegStatic = require('ffmpeg-static');
const { execFile } = require('child_process');
const { promisify } = require('util');
const sleep = promisify(setTimeout);
const execFilePromise = promisify(execFile);

/**
 * 将webm视频转换为webp动画
 * @param {string} inputPath webm文件路径
 * @param {string} outputPath webp文件路径
 * @returns {Promise<Object>} 转换结果
 */
async function convertWebmToWebp(inputPath, outputPath) {
  try {
    console.log(`开始将 ${inputPath} 转换为 ${outputPath}`);
    
    // 构建ffmpeg命令参数 - 保持原始尺寸，不添加填充
    const args = [
      '-i', inputPath,
      '-loop', '0',
      '-compression_level', '6',
      '-quality', '80',
      '-preset', 'default',
      '-an', // 移除音频
      '-vsync', '0',
      '-f', 'webp',
      outputPath
    ];
    
    console.log('执行FFmpeg命令:', ffmpegStatic, args.join(' '));
    
    // 执行ffmpeg命令
    const { stdout, stderr } = await execFilePromise(ffmpegStatic, args);
    
    if (stderr) {
      console.log('FFmpeg输出:', stderr);
    }
    
    // 检查输出文件是否存在
    if (fs.existsSync(outputPath)) {
      console.log(`转换完成: ${outputPath}`);
      return {
        success: true,
        outputPath
      };
    } else {
      throw new Error('转换后的文件不存在');
    }
  } catch (error) {
    console.error('转换过程中出错:', error);
    return {
      success: false,
      error: error.message || '转换过程中出错'
    };
  }
}

/**
 * 批量转换目录中的所有webm文件为webp
 * @param {string} directory 目录路径
 * @param {boolean} keepOriginal 是否保留原始文件
 * @returns {Promise<Object>} 转换结果
 */
async function convertDirectoryWebmToWebp(directory, keepOriginal = false) {
  try {
    console.log(`开始转换目录 ${directory} 中的webm文件`);
    
    // 读取目录中的所有文件
    const files = await fs.readdir(directory);
    
    // 筛选出webm文件
    const webmFiles = files.filter(file => path.extname(file).toLowerCase() === '.webm');
    
    if (webmFiles.length === 0) {
      console.log('目录中没有webm文件需要转换');
      return {
        success: true,
        converted: 0,
        total: 0
      };
    }
    
    console.log(`找到 ${webmFiles.length} 个webm文件需要转换`);
    
    // 转换每个webm文件
    const results = [];
    for (let i = 0; i < webmFiles.length; i++) {
      const webmFile = webmFiles[i];
      const inputPath = path.join(directory, webmFile);
      const outputPath = path.join(directory, webmFile.replace('.webm', '.webp'));
      
      console.log(`[${i + 1}/${webmFiles.length}] 转换 ${webmFile}`);
      
      try {
        const result = await convertWebmToWebp(inputPath, outputPath);
        
        // 如果不保留原始文件，则删除webm文件
        if (!keepOriginal && result.success) {
          await fs.remove(inputPath);
          console.log(`已删除原始文件: ${inputPath}`);
        }
        
        results.push({
          file: webmFile,
          success: result.success,
          error: result.error
        });
      } catch (error) {
        console.error(`转换 ${webmFile} 时出错:`, error);
        results.push({
          file: webmFile,
          success: false,
          error: error.message || '转换过程中出错'
        });
      }
      
      // 添加短暂延迟，避免系统资源过度使用
      await sleep(500);
    }
    
    // 统计转换结果
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    
    console.log(`转换完成，成功: ${successCount}，失败: ${failCount}`);
    
    return {
      success: true,
      converted: successCount,
      failed: failCount,
      total: webmFiles.length,
      results
    };
  } catch (error) {
    console.error('批量转换过程中出错:', error);
    return {
      success: false,
      error: error.message || '批量转换过程中出错'
    };
  }
}

module.exports = {
  convertWebmToWebp,
  convertDirectoryWebmToWebp
};