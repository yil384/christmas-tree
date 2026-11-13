export type Experience = 'letter' | 'christmas';

// Restored on the owner's request, 2026-11-13. The home page no longer depends
// on a visitor's clock or a future seasonal switch. Both fixed entries remain.
export function resolveExperience(pathname: string): Experience {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/letter') return 'letter';
  return 'christmas';
}
