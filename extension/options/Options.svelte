<script>
  import { onMount } from 'svelte';

  import { DEFAULT_API_BASE_URL, DEFAULT_API_KEY, normalizeApiBaseUrl } from '../utils/config.js';

  const defaultSettings = {
    theme: 'light',
    backendUrl: DEFAULT_API_BASE_URL,
    apiKey: DEFAULT_API_KEY,
    downloadSubdirectory: '',
    showPrivateNotification: false
  };

  let settings = { ...defaultSettings };
  let toastMsg = '';
  let loaded = false;
  let backendTestStatus = '';

  function showToast(msg) {
    toastMsg = msg;
    setTimeout(() => toastMsg = '', 3000);
  }

  onMount(() => {
    chrome.storage.local.get('settings', (data) => {
      if (data.settings) {
        settings = { ...defaultSettings, ...data.settings };
      }
      loaded = true;
    });
  });

  // Automatically save settings whenever they change
  $: {
    if (loaded && settings) {
      chrome.storage.local.set({
        settings: {
          ...settings,
          backendUrl: normalizeApiBaseUrl(settings.backendUrl),
          apiKey: (settings.apiKey || '').trim(),
        }
      });
      // Apply theme immediately
      if (settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  }

  function openBrowserDownloads() {
    chrome.tabs.create({ url: 'chrome://settings/downloads' });
  }

  function openExtensionSettings() {
    chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
  }

  async function testBackendConnection() {
    backendTestStatus = 'Checking...';
    try {
      const url = new URL('/api/health', normalizeApiBaseUrl(settings.backendUrl));
      const response = await fetch(url.toString(), {
        headers: settings.apiKey ? { 'X-API-Key': settings.apiKey.trim() } : {},
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      backendTestStatus = data.status === 'ok'
        ? `Backend is reachable. Queue: ${data.queue_size || 0}, active: ${data.active_downloads || 0}.`
        : `Backend is reachable but degraded: ${data.ffmpeg || 'unknown issue'}`;
    } catch (error) {
      backendTestStatus = `Backend is not reachable: ${error.message}`;
    }
  }
</script>

<div class="p-4 text-gray-800 dark:text-gray-200 font-sans pb-10 bg-[#f9f9f9] dark:bg-gray-900 min-h-screen">
  <div class="max-w-2xl mx-auto space-y-4">
    
    <!-- Version -->
    <div class="bg-white dark:bg-gray-800 p-5 rounded shadow-sm border border-gray-200 dark:border-gray-700">
      <h2 class="text-xl font-bold mb-4 text-gray-900 dark:text-white">Version</h2>
      <p class="text-[15px]">VidCatch: <strong>v1.0.0</strong></p>
    </div>

    <!-- Theme Configuration -->
    <div class="bg-white dark:bg-gray-800 p-5 rounded shadow-sm border border-gray-200 dark:border-gray-700">
      <h2 class="text-xl font-bold mb-4 text-gray-900 dark:text-white">Theme</h2>
      <div class="flex gap-6 mb-2">
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="radio" bind:group={settings.theme} value="light" class="w-4 h-4 text-blue-600 focus:ring-blue-500">
          <span class="text-[15px] text-gray-800 dark:text-gray-200">Light</span>
        </label>
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="radio" bind:group={settings.theme} value="dark" class="w-4 h-4 text-blue-600 focus:ring-blue-500">
          <span class="text-[15px] text-gray-800 dark:text-gray-200">Dark</span>
        </label>
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="radio" bind:group={settings.theme} value="system" class="w-4 h-4 text-blue-600 focus:ring-blue-500">
          <span class="text-[15px] text-gray-800 dark:text-gray-200">System</span>
        </label>
      </div>
    </div>

    <!-- Backend Server -->
    <div class="bg-white dark:bg-gray-800 p-5 rounded shadow-sm border border-gray-200 dark:border-gray-700">
      <h2 class="text-xl font-bold mb-4 text-gray-900 dark:text-white">Backend Server</h2>
      <p class="text-[15px] mb-4 text-gray-800 dark:text-gray-200 leading-relaxed">
        VidCatch uses a local backend for yt-dlp and FFmpeg downloads. Change this if your server runs on another port or host.
      </p>

      <div class="flex items-center gap-2 mb-3">
        <span class="text-[15px] shrink-0">Server URL:</span>
        <input type="text" bind:value={settings.backendUrl} placeholder={DEFAULT_API_BASE_URL} class="flex-1 p-1 border border-gray-400 dark:border-gray-500 rounded outline-none text-[15px]">
        <button type="button" on:click={testBackendConnection} class="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-[#f8f9fa] dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-[15px]">
          Test
        </button>
      </div>

      <div class="flex items-center gap-2 mb-3">
        <span class="text-[15px] shrink-0">API key:</span>
        <input type="password" bind:value={settings.apiKey} placeholder="API key" class="flex-1 p-1 border border-gray-400 dark:border-gray-500 rounded outline-none text-[15px]">
      </div>

      {#if backendTestStatus}
        <p class="text-[13px] text-gray-600 dark:text-gray-400">{backendTestStatus}</p>
      {/if}
    </div>

    <!-- Download Directory -->
    <div class="bg-white dark:bg-gray-800 p-5 rounded shadow-sm border border-gray-200 dark:border-gray-700">
      <h2 class="text-xl font-bold mb-4 text-gray-900 dark:text-white">Download Directory</h2>
      <p class="text-[15px] mb-4 text-gray-800 dark:text-gray-200 leading-relaxed">
        Videos are downloaded in the default browser download directory. You can also specifify a sub-directory. Website-specific download directories can be set with the smartnaming tool.
      </p>
      
      <button on:click={openBrowserDownloads} class="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-[#f8f9fa] dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-[15px] mb-4">
        Change browser download directory
      </button>

      <div class="flex items-center gap-2 mb-4">
        <span class="text-[15px]">Download subdirectory:</span>
        <input type="text" bind:value={settings.downloadSubdirectory} placeholder="MyVideos/" class="flex-1 p-1 border border-gray-400 dark:border-gray-500 rounded outline-none text-[15px]">
      </div>

    </div>

    <!-- Private browsing -->
    <div class="bg-white dark:bg-gray-800 p-5 rounded shadow-sm border border-gray-200 dark:border-gray-700">
      <h2 class="text-xl font-bold mb-4 text-gray-900 dark:text-white">Private browsing</h2>
      
      <div class="border-l-2 border-orange-500 pl-3 mb-4">
        <p class="text-[15px] text-gray-800 dark:text-gray-200 flex items-start gap-2 mb-2">
          <svg class="w-5 h-5 text-orange-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
          <span>VidCatch is not enabled in a Private/Incognito windows. You need to turn on that option manually (this is not required).</span>
        </p>
        <button on:click={openExtensionSettings} class="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-[#f8f9fa] dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-[15px]">
          Change private browsing setting
        </button>
      </div>

      <label class="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" bind:checked={settings.showPrivateNotification} class="w-4 h-4 rounded border-gray-300 dark:border-gray-600">
        <span class="text-[15px]">Show notification for private downloads</span>
      </label>
    </div>

  </div>

  {#if toastMsg}
    <div class="fixed bottom-4 right-4 bg-gray-800 text-white px-4 py-2 rounded shadow-lg transition-opacity duration-300 z-50">
      {toastMsg}
    </div>
  {/if}
</div>
