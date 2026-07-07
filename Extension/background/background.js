import { fetchApi, getApiBaseUrl, getAuthHeaders } from '../utils/config.js';

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
async function prefetchFromBackend(tabId, url, referer = '') {
  if (!url || url.startsWith('chrome://') || url.startsWith('edge://')) return;
  
  // Mark as scanning to prevent duplicate scans
  backendCache[tabId] = { status: 'scanning' };
  
  try {
    const response = await fetchApi('/api/extract', { url, referer });
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

function getSerializableDownloads() {
  return Object.fromEntries(
    Object.entries(activeDownloads).map(([vidId, state]) => {
      const { ws, ...serializableState } = state;
      return [vidId, serializableState];
    })
  );
}

function getHeaderValue(headers, headerName) {
  const header = headers?.find((item) => item.name.toLowerCase() === headerName.toLowerCase());
  return header?.value || '';
}

function rememberMediaStream(tabId, details, tabUrl = '') {
  if (!tabMediaStreams[tabId]) tabMediaStreams[tabId] = [];

  if (!tabMediaStreams[tabId].some((stream) => stream.url === details.url)) {
    tabMediaStreams[tabId].push({
      url: details.url,
      contentType: getHeaderValue(details.responseHeaders, 'content-type'),
      referer: details.initiator || details.documentUrl || tabUrl,
      tabUrl,
      detectedAt: Date.now(),
    });
  }
}

function notifyDownloadProgress(vidId) {
  const { ws, ...state } = activeDownloads[vidId] || {};
  chrome.runtime
    .sendMessage({ action: "DOWNLOAD_PROGRESS", vidId, state })
    .catch(() => {});
}

async function startBackgroundDownload(message) {
  const { vidId, wsUrl, filename, title, jobId, apiKey } = message;
  const apiBaseUrl = message.apiBaseUrl || await getApiBaseUrl();

  if (activeDownloads[vidId] && activeDownloads[vidId].state !== 'error' && activeDownloads[vidId].state !== 'done') {
    return;
  }

  activeDownloads[vidId] = {
    state: 'downloading',
    progress: 0,
    label: 'Sending...',
    title,
    filename,
    jobId,
    apiBaseUrl,
    speed: '0B/s',
    eta: 'Unknown'
  };

  const ws = new WebSocket(wsUrl);
  activeDownloads[vidId].ws = ws;

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.state === "downloading") {
      const percentRaw = parseFloat(data.progress.replace("%", ""));
      const percent = isNaN(percentRaw) ? 0 : percentRaw;
      activeDownloads[vidId] = { ...activeDownloads[vidId], ws, state: "downloading", progress: percent, label: data.progress, speed: data.speed || '', eta: data.eta || '' };
    } else if (data.state === "muxing") {
      activeDownloads[vidId] = { ...activeDownloads[vidId], ws, state: "muxing", progress: 100, label: data.label || 'Muxing...', speed: '', eta: '' };
    } else if (data.state === "done") {
      activeDownloads[vidId] = { ...activeDownloads[vidId], ws, state: "done", progress: 100, label: "Done!", speed: '', eta: '' };
      const downloadUrl = new URL(data.file_url, apiBaseUrl);
      if (apiKey) {
        downloadUrl.searchParams.set('api_key', apiKey);
      }
      chrome.downloads.download({
        url: downloadUrl.toString(),
        filename,
      }, () => {
        if (chrome.runtime.lastError) {
          console.error("Download failed:", chrome.runtime.lastError.message);
          activeDownloads[vidId] = { ...activeDownloads[vidId], state: "error", progress: 100, label: chrome.runtime.lastError.message };
          notifyDownloadProgress(vidId);
        }
      });
    } else if (data.state === "error") {
      activeDownloads[vidId] = { ...activeDownloads[vidId], ws, state: "error", progress: 100, label: data.error || "Error", speed: '', eta: '' };
    }

    notifyDownloadProgress(vidId);
  };

  ws.onerror = () => {
    if (activeDownloads[vidId]) {
      activeDownloads[vidId] = { ...activeDownloads[vidId], state: "error", progress: 100, label: "WebSocket Error", speed: '', eta: '' };
      notifyDownloadProgress(vidId);
    }
  };

  ws.onclose = () => {
    if (activeDownloads[vidId] && activeDownloads[vidId].state !== 'done' && activeDownloads[vidId].state !== 'error') {
      activeDownloads[vidId] = { ...activeDownloads[vidId], state: "error", progress: 100, label: "Connection Closed", speed: '', eta: '' };
      notifyDownloadProgress(vidId);
    }
  };
}

async function stopBackgroundDownload(vidId) {
  const download = activeDownloads[vidId];
  if (!download) return;

  if (download.jobId && download.apiBaseUrl) {
    try {
      const cancelUrl = new URL('/api/cancel_download', download.apiBaseUrl);
      cancelUrl.searchParams.set('job_id', download.jobId);
      await fetch(cancelUrl.toString(), { method: 'POST', headers: await getAuthHeaders() });
    } catch (error) {
      console.warn('Cancel request failed:', error);
    }
  }

  if (download.ws) {
    download.ws.close();
  }

  activeDownloads[vidId] = { ...download, state: "error", progress: 100, label: "Cancelled", speed: '', eta: '' };
  notifyDownloadProgress(vidId);
}

function checkMediaRequest(details) {
  const tabId = details.tabId;
  if (tabId === -1) return;

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
    chrome.tabs.get(tabId, (tab) => {
      if (!chrome.runtime.lastError && tab && tab.url) {
        rememberMediaStream(tabId, details, tab.url);

        if (!tabMediaState[tabId]) {
          tabMediaState[tabId] = true;
          chrome.action.setIcon({
            tabId: tabId,
            path: COLOR_ICONS
          });
        }

        if (!backendCache[tabId]) {
           prefetchFromBackend(tabId, tab.url, tab.url);
        }
      } else {
        rememberMediaStream(tabId, details);
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
    sendResponse(getSerializableDownloads());
  } else if (message.action === 'START_DOWNLOAD') {
    startBackgroundDownload(message)
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  } else if (message.action === 'CLEAR_DOWNLOAD') {
    delete activeDownloads[message.vidId];
    sendResponse({ success: true });
  } else if (message.action === 'STOP_DOWNLOAD') {
    stopBackgroundDownload(message.vidId)
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }
  return true; // Keep connection open for async response
});
