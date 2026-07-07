"use client";

import { useState } from "react";
import styles from "./page.module.css";
import UrlInput from "./components/UrlInput";
import VideoResult from "./components/VideoResult";
import ExtensionPromo from "./components/ExtensionPromo";

export default function Home() {
  const [isLoading, setIsLoading] = useState(false);
  const [videoData, setVideoData] = useState(null);
  const [error, setError] = useState<string | null>(null);
  const [currentUrl, setCurrentUrl] = useState<string>('');

  const handleExtract = async (url: string) => {
    setIsLoading(true);
    setError(null);
    setVideoData(null);
    setCurrentUrl(url);
    
    try {
      const response = await fetch(`http://localhost:8000/api/extract?url=${encodeURIComponent(url)}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'x-api-key': 'dev-local-key' // fallback for local dev
        },
        cache: 'no-store'
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.detail || data.error || 'Failed to extract video');
      }
      
      setVideoData(data);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An unexpected error occurred. Please make sure the backend is running.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className={styles.main}>
      <div className={styles.hero}>
        <h1 className={styles.title}>
          <span className={styles.gradientText}>VidCatch</span> Downloader
        </h1>
        <p className={styles.subtitle}>
          Download your favorite videos from YouTube, TikTok, Facebook, and more.
          Free, fast, and secure.
        </p>
        <UrlInput onSubmit={handleExtract} isLoading={isLoading} />
      </div>

      <div className={styles.resultArea}>
        {(videoData || error) && (
          <VideoResult video={videoData} error={error} originalUrl={currentUrl} />
        )}
      </div>

      <ExtensionPromo />
    </main>
  );
}
