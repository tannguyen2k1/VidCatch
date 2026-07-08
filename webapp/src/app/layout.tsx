import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import { DownloadProvider } from "./contexts/DownloadContext";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VidCatch - Tải Video YouTube, TikTok Nhanh Chóng Miễn Phí",
  description: "Công cụ tải video yêu thích từ YouTube, TikTok, Facebook, Douyin, Bilibili, Weibo chất lượng cao (1080p, 4K). Miễn phí, siêu tốc, an toàn tuyệt đối.",
  keywords: [
    "tải video", "tải video youtube", "tải video tiktok", "tải video facebook", 
    "tải video douyin", "tải video bilibili", "tải video weibo", "tải video instagram",
    "tải video twitter", "tải video x", "tải video vimeo", "tải video pinterest",
    "vidcatch", "youtube downloader", "download mp4", "download mp3", "tải nhạc mp3",
    "tải video không logo", "tải video tiktok không logo", "tải video hd", 
    "tải video 4k", "tải m3u8", "trình tải video", "công cụ tải video"
  ],
  authors: [{ name: "Tan Nguyen" }],
  openGraph: {
    title: "VidCatch - Tải Video Mọi Nền Tảng Miễn Phí",
    description: "Tải video chất lượng cao từ YouTube, TikTok nhanh nhất. Hoàn toàn miễn phí, không giới hạn tải xuống.",
    url: "https://vidcatch.io.vn",
    siteName: "VidCatch Downloader",
    images: [
      {
        url: "/logo.png",
        width: 800,
        height: 800,
        alt: "VidCatch Logo",
      },
    ],
    locale: "vi_VN",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "VidCatch - Tải Video Mọi Nền Tảng Miễn Phí",
    description: "Tải video chất lượng cao từ YouTube, TikTok nhanh nhất. Hoàn toàn miễn phí.",
    images: ["/logo.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className={`${inter.variable} ${outfit.variable}`}>
      <body>
        <DownloadProvider>
          {children}
        </DownloadProvider>
        <ToastContainer
          position="top-right"
          autoClose={3000}
          hideProgressBar={false}
          newestOnTop
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
          theme="dark"
        />
      </body>
    </html>
  );
}
