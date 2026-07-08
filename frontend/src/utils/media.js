const WORKER_URL = 'https://shaby-and-andy-wedding.andyechc.workers.dev';

export { WORKER_URL };

export function mediaUrl(id) {
  if (!id) return '';
  return `${WORKER_URL}/media/${id}`;
}

export function hlsUrl(folderId, filePath) {
  if (!folderId || !filePath) return '';
  return `${WORKER_URL}/hls/${folderId}/${filePath}`;
}
