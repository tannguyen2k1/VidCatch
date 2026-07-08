
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
          <h3 className={styles.title}>Tải nhanh hơn với tiện ích VidCatch!</h3>
          <p className={styles.description}>
            Cài đặt tiện ích mở rộng của chúng tôi để tải video chỉ bằng 1 click ngay trên trang xem video. Không cần copy-paste link nữa.
          </p>
        </div>
      </div>
      <a
        href="#"
        className={`btn btn-primary ${styles.installBtn}`}
        onClick={(e) => {
          e.preventDefault();
          alert('Link cài đặt tiện ích mở rộng sẽ sớm ra mắt!');
        }}
      >
        Cài Đặt Tiện Ích
      </a>
    </div>
  );
}
