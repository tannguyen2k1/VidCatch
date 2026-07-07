// config.js
// Nơi chứa các cấu hình dùng chung cho toàn bộ Extension
export const DEFAULT_API_BASE_URL = 'http://localhost:8000';
export const API_BASE_URL = DEFAULT_API_BASE_URL;
export const DEFAULT_API_KEY = 'dev-local-key';

export function normalizeApiBaseUrl(value) {
  const trimmed = (value || '').trim().replace(/\/+$/, '');
  if (!trimmed) return DEFAULT_API_BASE_URL;
  if (!/^https?:\/\//i.test(trimmed)) return `http://${trimmed}`;
  return trimmed;
}

export function getStoredSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get('settings', (data) => resolve(data.settings || {}));
  });
}

export async function getApiBaseUrl() {
  const settings = await getStoredSettings();
  return normalizeApiBaseUrl(settings.backendUrl);
}

export async function getApiKey() {
  const settings = await getStoredSettings();
  return (settings.apiKey || DEFAULT_API_KEY).trim();
}

export async function getAuthHeaders() {
  const apiKey = await getApiKey();
  return apiKey ? { 'X-API-Key': apiKey } : {};
}

export async function buildApiUrl(path, params = {}) {
  const url = new URL(path, await getApiBaseUrl());
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  });
  return url.toString();
}

export async function fetchApi(path, params = {}, options = {}) {
  const headers = {
    ...(await getAuthHeaders()),
    ...(options.headers || {}),
  };
  return fetch(await buildApiUrl(path, params), {
    ...options,
    headers,
  });
}

export function toWebSocketBaseUrl(apiBaseUrl) {
  return normalizeApiBaseUrl(apiBaseUrl).replace(/^http/i, 'ws');
}
