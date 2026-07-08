"use client";

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import { API_BASE_URL, WS_BASE_URL } from '../config';

export type JobState = 'queued' | 'downloading' | 'muxing' | 'done' | 'error' | 'cancelled';

export const getSessionId = () => {
  if (typeof window === 'undefined') return 'dev-local-key';
  let sid = localStorage.getItem('vidcatch_session_id');
  if (!sid) {
    sid = 'session_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('vidcatch_session_id', sid);
  }
  return sid;
};

export interface DownloadJob {
  job_id: string;
  url: string;
  format_id: string;
  title: string;
  thumbnail?: string;
  state: JobState;
  progress: string;
  speed: string;
  eta: string;
  label: string;
  file_url?: string;
  filename?: string;
  error?: string;
}

interface DownloadContextType {
  jobs: Record<string, DownloadJob>;
  addJob: (url: string, format_id: string, title: string, thumbnail?: string, referer?: string) => void;
  removeJob: (job_id: string) => void;
  cancelJob: (job_id: string) => void;
}

const DownloadContext = createContext<DownloadContextType | undefined>(undefined);

export function DownloadProvider({ children }: { children: React.ReactNode }) {
  const [jobs, setJobs] = useState<Record<string, DownloadJob>>({});
  const wsRef = useRef<WebSocket | null>(null);
  const downloadedFiles = useRef<Set<string>>(new Set());
  const removedJobs = useRef<Set<string>>(new Set());

  // Kết nối Global WebSocket
  useEffect(() => {
    let reconnectTimer: NodeJS.Timeout;

    const connectSync = () => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

      const sessionId = getSessionId();
      const wsUrl = `${WS_BASE_URL}/api/ws/sync?api_key=${sessionId}`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log("Connected to Sync WebSocket");
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'sync' && data.jobs) {
          setJobs(prev => {
            const next = { ...prev };

            // Xử lý các job từ server
            for (const jid in data.jobs) {
              const serverJob = data.jobs[jid];

              // Nếu job đã bị remove thủ công từ trước (tồn tại trong removedJobs)
              // hoặc đã tải xong (tồn tại trong downloadedFiles) thì bỏ qua hoàn toàn.
              if (removedJobs.current.has(jid) || downloadedFiles.current.has(jid)) {
                continue;
              }

              // Nếu server báo lỗi mà chưa có trong danh sách thì hiển thị toast
              if (!next[jid] && (serverJob.state === 'error' || serverJob.state === 'cancelled')) {
                if (serverJob.error && serverJob.error.toLowerCase().includes('cancel')) {
                  // Bỏ qua log
                } else {
                  toast.error(serverJob.error || 'Lỗi tải xuống');
                }
                removedJobs.current.add(jid);
                continue;
              }

              // Xử lý khi job hoàn thành
              if (serverJob.state === 'done' && serverJob.file_url) {
                if (!downloadedFiles.current.has(jid)) {
                  downloadedFiles.current.add(jid);
                  removedJobs.current.add(jid); // Đánh dấu xoá luôn

                  // Tự động tải file
                  const initiatedJobs = JSON.parse(sessionStorage.getItem('initiatedJobs') || '[]');
                  if (initiatedJobs.includes(jid)) {
                    window.location.href = `${API_BASE_URL}${serverJob.file_url}&api_key=${sessionId}`;
                  }

                  // Xóa thẳng khỏi state, không cho hiển thị nữa (nghiệp vụ: xong là clear)
                  delete next[jid];
                  continue;
                }
              }

              // Nếu chưa hoàn thành và chưa bị xoá, cập nhật vào danh sách
              next[jid] = {
                ...(next[jid] || {}),
                ...serverJob
              };
            }

            // Xoá các job cục bộ không còn tồn tại trên server
            for (const jid in next) {
              if (!data.jobs[jid]) {
                // Đánh dấu xoá
                removedJobs.current.add(jid);
                delete next[jid];
              }
            }

            return next;
          });
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        reconnectTimer = setTimeout(connectSync, 2000); // Thử kết nối lại sau 2s
      };

      ws.onerror = () => {
        ws.close();
      };

      wsRef.current = ws;
    };

    connectSync();

    return () => {
      clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const addJob = async (url: string, format_id: string, title: string, thumbnail?: string, referer?: string) => {
    try {
      const sessionId = getSessionId();
      const response = await fetch(`${API_BASE_URL}/api/start_download`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': sessionId
        },
        body: JSON.stringify({
          url,
          format_id,
          title,
          thumbnail: thumbnail || '',
          referer: referer || null
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        toast.error(`Không thể bắt đầu: ${errorData.detail || 'Lỗi hệ thống'}`);
        return;
      }

      const responseData = await response.json();
      if (responseData.job_id) {
        // Lưu vào sessionStorage để biết tab này là tab khởi tạo tải xuống
        const initiated = JSON.parse(sessionStorage.getItem('initiatedJobs') || '[]');
        initiated.push(responseData.job_id);
        sessionStorage.setItem('initiatedJobs', JSON.stringify(initiated));
      }

      toast.success('Đã đưa vào danh sách tải xuống');
    } catch (error) {
      toast.error('Lỗi kết nối máy chủ');
    }
  };

  const removeJob = (job_id: string) => {
    removedJobs.current.add(job_id);
    setJobs(prev => {
      const next = { ...prev };
      delete next[job_id];
      return next;
    });
  };

  const cancelJob = (job_id: string) => {
    const sessionId = getSessionId();
    fetch(`${API_BASE_URL}/api/cancel_download?job_id=${encodeURIComponent(job_id)}`, {
      method: 'POST',
      headers: { 'x-api-key': sessionId }
    });
    toast.info('Đã hủy tải xuống');
    removeJob(job_id);
  };

  return (
    <DownloadContext.Provider value={{ jobs, addJob, removeJob, cancelJob }}>
      {children}
    </DownloadContext.Provider>
  );
}

export function useDownload() {
  const context = useContext(DownloadContext);
  if (!context) {
    throw new Error('useDownload must be used within a DownloadProvider');
  }
  return context;
}
