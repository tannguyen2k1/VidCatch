import { API_BASE_URL } from '../utils/config.js';

// Store state of tabs to check if data is already fetched
const tabMediaState = {};
const backendCache = {}; // Cache for videos scanned in background: backendCache[tabId] = data
const tabMediaStreams = {}; // Cache for intercepted raw media URLs: tabMediaStreams[tabId] = [url1, url2...]
const activeDownloads = {}; // Tracks background downloads: { vidId: { state, progress, label } }

const COLOR_ICONS = {
  16: "/icons/icon16.png",
  48: "/icons/icon48.png",
  128: "/icons/icon128.png"
};

const GRAY_ICONS = {
  16: "/icons/icon16-gray.png",
  48: "/icons/icon48-gray.png",
  128: "/icons/icon128-gray.png"
};

const MEDIA_EXTENSIONS = ['mp4', 'm3u8', 'ts', 'mkv', 'webm', 'flv', 'mpd'];

// Silently call Backend to scan video
async function prefetchFromBackend(tabId, url) {
  if (!url || url.startsWith('chrome://') || url.startsWith('edge://')) return;
  
  // Mark as scanning to prevent duplicate scans
  backendCache[tabId] = { status: 'scanning' };
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/extract?url=${encodeURIComponent(url)}`);
    const data = await response.json();
    if (data && data.streams && data.streams.length > 0) {
      backendCache[tabId] = { status: 'done', data: data };
    } else {
      backendCache[tabId] = { status: 'error', error: 'No videos found' };
    }
  } catch (err) {
    backendCache[tabId] = { status: 'error', error: err.toString() };
  }
}

function checkMediaRequest(details) {
  const tabId = details.tabId;
  if (tabId === -1) return;

  // Skip if already detected
  if (tabMediaState[tabId]) return;

  let isMedia = false;
  
  // Check network file extensions or popular URL patterns
  const url = details.url.toLowerCase();
  const extRegex = new RegExp(`\\.(${MEDIA_EXTENSIONS.join('|')})(\\?|$)`, 'i');
  if (extRegex.test(url)) {
    isMedia = true;
  }
  
  if (!isMedia && (url.includes('videoplayback') || url.includes('.fbcdn.net/v/t39') || url.includes('/video/'))) {
    isMedia = true;
  }

  // Check Content-Type
  if (!isMedia && details.responseHeaders) {
    for (const header of details.responseHeaders) {
      if (header.name.toLowerCase() === 'content-type') {
        const type = header.value.toLowerCase();
        if (type.startsWith('video/') || type.startsWith('audio/') || type.includes('mpegurl') || type.includes('dash+xml')) {
          isMedia = true;
          break;
        }
      }
    }
  }

  if (isMedia) {
    if (!tabMediaStreams[tabId]) tabMediaStreams[tabId] = [];
    if (!tabMediaStreams[tabId].includes(details.url)) {
      tabMediaStreams[tabId].push(details.url);
    }

    tabMediaState[tabId] = true;
    chrome.action.setIcon({
      tabId: tabId,
      path: COLOR_ICONS
    });

    // IMMEDIATELY CALL BACKEND UPON MEDIA DETECTION
    chrome.tabs.get(tabId, (tab) => {
      if (!chrome.runtime.lastError && tab && tab.url) {
        // Only prefetch if not scanned before
        if (!backendCache[tabId]) {
           prefetchFromBackend(tabId, tab.url);
        }
      }
    });
  }
}

// Reset state when tab updates or navigates to another link
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading' && changeInfo.url) {
    tabMediaState[tabId] = false;
    delete backendCache[tabId];
    delete tabMediaStreams[tabId];
    chrome.action.setIcon({
      tabId: tabId,
      path: GRAY_ICONS
    });
  }
});

// Clear cache when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  delete tabMediaState[tabId];
  delete backendCache[tabId];
  delete tabMediaStreams[tabId];
});

// Listen to network stream
chrome.webRequest.onHeadersReceived.addListener(
  checkMediaRequest,
  { urls: ["<all_urls>"] },
  ["responseHeaders"]
);

// Respond to Popup asking if background scan is done
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'GET_PREFETCH') {
    const tabId = message.tabId;
    if (backendCache[tabId]) {
      sendResponse({ ...backendCache[tabId], rawStreams: tabMediaStreams[tabId] || [] });
    } else {
      sendResponse({ status: 'none', rawStreams: tabMediaStreams[tabId] || [] });
    }
  } else if (message.action === 'SAVE_CACHE') {
    const tabId = message.tabId;
    backendCache[tabId] = { status: 'done', data: message.data };
    sendResponse({ success: true });
  } else if (message.action === 'GET_DOWNLOADS') {
    sendResponse(activeDownloads);
  } else if (message.action === 'START_DOWNLOAD') {
    const { vidId, wsUrl, filename, title } = message;
    
    // Only start if not already downloading
    if (!activeDownloads[vidId] || activeDownloads[vidId].state === 'error' || activeDownloads[vidId].state === 'done') {
      activeDownloads[vidId] = { state: 'downloading', progress: 0, label: 'Sending...' };
      
      const ws = new WebSocket(wsUrl);
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.state === "downloading") {
          const percentRaw = parseFloat(data.progress.replace("%", ""));
          const percent = isNaN(percentRaw) ? 0 : percentRaw;
          activeDownloads[vidId] = { state: "downloading", progress: percent, label: data.progress };
        } else if (data.state === "muxing") {
          activeDownloads[vidId] = { state: "muxing", progress: 100, label: data.label || 'Muxing...' };
        } else if (data.state === "done") {
          activeDownloads[vidId] = { state: "done", progress: 100, label: "Done!" };
          chrome.downloads.download({
            url: data.file_url,
            filename: filename,
          }, () => {
             if (chrome.runtime.lastError) {
               console.error("Download failed:", chrome.runtime.lastError.message);
               activeDownloads[vidId] = { state: "error", progress: 100, label: chrome.runtime.lastError.message };
             }
          });
        } else if (data.state === "error") {
          activeDownloads[vidId] = { state: "error", progress: 100, label: data.error || "Error" };
        }
        // Broadcast update to Popup if it's open
        chrome.runtime.sendMessage({ action: "DOWNLOAD_PROGRESS", vidId, state: activeDownloads[vidId] }).catch(() => {});
      };

      ws.onerror = (error) => {
        activeDownloads[vidId] = { state: "error", progress: 100, label: "WebSocket Error" };
        chrome.runtime.sendMessage({ action: "DOWNLOAD_PROGRESS", vidId, state: activeDownloads[vidId] }).catch(() => {});
      };

      ws.onclose = () => {
        // If closed prematurely
        if (activeDownloads[vidId] && activeDownloads[vidId].state !== 'done' && activeDownloads[vidId].state !== 'error') {
           activeDownloads[vidId] = { state: "error", progress: 100, label: "Connection Closed" };
           chrome.runtime.sendMessage({ action: "DOWNLOAD_PROGRESS", vidId, state: activeDownloads[vidId] }).catch(() => {});
        }
      };
    }
    sendResponse({ success: true });
  } else if (message.action === 'CLEAR_DOWNLOAD') {
    delete activeDownloads[message.vidId];
    sendResponse({ success: true });
  }
  return true; // Keep connection open for async response
});
