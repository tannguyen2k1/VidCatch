// ============================================================
// Downloader Utility - Quản lý quá trình tải xuống
// ============================================================

class Downloader {
    constructor() {
        this.downloadQueue = [];
        this.activeDownloads = new Map();
        this.maxConcurrent = 3;
        this.listeners = [];
    }

    /**
     * Thêm video vào hàng đợi tải
     */
    enqueue(videoInfo) {
        const task = {
            id: this._generateId(),
            url: videoInfo.url,
            fileName: videoInfo.title || this._getFileName(videoInfo.url),
            status: 'queued',
            progress: 0,
            startTime: null,
            endTime: null,
            error: null,
            retries: 0
        };

        this.downloadQueue.push(task);
        this._notifyListeners('enqueued', task);
        this._processQueue();

        return task.id;
    }

    /**
     * Tải nhiều video cùng lúc
     */
    enqueueMultiple(videos) {
        return videos.map(v => this.enqueue(v));
    }

    /**
     * Hủy tải
     */
    cancel(taskId) {
        const task = this._findTask(taskId);
        if (!task) return false;

        if (task.status === 'downloading') {
            // Hủy chrome download
            if (task.chromeDownloadId) {
                chrome.downloads.cancel(task.chromeDownloadId);
            }
            this.activeDownloads.delete(taskId);
        }

        task.status = 'cancelled';
        this._notifyListeners('cancelled', task);
        this._processQueue();

        return true;
    }

    /**
     * Hủy tất cả
     */
    cancelAll() {
        const taskIds = this.downloadQueue.map(t => t.id);
        taskIds.forEach(id => this.cancel(id));
    }

    /**
     * Lấy trạng thái tất cả task
     */
    getTasks() {
        return [...this.downloadQueue];
    }

    /**
     * Lấy task đang active
     */
    getActiveTasks() {
        return this.downloadQueue.filter(t =>
            t.status === 'downloading' || t.status === 'queued'
        );
    }

    /**
     * Đăng ký listener
     */
    on(event, callback) {
        this.listeners.push({ event, callback });
    }

    // ============= PRIVATE =============

    _processQueue() {
        const activeCount = this.downloadQueue.filter(t => t.status === 'downloading').length;
        if (activeCount >= this.maxConcurrent) return;

        const nextTask = this.downloadQueue.find(t => t.status === 'queued');
        if (!nextTask) return;

        this._startDownload(nextTask);
    }

    async _startDownload(task) {
        task.status = 'downloading';
        task.startTime = Date.now();
        this._notifyListeners('started', task);

        try {
            const downloadId = await chrome.downloads.download({
                url: task.url,
                filename: task.fileName,
                saveAs: true,
                conflictAction: 'uniquify'
            });

            task.chromeDownloadId = downloadId;
            this.activeDownloads.set(task.id, task);

            // Lắng nghe tiến trình
            chrome.downloads.onChanged.addListener((delta) => {
                if (delta.id !== downloadId) return;

                if (delta.state) {
                    switch (delta.state.current) {
                        case 'complete':
                            task.status = 'completed';
                            task.endTime = Date.now();
                            task.progress = 100;
                            this.activeDownloads.delete(task.id);
                            this._notifyListeners('completed', task);
                            this._processQueue();
                            break;

                        case 'interrupted':
                            task.status = 'interrupted';
                            task.error = 'Download bị gián đoạn';
                            this.activeDownloads.delete(task.id);
                            this._notifyListeners('interrupted', task);

                            // Retry
                            if (task.retries < 3) {
                                task.retries++;
                                task.status = 'queued';
                                this._processQueue();
                            }
                            break;
                    }
                }

                if (delta.totalBytes && delta.totalBytes.current > 0) {
                    task.totalBytes = delta.totalBytes.current;
                }
                if (delta.bytesReceived && delta.bytesReceived.current > 0) {
                    task.bytesReceived = delta.bytesReceived.current;
                    task.progress = task.totalBytes ?
                        Math.round((task.bytesReceived / task.totalBytes) * 100) : 0;
                }
            });
        } catch (error) {
            task.status = 'failed';
            task.error = error.message;
            this._notifyListeners('failed', task);

            if (task.retries < 3) {
                task.retries++;
                task.status = 'queued';
                this._processQueue();
            }
        }
    }

    _notifyListeners(event, task) {
        this.listeners
            .filter(l => l.event === event || l.event === '*')
            .forEach(l => l.callback(task, event));
    }

    _findTask(taskId) {
        return this.downloadQueue.find(t => t.id === taskId);
    }

    _generateId() {
        return 'dl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    _getFileName(url) {
        try {
            const pathname = new URL(url).pathname;
            return pathname.split('/').pop()?.split('?')[0] || 'video.mp4';
        } catch {
            return 'video.mp4';
        }
    }
}

// Singleton
const downloader = new Downloader();

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Downloader, downloader };
}
