<script>
  import { onMount } from "svelte";
  import Options from "../options/Options.svelte";
  import Thumbnail from "./components/Thumbnail.svelte";
  import { getApiBaseUrl, getApiKey } from "../utils/config.js";
  import { getPageFavicon } from "../utils/video.js";
  import { checkBackendHealth as checkBackendHealthRequest, scanVideos } from "./lib/scan.js";
  import { startVideoDownload } from "./lib/downloads.js";
  import { clearTitleEdit, saveEditedTitle, startTitleEdit as createTitleEdit } from "./lib/titleEditing.js";

  let videos = [];
  let loading = true;
  let statusText = "";
  let currentView = "main"; // 'main' | 'settings'
  let deepScanning = false;
  let tabUrl = "";
  let tabFavicon = "";
  let apiBaseUrl = "";
  let apiKey = "";
  let backendStatusText = "";
  let videoProgress = {};
  let editingVideoId = null;
  let editingTitle = "";

  let activeTabId = null;

  onMount(async () => {
    chrome.storage.local.get("settings", (data) => {
      let theme = "system";
      if (data.settings && data.settings.theme) {
        theme = data.settings.theme;
      }
      if (theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    });

    try {
      apiBaseUrl = await getApiBaseUrl();
      apiKey = await getApiKey();
      await checkBackendHealth();

      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tab && tab.url && tab.url.startsWith("http")) {
        tabUrl = tab.url;
        tabFavicon = tab.favIconUrl || getPageFavicon(tab.url);
        if (!tabFavicon && tab.url) {
          try {
            tabFavicon = new URL("/favicon.ico", tab.url).href;
          } catch {}
        }
        activeTabId = tab.id;
        const pollBackground = () => {
          chrome.runtime.sendMessage(
            { action: "GET_PREFETCH", tabId: tab.id },
            async (response) => {
              if (!chrome.runtime.lastError && response) {
                if (response.status === "done" && response.data) {
                  await deepScanServer(response.data, response.rawStreams || []);
                } else if (response.status === "scanning") {
                  setTimeout(pollBackground, 500);
                } else {
                  await deepScanServer(null, response.rawStreams || []);
                }
              } else {
                await deepScanServer();
              }
            },
          );
        };
        pollBackground();
        
        // Fetch existing background downloads
        chrome.runtime.sendMessage({ action: "GET_DOWNLOADS" }, (response) => {
          if (response) {
            videoProgress = { ...videoProgress, ...response };
          }
        });
      } else {
        statusText = "Please open a valid web page.";
        loading = false;
      }
    } catch (e) {
      statusText = "Extension Error: " + e.message;
      loading = false;
    }

    // Listen for progress updates from background.js
    const messageListener = (message) => {
      if (message.action === "DOWNLOAD_PROGRESS" && message.vidId) {
        videoProgress = {
          ...videoProgress,
          [message.vidId]: message.state
        };
      }
    };
    chrome.runtime.onMessage.addListener(messageListener);

    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  });

  async function checkBackendHealth() {
    backendStatusText = await checkBackendHealthRequest(apiBaseUrl);
  }

  async function deepScanServer(prefetchedData = null, rawStreams = []) {
    deepScanning = true;
    loading = true;

    try {
      const result = await scanVideos({
        apiBaseUrl,
        tabUrl,
        activeTabId,
        prefetchedData,
        rawStreams,
        backendStatusText,
      });
      videos = result.videos;
      statusText = result.statusText;
    } finally {
      deepScanning = false;
      loading = false;
    }
  }

  function downloadVideo(videoGroup) {
    const progress = startVideoDownload({ videoGroup, tabUrl, apiBaseUrl, apiKey });
    if (progress) {
      videoProgress = {
        ...videoProgress,
        [progress.vidId]: progress.state,
      };
    }
  }

  function formatDuration(seconds) {
    if (!seconds || isNaN(seconds)) return "00:00";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0)
      return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }

  function getQualityLabel(video) {
    return video.quality || (video.resolution ? video.resolution + "p" : "");
  }

  function formatSize(bytes) {
    if (!bytes) return "";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    if (bytes < 1024 * 1024 * 1024)
      return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
  }

  function getVideoFormat(video) {
    return video.ext.toUpperCase();
  }
  function isAudioOnly(video) {
    return video.streamType === "audio";
  }

  function getDisplayTitle(videoGroup) {
    return videoGroup.title;
  }

  function startEditTitle(videoGroup) {
    const state = createTitleEdit(videoGroup);
    editingVideoId = state.editingVideoId;
    editingTitle = state.editingTitle;
  }

  function saveEditTitle(videoGroup) {
    const state = saveEditedTitle(videoGroup, editingTitle, videos);
    videos = state.videos;
    editingVideoId = state.editingVideoId;
    editingTitle = state.editingTitle;
  }

  function cancelEditTitle() {
    const state = clearTitleEdit();
    editingVideoId = state.editingVideoId;
    editingTitle = state.editingTitle;
  }

  function handleEditKeydown(event, videoGroup) {
    if (event.key === "Enter") {
      event.preventDefault();
      event.target.blur();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelEditTitle();
    }
  }

  function focusOnMount(node) {
    node.focus();
    node.select();
  }
