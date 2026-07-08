import React, { useState, useEffect, useRef } from 'react';
import styles from './DownloadManager.module.css';
import { useDownload, DownloadJob } from '../contexts/DownloadContext';
import { API_BASE_URL } from '../config';

export default function DownloadManager() {
  const { jobs, removeJob, cancelJob } = useDownload();
  const [isOpen, setIsOpen] = useState(false);
  const prevJobCount = useRef(0);

  const jobList = Object.values(jobs);
  const activeCount = jobList.filter(j => ['queued', 'downloading', 'muxing'].includes(j.state)).length;

  if (jobList.length === 0) return null;

  return (
    <div className={styles.managerContainer}>
      <div className={styles.panel}>
        <div
          className={styles.panelHeader}
          onClick={() => setIsOpen(!isOpen)}
        >
          <div className={styles.headerLeft}>
            <div className={styles.iconWrapper}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              {activeCount > 0 && <span className={styles.badge}>{activeCount}</span>}
            </div>
            <h4>Tiến trình hệ thống ({jobList.length})</h4>
          </div>

          <div className={styles.headerRight}>
            <svg
              className={styles.chevron}
              style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
              width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            >
              <polyline points="18 15 12 9 6 15"></polyline>
            </svg>
          </div>
        </div>

        <div className={`${styles.panelContent} ${isOpen ? styles.open : ''}`}>
          <div className={styles.jobList}>
            {jobList.map(job => (
              <JobItem
                key={job.job_id}
                job={job}
                onRemove={() => removeJob(job.job_id)}
                onCancel={() => cancelJob(job.job_id)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function JobItem({ job, onRemove, onCancel }: { job: DownloadJob; onRemove: () => void; onCancel: () => void }) {
  const isDone = job.state === 'done';
  const isError = job.state === 'error' || job.state === 'cancelled';
  const isActive = ['queued', 'downloading', 'muxing'].includes(job.state);

  return (
    <div className={styles.jobItem}>
      <div className={styles.jobThumbnail}>
        {job.thumbnail ? (
          <img src={job.thumbnail} alt="thumb" />
        ) : (
          <div className={styles.thumbPlaceholder}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
          </div>
        )}
      </div>
      <div className={styles.jobDetails}>
        <div className={styles.jobTitle} title={job.title}>{job.title}</div>
        <div className={styles.jobMeta}>
          {isDone ? (
            <span className={styles.successText}>Đã hoàn thành</span>
          ) : isError ? (
            <span className={styles.errorText}>{job.error || 'Đã hủy'}</span>
          ) : (
            <>
              <span className={styles.stateLabel}>{job.label || job.state}</span>
              {job.progress && <span>{job.progress}</span>}
              {job.speed && <span>{job.speed}</span>}
            </>
          )}
        </div>

        {isActive && (
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: job.progress === 'Unknown' ? '100%' : (job.progress || '0%') }}
            />
          </div>
        )}
      </div>

      <div className={styles.jobActions}>
        {isError && (
          <button className={styles.actionBtn} onClick={onRemove} title="Xóa khỏi danh sách">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"></path>
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
