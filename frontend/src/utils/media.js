export function mediaUrl(id) {
  if (!id) return '';
  if (id.startsWith('website-images/')) return `/${id}`;
  return `/media/${id}`;
}
