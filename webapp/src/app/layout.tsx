import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import { DownloadProvider } from "./contexts/DownloadContext";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./globals.css";
import {
  PLATFORM_KEYWORDS,
  PLATFORM_META_DESCRIPTION,
  PLATFORM_META_TITLE,
  PLATFORM_OG_DESCRIPTION,
} from "./config/marketing";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://vidcatch.io.vn"),
  alternates: {
    canonical: "/",
  },
  title: PLATFORM_META_TITLE,
  description: PLATFORM_META_DESCRIPTION,
  keywords: [
    ...PLATFORM_KEYWORDS,
    "tải video twitter", "tải video x", "tải video vimeo", "tải video pinterest",
    "download mp4", "download mp3", "tải nhạc mp3",
    "tải m3u8", "trình tải video",
  ],
  authors: [{ name: "Tan Nguyen" }],
  openGraph: {
    title: "VidCatch - Tải Video Mọi Nền Tảng Miễn Phí",
    description: PLATFORM_OG_DESCRIPTION,
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
    description: PLATFORM_OG_DESCRIPTION,
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
