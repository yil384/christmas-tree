import { lazy, Suspense, useEffect, useState } from 'react';
import { CHRISTMAS_LAUNCH, nextSeasonCheck, resolveExperience } from './lib/experience-route';
import { assetUrl } from './lib/content';

const CastleRide = lazy(() => import('./journey/CastleRide'));
const ChristmasPage = lazy(() => import('./App'));

function currentExperience() {
  return resolveExperience(window.location.pathname, window.location.hostname);
}

export default function SeasonalEntry() {
  const [experience, setExperience] = useState(currentExperience);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      setExperience(currentExperience());
      if (Date.now() < CHRISTMAS_LAUNCH) timer = setTimeout(refresh, nextSeasonCheck());
    };
    const onVisibility = () => { if (!document.hidden) refresh(); };
    refresh();
    window.addEventListener('focus', refresh);
    window.addEventListener('popstate', refresh);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('popstate', refresh);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  useEffect(() => {
    const isLetter = experience === 'letter';
    document.title = isLetter ? '月光秘境 · 思仪' : '集美小喵的圣诞魔法';
    document.querySelector('meta[name="description"]')?.setAttribute('content', isLetter
      ? '给谭陈思仪的城堡巡游，和一句我喜欢你。'
      : '送给集美小喵的圣诞魔法：童话城堡、雪中的小猫与一棵照片圣诞树。');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isLetter ? '#080e25' : '#15203b');
  }, [experience]);

  return <Suspense fallback={<div role="status" aria-label="正在打开这一页" style={{ minHeight: '100svh', display: 'grid', placeItems: 'center', background: '#080e25' }}>
    <img src={assetUrl('icons/xiaomiao-chibi-v1-48.png')} width="48" height="48" alt="" />
  </div>}>
    {experience === 'letter' ? <CastleRide /> : <ChristmasPage />}
  </Suspense>;
}
