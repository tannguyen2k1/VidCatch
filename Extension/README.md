# VidCatch

VidCatch là Chrome Extension Manifest V3 dùng để phát hiện và tải video/audio từ trang web đang mở. UI chính nằm trong popup của extension; content script quét trang và background service worker bắt thêm các request media qua network.

## Tính năng hiện có

- Phát hiện media từ thẻ HTML5 `<video>`, `<audio>` và `<source>`.
- Bắt stream qua `chrome.webRequest`, gồm các request media, HLS manifest (`.m3u8`) và một số DASH/media URL phổ biến.
- Hiển thị danh sách video trong popup theo tab hiện tại.
- Tải trực tiếp bằng `chrome.downloads`.
- Tải HLS trong offscreen document bằng cách tải các segment rồi lưu thành file `.ts`.
- Ghép video-only stream với audio stream bằng FFmpeg WASM trong offscreen document.
- Lấy metadata cơ bản như tiêu đề, thumbnail, duration, quality/resolution và size khi có thể.
- Trang settings cho một số cấu hình download.

## Lưu ý trạng thái

- UI đang chạy chính là Svelte popup tại `src/popup/Popup.svelte`.
- Các file `src/popup/popup.html`, `src/popup/popup.js`, `src/popup/popup.css` là UI cũ và hiện không được manifest trỏ tới.
- `src/content/overlay.js` có code cho panel/nút nổi trên trang, nhưng hiện chưa được inject/gọi trong luồng chính. Vì vậy extension hiện không có nút tải nổi kiểu IDM, badge góc trang, hoặc phím tắt mở panel.
- Một số setting trong Options vẫn đang là khung UI và chưa khớp hoàn toàn với logic background.

## Cấu trúc chính

```text
VidCatch/
├── src/
│   ├── manifest.json
│   ├── background/
│   │   └── service-worker.js
│   ├── content/
│   │   ├── content.js
│   │   ├── detector.js
│   │   ├── overlay.js
│   │   └── overlay.css
│   ├── offscreen/
│   │   ├── offscreen.html
│   │   └── offscreen.js
│   ├── popup/
│   │   ├── index.html
│   │   ├── main.js
│   │   └── Popup.svelte
│   ├── options/
│   │   ├── index.html
│   │   ├── main.js
│   │   └── Options.svelte
│   └── icons/
├── package.json
├── vite.config.js
└── tailwind.config.js
```

## Công nghệ

- Chrome Extension Manifest V3
- Vite
- Svelte
- Tailwind CSS
- `@crxjs/vite-plugin`
- `webext-bridge`
- `chrome.downloads`, `chrome.webRequest`, `chrome.offscreen`
- `m3u8-parser`
- FFmpeg WASM (`@ffmpeg/ffmpeg`)

## Cài đặt để phát triển

```bash
npm install
npm run build
```

Sau khi build, load extension từ thư mục build output trong Chrome:

1. Mở `chrome://extensions/`.
2. Bật Developer mode.
3. Chọn Load unpacked.
4. Chọn thư mục extension đã build.

Khi phát triển UI, có thể chạy:

```bash
npm run dev
```

## Cách dùng

1. Mở một trang có video/audio.
2. Click icon VidCatch trên toolbar.
3. Popup sẽ yêu cầu content script quét lại trang hiện tại.
4. Chọn video trong danh sách và bấm Download.
5. Nếu stream là video-only và tìm được audio tương ứng, VidCatch sẽ ghép bằng FFmpeg WASM rồi mở save dialog khi hoàn tất.

## Hỗ trợ media

Các nguồn được xử lý tốt nhất hiện tại:

- HTML5 video/audio trực tiếp.
- Network media request có content type hoặc URL nhận diện được.
- HLS `.m3u8`.
- Một số stream video-only/audio-only kiểu DASH từ các CDN phổ biến.
- Một số player phổ biến khi source URL có thể đọc được từ DOM hoặc API toàn cục.

Khả năng tải phụ thuộc vào cách website phát media, CORS, token URL, request range/chunk, DRM và quyền truy cập của Chrome Extension.
