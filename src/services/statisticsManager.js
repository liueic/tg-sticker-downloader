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
        this.init();
    }

    async init() {
        try {
            await this.loadStats();
        } catch (error) {
            console.log('初始化统计数据...');
            await this.saveStats();
        }
    }

    async loadStats() {
        try {
            const data = await fs.readFile(this.statsFile, 'utf8');
            this.stats = JSON.parse(data);
        } catch (error) {
            // 如果文件不存在，使用默认值
            console.log('统计文件不存在，使用默认统计数据');
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

    getStats() {
        return {
            totalDownloads: this.stats.totalDownloads,
            recentDownloads: this.stats.downloadHistory.slice(-10), // 最近10条
            lastUpdated: this.stats.lastUpdated
        };
    }

    async resetStats() {
        this.stats = {
            totalDownloads: 0,
            downloadHistory: [],
            lastUpdated: null
        };
        await this.saveStats();
        console.log('统计数据已重置');
    }
}

module.exports = new StatisticsManager();