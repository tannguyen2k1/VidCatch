// ============================================================
// Options Script - Quản lý cài đặt extension
// ============================================================

const defaultSettings = {
    autoDetect: true,
    showOverlay: true,
    minFileSize: 100,
    maxConcurrent: 3,
    downloadPath: '',
    enabledSites: [],
    disabledSites: [],
    videoFormats: ['.mp4', '.webm', '.mkv', '.flv', '.avi', '.mov', '.m3u8', '.ts', '.mpd'],
    audioFormats: ['.mp3', '.aac', '.ogg', '.wav', '.m4a', '.flac']
};

// Elements
const elements = {
    autoDetect: document.getElementById('autoDetect'),
    showOverlay: document.getElementById('showOverlay'),
    minFileSize: document.getElementById('minFileSize'),
    maxConcurrent: document.getElementById('maxConcurrent'),
    downloadPath: document.getElementById('downloadPath'),
    enabledSites: document.getElementById('enabledSites'),
    disabledSites: document.getElementById('disabledSites'),
    videoFormats: document.getElementById('videoFormats'),
    audioFormats: document.getElementById('audioFormats'),
    saveBtn: document.getElementById('saveBtn'),
    resetBtn: document.getElementById('resetBtn')
};

// Load settings
function loadSettings() {
    chrome.storage.local.get('settings', (data) => {
        const settings = data.settings || defaultSettings;

        elements.autoDetect.checked = settings.autoDetect !== false;
        elements.showOverlay.checked = settings.showOverlay !== false;
        elements.minFileSize.value = settings.minFileSize ?? 100;
        elements.maxConcurrent.value = settings.maxConcurrent ?? 3;
        elements.downloadPath.value = settings.downloadPath || '';
        elements.enabledSites.value = (settings.enabledSites || []).join('\n');
        elements.disabledSites.value = (settings.disabledSites || []).join('\n');
        elements.videoFormats.value = (settings.videoFormats || defaultSettings.videoFormats).join('\n');
        elements.audioFormats.value = (settings.audioFormats || defaultSettings.audioFormats).join('\n');
    });
}

// Save settings
function saveSettings() {
    const settings = {
        autoDetect: elements.autoDetect.checked,
        showOverlay: elements.showOverlay.checked,
        minFileSize: parseInt(elements.minFileSize.value) || 100,
        maxConcurrent: parseInt(elements.maxConcurrent.value) || 3,
        downloadPath: elements.downloadPath.value.trim(),
        enabledSites: elements.enabledSites.value
            .split('\n')
            .map(s => s.trim())
            .filter(s => s.length > 0),
        disabledSites: elements.disabledSites.value
            .split('\n')
            .map(s => s.trim())
            .filter(s => s.length > 0),
        videoFormats: elements.videoFormats.value
            .split('\n')
            .map(s => s.trim())
            .filter(s => s.length > 0),
        audioFormats: elements.audioFormats.value
            .split('\n')
            .map(s => s.trim())
            .filter(s => s.length > 0)
    };

    chrome.storage.local.set({ settings }, () => {
        showToast('✅ Đã lưu cài đặt!');
    });
}

// Reset to defaults
function resetSettings() {
    if (!confirm('Khôi phục cài đặt mặc định?')) return;

    elements.autoDetect.checked = true;
    elements.showOverlay.checked = true;
    elements.minFileSize.value = 100;
    elements.maxConcurrent.value = 3;
    elements.downloadPath.value = '';
    elements.enabledSites.value = '';
    elements.disabledSites.value = '';
    elements.videoFormats.value = defaultSettings.videoFormats.join('\n');
    elements.audioFormats.value = defaultSettings.audioFormats.join('\n');

    chrome.storage.local.set({ settings: defaultSettings }, () => {
        showToast('🔄 Đã khôi phục mặc định!');
    });
}

// Toast
function showToast(message) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 2000);
}

// Event Listeners
elements.saveBtn.addEventListener('click', saveSettings);
elements.resetBtn.addEventListener('click', resetSettings);

// Keyboard shortcut: Ctrl+S to save
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveSettings();
    }
});

// Init
loadSettings();
