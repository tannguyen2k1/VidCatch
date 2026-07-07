import React from 'react';
import styles from './VideoResult.module.css';

interface StreamInfo {
  format_id: string;
  ext: string;
  quality?: string;
  streamType?: string;
  resolution?: number | string;
  filesize?: number;
  url: string;
}

interface VideoInfo {
  id?: string;
  title: string;
  thumbnail?: string;
  duration?: number;
  uploader?: string;
  view_count?: number;
  description?: string;
  streams: StreamInfo[];
}

interface VideoResultProps {
  video: VideoInfo | null;
  error: string | null;
  originalUrl?: string;
}

type DownloadState = {
  status: 'queued' | 'downloading' | 'muxing' | 'done' | 'error';
  progress?: string;
  speed?: string;
  eta?: string;
  label?: string;
  error?: string;
};

export default function VideoResult({ video, error, originalUrl }: VideoResultProps) {
  const [downloads, setDownloads] = React.useState<Record<string, DownloadState>>({});
  const wsRefs = React.useRef<Record<string, WebSocket>>({});
  if (error) {
    return (
      <div className={`${styles.container} glass-panel`}>
        <div className={styles.error}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (!video) return null;

  // Filter out formats without url
  const validFormats = (video.streams || []).filter(f => f.url);
  
  // Deduplicate to ensure no exact matches show up
  const seenSignatures = new Set();
  const availableFormats = [];
  for (const f of validFormats) {
    const quality = f.quality || (f.resolution ? `${f.resolution}p` : 'Audio');
    const signature = `${quality}-${f.ext}-${f.streamType}`;
    if (!seenSignatures.has(signature)) {
      seenSignatures.add(signature);
      availableFormats.push(f);
    }
  }

  const startDownload = (format: StreamInfo) => {
    const fId = format.format_id;
    const currentStatus = downloads[fId]?.status;
    if (currentStatus === 'queued' || currentStatus === 'downloading' || currentStatus === 'muxing') {
      return; // Already actively downloading
    }

    if (!originalUrl) return;

    setDownloads(prev => ({
      ...prev,
      [fId]: { status: 'queued', label: 'Queued...' }
    }));

    const wsUrl = `ws://localhost:8000/api/ws/download?url=${encodeURIComponent(originalUrl)}&format_id=${encodeURIComponent(fId)}&api_key=dev-local-key`;
    const ws = new WebSocket(wsUrl);
    wsRefs.current[fId] = ws;

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.state === 'done') {
        setDownloads(prev => ({
          ...prev,
          [fId]: { status: 'done', label: 'Download ready' }
        }));
        ws.close();
        // Trigger file save
        window.location.href = `http://localhost:8000${data.file_url}&api_key=dev-local-key`;
      } else if (data.state === 'error') {
        setDownloads(prev => ({
          ...prev,
          [fId]: { status: 'error', error: data.error }
        }));
        ws.close();
      } else {
        setDownloads(prev => ({
          ...prev,
          [fId]: { 
            status: data.state, 
            progress: data.progress, 
            speed: data.speed, 
            eta: data.eta, 
            label: data.label 
          }
        }));
      }
    };

    ws.onerror = () => {
      setDownloads(prev => ({
        ...prev,
        [fId]: { status: 'error', error: 'Connection lost' }
      }));
    };
  };

  const cancelDownload = (formatId: string) => {
    if (wsRefs.current[formatId]) {
      wsRefs.current[formatId].close();
      delete wsRefs.current[formatId];
    }
    setDownloads(prev => {
      const next = { ...prev };
      delete next[formatId];
      return next;
    });
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'Unknown size';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const formatViewCount = (views?: number) => {
    if (!views) return '';
    return new Intl.NumberFormat('en-US').format(views) + ' views';
  };

  return (
    <div className={`${styles.container} glass-panel`}>
      <div className={styles.videoHeader}>
        <div className={styles.thumbnailWrapper}>
          {video.thumbnail && <img src={video.thumbnail} alt={video.title} className={styles.thumbnail} />}
        </div>
        <div className={styles.videoDetails}>
          <h2 className={styles.title}>{video.title}</h2>
          
          <div className={styles.metaInfo}>
            {video.uploader && (
              <span className={styles.metaItem}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                {video.uploader}
              </span>
            )}
            {video.view_count && (
              <span className={styles.metaItem}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                {formatViewCount(video.view_count)}
              </span>
            )}
            {video.duration && (
              <span className={styles.metaItem}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                {Math.floor(video.duration / 60)}:{String(Math.floor(video.duration % 60)).padStart(2, '0')}
              </span>
            )}
          </div>
          {video.description && (
            <p className={styles.description}>
              {video.description.length > 150 ? video.description.slice(0, 150) + '...' : video.description}
            </p>
          )}
        </div>
      </div>

      <div className={styles.formatsSection}>
        <h3 className={styles.formatsTitle}>Download Options ({availableFormats.length})</h3>
        <div className={styles.formatListWrapper}>
          <div className={styles.formatList}>
            {availableFormats.map((format, idx) => (
              <div key={`${format.format_id}-${idx}`} className={styles.formatItem}>
                <div className={styles.formatInfo}>
                  <span className={styles.formatQuality}>
                    {format.quality || (format.resolution ? `${format.resolution}p` : 'Audio')}
                  </span>
                  <span className={styles.formatBadge}>{format.ext.toUpperCase()}</span>
                  {format.streamType && (
                    <span className={`${styles.formatBadge} ${styles.typeBadge}`}>
                      {format.streamType}
                    </span>
                  )}
                  <span className={styles.formatSize}>{formatFileSize(format.filesize)}</span>
                </div>
                {downloads[format.format_id] && downloads[format.format_id].status !== 'done' ? (
                  <div className={styles.downloadProgressContainer}>
                    <div className={styles.progressInfo}>
                      <span className={styles.progressLabel}>{downloads[format.format_id].label || 'Starting...'}</span>
                      <span className={styles.progressStats}>
                        {downloads[format.format_id].progress && `${downloads[format.format_id].progress}`}
                        {downloads[format.format_id].speed && ` • ${downloads[format.format_id].speed}`}
                      </span>
                    </div>
                    <div className={styles.progressBarWrapper}>
                      <div 
                        className={styles.progressBar} 
                        style={{ width: downloads[format.format_id].progress ? downloads[format.format_id].progress : '0%' }}
                      />
                    </div>
                    {downloads[format.format_id].error && (
                      <p className={styles.progressError}>{downloads[format.format_id].error}</p>
                    )}
                    <button 
                      className={`btn btn-secondary ${styles.cancelBtn}`}
                      onClick={() => cancelDownload(format.format_id)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    className={`btn btn-primary ${styles.downloadBtn}`}
                    onClick={() => startDownload(format)}
                    disabled={!originalUrl}
                  >
                    Download
                  </button>
                )}
              </div>
            ))}
            {availableFormats.length === 0 && (
              <p className={styles.noFormats}>No direct download links available.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
