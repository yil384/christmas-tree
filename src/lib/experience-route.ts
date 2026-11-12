export type Experience = 'letter' | 'christmas';

// One shared instant for the custom domain. Explicit routes remain available
// before and after the change. The date can be adjusted without moving DNS.
export const CHRISTMAS_LAUNCH = Date.parse('2026-12-25T00:00:00+08:00');
const LEGACY_HOST = 'jimeixiaomiao.wildmole.chatgpt.site';

export function resolveExperience(pathname: string, hostname: string, now = Date.now()): Experience {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/christmas') return 'christmas';
  if (path === '/letter') return 'letter';
  if (hostname.toLowerCase().replace(/\.$/, '') === LEGACY_HOST) return 'christmas';
  return now >= CHRISTMAS_LAUNCH ? 'christmas' : 'letter';
}

export function nextSeasonCheck(now = Date.now()): number {
  // Stay within the browser's signed 32-bit timer limit; re-check at least
  // daily, and immediately on returning to a long-suspended tab.
  return Math.max(1000, Math.min(86_400_000, CHRISTMAS_LAUNCH - now));
}
