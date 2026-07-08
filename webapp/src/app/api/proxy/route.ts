import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const imageUrl = searchParams.get('url');

  if (!imageUrl) {
    return new NextResponse('Missing url parameter', { status: 400 });
  }

  try {
    const res = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Referer': 'http://localhost:3000/'
      }
    });

    if (!res.ok) {
      // Trả về một ảnh SVG trong suốt (mã 200) thay vì ném lỗi (404/403) 
      // để trình duyệt không báo đỏ trong F12 Console.
      const transparentSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';
      return new NextResponse(transparentSvg, { 
        status: 200,
        headers: {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'public, max-age=86400',
        }
      });
    }

    const contentType = res.headers.get('content-type') || 'image/jpeg';
    
    // Truyền thẳng luồng dữ liệu (stream) về cho client để tiết kiệm RAM
    return new NextResponse(res.body, {
      headers: {
        'Content-Type': contentType,
        // Yêu cầu trình duyệt người dùng nhớ (cache) bức ảnh này trong 24 giờ
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=43200',
      },
    });
  } catch (error) {
    console.error('Proxy image error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
