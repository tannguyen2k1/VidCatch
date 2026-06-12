import yt_dlp
from app.models.schemas import VideoExtractionResponse, StreamInfo
from app.core.config import settings

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
                if stream_type == "audio":
                    quality = f.get('format_note', 'Audio')
                else:
                    quality = f"{height}p" if height else "Unknown"
                    if f.get('fps'):
                        quality += f" {f['fps']}fps"

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
                streams=streams
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
    def download_and_mux(url: str, format_id: str, progress_hook=None, referer: str = None) -> str:
        """
        Downloads and optionally muxes the requested format (with best audio if needed)
        Returns the absolute path to the downloaded file.
        """
        import os
        import tempfile
        import imageio_ffmpeg
        
        ffmpeg_path = imageio_ffmpeg.get_ffmpeg_exe()
        
        # Use a consistent temporary directory named 'VidCatch'
        base_temp = tempfile.gettempdir()
        download_dir = os.path.join(base_temp, 'VidCatch')
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
            'outtmpl': os.path.join(download_dir, '%(id)s_%(format_id)s.%(ext)s'),
            'merge_output_format': 'mp4',
            'ffmpeg_location': ffmpeg_path,
            'concurrent_fragment_downloads': 32,
            'skip_download': False,
            'quiet': True,
            'no_warnings': True,
            'color': 'no_color',
        })
        
        if progress_hook:
            options['progress_hooks'] = [progress_hook]
        
        try:
            with yt_dlp.YoutubeDL(options) as ydl:
                info = ydl.extract_info(url, download=True)
                # the requested download file path is _filename
                return ydl.prepare_filename(info)
        except Exception as e:
            raise Exception(f"Download failed: {str(e)}")
