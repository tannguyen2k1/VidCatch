"use client";

import { useState, useEffect } from "react";
import styles from "./page.module.css";
import UrlInput from "./components/UrlInput";
import VideoResult from "./components/VideoResult";
import ExtensionPromo from "./components/ExtensionPromo";

import { getSessionId } from "./contexts/DownloadContext";
import { API_BASE_URL } from "./config";
import { PLATFORM_SUBTITLE } from "./config/marketing";

export default function Home() {
  const [isLoading, setIsLoading] = useState(false);
  const [videoData, setVideoData] = useState(null);
  const [error, setError] = useState<string | null>(null);
  const [currentUrl, setCurrentUrl] = useState<string>('');

  const [showDonate, setShowDonate] = useState(false);



  const translateBackendError = (message: string) => {
    const msg = (message || '').toString();

    if (msg.includes('Only http/https URLs are allowed')) {
      return 'Chỉ hỗ trợ link bắt đầu bằng http:// hoặc https://';
    }
    if (msg.includes('URL host is required')) {
      return 'Link không hợp lệ: thiếu domain (host).';
    }
    if (msg.includes('URL host cannot be resolved')) {
      return 'Không phân giải được domain của link. Vui lòng kiểm tra lại đường dẫn.';
    }
    if (msg.includes('Private or local network URLs are not allowed')) {
      return 'Không cho phép link nội bộ/mạng riêng.';
    }
    if (msg.includes('Rate limit exceeded')) {
      return 'Bạn gửi yêu cầu quá nhanh. Vui lòng thử lại sau vài giây.';
    }
    if (msg.toLowerCase().includes('failed to extract video')) {
      return 'Không thể trích xuất video từ link này. Hãy thử lại.';
    }

    return msg;
  };

  const handleExtract = async (url: string) => {
    setIsLoading(true);
    setError(null);
    setVideoData(null);
    setCurrentUrl(url);

    try {
      const response = await fetch(`${API_BASE_URL}/api/extract?url=${encodeURIComponent(url)}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'x-api-key': getSessionId()
        },
        cache: 'no-store'
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(translateBackendError(data?.detail || data?.error || 'Failed to extract video'));
      }

      setVideoData(data);
    } catch (err: any) {
      console.error(err);
      const fallback = 'Đã xảy ra lỗi không xác định. Vui lòng đảm bảo backend đang chạy.';
      setError(translateBackendError(err?.message || fallback));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className={styles.main}>
      <div className={styles.hero}>
        <div className={styles.titleWrapper}>
          <img src="/logo.png" alt="VidCatch Logo" className={styles.heroLogo} />
          <h1 className={styles.title}>
            <span className={styles.gradientText}>VidCatch</span> Downloader
          </h1>
        </div>
        <p className={styles.subtitle}>
          {PLATFORM_SUBTITLE}
        </p>
        <UrlInput onSubmit={handleExtract} isLoading={isLoading} />
      </div>

      <div className={styles.resultArea}>
        {(videoData || error) && (
          <VideoResult video={videoData} error={error} originalUrl={currentUrl} />
        )}
      </div>

      <footer className={styles.footer}>
        <ExtensionPromo />
        <div className={styles.authorInfo}>
          Được phát triển với 💖 bởi <a href="https://github.com/tannguyen2k1" target="_blank" rel="noopener noreferrer" className={styles.authorLink}>tannguyen2k1</a>
        </div>
        <button onClick={() => setShowDonate(true)} className={styles.donateBtn} title="Donate">
          <span className={styles.donateIcon}>☕</span>
          <span>Mua cho tôi cốc cà phê</span>
        </button>
      </footer>

      {showDonate && (
        <div className={styles.modalOverlay} onClick={() => setShowDonate(false)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <button className={styles.closeBtn} onClick={() => setShowDonate(false)}>✕</button>
            <h3 className={styles.modalTitle}>Ủng Hộ Tác Giả</h3>
            <p className={styles.modalDesc}>Cảm ơn bạn đã yêu thích và sử dụng VidCatch! 💖</p>
            <div className={styles.qrWrapper}>
              <img src="/qr.png" alt="Donate QR Code" className={styles.qrImage} />
            </div>
            <div className={styles.bankInfo}>
              <p><strong>Ngân hàng:</strong> VPBank</p>
              <p><strong>Chủ TK:</strong> NGUYEN VAN TAN</p>
              <p><strong>Số TK:</strong> 2001018386</p>
            </div>
          </div>
        </div>
      )}


    </main>
  );
}
