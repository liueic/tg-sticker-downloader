const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const cacheManager = require('./cacheManager');

/**
 * 启动文件服务器
 * @param {number} port 端口号
 * @returns {Object} 服务器实例
 */
function startFileServer(port = 3000) {
  const app = express();
  
  // 静态文件目录
  const publicDir = path.join(process.cwd(), 'public');
  fs.ensureDirSync(publicDir);
  
  // 设置静态文件服务
  app.use(express.static(publicDir));
  
  // 设置缓存文件访问路由
  app.get('/cache/:filename', (req, res) => {
    try {
      const filename = req.params.filename;
      const filePath = path.join(cacheManager.cacheDir, filename);
      
      if (fs.existsSync(filePath)) {
        res.download(filePath);
      } else {
        res.status(404).send('文件不存在');
      }
    } catch (error) {
      console.error('访问缓存文件时出错:', error);
      res.status(500).send('服务器错误');
    }
  });
  
  // 文件列表路由
  app.get('/', (req, res) => {
    try {
      // 获取公共目录中的文件
      const publicFiles = fs.readdirSync(publicDir)
        .filter(file => file.endsWith('.zip'))
        .map(file => {
          const stats = fs.statSync(path.join(publicDir, file));
          return {
            name: file,
            size: (stats.size / (1024 * 1024)).toFixed(2) + ' MB',
            url: `/${file}`,
            created: stats.birthtime.toLocaleString(),
            type: 'public'
          };
        });
      
      // 获取缓存目录中的文件
      const cacheInfo = cacheManager.getAllCacheInfo();
      const cacheFiles = Object.keys(cacheInfo)
        .filter(name => fs.existsSync(path.join(cacheManager.cacheDir, `${name}.zip`)))
        .map(name => {
          const stats = fs.statSync(path.join(cacheManager.cacheDir, `${name}.zip`));
          const cacheItem = cacheInfo[name];
          return {
            name: `${name}.zip`,
            size: (stats.size / (1024 * 1024)).toFixed(2) + ' MB',
            url: `/cache/${name}.zip`,
            created: new Date(cacheItem.timestamp).toLocaleString(),
            type: 'cache',
            metadata: cacheItem.metadata || {}
          };
        });
      
      // 合并文件列表
      const files = [...publicFiles, ...cacheFiles];
      
      // 生成HTML页面
      let html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Telegram贴纸包下载服务</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body {
              font-family: Arial, sans-serif;
              max-width: 800px;
              margin: 0 auto;
              padding: 20px;
            }
            h1 {
              color: #0088cc;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 20px;
            }
            th, td {
              padding: 10px;
              text-align: left;
              border-bottom: 1px solid #ddd;
            }
            th {
              background-color: #f2f2f2;
            }
            tr:hover {
              background-color: #f5f5f5;
            }
            a {
              color: #0088cc;
              text-decoration: none;
            }
            a:hover {
              text-decoration: underline;
            }
            .empty {
              text-align: center;
              padding: 40px;
              color: #666;
            }
          </style>
        </head>
        <body>
          <h1>Telegram贴纸包下载服务</h1>
          <p>这里列出了所有可下载的贴纸包。点击链接即可下载。</p>
      `;
      
      if (files.length > 0) {
        html += `
          <table>
            <tr>
              <th>文件名</th>
              <th>大小</th>
              <th>创建时间</th>
              <th>类型</th>
              <th>操作</th>
            </tr>
        `;
        
        files.forEach(file => {
          const typeLabel = file.type === 'cache' ? '缓存' : '公共';
          const titleInfo = file.metadata && file.metadata.title ? ` (${file.metadata.title})` : '';
          const countInfo = file.metadata && file.metadata.count ? ` - ${file.metadata.count}个贴纸` : '';
          
          html += `
            <tr>
              <td>${file.name}${titleInfo}${countInfo}</td>
              <td>${file.size}</td>
              <td>${file.created}</td>
              <td>${typeLabel}</td>
              <td><a href="${file.url}" download>下载</a></td>
            </tr>
          `;
        });
        
        html += `</table>`;
      } else {
        html += `<div class="empty">暂无可下载的贴纸包</div>`;
      }
      
      html += `
        </body>
        </html>
      `;
      
      res.send(html);
    } catch (error) {
      console.error('生成文件列表时出错:', error);
      res.status(500).send('服务器错误');
    }
  });
  
  // 添加错误处理中间件
  app.use((err, req, res, next) => {
    console.error('文件服务器错误:', err);
    res.status(500).send('服务器内部错误');
  });

  // 启动服务器
  const server = app.listen(port, () => {
    console.log(`文件服务器已启动，访问 http://localhost:${port} 查看可下载的贴纸包`);
  });
  
  // 处理服务器错误
  server.on('error', (err) => {
    console.error('文件服务器启动失败:', err);
    if (err.code === 'EADDRINUSE') {
      console.error(`端口 ${port} 已被占用，请尝试其他端口`);
    }
  });
  
  return server;
}

module.exports = {
  startFileServer
};