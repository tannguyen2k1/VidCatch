import React, { useState } from 'react';
import styles from './UrlInput.module.css';

interface UrlInputProps {
  onSubmit: (url: string) => void;
  isLoading: boolean;
}

export default function UrlInput({ onSubmit, isLoading }: UrlInputProps) {
  const [url, setUrl] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      onSubmit(url.trim());
    }
  };

  return (
    <form className={styles.formContainer} onSubmit={handleSubmit}>
      <div className={styles.inputWrapper}>
        <input
          type="url"
          className={styles.input}
          placeholder="Paste video link here (YouTube, TikTok, etc.)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
          disabled={isLoading}
        />
        <button 
          type="submit" 
          className={`btn btn-primary ${styles.submitBtn}`}
          disabled={isLoading || !url.trim()}
        >
          {isLoading ? <div className="spinner"></div> : 'Extract'}
        </button>
      </div>
    </form>
  );
}
