export interface Photo { id: string; src: string; thumbnail: string; width: number; height: number; alt: string; caption?: string; }
export interface Gift { recipient: string; headline: [string, string]; subtitle: string; letter: string[]; signature: string; year: string; music: string | null; }

export const defaultGift: Gift = {
  recipient: '亲爱的你', headline: ['把星光，', '都送给你。'], subtitle: '愿每一个平凡的日子，\n都有一点闪闪发光的小美好。',
  letter: ['想把冬天里温柔的东西，都放在这里送给你。', '一棵会发光的树，一场慢慢落下的雪，还有那些值得被记住的小小瞬间。', '愿你有热爱的事，有期待的明天。愿平凡的每一天，都有人惦记，也都有让你微笑的理由。'],
  signature: '送你这棵树的人', year: '2026', music: null,
};
export const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;
const text = (value: unknown, fallback: string) => typeof value === 'string' && value.trim() ? value.trim() : fallback;
export function readGift(data: unknown): Gift {
  if (!data || typeof data !== 'object') return defaultGift;
  const value = data as Record<string, unknown>;
  const headline = Array.isArray(value.headline) && value.headline.length === 2 && value.headline.every(line => typeof line === 'string' && line.trim()) ? value.headline as [string, string] : defaultGift.headline;
  const letter = Array.isArray(value.letter) && value.letter.length && value.letter.every(line => typeof line === 'string') ? value.letter as string[] : defaultGift.letter;
  const music = typeof value.music === 'string' && value.music.trim() && !/^(?:javascript|data):/i.test(value.music) ? value.music.trim() : null;
  const year = typeof value.year === 'number' && Number.isInteger(value.year) ? String(value.year) : text(value.year, defaultGift.year);
  return { recipient: text(value.recipient, defaultGift.recipient), headline, subtitle: text(value.subtitle, defaultGift.subtitle), letter, signature: text(value.signature, defaultGift.signature), year, music };
}
export function readPhotos(data: unknown): Photo[] {
  if (!data || typeof data !== 'object' || !('photos' in data) || !Array.isArray(data.photos)) throw new Error('Invalid photo manifest');
  return data.photos.filter((photo): photo is Photo => {
    if (!photo || typeof photo !== 'object') return false;
    return typeof photo.id === 'string' && typeof photo.src === 'string' && typeof photo.thumbnail === 'string' && /^generated\/photos\/[a-z0-9-]+\.webp$/.test(photo.src) && /^generated\/photos\/[a-z0-9-]+\.webp$/.test(photo.thumbnail) && typeof photo.alt === 'string' && Number.isFinite(photo.width) && Number.isFinite(photo.height);
  });
}
