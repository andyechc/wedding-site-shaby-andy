const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const os = require('os');

const OUTPUT_DIR = path.join(__dirname, '..', 'frontend', 'public', 'website-images');
const MEDIA_PATH = path.join(__dirname, '..', 'frontend', 'src', 'data', 'media.json');
const WEBP_QUALITY = 80;
const MAX_WIDTH = 1200;

function resolveInput() {
  const idx = process.argv.indexOf('--input');
  if (idx !== -1) return process.argv[idx + 1];
  return path.join(os.homedir(), 'Documents', '439-Boda 250426');
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
  const outDir = OUTPUT_DIR;

  fs.mkdirSync(outDir, { recursive: true });
  console.log(`Input:  ${inputDir}`);
  console.log(`Output: ${outDir}`);
  console.log(`WebP quality: ${WEBP_QUALITY}\n`);

  const compressBatch = async (label) => {
    const files = readPhotos(inputDir, label);
    const paths = [];

    for (let i = 0; i < files.length; i++) {
      const src = path.join(inputDir, label, files[i]);
      const name = `${label}_${i}.webp`;
      const dest = path.join(outDir, name);
      paths.push(`website-images/${name}`);

      if (fs.existsSync(dest)) {
        continue;
      }

      process.stdout.write(`  [${label}] ${i + 1}/${files.length} (${files[i].slice(0, 30)}) `);
      try {
        const buf = fs.readFileSync(src);
        const webp = await sharp(buf)
          .resize({ width: MAX_WIDTH, withoutEnlargement: true })
          .webp({ quality: WEBP_QUALITY })
          .toBuffer();
        fs.writeFileSync(dest, webp);
        const saved = ((buf.length - webp.length) / buf.length * 100).toFixed(0);
        process.stdout.write(`\u2713 ${saved}% smaller\n`);
      } catch (err) {
        process.stdout.write(`\u2717 ${err.message}\n`);
      }
    }

    return paths;
  };

  console.log('Edited photos:');
  const edited = await compressBatch('Edited');
  console.log('\nNon-edited photos:');
  const nonEdited = await compressBatch('Non-edited');

  const media = {
    edited,
    nonEdited,
    video: { id: '10T4AAJBmqfkTWwdexBiCdcId7fVicxJ9', title: 'Our Wedding Highlight' },
  };
  fs.writeFileSync(MEDIA_PATH, JSON.stringify(media, null, 2));
  console.log(`\nDone! ${edited.length + nonEdited.length} images processed`);
  console.log(`Updated ${MEDIA_PATH}`);
}

main().catch(console.error);
