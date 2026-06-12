# VidCatch

VidCatch is a powerful media extraction and downloading tool that works across various platforms, including websites utilizing complex encrypted streams like HLS (`.m3u8`).
The project is built using a **Monorepo** architecture consisting of two main components:
1. **Extension (Frontend):** A Chrome Extension (Manifest V3) designed to sniff and intercept network requests containing video/audio streams from active web pages.
2. **VidDownloadServer (Backend):** A local server built with Python (FastAPI + yt-dlp) responsible for receiving intercepted URLs from the Extension, downloading media concurrently at high speeds, and automatically muxing video and audio streams using FFmpeg.

## Project Structure

```text
VidCatch/
├── Extension/              # Chrome Extension source code (Vite + Svelte + Tailwind)
│   ├── background/         # Background Service Worker for handling background downloads
│   ├── popup/              # Main UI popup when clicking the extension icon
│   ├── options/            # Extension settings page
│   └── package.json        # Node dependencies
│
├── VidDownloadServer/      # Backend source code (FastAPI + yt-dlp)
│   ├── app/                
│   │   ├── api/            # API & WebSockets for handling requests
│   │   ├── services/       # Core downloading & muxing logic via yt-dlp
│   │   └── main.py         # Backend application entry point
│   └── requirements.txt    # Python dependencies
└── README.md
```

## Key Features

- **Universal Format Support:** Capable of downloading direct HTML5 media (`.mp4`) as well as complex streaming protocols such as HLS (`.m3u8`) and DASH.
- **Concurrent Background Downloads:** Once a download initiates, the background worker fully takes over the task. You can safely close the popup or navigate away while your media downloads seamlessly in the background.
- **Extreme Download Speeds:** The Backend is configured to download up to **32 video fragments concurrently** (similar to multi-thread download managers like IDM), maximizing your network bandwidth.
- **Real-time Progress Updates:** The downloading and muxing progress is transmitted to the Popup UI in real-time via WebSockets.
- **Auto-Save & Cleanup:** Once the Backend finishes processing the video, Chrome automatically saves the final output to your default Downloads folder. The Backend then automatically deletes the temporary files to save disk space.

## Installation and Setup

### 1. Starting the Backend (VidDownloadServer)
Requires Python 3.8+ and FFmpeg installed on your system.

```bash
cd VidDownloadServer
# Create and activate a virtual environment (Optional but recommended)
python -m venv .venv
# On Windows
.venv\Scripts\activate
# On Linux/Mac
# source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start the server
uvicorn app.main:app --reload --port 8000
```
*(The backend will run on `http://127.0.0.1:8000`)*

### 2. Building the Extension
Requires Node.js.

```bash
cd Extension
# Install dependencies
npm install

# Build the extension
npm run build
```

After building:
1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** in the top right corner.
3. Click **Load unpacked**.
4. Select the newly generated `Extension/dist` folder.

## Usage

1. Ensure the **Backend is running**.
2. Open any web page containing a video.
3. Click the VidCatch Extension icon on the Chrome toolbar. The extension will automatically detect media streams on the page.
4. Click **Download** on the desired video stream. 
5. You can view the real-time download percentage directly on the button. You can safely close the popup; the file will automatically download to your computer when finished.
6. If a download fails, you can click the red **Error** badge to reset its state and try again.

## Technologies Used
- **Extension:** Vite, Svelte, Tailwind CSS, Chrome Manifest V3 APIs (WebRequest, Messaging, Downloads).
- **Backend:** Python, FastAPI, WebSockets, `yt-dlp`, FFmpeg, `imageio-ffmpeg`.
