import React, { useState } from 'react';
import styles from './UrlInput.module.css';
import { PLATFORM_PLACEHOLDER } from '../config/marketing';

interface UrlInputProps {
  onSubmit: (url: string) => void;
  isLoading: boolean;
}

function validateUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) {
    return 'Vui lòng nhập link video.';
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return 'Link không hợp lệ. Hãy dán link đầy đủ, ví dụ: https://www.youtube.com/watch?v=...';
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return 'Link phải bắt đầu bằng http:// hoặc https://';
  }

  // Hostname phải là domain thật (có dấu chấm), tránh nhập "localhost" hay text vô nghĩa
  if (!parsed.hostname.includes('.') || parsed.hostname.endsWith('.')) {
    return 'Link không hợp lệ. Hãy kiểm tra lại địa chỉ trang web.';
  }

  return null;
}

export default function UrlInput({ onSubmit, isLoading }: UrlInputProps) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateUrl(url);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    onSubmit(url.trim());
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUrl(e.target.value);
    if (error) {
      setError(null);
    }
  };

  return (
    <form className={styles.formContainer} onSubmit={handleSubmit} noValidate>
      <div className={`${styles.inputWrapper} ${error ? styles.inputWrapperError : ''}`}>
        <input
          type="text"
          inputMode="url"
          className={styles.input}
          placeholder={PLATFORM_PLACEHOLDER}
          value={url}
          onChange={handleChange}
          disabled={isLoading}
          aria-invalid={!!error}
        />
        <button
          type="submit"
          className={`btn btn-primary ${styles.submitBtn}`}
          disabled={isLoading || !url.trim()}
        >
          {isLoading ? <div className="spinner"></div> : 'Extract'}
        </button>
      </div>
      {error && (
        <p className={styles.errorMessage} role="alert">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <span>{error}</span>
        </p>
      )}
    </form>
  );
}
