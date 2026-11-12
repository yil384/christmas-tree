import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { assetUrl } from '../lib/content';
import { createGiftCard, DEFAULT_GIFT_GREETING } from './gift-card';
import { Icon } from './Icon';
import './ShareGift.css';

interface ShareGiftProps {
  notify: (message: string) => void;
  greeting?: string;
  catSrc?: string | null;
}

export default function ShareGift({ notify, greeting = DEFAULT_GIFT_GREETING, catSrc = null }: ShareGiftProps) {
  const [url] = useState(() => {
    const current = new URL(window.location.href);
    current.search = '';
    current.hash = '';
    return current.href;
  });
  const [qr, setQr] = useState('');
  const [qrFailed, setQrFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [card, setCard] = useState<{ src: string; blob: Blob } | null>(null);
  const [cardFailed, setCardFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [manualCopy, setManualCopy] = useState(false);
  const linkInput = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setQr('');
    setQrFailed(false);
    QRCode.toDataURL(url, { width: 720, margin: 4, errorCorrectionLevel: 'M', color: { dark: '#18213c', light: '#ffffff' } })
      .then(data => { if (active) setQr(data); })
      .catch(() => { if (active) setQrFailed(true); });
    return () => { active = false; };
  }, [url, attempt]);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = '';
    setCard(null);
    setCardFailed(false);
    createGiftCard({ url, text: greeting, catUrl: catSrc ? assetUrl(catSrc) : null, signal: controller.signal })
      .then(blob => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setCard({ src: objectUrl, blob });
      })
      .catch(() => { if (!controller.signal.aborted) setCardFailed(true); });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, greeting, catSrc, attempt]);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copyLink = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(url);
      if (!mounted.current) return;
      setCopied(true);
      setManualCopy(false);
      notify('链接已复制');
    } catch {
      if (!mounted.current) return;
      setManualCopy(true);
      linkInput.current?.focus();
      linkInput.current?.select();
      linkInput.current?.setSelectionRange(0, url.length);
    }
  };
  const share = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      if (navigator.share) {
        try {
          const file = card ? new File([card.blob], 'xiaomiao-christmas-card.png', { type: 'image/png' }) : null;
          const data = file && navigator.canShare?.({ files: [file] })
            ? { title: greeting, files: [file], url }
            : { title: greeting, url };
          await navigator.share(data);
          return;
        } catch (error) {
          if (!mounted.current || (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError')) return;
        }
      }
      await copyLink();
    } finally { if (mounted.current) setSharing(false); }
  };

  return <div className="share-content share-gift">
    <header className="share-gift-heading">
      <p>CHRISTMAS WISHES</p>
      <h2>把圣诞魔法装进贺卡</h2>
    </header>
    <div className="share-gift-layout">
      <div className="share-gift-preview" aria-busy={!card && !cardFailed}>
        {card ? <img className="share-gift-image" src={card.src} width={1200} height={1800} alt={`${greeting}，扫码打开圣诞树的贺卡`} />
          : <div className="share-gift-placeholder" role="status">
            {cardFailed && qr ? <img className="share-gift-fallback-qr" src={qr} width={240} height={240} alt="圣诞树二维码" /> : <Icon name="sparkle" />}
            <p>{cardFailed ? '贺卡暂时未能生成' : '正在制作你的圣诞贺卡…'}</p>
            {cardFailed && <button type="button" className="more-photos" onClick={() => setAttempt(value => value + 1)}>重新制作</button>}
          </div>}
      </div>
      <div className="share-gift-actions">
        <p className="share-gift-lead">让这一夜的星光<br />陪伴每一个美好愿望。</p>
        <p className="share-gift-description">保存贺卡发到微信，扫一扫，<br />就能走进这棵圣诞树。</p>
        {card ? <a className="share-gift-save" href={card.src} download="xiaomiao-christmas-card.png"><Icon name="photos" />保存贺卡 PNG</a>
          : <button className="share-gift-save" type="button" disabled>{cardFailed ? '贺卡暂不可用' : '贺卡制作中…'}</button>}
        <button type="button" className="share-gift-share" onClick={share} disabled={sharing}><Icon name="share" />{sharing ? '正在打开分享…' : '分享这份祝福'}</button>
        <p className="share-gift-save-tip">微信内也可长按贺卡，保存到相册。</p>
        <div className="copy-row">
          <input ref={linkInput} value={url} readOnly aria-label="圣诞树链接" onFocus={event => event.currentTarget.select()} onClick={event => event.currentTarget.select()} />
          <button type="button" onClick={copyLink} aria-label={copied ? '链接已复制' : '复制链接'} title={copied ? '链接已复制' : '复制链接'}><Icon name={copied ? 'check' : 'copy'} /></button>
        </div>
        <p className="share-copy-status" role="status">{copied ? '链接已复制' : manualCopy ? '长按选中的链接复制，或按 Ctrl / ⌘ + C。' : '也可以直接复制链接。'}</p>
        {qr ? <a className="download-qr" href={qr} download="christmas-tree-qr.png">保存纯二维码<Icon name="arrow" /></a>
          : qrFailed ? <button className="share-gift-qr-retry" type="button" onClick={() => setAttempt(value => value + 1)}>重新生成二维码</button>
            : <p className="share-gift-qr-status" role="status">二维码生成中…</p>}
      </div>
    </div>
  </div>;
}
