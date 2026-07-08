/** Copy dùng chung — cập nhật nền tảng ở đây một chỗ. */

export type PlatformChip = {
  name: string;
  icon: string;
};

export const PLATFORM_SUBTITLE =
  'Tải video chất lượng cao từ hàng trăm nền tảng. Miễn phí, nhanh chóng và an toàn.';

/** Nền tảng nổi bật hiển thị dạng chip dưới subtitle. Icon nằm trong /public/platforms/. */
export const PLATFORM_CHIPS: PlatformChip[] = [
  { name: 'YouTube', icon: '/platforms/youtube.png' },
  { name: 'TikTok/Douyin', icon: '/platforms/tiktok.png' },
  { name: 'Facebook', icon: '/platforms/facebook.png' },
  { name: 'Instagram', icon: '/platforms/instagram.png' },
  { name: 'Bilibili', icon: '/platforms/bilibili.png' },
  { name: 'Kuaishou', icon: '/platforms/kuaishou.png' },
  { name: 'Youku', icon: '/platforms/youku.png' },
  { name: 'Weibo', icon: '/platforms/weibo.png' },
  { name: 'Taobao/Tmall', icon: '/platforms/taobao.png' },
  { name: 'JD', icon: '/platforms/jd.png' },
  { name: 'Xiaohongshu', icon: '/platforms/xiaohongshu.ico' },
  { name: 'Shopee', icon: '/platforms/shopee.png' },
  { name: 'Lazada', icon: '/platforms/lazada.png' },
];

export const PLATFORM_PLACEHOLDER =
  'Dán link video (YouTube, TikTok, Taobao, Bilibili, Shopee, v.v.)';

export const PLATFORM_META_DESCRIPTION =
  'Công cụ tải video từ YouTube, TikTok, Facebook, Bilibili, Douyin, Kuaishou, Youku, Weibo, Taobao, Tmall, JD, Pinduoduo, Xiaohongshu, Shopee, Lazada chất lượng cao (1080p, 4K). Miễn phí, siêu tốc, an toàn.';

export const PLATFORM_OG_DESCRIPTION =
  'Tải video chất lượng cao từ YouTube, TikTok, Taobao, Bilibili, Shopee, Douyin và hàng trăm nền tảng khác. Hoàn toàn miễn phí.';

export const PLATFORM_META_TITLE =
  'VidCatch - Tải Video YouTube, TikTok, Taobao, Bilibili Miễn Phí';

export const PLATFORM_KEYWORDS = [
  'tải video',
  'tải video youtube',
  'tải video tiktok',
  'tải video facebook',
  'tải video bilibili',
  'tải video douyin',
  'tải video kuaishou',
  'tải video youku',
  'tải video weibo',
  'tải video taobao',
  'tải video tmall',
  'tải video jd',
  'tải video pinduoduo',
  'tải video xiaohongshu',
  'tải video shopee',
  'tải video lazada',
  'tải video instagram',
  'tải video không logo',
  'tải video tiktok không logo',
  'tải video hd',
  'tải video 4k',
  'vidcatch',
  'youtube downloader',
  'công cụ tải video',
];
