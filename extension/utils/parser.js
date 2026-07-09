// ============================================================
// URL Parser Utility - Phân tích URL video, lấy metadata
// ============================================================

const UrlParser = {
    /**
     * Parse URL và trích xuất thông tin
     */
    parse(url) {
        try {
            const urlObj = new URL(url);
            return {
                protocol: urlObj.protocol,
                hostname: urlObj.hostname,
                pathname: urlObj.pathname,
                search: urlObj.search,
                hash: urlObj.hash,
                fileName: this.getFileName(url),
                extension: this.getExtension(url),
                isStreaming: this.isStreamingUrl(url),
                isHLS: this.isHLS(url),
                isDASH: this.isDASH(url),
                quality: this.detectQuality(url)
            };
        } catch {
            return null;
        }
    },

    /**
     * Lấy tên file từ URL
     */
    getFileName(url) {
        try {
            const urlObj = new URL(url);
            const pathname = urlObj.pathname;
            let fileName = pathname.split('/').pop() || 'video';
            // Loại bỏ query params và hash
            fileName = fileName.split('?')[0].split('#')[0];
            return decodeURIComponent(fileName);
        } catch {
            return 'video.mp4';
        }
    },

    /**
     * Lấy phần mở rộng file
     */
    getExtension(url) {
        const fileName = this.getFileName(url);
        const dotIndex = fileName.lastIndexOf('.');
        return dotIndex > -1 ? fileName.substring(dotIndex).toLowerCase() : '';
    },

    /**
     * Kiểm tra URL có phải streaming không
     */
    isStreamingUrl(url) {
        return this.isHLS(url) || this.isDASH(url);
    },

    /**
     * Kiểm tra HLS (.m3u8)
     */
    isHLS(url) {
        const lower = url.toLowerCase();
        return lower.includes('.m3u8') || lower.includes('application/vnd.apple.mpegurl');
    },

    /**
     * Kiểm tra DASH (.mpd)
     */
    isDASH(url) {
        const lower = url.toLowerCase();
        return lower.includes('.mpd') || lower.includes('application/dash+xml');
    },

    /**
     * Phát hiện chất lượng từ URL
     */
    detectQuality(url) {
        const lower = url.toLowerCase();

        const patterns = {
            '4K': ['2160', '4k', 'uhd', '3840'],
            '1440p': ['1440', '2k'],
            '1080p': ['1080', 'fhd', 'fullhd', '1920'],
            '720p': ['720', 'hd', '1280'],
            '480p': ['480', 'sd'],
            '360p': ['360'],
            '240p': ['240']
        };

        for (const [quality, keywords] of Object.entries(patterns)) {
            if (keywords.some(kw => lower.includes(kw))) {
                return quality;
            }
        }

        return null;
    },

    /**
     * Định dạng kích thước file
     */
    formatSize(bytes) {
        if (!bytes || bytes === 0) return 'Unknown';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    },

    /**
     * Lấy domain từ URL
     */
    getDomain(url) {
        try {
            return new URL(url).hostname;
        } catch {
            return '';
        }
    },

    /**
     * Chuẩn hóa URL (loại bỏ params không cần thiết)
     */
    normalizeUrl(url) {
        try {
            const urlObj = new URL(url);
            // Giữ lại các params quan trọng cho streaming
            if (url.includes('.m3u8') || url.includes('.mpd')) {
                return url;
            }
            // Loại bỏ tracking params
            const trackingParams = [
                'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
                'ref', 'referrer', 'source', 'fbclid', 'gclid', 'msclkid',
                '_ga', '_gl', 'spm', 'scm', 'track', 'tracking'
            ];
            trackingParams.forEach(p => urlObj.searchParams.delete(p));
            return urlObj.toString();
        } catch {
            return url;
        }
    }
};

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UrlParser;
}
