import sizeOf from 'image-size';
import fs from 'fs';
import path from 'path';

const PUBLIC_DIR = path.join(process.cwd(), 'public');

export function getImageDimensions(id) {
  if (!id.startsWith('website-images/')) return null;

  const filePath = path.join(PUBLIC_DIR, id);
  if (!fs.existsSync(filePath)) return null;

  try {
    const { width, height } = sizeOf(filePath);
    return { width, height };
  } catch {
    return null;
  }
}

export function getBentoSpan(id, index) {
  const dims = getImageDimensions(id);
  if (!dims) {
    return getFallbackSpan(index);
  }

  const ratio = dims.width / dims.height;

  if (ratio > 1.3) {
    if (index % 3 === 0) return 'col-span-2 row-span-2';
    return 'col-span-2';
  }

  if (ratio < 0.77) {
    if (index % 5 === 0) return 'col-span-2 row-span-2';
    return 'row-span-2';
  }

  if (index % 7 === 0) return 'col-span-2 row-span-2';
  return '';
}

function getFallbackSpan(index) {
  const pattern = index % 8;
  if (pattern === 0) return 'col-span-2 row-span-2';
  if (pattern === 3 || pattern === 7) return 'col-span-2';
  if (pattern === 4) return 'row-span-2';
  return '';
}
