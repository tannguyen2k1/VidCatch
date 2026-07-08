"use client";

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import { API_BASE_URL, WS_BASE_URL } from '../config';

export type JobState = 'queued' | 'downloading' | 'muxing' | 'done' | 'error' | 'cancelled';

let memorySessionId = '';
export const getSessionId = () => {
  if (typeof window === 'undefined') return 'dev-local-key';
  if (!memorySessionId) {
    memorySessionId = 'session_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }
  return memorySessionId;
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
  queue_position?: number;
}

interface DownloadContextType {
  jobs: Record<string, DownloadJob>;
  addJob: (url: string, format_id: string, title: string, thumbnail?: string, referer?: string) => Promise<string | null>;
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

              // Nếu job đã bị remove thủ công từ trước (tồn tại trong removedJobs) thì bỏ qua hoàn toàn.
              if (removedJobs.current.has(jid)) {
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

              // Nếu chưa hoàn thành và chưa bị xoá, cập nhật vào danh sách
              next[jid] = {
                ...(next[jid] || {}),
                ...serverJob
              };
            }

            // Xoá các job cục bộ không còn tồn tại trên server
            for (const jid in next) {
              if (!data.jobs[jid]) {
                // Giữ lại job đã hoàn tất (done) còn file_url để nút "Lưu về máy"
                // không bị mất khi server chủ động dọn active_downloads sau khi tải xong.
                if (next[jid].state === 'done' && next[jid].file_url) {
                  continue;
                }
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

  const addJob = async (url: string, format_id: string, title: string, thumbnail?: string, referer?: string): Promise<string | null> => {
    try {
      const sessionId = getSessionId();
      const response = await fetch(`${API_BASE_URL}/api/jobs/start`, {
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
        return null;
      }

      const responseData = await response.json();
      return responseData.job_id || null;
    } catch (error) {
      toast.error('Lỗi kết nối máy chủ');
      return null;
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
