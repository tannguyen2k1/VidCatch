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

import { useDownload, getSessionId } from '../contexts/DownloadContext';
import { API_BASE_URL } from '../config';
import { toast } from 'react-toastify';

type DownloadState = {
  status: 'queued' | 'downloading' | 'muxing' | 'done' | 'error';
  progress?: string;
  speed?: string;
  eta?: string;
  label?: string;
  error?: string;
  file_url?: string;
  queue_position?: number;
};

export default function VideoResult({ video, error, originalUrl }: VideoResultProps) {
  const { jobs, addJob, cancelJob } = useDownload();

  const formatJobs = React.useMemo(() => {
    const mapping: Record<string, any> = {};
    Object.values(jobs).forEach(job => {
      if (job.url === originalUrl) {
        // Lấy job mới nhất cho format này
        mapping[job.format_id] = job;
      }
    });
    return mapping;
  }, [jobs, originalUrl]);

  const prevStatusRef = React.useRef<Record<string, string>>({});
  React.useEffect(() => {
    Object.values(formatJobs).forEach((job: any) => {
      const currentStatus = job.state || 'queued';
      const prevStatus = prevStatusRef.current[job.format_id];
      
      // Chỉ hiện toast khi mới vào queue và có vị trí rõ ràng
      if (currentStatus === 'queued' && job.queue_position >= 1 && prevStatus !== 'queued') {
        toast.info(`Server đang xử lý nhiều tiến trình. Video của bạn đang ở hàng đợi (Vị trí: ${job.queue_position})`);
      }
      prevStatusRef.current[job.format_id] = currentStatus;
    });
  }, [formatJobs]);

  // Chuyển đổi trạng thái từ Context sang dạng UI cũ để không phải sửa quá nhiều HTML
  const downloads: Record<string, DownloadState> = {};
  for (const fId in formatJobs) {
    const j = formatJobs[fId];
    downloads[fId] = {
      status: j.state as any,
      progress: j.progress,
      speed: j.speed,
      eta: j.eta,
      label: j.label,
      error: j.error,
      file_url: j.file_url,
      queue_position: j.queue_position,
    };
  }

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
    if (!originalUrl) return;
    const currentStatus = downloads[format.format_id]?.status;
    if (currentStatus === 'queued' || currentStatus === 'downloading' || currentStatus === 'muxing') {
      return; // Already actively downloading
    }

    addJob(originalUrl, format.format_id, video.title || 'Video', video.thumbnail);
  };

  const cancelDownload = (formatId: string) => {
    const currentJob = formatJobs[formatId];
    if (currentJob) {
      cancelJob(currentJob.job_id);
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'Unknown size';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const formatViewCount = (views?: number) => {
    if (!views) return '';
    return new Intl.NumberFormat('vi-VN').format(views) + ' lượt xem';
  };

  const getSourceInfo = (url?: string) => {
    if (!url) return null;
    try {
      const host = new URL(url).hostname.replace(/^www\./, '');
      return {
        host,
        favicon: `https://www.google.com/s2/favicons?domain=${host}&sz=64`,
      };
    } catch {
      return null;
    }
  };

  const sourceInfo = getSourceInfo(originalUrl);

  return (
    <div className={`${styles.container} glass-panel`}>
      <div className={styles.videoHeader}>
        <a
          href={originalUrl || '#'}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.thumbnailWrapper}
          title={originalUrl}
        >
          {video.thumbnail && <img src={video.thumbnail} alt={video.title} className={styles.thumbnail} />}
          {sourceInfo && (
            <div className={styles.sourceBadge} title={sourceInfo.host}>
              <img src={sourceInfo.favicon} alt={sourceInfo.host} className={styles.sourceLogo} />
            </div>
          )}
        </a>
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
        <h3 className={styles.formatsTitle}>Tùy Chọn Tải Về ({availableFormats.length})</h3>
        <div className={styles.formatListWrapper}>
          <div className={styles.formatList}>
            {availableFormats.map((format, idx) => (
              <div key={`${format.format_id}-${idx}`} className={styles.formatItem}>
                <div className={styles.formatInfo}>
                  <span className={styles.formatQuality}>
                    {format.quality || (format.resolution ? `${format.resolution}p` : 'Âm thanh')}
                  </span>
                  <span className={styles.formatBadge}>{format.ext.toUpperCase()}</span>
                  {format.streamType && (
                    <span className={`${styles.formatBadge} ${styles.typeBadge}`}>
                      {format.streamType}
                    </span>
                  )}
                  <span className={styles.formatSize}>{formatFileSize(format.filesize)}</span>
                </div>
                {downloads[format.format_id] ? (
                  downloads[format.format_id].status === 'done' && downloads[format.format_id].file_url ? (
                    <a
                      href={`${API_BASE_URL}${downloads[format.format_id].file_url}&api_key=${getSessionId()}`}
                      className={`${styles.downloadBtn} ${styles.saveBtn}`}
                      download
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                      </svg>
                      <span>Lưu về máy</span>
                    </a>
                  ) : (
                    <div className={styles.downloadProgressContainer}>
                      <div className={styles.progressInfo}>
                        <span className={downloads[format.format_id].status === 'queued' ? styles.queueLabel : styles.progressLabel}>
                          {downloads[format.format_id].status === 'queued'
                            ? `Đang chờ đến lượt (Vị trí: ${downloads[format.format_id].queue_position || '...'})`
                            : (downloads[format.format_id].label || 'Đang kết nối...')}
                        </span>
                        <span className={styles.progressStats}>
                          {downloads[format.format_id].progress && `${downloads[format.format_id].progress}`}
                          {downloads[format.format_id].speed && ` • ${downloads[format.format_id].speed}`}
                        </span>
                      </div>
                      <div className={styles.progressBarWrapper}>
                        <div
                          className={`${styles.progressBar} ${downloads[format.format_id].status === 'queued' ? styles.progressQueued : ''}`}
                          style={{ width: downloads[format.format_id].status === 'queued' ? '100%' : (downloads[format.format_id].progress || '0%') }}
                        />
                      </div>
                      {downloads[format.format_id].error && (
                        <p className={styles.progressError}>{downloads[format.format_id].error}</p>
                      )}
                      <button
                        className={`btn btn-secondary ${styles.cancelBtn}`}
                        onClick={() => cancelDownload(format.format_id)}
                      >
                        Hủy
                      </button>
                    </div>
                  )
                ) : (
                  <button
                    className={`btn btn-primary ${styles.downloadBtn}`}
                    onClick={() => startDownload(format)}
                    disabled={!originalUrl}
                  >
                    Tải Về
                  </button>
                )}
              </div>
            ))}
            {availableFormats.length === 0 && (
              <p className={styles.noFormats}>Không có link tải trực tiếp nào khả dụng.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
