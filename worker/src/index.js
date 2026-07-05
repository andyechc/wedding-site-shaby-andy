const PLACEHOLDER_SVG = (seed) => `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
  <rect width="1200" height="800" fill="#f5f0eb"/>
  <rect x="560" y="360" width="80" height="80" rx="8" fill="#c9a84c" opacity="0.3"/>
  <text x="600" y="420" font-family="serif" font-size="12" fill="#c9a84c" text-anchor="middle" opacity="0.5">${seed}</text>
</svg>`;

function base64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function pemToBinary(pem) {
  const b64 = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function getAccessToken(saJson) {
  const sa = JSON.parse(saJson);
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const enc = (o) => base64url(new TextEncoder().encode(JSON.stringify(o)));
  const message = `${enc(header)}.${enc(payload)}`;

  const key = await crypto.subtle.importKey(
    'pkcs8', pemToBinary(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );

  const sig = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' }, key,
    new TextEncoder().encode(message)
  );

  const jwt = `${message}.${base64url(sig)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const data = await res.json();
  return data.access_token;
}

function isImage(contentType) {
  return contentType && (contentType.startsWith('image/') || contentType.startsWith('video/'));
}

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  if (request.method !== 'GET' || !path.startsWith('/media/')) {
    return new Response('Not found', { status: 404 });
  }

  const fileId = path.replace('/media/', '');
  if (!fileId || fileId.length < 10) {
    return new Response('Invalid file ID', { status: 400 });
  }

  // Placeholder mode: return gold-toned SVG when no service account configured
  if (!env.GOOGLE_SERVICE_ACCOUNT || env.GOOGLE_SERVICE_ACCOUNT === 'dev') {
    const svg = PLACEHOLDER_SVG(fileId.slice(0, 8));
    return new Response(svg, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  const referer = request.headers.get('Referer') || '';
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const isValid = allowed.length === 0 ||
    allowed.some(o => referer.startsWith(o) || origin === o);

  if (allowed.length > 0 && !isValid) {
    return new Response('Forbidden', { status: 403 });
  }

  try {
    const token = await getAccessToken(env.GOOGLE_SERVICE_ACCOUNT);

    const driveRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!driveRes.ok) {
      const errText = await driveRes.text();
      return new Response(errText, { status: driveRes.status });
    }

    const contentType = driveRes.headers.get('Content-Type') || 'application/octet-stream';

    return new Response(driveRes.body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': 'inline',
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    const svg = PLACEHOLDER_SVG('error');
    return new Response(svg, {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}

export default { fetch: handleRequest };