</script>

{#if currentView === "main"}
  <div class="flex flex-col h-[500px] bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 font-sans">
    <!-- Header -->
    <header
      class="bg-blue-600 text-white p-3 flex justify-between items-center shadow-md z-10"
    >
      <div class="flex items-center gap-2">
        <svg
          class="w-6 h-6"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        <h1 class="font-bold text-lg m-0">VidCatch Pro</h1>
      </div>
      <div class="flex items-center gap-1">
        <button
          class="p-1 hover:bg-blue-700 rounded transition"
          title="Settings"
          on:click={() => (currentView = "settings")}
        >
          <svg
            class="w-5 h-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <circle cx="12" cy="12" r="3" />
            <path
              d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
            />
          </svg>
        </button>
      </div>
    </header>

    {#if statusText || backendStatusText}
      <div
        class="px-3 py-2 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 text-[12px] text-gray-700 dark:text-gray-300 leading-snug"
      >
        {statusText || backendStatusText}
      </div>
    {/if}

    <!-- Video List -->
    <div class="flex-1 overflow-y-auto p-2 space-y-2">
      {#if loading}
        <div
          class="h-full flex flex-col items-center justify-center text-blue-500"
        >
          <svg
            class="animate-spin h-10 w-10 mb-2"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              class="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              stroke-width="4"
            ></circle>
            <path
              class="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
          <p class="font-medium text-sm text-gray-600 dark:text-gray-400">Scanning video...</p>
        </div>
      {:else if videos.length === 0}
        <div
          class="h-full flex flex-col items-center justify-center text-gray-400"
        >
          <svg
            class="w-12 h-12 mb-2"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
            <line x1="7" y1="2" x2="7" y2="22" />
            <line x1="17" y1="2" x2="17" y2="22" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <line x1="2" y1="7" x2="7" y2="7" />
            <line x1="2" y1="17" x2="7" y2="17" />
            <line x1="17" y1="7" x2="22" y2="7" />
            <line x1="17" y1="17" x2="22" y2="17" />
          </svg>
          <p class="font-medium">No videos detected</p>
        </div>
      {:else}
        {#each videos as videoGroup}
          {@const video = videoGroup.streams[videoGroup.selectedStreamIndex]}
          <div
            class="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 flex gap-4 relative group"
          >
            <!-- Close button -->
            <button
              class="absolute top-2 right-2 text-gray-400 hover:text-gray-600 dark:text-gray-400 p-1"
              title="Remove"
              on:click={() => {
                videos = videos.filter((v) => v !== videoGroup);
              }}
            >
              <svg
                class="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                ><path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M6 18L18 6M6 6l12 12"
                ></path></svg
              >
            </button>

            <Thumbnail {videoGroup} {video} {tabFavicon} {formatDuration} />

            <!-- Chi tiết Video -->
            <div class="flex-1 min-w-0 flex flex-col justify-between py-0.5">
              <!-- Dòng tiêu đề -->
              <div class="pr-6 flex items-center gap-1.5 mb-1">
                <span
                  class="text-[10px] border border-[#3081C4] text-[#3081C4] px-1 py-0.5 rounded font-medium shrink-0 leading-none bg-blue-50 dark:bg-blue-950"
                  >{getVideoFormat(video)}</span
                >
                {#if editingVideoId === videoGroup.id}
                  <input
                    type="text"
                    class="flex-1 min-w-0 text-[13px] font-medium leading-none px-1.5 py-0.5 border border-blue-400 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    bind:value={editingTitle}
                    on:keydown={(e) => handleEditKeydown(e, videoGroup)}
                    on:blur={() => saveEditTitle(videoGroup)}
                    use:focusOnMount
                  />
                {:else}
                  <span
                    class="font-medium text-[13px] leading-none text-gray-800 dark:text-gray-200 line-clamp-2"
                    title={videoGroup.title}>{getDisplayTitle(videoGroup)}</span
                  >
                {/if}
              </div>

              <!-- Dòng nút chức năng -->
              <div
                class="flex justify-between items-center mt-auto flex-wrap gap-y-1"
              >
                <div class="flex gap-1.5">
                  <!-- Nút Edit -->
                  <button
                    type="button"
                    aria-label="Edit video title"
                    title="Edit video title"
                    class="p-1 border border-gray-300 dark:border-gray-600 rounded text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-900 flex items-center justify-center bg-white dark:bg-gray-800 shadow-sm h-[26px] w-[28px] shrink-0 {editingVideoId === videoGroup.id ? 'border-blue-400 text-blue-600' : ''}"
                    on:click|stopPropagation={() => startEditTitle(videoGroup)}
                  >
                    <svg
                      class="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      ><path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5h.036l13.696-13.696z"
                      ></path></svg
                    >
                  </button>
                  <!-- Nút định dạng (Custom Dropdown) -->
                  <div class="relative">
                    <button
                      type="button"
                      class="border border-gray-300 dark:border-gray-600 rounded flex items-center justify-between text-[11px] h-[26px] bg-white dark:bg-gray-800 px-2 hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-900 min-w-[110px] shadow-sm transition-colors"
                      on:click|stopPropagation={() => videoGroup.dropdownOpen = !videoGroup.dropdownOpen}
                    >
                      <span class="font-medium text-gray-700 dark:text-gray-300 truncate mr-2 flex items-center gap-1">
                        {getQualityLabel(videoGroup.streams[videoGroup.selectedStreamIndex]) || getVideoFormat(videoGroup.streams[videoGroup.selectedStreamIndex])} 
                        <span class="text-[9px] text-gray-400 font-normal uppercase">{getVideoFormat(videoGroup.streams[videoGroup.selectedStreamIndex])}</span>
                      </span>
                      <svg class="w-3 h-3 text-gray-400 shrink-0 transform transition-transform duration-200 {videoGroup.dropdownOpen ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                    </button>
                    
                    {#if videoGroup.dropdownOpen}
                      <!-- Backdrop để click ra ngoài thì đóng -->
                      <!-- svelte-ignore a11y-click-events-have-key-events -->
                      <!-- svelte-ignore a11y-no-static-element-interactions -->
                      <div class="fixed inset-0 z-40" on:click|stopPropagation={() => videoGroup.dropdownOpen = false}></div>
                      
                      <!-- Menu Dropdown -->
                      <div class="absolute top-[calc(100%+4px)] left-0 w-[200px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-xl z-[100] overflow-hidden flex flex-col max-h-[220px] origin-top-left animate-in fade-in zoom-in-95 duration-100">
                        <div class="bg-gray-50 dark:bg-gray-900 px-2.5 py-1.5 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                          <span class="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Select Quality</span>
                          <span class="text-[9px] text-gray-400">{videoGroup.streams.length} options</span>
                        </div>
                        <div class="overflow-y-auto overscroll-contain">
                          {#each videoGroup.streams as stream, i}
                            <button
                              type="button"
                              class="w-full text-left px-2.5 py-1.5 text-[11px] hover:bg-blue-50 dark:hover:bg-gray-700 flex items-center justify-between border-b border-gray-100 dark:border-gray-700/50 last:border-0 transition-colors {videoGroup.selectedStreamIndex === i ? 'bg-blue-50/70 dark:bg-gray-700/80' : ''}"
                              on:click|stopPropagation={() => {
                                videoGroup.selectedStreamIndex = i;
                                videoGroup.dropdownOpen = false;
                              }}
                            >
                              <div class="flex items-center gap-1.5 truncate">
                                {#if videoGroup.selectedStreamIndex === i}
                                  <svg class="w-3 h-3 text-blue-600 dark:text-blue-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                {:else}
                                  <div class="w-3 shrink-0"></div>
                                {/if}
                                <span class="font-medium text-gray-700 dark:text-gray-300 {videoGroup.selectedStreamIndex === i ? 'text-blue-700 dark:text-blue-400' : ''}">
                                  {getQualityLabel(stream) || "Unknown"}
                                </span>
                                <span class="text-[9px] text-gray-400 uppercase font-medium">{getVideoFormat(stream)}</span>
                              </div>
                              {#if stream.size > 0}
                                <span class="text-[10px] text-gray-500 dark:text-gray-400 shrink-0 font-medium">{formatSize(stream.size)}</span>
                              {/if}
                            </button>
                          {/each}
                        </div>
                      </div>
                    {/if}
                  </div>
                </div>

                <!-- Nút Download / Progress -->
                {#if videoProgress[video._dedupUrl || video.url]}
                  <button
                    class="relative h-[28px] w-[96px] rounded-full overflow-hidden shadow-sm bg-blue-100 text-blue-800 flex items-center justify-center text-[11px] font-semibold transition-opacity disabled:opacity-100 hover:opacity-80 disabled:hover:opacity-100"
                    disabled={videoProgress[video._dedupUrl || video.url].state === 'downloading' || videoProgress[video._dedupUrl || video.url].state === 'muxing' || videoProgress[video._dedupUrl || video.url].state === 'saving'}
                    on:click|stopPropagation={() => {
                      const state = videoProgress[video._dedupUrl || video.url].state;
                      if (state === 'done' || state === 'error') {
                        // Clear the state locally and in background
                        const vidId = video._dedupUrl || video.url;
                        videoProgress = { ...videoProgress };
                        delete videoProgress[vidId];
                        chrome.runtime.sendMessage({ action: "CLEAR_DOWNLOAD", vidId: vidId });
                      }
                    }}
                  >
                    <div
                      class="absolute inset-y-0 left-0 transition-all duration-300 {videoProgress[
                        video._dedupUrl || video.url
                      ].state === 'error'
                        ? 'bg-red-300'
                        : 'bg-blue-300'}"
                      style={`width: ${videoProgress[video._dedupUrl || video.url].progress}%`}
                    ></div>
                    <span class="relative z-10 truncate px-1" title={videoProgress[video._dedupUrl || video.url].label}>
                      {videoProgress[video._dedupUrl || video.url].label}
                    </span>
                  </button>
                {:else}
                  <button
                    class="{video.streamType === 'audio'
                      ? 'bg-gray-50 dark:bg-gray-9000 hover:bg-gray-600'
                      : 'bg-[#3081C4] hover:bg-[#2970AA]'} text-white px-4 h-[28px] rounded-full text-[12px] font-medium transition flex items-center gap-1.5 shadow-sm"
                    on:click|stopPropagation={() => downloadVideo(videoGroup)}
                  >
                    <svg
                      class="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      ><path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                      ></path></svg
                    >
                    {video.streamType === "audio" ? "Audio" : "Download"}
                  </button>
                {/if}
              </div>
            </div>
          </div>
        {/each}
      {/if}
    </div>
  </div>
{:else}
  <div class="flex flex-col h-[500px] bg-gray-50 dark:bg-gray-900 font-sans">
    <header
      class="bg-blue-600 text-white p-3 flex items-center shadow-md z-10 gap-3"
    >
      <button
        class="p-1 hover:bg-blue-700 rounded transition flex items-center justify-center"
        on:click={() => (currentView = "main")}
        title="Back"
      >
        <svg
          class="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          ><path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M10 19l-7-7m0 0l7-7m-7 7h18"
          ></path></svg
        >
      </button>
      <h1 class="font-bold text-lg m-0">Settings</h1>
    </header>
    <div class="flex-1 overflow-y-auto">
      <Options />
    </div>
  </div>
{/if}
