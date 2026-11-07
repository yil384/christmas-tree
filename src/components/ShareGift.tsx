import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Icon } from './Icon';

type ShareGiftProps = { recipient: string; year: string; notify: (message: string) => void };

export default function ShareGift({ recipient, year, notify }: ShareGiftProps) {
  const [url] = useState(() => window.location.href.split('#')[0]);
  const [qr, setQr] = useState('');
  const [qrFailed, setQrFailed] = useState(false);
  const [qrAttempt, setQrAttempt] = useState(0);
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [manualCopy, setManualCopy] = useState(false);
  const linkInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    setQrFailed(false);
    QRCode.toDataURL(url, {
      width: 720,
      margin: 4,
      errorCorrectionLevel: 'M',
      color: { dark: '#153c2e', light: '#faf5e9' },
    }).then(data => { if (active) setQr(data); })
      .catch(() => { if (active) setQrFailed(true); });
    return () => { active = false; };
  }, [url, qrAttempt]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copyLink = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setManualCopy(false);
      notify('链接已复制，可以把这份礼物发出去了。');
    } catch {
      setManualCopy(true);
      linkInput.current?.focus();
      linkInput.current?.select();
      linkInput.current?.setSelectionRange(0, url.length);
      notify('请长按下方链接，选择“复制”。');
    }
  };

  const share = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      if (navigator.share) {
        try {
          await navigator.share({
            title: `送给${recipient || '你'}的圣诞树`,
            text: '给你留了一棵圣诞树，点开看看 🎄',
            url,
          });
          return;
        } catch (error) {
          if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') return;
        }
      }
      await copyLink();
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="share-content">
      <p className="overline">A LITTLE GIFT, JUST FOR YOU</p>
      <h2>让心意，抵达你。</h2>
      <div className="qr-card">
        <Icon name="sparkle" />
        <p>{recipient}，圣诞快乐</p>
        {qr ? (
          <img src={qr} width={260} height={260} alt={`扫码打开送给${recipient || '你'}的圣诞树`} />
        ) : (
          <div className="qr-placeholder" role="status">
            <Icon name="sparkle" />
            <p>{qrFailed ? '二维码暂时没准备好' : '正在把心意装进二维码…'}</p>
            {qrFailed && <button type="button" className="more-photos" onClick={() => setQrAttempt(value => value + 1)}>再试一次</button>}
          </div>
        )}
        <p>送给{recipient || '你'} · {year}</p>
        <span>扫码，打开这份圣诞礼物</span>
      </div>

      <p className="share-tip">发到微信，或印在一张小卡片上。<br />在微信里，也可以长按二维码保存。</p>
      <button type="button" className="primary-button" onClick={share} disabled={sharing}>
        <Icon name="share" />{sharing ? '正在打开分享…' : '分享这份礼物'}
      </button>

      <div className="copy-row">
        <input
          ref={linkInput}
          value={url}
          readOnly
          aria-label="圣诞树链接"
          onFocus={event => event.currentTarget.select()}
          onClick={event => event.currentTarget.select()}
        />
        <button type="button" onClick={copyLink} aria-label={copied ? '链接已复制' : '复制链接'}>
          <Icon name={copied ? 'check' : 'copy'} />
        </button>
      </div>
      <p className="share-copy-status" role="status">{copied ? '链接已复制，可以贴到微信里。' : ''}</p>
      {manualCopy && <p className="share-tip" role="status">已选中链接，长按后选择“复制”，也可以按 Ctrl / ⌘ + C。</p>}
      {qr && <a className="download-qr" href={qr} download={`christmas-tree-${year.replace(/[^\w-]/g, '') || 'gift'}.png`}>
        保存二维码<Icon name="arrow" />
      </a>}
    </div>
  );
}
