const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const frontendModules = path.join(__dirname, '..', 'frontend', 'node_modules');
const modulePath = require.resolve('google-auth-library', { paths: [frontendModules] });
const { GoogleAuth } = require(modulePath);

const MEDIA_PATH = path.join(__dirname, '..', 'frontend', 'src', 'data', 'media.json');
const WEBP_QUALITY = 55;

function loadSA() {
  const keyArgIndex = process.argv.indexOf('--key');
  if (keyArgIndex !== -1) {
    const keyPath = process.argv[keyArgIndex + 1];
    return JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  }
  if (process.env.GOOGLE_SERVICE_ACCOUNT) {
    return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  }
  console.error('Provide service account via --key <path> or GOOGLE_SERVICE_ACCOUNT env');
  process.exit(1);
}

async function getToken(sa) {
  const auth = new GoogleAuth({
    credentials: sa,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  return { token, auth, client };
}

async function downloadImage(id, token) {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${id}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`Download ${id}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function uploadWebp(buffer, name, token) {
  const boundary = 'boundary_' + Math.random().toString(36).slice(2);
  const metadata = JSON.stringify({ name });
  const enc = (s) => Buffer.from(s, 'utf8');

  const parts = [
    enc(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`),
    enc(`--${boundary}\r\nContent-Type: image/webp\r\n\r\n`),
    buffer,
    enc(`\r\n--${boundary}--\r\n`),
  ];

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: Buffer.concat(parts),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload: ${res.status} ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.id;
}

async function main() {
  const sa = loadSA();
  const { token } = await getToken(sa);

  const media = JSON.parse(fs.readFileSync(MEDIA_PATH, 'utf8'));
  const total = media.edited.length + media.nonEdited.length;
  console.log(`Compressing ${total} images to WebP (quality ${WEBP_QUALITY})...\n`);

  const compressBatch = async (ids, label) => {
    const newIds = [];
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      process.stdout.write(`  [${label}] ${i + 1}/${ids.length} (${id.slice(0, 12)}...) `);
      try {
        const buf = await downloadImage(id, token);
        const webp = await sharp(buf).webp({ quality: WEBP_QUALITY }).toBuffer();
        const newId = await uploadWebp(webp, `wedding_${label}_${i}.webp`, token);
        newIds.push(newId);
        const saved = ((buf.length - webp.length) / buf.length * 100).toFixed(0);
        process.stdout.write(`✓ ${saved}% smaller\n`);
      } catch (err) {
        process.stdout.write(`✗ ${err.message}\n`);
        newIds.push(id);
      }
    }
    return newIds;
  };

  console.log('Edited photos:');
  media.edited = await compressBatch(media.edited, 'edited');

  console.log('\nNon-edited photos:');
  media.nonEdited = await compressBatch(media.nonEdited, 'nonEdited');

  fs.writeFileSync(MEDIA_PATH, JSON.stringify(media, null, 2));
  console.log(`\nDone! Updated ${MEDIA_PATH}`);
}

main().catch(console.error);
