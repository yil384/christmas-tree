const OPENING_FILM_KEY = 'christmas-film-opening';
type SessionStore = Pick<Storage, 'getItem' | 'setItem'>;

function sessionStore(): SessionStore | undefined {
  try { return window.sessionStorage; }
  catch { return undefined; }
}

/** Offer each finished film once per tab, without interrupting an active visit. */
export function claimOpeningFilm(src: string | null, hasInteracted: boolean, storage = sessionStore()): boolean {
  if (!src || hasInteracted) return false;
  try {
    if (storage?.getItem(OPENING_FILM_KEY) === src) return false;
    storage?.setItem(OPENING_FILM_KEY, src);
  } catch { /* Private browsing may disable storage; this visit still works. */ }
  return true;
}

export function formatFilmDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return '';
  const rounded = Math.round(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`;
}
