export function mediaUrl(id) {
  if (!id) return '';
  if (id.startsWith('website-images/')) return `/${id}`;
  return `https://boda-media-proxy.andyechc.workers.dev/media/${id}`;
}
