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

  const isStream = new URL(request.url).searchParams.has('stream');

  try {
    const auth = new GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });

    const client = await auth.getClient();

    if (isStream) {
      const authHeaders = await client.getRequestHeaders();
      const driveRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${id}?alt=media`,
        { headers: authHeaders, redirect: 'manual' }
      );

      if (driveRes.status >= 300 && driveRes.status < 400) {
        const location = driveRes.headers.get('location');
        if (location) {
          return new Response(null, {
            status: 302,
            headers: { 'Location': location, ...corsHeaders },
          });
        }
      }
    }

    const authHeaders = await client.getRequestHeaders();

    const fetchHeaders: Record<string, string> = { ...authHeaders };

    const range = request.headers.get('range');
    if (range) fetchHeaders['Range'] = range;

    const driveRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${id}?alt=media`,
      { headers: fetchHeaders }
    );

    const responseHeaders: Record<string, string> = {
      'Content-Type': driveRes.headers.get('content-type') || 'application/octet-stream',
      'Content-Disposition': 'inline',
      'Cache-Control': 'public, max-age=3600',
      ...corsHeaders,
    };

    for (const h of ['content-range', 'accept-ranges', 'content-length']) {
      const val = driveRes.headers.get(h);
      if (val) responseHeaders[h] = val;
    }

    return new Response(driveRes.body, {
      status: driveRes.status,
      headers: responseHeaders,
    });
  } catch (err: any) {
    return new Response(PLACEHOLDER('error'), {
      headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=60', ...corsHeaders },
    });
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
