import React from 'react';
import styles from './ExtensionPromo.module.css';

export default function ExtensionPromo() {
  return (
    <div className={`${styles.container} glass-panel`}>
      <div className={styles.content}>
        <div className={styles.iconWrapper}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
        </div>
        <div className={styles.textWrapper}>
          <h3 className={styles.title}>Download Faster with VidCatch Extension!</h3>
          <p className={styles.description}>
            Get our browser extension to download videos with a single click, right from the video page. No more copy-pasting links.
          </p>
        </div>
      </div>
      <a 
        href="#" 
        className={`btn btn-primary ${styles.installBtn}`}
        onClick={(e) => {
          e.preventDefault();
          alert('Extension download link will be available soon!');
        }}
      >
        Install Extension
      </a>
    </div>
  );
}
