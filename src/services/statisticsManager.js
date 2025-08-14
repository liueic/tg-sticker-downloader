const fs = require('fs').promises;
const path = require('path');

class StatisticsManager {
    constructor() {
        this.statsFile = path.join(__dirname, '../../config/statistics.json');
        this.stats = {
            totalDownloads: 0,
            downloadHistory: [],
            lastUpdated: null
        };
        this.initialized = false;
        this.initPromise = this.init();
    }

    async init() {
        try {
            await this.loadStats();
            this.initialized = true;
        } catch (error) {
            console.log('初始化统计数据...');
            await this.saveStats();
            this.initialized = true;
        }
    }

    async ensureInitialized() {
        if (!this.initialized) {
            await this.initPromise;
        }
    }

    async loadStats() {
        try {
            const data = await fs.readFile(this.statsFile, 'utf8');
            this.stats = JSON.parse(data);
            console.log('统计数据加载成功');
        } catch (error) {
            // 如果文件不存在，抛出错误让init方法处理
            console.log('统计文件不存在，将创建新的统计文件');
            throw error;
        }
    }

    async saveStats() {
        try {
            // 确保config目录存在
            const configDir = path.dirname(this.statsFile);
            await fs.mkdir(configDir, { recursive: true });
            
            this.stats.lastUpdated = new Date().toISOString();
            await fs.writeFile(this.statsFile, JSON.stringify(this.stats, null, 2));
        } catch (error) {
            console.error('保存统计数据失败:', error);
        }
    }

    async recordDownload(stickerSetName, stickerCount = 0) {
        try {
            await this.ensureInitialized();
            
            this.stats.totalDownloads += 1;
            this.stats.downloadHistory.push({
                name: stickerSetName,
                stickerCount: stickerCount,
                downloadTime: new Date().toISOString()
            });

            // 只保留最近100条记录
            if (this.stats.downloadHistory.length > 100) {
                this.stats.downloadHistory = this.stats.downloadHistory.slice(-100);
            }

            await this.saveStats();
            console.log(`📊 统计更新: 总下载数 ${this.stats.totalDownloads}`);
        } catch (error) {
            console.error('记录下载统计失败:', error);
        }
    }

    async getStats() {
        await this.ensureInitialized();
        return {
            totalDownloads: this.stats.totalDownloads,
            recentDownloads: this.stats.downloadHistory.slice(-10), // 最近10条
            lastUpdated: this.stats.lastUpdated
        };
    }

}

module.exports = new StatisticsManager();