const WORKER_URL = 'https://boda-media-proxy.andyechc.workers.dev';

export { WORKER_URL };

export function mediaUrl(id) {
  if (!id) return '';
  return `${WORKER_URL}/media/${id}`;
}

export function hlsUrl(folderId, filePath) {
  if (!folderId || !filePath) return '';
  return `${WORKER_URL}/hls/${folderId}/${filePath}`;
}
