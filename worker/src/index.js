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
  const now = Math.floor(Date.now() / 1000);
  if (globalThis.__tokenCache && globalThis.__tokenCache.exp > now + 60) {
    return globalThis.__tokenCache.token;
  }

  const sa = JSON.parse(saJson);
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

  globalThis.__tokenCache = {
    token: data.access_token,
    exp: now + 3500,
  };
  return data.access_token;
}

async function listDriveFolder(folderId, token) {
  const all = [];
  let pageToken = null;

  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'files(id,name,mimeType),nextPageToken',
      pageSize: '100',
    });
    if (pageToken) params.set('pageToken', pageToken);

    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?${params}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await res.json();
    all.push(...data.files);
    pageToken = data.nextPageToken || null;
  } while (pageToken);

  return all;
}

const hlsCache = new Map();

async function getHlsMapping(folderId, token) {
  const cached = hlsCache.get(folderId);
  if (cached && Date.now() - cached.time < 300000) {
    return cached.mapping;
  }

  const mapping = {};
  const rootFiles = await listDriveFolder(folderId, token);

  for (const file of rootFiles) {
    if (file.mimeType === 'application/vnd.google-apps.folder') {
      const subFiles = await listDriveFolder(file.id, token);
      for (const subFile of subFiles) {
        mapping[`${file.name}/${subFile.name}`] = subFile.id;
      }
    } else {
      mapping[file.name] = file.id;
    }
  }

  hlsCache.set(folderId, { mapping, time: Date.now() });
  return mapping;
}

async function fetchFromDrive(fileId, request, env) {
  const token = await getAccessToken(env.GOOGLE_SERVICE_ACCOUNT);
  const driveHeaders = { Authorization: `Bearer ${token}` };

  const rangeHeader = request.headers.get('Range');
  if (rangeHeader) driveHeaders['Range'] = rangeHeader;
  driveHeaders['Accept-Encoding'] = 'identity';

  const driveRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`,
    { headers: driveHeaders }
  );

  if (!driveRes.ok && driveRes.status !== 206) {
    const errText = await driveRes.text();
    return new Response(errText, { status: driveRes.status });
  }

  const contentType = driveRes.headers.get('Content-Type') || 'application/octet-stream';
  const contentLength = driveRes.headers.get('Content-Length');
  const contentRange = driveRes.headers.get('Content-Range');

  const responseHeaders = {
    'Content-Type': contentType,
    'Content-Disposition': 'inline',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=86400',
    'X-Content-Type-Options': 'nosniff',
    'Access-Control-Allow-Origin': '*',
  };
  if (contentLength) responseHeaders['Content-Length'] = contentLength;
  if (contentRange) responseHeaders['Content-Range'] = contentRange;

  return new Response(driveRes.body, {
    status: driveRes.status,
    headers: responseHeaders,
  });
}

function handleCors() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Max-Age': '86400',
    },
  });
}

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === 'OPTIONS') {
    return handleCors();
  }

  if (request.method !== 'GET') {
    return new Response('Not found', { status: 404 });
  }

  // Diagnostic endpoint
  if (path === '/__debug') {
    const sa = env.GOOGLE_SERVICE_ACCOUNT;
    const exists = !!sa;
    const isDev = sa === 'dev';
    const length = sa ? sa.length : 0;
    const preview = sa ? sa.substring(0, 30) + '...' : 'undefined';
    return new Response(JSON.stringify({ exists, isDev, length, preview, origins: env.ALLOWED_ORIGINS }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  if (!env.GOOGLE_SERVICE_ACCOUNT || env.GOOGLE_SERVICE_ACCOUNT === 'dev') {
    const seed = path.split('/').pop()?.slice(0, 8) || 'dev';
    return new Response(PLACEHOLDER_SVG(seed), {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  const referer = request.headers.get('Referer') || '';
  const origin = request.headers.get('Origin') || '';
  const ua = request.headers.get('User-Agent') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);

  const hasValidReferer = allowed.some(o => referer.startsWith(o) || origin === o);
  const isBrowser = /Mozilla|Chrome|Safari|Firefox|Edg|OPR/i.test(ua);
  const isValid = allowed.length === 0 || hasValidReferer || isBrowser;

  if (allowed.length > 0 && !isValid) {
    return new Response('Forbidden', { status: 403 });
  }

  // HLS route: /hls/{folderId}/{filePath...}
  if (path.startsWith('/hls/')) {
    const parts = path.replace('/hls/', '').split('/');
    const folderId = parts[0];
    const filePath = parts.slice(1).join('/');

    if (!folderId || folderId.length < 10 || !filePath) {
      return new Response('Invalid HLS path', { status: 400 });
    }

    try {
      const token = await getAccessToken(env.GOOGLE_SERVICE_ACCOUNT);
      const mapping = await getHlsMapping(folderId, token);
      const fileId = mapping[filePath];

      if (!fileId) {
        return new Response('File not found in HLS folder', { status: 404 });
      }

      return await fetchFromDrive(fileId, request, env);
    } catch (err) {
      return new Response('HLS error', { status: 500 });
    }
  }

  // Media route: /media/{fileId}
  if (path.startsWith('/media/')) {
    const fileId = path.replace('/media/', '');
    if (!fileId || fileId.length < 10) {
      return new Response('Invalid file ID', { status: 400 });
    }

    try {
      return await fetchFromDrive(fileId, request, env);
    } catch (err) {
      return new Response(PLACEHOLDER_SVG('error'), {
        status: 200,
        headers: {
          'Content-Type': 'image/svg+xml',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  }

  return new Response('Not found', { status: 404 });
}

export default { fetch: handleRequest };
