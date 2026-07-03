import type { APIRoute } from 'astro';
import { GoogleAuth } from 'google-auth-library';

const PLACEHOLDER = (seed: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
    <rect width="1200" height="800" fill="#f5f0eb"/>
    <rect x="560" y="360" width="80" height="80" rx="8" fill="#c9a84c" opacity="0.3"/>
    <text x="600" y="420" font-family="serif" font-size="12" fill="#c9a84c" text-anchor="middle" opacity="0.5">${seed}</text>
  </svg>`;

export const GET: APIRoute = async ({ params, request }) => {
  const { id } = params;
  if (!id || id.length < 3) {
    return new Response('Invalid file ID', { status: 400 });
  }

  const corsHeaders: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Max-Age': '86400',
  };

  if (!process.env.GOOGLE_SERVICE_ACCOUNT || process.env.GOOGLE_SERVICE_ACCOUNT === 'dev') {
    return new Response(PLACEHOLDER(id.slice(0, 8)), {
      headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400', ...corsHeaders },
    });
  }

  try {
    const auth = new GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });

    const client = await auth.getClient();

    const metaRes = await client.request({
      url: `https://www.googleapis.com/drive/v3/files/${id}?fields=mimeType`,
    });
    const mimeType = ((metaRes as any).data?.mimeType as string) || 'application/octet-stream';

    const url = `https://www.googleapis.com/drive/v3/files/${id}?alt=media`;
    const driveRes = await client.request({ url, responseType: 'stream' });

    const body = driveRes.data as unknown as ReadableStream;

    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': 'inline',
        'Cache-Control': 'public, s-maxage=86400, max-age=3600',
        'CDN-Cache-Control': 'public, max-age=86400',
        ...corsHeaders,
      },
    });
  } catch (err: any) {
    if (process.env.NODE_ENV === 'development') {
      return new Response(PLACEHOLDER('dev'), {
        headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400', ...corsHeaders },
      });
    }
    return new Response('Proxy error', { status: 502, headers: corsHeaders });
  }
};

export const OPTIONS: APIRoute = async () => {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Max-Age': '86400',
    },
  });
};
