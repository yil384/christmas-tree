import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Icon } from './Icon';

export default function ShareGift({ notify }: { notify: (message: string) => void }) {
  const [url] = useState(() => window.location.href.split('#')[0].split('?')[0]);
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
    QRCode.toDataURL(url, { width: 720, margin: 4, errorCorrectionLevel: 'M', color: { dark: '#0b1b10', light: '#ffffff' } })
      .then(data => { if (active) setQr(data); })
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
      notify('链接已复制');
    } catch {
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
        try { await navigator.share({ title: '圣诞树', url }); return; }
        catch (error) { if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') return; }
      }
      await copyLink();
    } finally { setSharing(false); }
  };

  return <div className="share-content">
    <h2>分享圣诞树</h2>
    <div className="qr-card">
      {qr ? <img src={qr} width={260} height={260} alt="圣诞树二维码" /> : <div className="qr-placeholder" role="status"><p>{qrFailed ? '二维码加载失败' : '正在生成二维码…'}</p>{qrFailed && <button type="button" className="more-photos" onClick={() => setQrAttempt(value => value + 1)}>重试</button>}</div>}
      <p>扫码打开圣诞树</p>
    </div>
    <p className="share-tip">可以把链接或二维码发到微信。</p>
    <button type="button" className="primary-button" onClick={share} disabled={sharing}><Icon name="share" />{sharing ? '正在打开分享…' : '分享'}</button>
    <div className="copy-row">
      <input ref={linkInput} value={url} readOnly aria-label="圣诞树链接" onFocus={event => event.currentTarget.select()} onClick={event => event.currentTarget.select()} />
      <button type="button" onClick={copyLink} aria-label={copied ? '链接已复制' : '复制链接'}><Icon name={copied ? 'check' : 'copy'} /></button>
    </div>
    <p className="share-copy-status" role="status">{copied ? '链接已复制' : ''}</p>
    {manualCopy && <p className="share-tip" role="status">长按选中的链接复制，也可以按 Ctrl / ⌘ + C。</p>}
    {qr && <a className="download-qr" href={qr} download="christmas-tree-qr.png">保存二维码<Icon name="arrow" /></a>}
  </div>;
}
