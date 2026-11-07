type IconName = 'sparkle' | 'arrow' | 'letter' | 'photos' | 'snow' | 'sound' | 'muted' | 'share' | 'hand' | 'pause' | 'play' | 'close' | 'left' | 'copy' | 'check';
export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  return <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === 'sparkle' && <><path d="m12 2 2.8 7.2L22 12l-7.2 2.8L12 22l-2.8-7.2L2 12l7.2-2.8L12 2Z" /><path d="m20 2 .5 1.5L22 4l-1.5.5L20 6l-.5-1.5L18 4l1.5-.5L20 2Z" /></>}
    {name === 'arrow' && <path d="M4 12h15m-5-5 5 5-5 5" />}
    {name === 'left' && <path d="M15 5 8 12l7 7" />}
    {name === 'letter' && <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 6 9 7 9-7" /></>}
    {name === 'photos' && <><rect x="7" y="3" width="14" height="17" rx="2" /><path d="M4 7H3v15h13v-1M7 16h14m-12-3 3-4 3 3 2-2 3 3" /><circle cx="17" cy="7" r="1" /></>}
    {name === 'snow' && <path d="M12 2v20M3.4 7l17.2 10M3.4 17 20.6 7M9 4l3 3 3-3M9 20l3-3 3 3M4 10l4-1-1-4m13 9-4 1 1 4M7 19l1-4-4-1m13-9-1 4 4 1" />}
    {(name === 'sound' || name === 'muted') && <><path d="m11 4-6 5H2v6h3l6 5V4Z" />{name === 'sound' ? <path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" /> : <path d="m16 9 6 6m0-6-6 6" />}</>}
    {name === 'share' && <path d="M12 16V3m-4 4 4-4 4 4M5 11v9h14v-9" />}
    {name === 'hand' && <path d="M8 12V5a2 2 0 0 1 4 0v6-3a2 2 0 0 1 4 0v3-1a2 2 0 0 1 4 0v6c0 4-3 6-6 6h-1c-2 0-4-1-5-3l-4-5a2 2 0 0 1 3-2l1 1" />}
    {name === 'pause' && <path d="M8 5v14M16 5v14" />}
    {name === 'play' && <path d="m8 4 11 8-11 8V4Z" />}
    {name === 'close' && <path d="m6 6 12 12M6 18 18 6" />}
    {name === 'copy' && <><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M15 8V3H3v13h5" /></>}
    {name === 'check' && <path d="m4 12 5 5L20 6" />}
  </svg>;
}
