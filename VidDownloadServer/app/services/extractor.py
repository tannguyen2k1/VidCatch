import os
import re
import tempfile

import imageio_ffmpeg
import yt_dlp
from app.models.schemas import VideoExtractionResponse, StreamInfo
from app.core.config import settings


class DownloadCancelled(Exception):
    pass


def sanitize_filename(name: str, fallback: str = "video") -> str:
    safe_name = re.sub(r'[\\/:*?"<>|\r\n]+', "_", name or fallback).strip(" .")
    return safe_name[:120] or fallback


def resolve_final_file(download_dir: str, prepared_path: str) -> str:
    if prepared_path and os.path.exists(prepared_path):
        return prepared_path

    base, _ = os.path.splitext(prepared_path)
    for ext in (".mp4", ".mkv", ".webm", ".m4a", ".mp3"):
        candidate = base + ext
        if os.path.exists(candidate):
            return candidate

    media_files = []
    for filename in os.listdir(download_dir):
        if filename.endswith((".part", ".ytdl", ".temp")):
            continue
        path = os.path.join(download_dir, filename)
        if os.path.isfile(path):
            media_files.append(path)

    if media_files:
        return max(media_files, key=os.path.getmtime)

    raise FileNotFoundError("File not found after download")

class YtDlpExtractor:
    @staticmethod
    def extract(url: str, referer: str = None) -> VideoExtractionResponse:
        try:
            options = settings.YTDLP_OPTIONS.copy()
            if referer:
                from urllib.parse import urlparse
                parsed = urlparse(referer)
                origin = f"{parsed.scheme}://{parsed.netloc}"
                options['http_headers'] = {
                    'Referer': referer,
                    'Origin': origin
                }
                
            with yt_dlp.YoutubeDL(options) as ydl:
                info = ydl.extract_info(url, download=False)
                
            streams = []
            
            formats = info.get('formats', [info])
            seen_formats = set()
            for f in formats:
                # We only want formats that have a direct URL
                if not f.get('url'):
                    continue
                
                vcodec = f.get('vcodec')
                acodec = f.get('acodec')
                
                # Determine stream type
                if vcodec != 'none' and acodec != 'none':
                    stream_type = "full"
                elif vcodec != 'none' and acodec == 'none':
                    stream_type = "video-only"
                elif vcodec == 'none' and acodec != 'none':
                    stream_type = "audio"
                else:
                    continue
                    
                height = f.get('height') or 0
                ext = f.get('ext') or 'mp4'
                
                # Construct quality label
                note = f.get('format_note', '')
                if stream_type == "audio":
                    quality = note if note else 'Audio'
                else:
                    quality = f"{height}p" if height else "Unknown"
                    if f.get('fps'):
                        quality += f" {f['fps']}fps"
                    # Append note if it exists and isn't just the resolution
                    if note and not note.startswith(str(height)):
                        quality += f" ({note})"

                # Deduplicate based on quality, ext, and stream_type
                signature = (quality, ext, stream_type)
                if signature in seen_formats:
                    continue
                seen_formats.add(signature)

                streams.append(StreamInfo(
                    format_id=f.get('format_id', ''),
                    url=f['url'],
                    quality=quality,
                    streamType=stream_type,
                    resolution=height,
                    ext=ext,
                    filesize=f.get('filesize') or f.get('filesize_approx') or 0
                ))
                
            # Filter and sort streams: sort by resolution descending, then audio
            streams.sort(key=lambda x: (x.resolution, x.streamType == 'audio'), reverse=True)

            return VideoExtractionResponse(
                title=info.get('title', 'Unknown Title'),
                thumbnail=info.get('thumbnail'),
                duration=info.get('duration') or 0,
                uploader=info.get('uploader') or info.get('creator') or info.get('channel'),
                view_count=info.get('view_count'),
                streams=streams,
                description=info.get('description')
            )
            
        except yt_dlp.utils.DownloadError as e:
            return VideoExtractionResponse(
                title="Error",
                error=str(e)
            )
        except Exception as e:
            return VideoExtractionResponse(
                title="Error",
                error=f"Unexpected error: {str(e)}"
            )

    @staticmethod
    def download_and_mux(
        url: str,
        format_id: str,
        progress_hook=None,
        referer: str = None,
        job_id: str = None,
        job_dir: str = None,
        cancel_event=None,
    ) -> str:
        """
        Downloads and optionally muxes the requested format (with best audio if needed)
        Returns the absolute path to the downloaded file.
        """
        if cancel_event and cancel_event.is_set():
            raise DownloadCancelled("Download cancelled")

        ffmpeg_path = imageio_ffmpeg.get_ffmpeg_exe()

        safe_job_id = sanitize_filename(job_id or "manual")
        download_dir = job_dir or os.path.join(tempfile.gettempdir(), "VidCatch", "jobs", safe_job_id)
        os.makedirs(download_dir, exist_ok=True)
        
        options = settings.YTDLP_OPTIONS.copy()
        if referer:
            from urllib.parse import urlparse
            parsed = urlparse(referer)
            origin = f"{parsed.scheme}://{parsed.netloc}"
            options['http_headers'] = {
                'Referer': referer,
                'Origin': origin
            }
            
        options.update({
            'format': f"{format_id}+bestaudio/{format_id}/best",
            'outtmpl': os.path.join(download_dir, '%(title).120B_%(id)s_%(format_id)s.%(ext)s'),
            'merge_output_format': 'mp4',
            'ffmpeg_location': ffmpeg_path,
            'concurrent_fragment_downloads': settings.YTDLP_CONCURRENT_FRAGMENTS,
            'skip_download': False,
            'quiet': True,
            'no_warnings': True,
            'color': 'no_color',
        })
        
        def guarded_progress_hook(d):
            if cancel_event and cancel_event.is_set():
                raise DownloadCancelled("Download cancelled")
            if progress_hook:
                progress_hook(d)

        options['progress_hooks'] = [guarded_progress_hook]
        
        try:
            with yt_dlp.YoutubeDL(options) as ydl:
                info = ydl.extract_info(url, download=True)
                prepared_path = ydl.prepare_filename(info)
                return resolve_final_file(download_dir, prepared_path)
        except DownloadCancelled:
            raise
        except Exception as e:
            raise Exception(f"Download failed: {str(e)}")
