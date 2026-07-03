const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const os = require('os');

const frontendModules = path.join(__dirname, '..', 'frontend', 'node_modules');
const modulePath = require.resolve('google-auth-library', { paths: [frontendModules] });
const { GoogleAuth } = require(modulePath);

const MEDIA_PATH = path.join(__dirname, '..', 'frontend', 'src', 'data', 'media.json');
const WEBP_QUALITY = 55;

function resolveInput() {
  const idx = process.argv.indexOf('--input');
  if (idx !== -1) return process.argv[idx + 1];
  return path.join(os.homedir(), 'Documents', '439-Boda 250426');
}

function loadSA() {
  const keyArgIndex = process.argv.indexOf('--key');
  if (keyArgIndex !== -1) {
    return JSON.parse(fs.readFileSync(process.argv[keyArgIndex + 1], 'utf8'));
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
  return token;
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

function readPhotos(folder, label) {
  const dir = path.join(folder, label);
  if (!fs.existsSync(dir)) {
    console.error(`Folder not found: ${dir}`);
    process.exit(1);
  }
  return fs.readdirSync(dir)
    .filter(f => /\.(jpg|jpeg|png|tiff?)$/i.test(f))
    .sort((a, b) => a.localeCompare(b));
}

async function main() {
  const inputDir = resolveInput();
  const sa = loadSA();
  const token = await getToken(sa);

  console.log(`Input: ${inputDir}`);
  console.log(`Compressing to WebP (quality ${WEBP_QUALITY})...\n`);

  const compressBatch = async (label) => {
    const files = readPhotos(inputDir, label);
    const newIds = [];

    for (let i = 0; i < files.length; i++) {
      const filePath = path.join(inputDir, label, files[i]);
      process.stdout.write(`  [${label}] ${i + 1}/${files.length} (${files[i].slice(0, 30)}) `);

      try {
        const buf = fs.readFileSync(filePath);
        const webp = await sharp(buf).webp({ quality: WEBP_QUALITY }).toBuffer();
        const newId = await uploadWebp(webp, `wedding_${label}_${i}.webp`, token);
        newIds.push(newId);
        const saved = ((buf.length - webp.length) / buf.length * 100).toFixed(0);
        process.stdout.write(`✓ ${saved}% smaller\n`);
      } catch (err) {
        process.stdout.write(`✗ ${err.message}\n`);
      }
    }

    return newIds;
  };

  console.log('Edited photos:');
  const edited = await compressBatch('Edited');
  console.log('\nNon-edited photos:');
  const nonEdited = await compressBatch('Non-edited');

  const media = { edited, nonEdited, video: { id: '10T4AAJBmqfkTWwdexBiCdcId7fVicxJ9', title: 'Our Wedding Highlight' } };
  fs.writeFileSync(MEDIA_PATH, JSON.stringify(media, null, 2));
  console.log(`\nDone! Updated ${MEDIA_PATH}`);
}

main().catch(console.error);
