import { lazy, Suspense, useEffect, useState } from 'react';
import { resolveExperience } from './lib/experience-route';
import { assetUrl } from './lib/content';

const CastleRide = lazy(() => import('./journey/CastleRide'));
const ChristmasPage = lazy(() => import('./App'));

function currentExperience() {
  return resolveExperience(window.location.pathname);
}

export default function SeasonalEntry() {
  const [experience, setExperience] = useState(currentExperience);

  useEffect(() => {
    const refresh = () => setExperience(currentExperience());
    window.addEventListener('popstate', refresh);
    return () => window.removeEventListener('popstate', refresh);
  }, []);

  useEffect(() => {
    const isLetter = experience === 'letter';
    const title = isLetter ? '月光秘境 · 思仪' : '集美小喵的圣诞魔法';
    const description = isLetter
      ? '给谭陈思仪的城堡巡游，和一句我喜欢你。'
      : '送给集美小喵的圣诞魔法：童话城堡、雪中的小猫与一棵照片圣诞树。';
    document.title = title;
    document.querySelector('meta[name="description"]')?.setAttribute('content', description);
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', title);
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', description);
    document.querySelector('meta[property="og:image"]')?.setAttribute('content', isLetter
      ? 'https://tanchensiyi.com/journey/cover.webp'
      : 'https://tanchensiyi.com/film/starlight-return-poster.webp');
    const route = window.location.pathname.replace(/\/+$/, '');
    document.querySelector('meta[property="og:url"]')?.setAttribute('content',
      `https://tanchensiyi.com${route === '/letter' || route === '/christmas' ? `${route}/` : '/'}`);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isLetter ? '#080e25' : '#15203b');
  }, [experience]);

  return <Suspense fallback={<div role="status" aria-label="正在打开这一页" style={{ minHeight: '100svh', display: 'grid', placeItems: 'center', background: '#080e25' }}>
    <img src={assetUrl('icons/xiaomiao-mark-v2.svg')} width="48" height="48" alt="" />
  </div>}>
    {experience === 'letter' ? <CastleRide /> : <ChristmasPage />}
  </Suspense>;
}
