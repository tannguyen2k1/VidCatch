import { fetchApi } from '../utils/config.js';
import { createMediaStreamRecord, isMediaRequest } from './lib/mediaDetection.js';
import {
  getSerializableDownloads,
  startBackgroundDownload,
  stopBackgroundDownload,
} from './lib/downloadSocket.js';


const tabMediaState = {};
const backendCache = {};
const tabMediaStreams = {};
const activeDownloads = {};

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


async function prefetchFromBackend(tabId, url, referer = '') {
  if (!url || url.startsWith('chrome://') || url.startsWith('edge://')) return;

  backendCache[tabId] = { status: 'scanning' };

  try {
    const response = await fetchApi('/api/extract', { url, referer });
    const data = await response.json();
    if (data && data.streams && data.streams.length > 0) {
      backendCache[tabId] = { status: 'done', data };
    } else {
      backendCache[tabId] = { status: 'error', error: 'No videos found' };
    }
  } catch (err) {
    backendCache[tabId] = { status: 'error', error: err.toString() };
  }
}


function rememberMediaStream(tabId, details, tabUrl = '') {
  if (!tabMediaStreams[tabId]) tabMediaStreams[tabId] = [];

  if (!tabMediaStreams[tabId].some((stream) => stream.url === details.url)) {
    tabMediaStreams[tabId].push(createMediaStreamRecord(details, tabUrl));
  }
}


function markTabHasMedia(tabId) {
  if (tabMediaState[tabId]) return;

  tabMediaState[tabId] = true;
  chrome.action.setIcon({
    tabId,
    path: COLOR_ICONS
  });
}


function checkMediaRequest(details) {
  const tabId = details.tabId;
  if (tabId === -1 || !isMediaRequest(details)) return;

  chrome.tabs.get(tabId, (tab) => {
    if (!chrome.runtime.lastError && tab && tab.url) {
      rememberMediaStream(tabId, details, tab.url);
      markTabHasMedia(tabId);

      if (!backendCache[tabId]) {
        prefetchFromBackend(tabId, tab.url, tab.url);
      }
    } else {
      rememberMediaStream(tabId, details);
    }
  });
}


chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading' && changeInfo.url) {
    tabMediaState[tabId] = false;
    delete backendCache[tabId];
    delete tabMediaStreams[tabId];
    chrome.action.setIcon({
      tabId,
      path: GRAY_ICONS
    });
  }
});


chrome.tabs.onRemoved.addListener((tabId) => {
  delete tabMediaState[tabId];
  delete backendCache[tabId];
  delete tabMediaStreams[tabId];
});


chrome.webRequest.onHeadersReceived.addListener(
  checkMediaRequest,
  { urls: ["<all_urls>"] },
  ["responseHeaders"]
);


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
    sendResponse(getSerializableDownloads(activeDownloads));
  } else if (message.action === 'START_DOWNLOAD') {
    startBackgroundDownload(message, activeDownloads)
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  } else if (message.action === 'CLEAR_DOWNLOAD') {
    delete activeDownloads[message.vidId];
    sendResponse({ success: true });
  } else if (message.action === 'STOP_DOWNLOAD') {
    stopBackgroundDownload(message.vidId, activeDownloads)
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }
  return true;
});
