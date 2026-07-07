/**
 * fetch-media.js
 *
 * Fetches file IDs from Google Drive folders using the service account
 * and generates frontend/src/data/media.json
 *
 * All images are served via the Cloudflare Worker proxy (no Vercel bandwidth).
 * Video uses HLS streaming via the Worker.
 *
 * Usage:
 *   export GOOGLE_SERVICE_ACCOUNT='{...}'  # JSON key
 *   node scripts/fetch-media.js
 *
 * Or create a service-account.json file and run:
 *   node scripts/fetch-media.js --key ./service-account.json
 */

const fs = require('fs');
const path = require('path');

// Resolve google-auth-library from frontend/node_modules
const frontendModules = path.join(__dirname, '..', 'frontend', 'node_modules');
const modulePath = require.resolve('google-auth-library', { paths: [frontendModules] });
const { GoogleAuth } = require(modulePath);

const WEBSITE_IMAGES_FOLDER_ID = '1x5rLvVQnLr2Po8jEygiORIiWNGlfuESe';
const HLS_STREAM_FOLDER_ID = '1CB1YfKlCnRZrUqrE2UqrjGgw0sBXh6iY';

async function getAccessToken(sa) {
  const auth = new GoogleAuth({
    credentials: sa,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  return token;
}

async function listFiles(folderId, token, mimeTypeFilter) {
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

  let filtered = all;
  if (mimeTypeFilter) {
    filtered = all.filter((f) => f.mimeType.startsWith(mimeTypeFilter));
  }

  return filtered.sort((a, b) => a.name.localeCompare(b.name));
}

async function listFolderRecursive(folderId, token) {
  const mapping = {};
  const rootFiles = await listFiles(folderId, token);

  for (const file of rootFiles) {
    if (file.mimeType === 'application/vnd.google-apps.folder') {
      const subFiles = await listFiles(file.id, token);
      for (const subFile of subFiles) {
        mapping[`${file.name}/${subFile.name}`] = subFile.id;
      }
    } else {
      mapping[file.name] = file.id;
    }
  }

  return mapping;
}

async function main() {
  let sa;
  const keyArgIndex = process.argv.indexOf('--key');
  if (keyArgIndex !== -1) {
    const keyPath = process.argv[keyArgIndex + 1];
    sa = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  } else if (process.env.GOOGLE_SERVICE_ACCOUNT) {
    sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  } else {
    console.error('Provide service account via --key <path> or GOOGLE_SERVICE_ACCOUNT env');
    process.exit(1);
  }

  console.log('Authenticating...');
  const token = await getAccessToken(sa);

  console.log('Fetching website-images folder...');
  const allImages = await listFiles(WEBSITE_IMAGES_FOLDER_ID, token, 'image/');
  console.log(`  Found ${allImages.length} images total`);

  const edited = [];
  const nonEdited = [];

  for (const file of allImages) {
    if (file.name.startsWith('Edited_')) {
      edited.push(file.id);
    } else if (file.name.startsWith('Non-edited_')) {
      nonEdited.push(file.id);
    }
  }

  console.log(`  Edited: ${edited.length}`);
  console.log(`  Non-edited: ${nonEdited.length}`);

  console.log('Fetching hls-stream folder structure...');
  const hlsMapping = await listFolderRecursive(HLS_STREAM_FOLDER_ID, token);
  const hlsFiles = Object.keys(hlsMapping);
  console.log(`  Found ${hlsFiles.length} HLS files`);

  const output = {
    edited,
    nonEdited,
    video: {
      id: HLS_STREAM_FOLDER_ID,
      title: 'Our Wedding Highlight',
    },
    hls: hlsMapping,
  };

  const outPath = path.join(__dirname, '..', 'frontend', 'src', 'data', 'media.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\nWritten to ${outPath}`);
}

main().catch(console.error);
