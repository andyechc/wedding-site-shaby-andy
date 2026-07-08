export function getImageDimensions(id) {
  return null;
}

export function getBentoSpan(id, index) {
  return '';
}

export function bentoClassFromRatio(width, height) {
  if (!width || !height) return '';
  const ratio = width / height;
  if (ratio > 1.3) return 'col-span-2';
  if (ratio < 0.77) return 'row-span-2';
  return '';
}
