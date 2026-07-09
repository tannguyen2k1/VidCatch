// ============================================================
// Popup Script - Giao diện popup của extension
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    let currentTab = 'current'; // 'current' | 'all'
    let currentVideos = [];

    // Elements
    const videoList = document.getElementById('videoList');
    const emptyState = document.getElementById('emptyState');
    const statusText = document.getElementById('statusText');
    const rescanBtn = document.getElementById('rescanBtn');
    const downloadAllBtn = document.getElementById('downloadAllBtn');
    const actionsBar = document.getElementById('actionsBar');
    const settingsBtn = document.getElementById('settingsBtn');
    const tabs = document.querySelectorAll('.tab');

    // ============================================================
    // Tab switching
    // ============================================================
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentTab = tab.dataset.tab;
            loadVideos();
        });
    });

    // ============================================================
    // Load videos
    // ============================================================
    function loadVideos() {
        videoList.innerHTML = '';
        videoList.appendChild(emptyState);
        emptyState.style.display = 'flex';
        actionsBar.style.display = 'none';

        if (currentTab === 'current') {
            loadCurrentTabVideos();
        } else {
            loadAllTabsVideos();
        }
    }

    async function loadCurrentTabVideos() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) {
                showStatus('❌ Không tìm thấy tab hiện tại');
                return;
            }

            // Yêu cầu content script quét lại, đợi kết quả rồi lấy videos
            chrome.tabs.sendMessage(tab.id, { action: 'scanNow' }, (response) => {
                if (chrome.runtime.lastError) {
                    // Content script chưa được inject, thử inject
                    injectContentScript(tab.id);
                    return;
                }
                // Đợi scanNow hoàn thành rồi lấy videos từ background
                setTimeout(() => {
                    chrome.runtime.sendMessage({ action: 'getVideos' }, (res) => {
                        if (res?.videos) {
                            currentVideos = res.videos;
                            renderVideos(currentVideos);
                        } else {
                            showStatus('📭 Chưa phát hiện video nào');
                        }
                    });
                }, 300);
            });
        } catch (e) {
            showStatus('❌ Lỗi: ' + e.message);
        }
    }

    function loadAllTabsVideos() {
        chrome.runtime.sendMessage({ action: 'getAllVideos' }, (response) => {
            if (response?.videos) {
                const allVideos = response.videos.flatMap(tab =>
                    tab.videos.map(v => ({ ...v, _tabId: tab.tabId }))
                );
                currentVideos = allVideos;
                renderVideos(currentVideos);
            } else {
                showStatus('📭 Chưa phát hiện video nào');
            }
        });
    }

    function injectContentScript(tabId) {
        chrome.scripting.executeScript({
            target: { tabId },
            files: ['content/detector.js', 'content/content.js']
        }).then(() => {
            showStatus('🔄 Đã kích hoạt, đang quét...');
            setTimeout(loadCurrentTabVideos, 500);
        }).catch((err) => {
            showStatus('⚠️ Không thể quét trang này: ' + err.message);
        });
    }

    // ============================================================
    // Render video list
    // ============================================================
    function renderVideos(videos) {
        videoList.innerHTML = '';

        if (!videos || videos.length === 0) {
            videoList.appendChild(emptyState);
            emptyState.style.display = 'flex';
            actionsBar.style.display = 'none';
            showStatus('📭 Chưa phát hiện video nào');
            return;
        }

        emptyState.style.display = 'none';
        actionsBar.style.display = 'block';
        showStatus(`✅ Phát hiện ${videos.length} video`);

        videos.forEach((video, index) => {
            const item = createVideoItem(video, index);
            videoList.appendChild(item);
        });
    }

    function createVideoItem(video, index) {
        const item = document.createElement('div');
        item.className = 'video-item';

        const icon = video.type?.includes('audio') ?
            `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>` :
            `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>`;

        const sourceLabel = getSourceLabel(video.source);
        const ext = getFileExt(video.url);
        const size = formatSize(video.size);

        item.innerHTML = `
      <div class="item-thumb">${icon}</div>
      <div class="item-info">
        <div class="item-title" title="${escapeHtml(video.title)}">${escapeHtml(video.title)}</div>
        <div class="item-meta">
          <span>📌 ${sourceLabel}</span>
          ${ext ? `<span>📦 ${ext}</span>` : ''}
          ${size ? `<span>💾 ${size}</span>` : ''}
        </div>
      </div>
      <div class="item-actions">
        <button class="item-download-btn" data-index="${index}">⬇ Tải</button>
      </div>
    `;

        // Click vào item để download
        item.addEventListener('click', (e) => {
            if (e.target.classList.contains('item-download-btn')) return;
            downloadVideo(video);
        });

        // Nút download
        item.querySelector('.item-download-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            downloadVideo(video);
        });

        return item;
    }

    // ============================================================
    // Download
    // ============================================================
    function downloadVideo(video) {
        const btn = document.querySelector(`.item-download-btn[data-index]`);
        if (btn) {
            btn.textContent = '⏳';
            btn.classList.add('downloading');
        }

        chrome.runtime.sendMessage({
            action: 'downloadVideo',
            videoUrl: video.url,
            fileName: video.title,
            options: { saveAs: true }
        }, (response) => {
            if (btn) {
                btn.classList.remove('downloading');
                if (response?.success) {
                    btn.textContent = '✅';
                    setTimeout(() => { btn.textContent = '⬇ Tải'; }, 2000);
                } else {
                    btn.textContent = '❌';
                    setTimeout(() => { btn.textContent = '⬇ Tải'; }, 2000);
                    console.error('Download failed:', response?.error);
                }
            }
        });
    }

    function downloadAllVideos() {
        if (currentVideos.length === 0) return;

        if (currentVideos.length > 5) {
            if (!confirm(`Bạn có chắc muốn tải ${currentVideos.length} video cùng lúc?`)) return;
        }

        currentVideos.forEach((video, i) => {
            setTimeout(() => {
                chrome.runtime.sendMessage({
                    action: 'downloadVideo',
                    videoUrl: video.url,
                    fileName: video.title,
                    options: { saveAs: i === 0 } // Chỉ hỏi nơi lưu cho video đầu tiên
                });
            }, i * 300); // Delay giữa các download
        });

        showStatus(`🔄 Đang tải ${currentVideos.length} video...`);
    }

    // ============================================================
    // Event Listeners
    // ============================================================
    rescanBtn.addEventListener('click', () => {
        showStatus('🔍 Đang quét lại...');
        loadVideos();
    });

    downloadAllBtn.addEventListener('click', downloadAllVideos);

    settingsBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'openOptions' });
    });

    // ============================================================
    // Helpers
    // ============================================================
    function showStatus(text) {
        statusText.textContent = text;
    }

    function formatSize(bytes) {
        if (!bytes || bytes === 0) return '';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    }

    function getFileExt(url) {
        try {
            const pathname = new URL(url).pathname;
            const ext = pathname.split('.').pop()?.split('?')[0];
            return ext?.toUpperCase() || '';
        } catch { return ''; }
    }

    function getSourceLabel(source) {
        const labels = {
            'video-element': 'HTML5 Video',
            'video-currentSrc': 'Đang phát',
            'video-source': 'Video Source',
            'audio-element': 'Audio',
            'audio-source': 'Audio Source',
            'iframe-embed': 'Nhúng',
            'jwplayer': 'JW Player',
            'videojs': 'VideoJS',
            'network': 'Network',
            'video-link': 'Link'
        };
        return labels[source] || source || 'Unknown';
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ============================================================
    // Init
    // ============================================================
    loadVideos();
});
