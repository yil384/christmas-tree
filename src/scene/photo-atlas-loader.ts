interface PhotoAtlasLoaderOptions {
  atlasUrl?: string;
  cardUrls: string[];
  onAtlas: (image: HTMLImageElement) => void;
  onFallbackStart: () => void;
  onCard: (slot: number, image: HTMLImageElement) => void;
  onFallbackComplete: () => void;
  createImage?: () => HTMLImageElement;
}

/** One atlas attempt, then at most one bounded, three-lane card fallback. */
export function loadPhotoAtlas({ atlasUrl, cardUrls, onAtlas, onFallbackStart, onCard,
  onFallbackComplete, createImage = () => new Image() }: PhotoAtlasLoaderOptions) {
  let cancelled = false;
  let fallbackStarted = false;
  let nextSlot = 0;
  let completed = 0;
  const active = new Set<HTMLImageElement>();

  const request = (url: string, onDecoded: (image: HTMLImageElement) => void, onFailure: () => void) => {
    const image = createImage();
    let settled = false;
    let decoding = false;
    image.decoding = 'async';
    active.add(image);
    const settle = (callback: () => void) => {
      if (cancelled || settled) return;
      settled = true;
      active.delete(image);
      image.onload = null;
      image.onerror = null;
      callback();
    };
    const fail = () => settle(onFailure);
    image.onload = () => {
      if (cancelled || settled || decoding) return;
      decoding = true;
      try {
        const decoded = typeof image.decode === 'function' ? image.decode() : Promise.resolve();
        decoded.then(() => settle(() => onDecoded(image)), fail);
      } catch {
        fail();
      }
    };
    image.onerror = fail;
    image.src = url;
  };

  const startNext = () => {
    if (cancelled || nextSlot >= cardUrls.length) return;
    const slot = nextSlot++;
    const finish = () => {
      if (cancelled) return;
      completed++;
      startNext();
      // Even missing/broken cards finish their lane; reveal only the full batch.
      if (completed === cardUrls.length) onFallbackComplete();
    };
    request(cardUrls[slot], image => {
      try { onCard(slot, image); }
      catch { /* Keep this card's placeholder if drawing fails. */ }
      finally { finish(); }
    }, finish);
  };

  const startFallback = () => {
    if (cancelled || fallbackStarted) return;
    fallbackStarted = true;
    onFallbackStart();
    if (!cardUrls.length) {
      onFallbackComplete();
      return;
    }
    for (let lane = 0; lane < 3; lane++) startNext();
  };

  if (atlasUrl) request(atlasUrl, image => {
    if (!fallbackStarted) onAtlas(image);
  }, startFallback);
  else startFallback();

  return () => {
    cancelled = true;
    active.forEach(image => {
      image.onload = null;
      image.onerror = null;
      image.src = '';
    });
    active.clear();
  };
}
