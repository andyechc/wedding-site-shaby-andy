const WORKER_ORIGIN = import.meta.env.PUBLIC_WORKER_ORIGIN || 'https://boda-media-proxy.andyechc.workers.dev';

export function mediaUrl(id) {
  if (!id) return '';
  if (id.startsWith('website-images/')) return `/${id}`;
  return `${WORKER_ORIGIN}/media/${id}`;
}
