export function getImageDimensions(id) {
  return null;
}

export function getBentoSpan(id, index) {
  return getFallbackSpan(index);
}

function getFallbackSpan(index) {
  const pattern = index % 8;
  if (pattern === 0) return 'col-span-2 row-span-2';
  if (pattern === 3 || pattern === 7) return 'col-span-2';
  if (pattern === 4) return 'row-span-2';
  return '';
}
