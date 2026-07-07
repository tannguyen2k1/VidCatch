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
}

export default function VideoResult({ video, error }: VideoResultProps) {
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
                <a 
                  href={format.url} 
                  target="_blank" 
                  rel="noreferrer" 
                  className={`btn btn-primary ${styles.downloadBtn}`}
                >
                  Download
                </a>
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
