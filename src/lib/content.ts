export interface PhotoAtlas {
  src: string;
  /** Normalized bottom-left UV offset and width/height, including half-texel inset. */
  rect: [number, number, number, number];
}
export interface Photo {
  id: string;
  src: string;
  thumbnail: string;
  ornament?: string;
  atlas?: PhotoAtlas;
  width: number;
  height: number;
  alt: string;
  caption?: string;
}
export const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;
const photoPath = /^generated\/photos\/[a-z0-9-]+\.webp$/;
function validAtlas(value: unknown): value is PhotoAtlas {
  if (!value || typeof value !== 'object' || !('src' in value) || !('rect' in value)) return false;
  const { src, rect } = value;
  return typeof src === 'string' && photoPath.test(src) && Array.isArray(rect) && rect.length === 4
    && rect.every(number => typeof number === 'number' && Number.isFinite(number) && number >= 0 && number <= 1)
    && rect[2] > 0 && rect[3] > 0 && rect[0] + rect[2] <= 1 && rect[1] + rect[3] <= 1;
}
export function readPhotos(data: unknown): Photo[] {
  if (!data || typeof data !== 'object' || !('photos' in data) || !Array.isArray(data.photos)) throw new Error('Invalid photo manifest');
  return data.photos.filter((photo): photo is Photo => {
    if (!photo || typeof photo !== 'object') return false;
    return typeof photo.id === 'string' && typeof photo.src === 'string' && typeof photo.thumbnail === 'string'
      && photoPath.test(photo.src) && photoPath.test(photo.thumbnail)
      && (photo.ornament === undefined || (typeof photo.ornament === 'string' && photoPath.test(photo.ornament)))
      && (photo.atlas === undefined || validAtlas(photo.atlas))
      && typeof photo.alt === 'string' && Number.isFinite(photo.width) && photo.width > 0
      && Number.isFinite(photo.height) && photo.height > 0;
  });
}
