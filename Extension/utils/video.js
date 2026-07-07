export function sanitizeDownloadFilename(title, fallback = 'video') {
  const safeTitle = (title || fallback)
    .substring(0, 100)
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim();
  return safeTitle || fallback;
}

export function getPageFavicon(url) {
  try {
    const parsed = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${parsed.hostname}&sz=128`;
  } catch {
    return '';
  }
}

export function normalizeRawStream(rawStream) {
  if (typeof rawStream === 'string') {
    return { url: rawStream };
  }
  return rawStream || {};
}

export function normalizeExtractionResult(data, sourceUrl) {
  const title = data.title || 'Extracted Video';
  const streams = (data.streams || []).map((stream, index) => ({
    url: stream.url,
    title,
    type: stream.streamType === 'audio' ? 'audio/mp4' : 'video/mp4',
    size: stream.filesize || 0,
    source: 'server-extractor',
    quality: stream.quality,
    streamType: stream.streamType,
    thumbnail: data.thumbnail || '',
    duration: data.duration || 0,
    resolution: stream.resolution || 0,
    ext: stream.ext,
    format_id: stream.format_id,
    _sourceUrl: sourceUrl,
    _dedupUrl: `server:${title}:${index}`,
  }));

  return {
    id: `vid_${Date.now()}`,
    title,
    thumbnail: data.thumbnail || '',
    duration: data.duration || 0,
    streams,
    selectedStreamIndex: 0,
    dropdownOpen: false,
  };
}
