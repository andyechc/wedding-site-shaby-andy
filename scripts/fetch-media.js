/**
 * fetch-media.js
 *
 * Fetches file IDs from Google Drive folders using the service account
 * and generates frontend/src/data/media.json
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

const EDITED_FOLDER_ID = '1Xb1NmvWM-2b-e-OaMMiwUcacToPiVvgc';
const NON_EDITED_FOLDER_ID = '1JxL3caLTKJ3Ehsf7KYriL8njnnoHR4D3';
const VIDEO_FILE_ID = '10T4AAJBmqfkTWwdexBiCdcId7fVicxJ9';

async function getAccessToken(sa) {
  const auth = new GoogleAuth({
    credentials: sa,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  return token;
}

async function listFiles(folderId, token) {
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

  return all
    .filter((f) => f.mimeType.startsWith('image/'))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((f) => f.id);
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

  console.log('Fetching Edited folder...');
  const edited = await listFiles(EDITED_FOLDER_ID, token);
  console.log(`  Found ${edited.length} images`);

  console.log('Fetching Non-edited folder...');
  const nonEdited = await listFiles(NON_EDITED_FOLDER_ID, token);
  console.log(`  Found ${nonEdited.length} images`);

  const output = {
    edited,
    nonEdited,
    video: {
      id: VIDEO_FILE_ID,
      title: 'Our Wedding Highlight',
    },
  };

  const outPath = path.join(__dirname, '..', 'frontend', 'src', 'data', 'media.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\nWritten to ${outPath}`);
}

main().catch(console.error);
