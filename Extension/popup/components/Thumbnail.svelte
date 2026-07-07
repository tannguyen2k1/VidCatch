<script>
  export let videoGroup;
  export let video;
  export let tabFavicon = "";
  export let formatDuration;
</script>

<div
  class="w-28 h-16 bg-black rounded shrink-0 relative overflow-hidden flex items-center justify-center"
>
  {#if videoGroup.thumbnail}
    <img
      src={videoGroup.thumbnail}
      alt="Thumbnail"
      class="w-full h-full object-cover opacity-80"
    />
  {:else if video.url && (video.url.includes(".mp4") || video.url.includes(".webm") || video.type?.includes("mp4") || video.type?.includes("webm")) && !video.url.includes(".m3u8") && !video.url.includes(".mpd")}
    <video
      src={video.url}
      class="w-full h-full object-cover opacity-80"
      preload="metadata"
      muted
      playsinline
    ></video>
  {:else if tabFavicon}
    <img
      src={tabFavicon}
      alt="Site favicon"
      class="w-10 h-10 object-contain opacity-90"
    />
  {:else}
    <svg
      class="w-8 h-8 text-white opacity-20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
    >
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  {/if}
  <div
    class="absolute bottom-1 left-1 flex gap-1 items-center bg-black/80 text-white text-[10px] px-1 py-0.5 rounded shadow-sm"
  >
    {#if tabFavicon}
      <img
        src={tabFavicon}
        alt=""
        class="w-3.5 h-3.5 rounded-full bg-white dark:bg-gray-800 shrink-0"
      />
    {:else}
      <svg
        class="w-3.5 h-3.5 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-full p-0.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        ><circle cx="12" cy="12" r="10" /><line
          x1="2"
          y1="12"
          x2="22"
          y2="12"
        /><path
          d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
        /></svg
      >
    {/if}

    {#if videoGroup.duration > 0}
      <span class="font-medium ml-0.5"
        >{formatDuration(videoGroup.duration)}</span
      >
    {/if}
  </div>
</div>
