export interface Photo { id: string; src: string; thumbnail: string; width: number; height: number; alt: string; caption?: string; }
export const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;
export function readPhotos(data: unknown): Photo[] {
  if (!data || typeof data !== 'object' || !('photos' in data) || !Array.isArray(data.photos)) throw new Error('Invalid photo manifest');
  return data.photos.filter((photo): photo is Photo => {
    if (!photo || typeof photo !== 'object') return false;
    return typeof photo.id === 'string' && typeof photo.src === 'string' && typeof photo.thumbnail === 'string' && /^generated\/photos\/[a-z0-9-]+\.webp$/.test(photo.src) && /^generated\/photos\/[a-z0-9-]+\.webp$/.test(photo.thumbnail) && typeof photo.alt === 'string' && Number.isFinite(photo.width) && photo.width > 0 && Number.isFinite(photo.height) && photo.height > 0;
  });
}
