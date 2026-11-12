import QRCode from 'qrcode';

export const DEFAULT_GIFT_GREETING = '祝集美小喵【zkl】圣诞节快乐';
const WIDTH = 1200;
const HEIGHT = 1800;
const SERIF = '"Songti SC", "Noto Serif CJK SC", "STSong", "SimSun", serif';
const SANS = '"PingFang SC", "Microsoft YaHei", sans-serif';

function checkCancelled(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('Card generation cancelled', 'AbortError');
}

function loadCat(src: string | null, signal: AbortSignal): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    checkCancelled(signal);
    const image = new Image();
    image.decoding = 'async';
    let finished = false;
    const cleanup = () => {
      window.clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      signal.removeEventListener('abort', cancel);
    };
    const complete = (loaded: boolean) => {
      if (finished) return;
      finished = true;
      cleanup();
      if (!loaded) image.src = '';
      resolve(loaded ? image : null);
    };
    const cancel = () => {
      if (finished) return;
      finished = true;
      cleanup();
      image.src = '';
      reject(new DOMException('Card generation cancelled', 'AbortError'));
    };
    const timer = window.setTimeout(() => complete(false), 4000);
    signal.addEventListener('abort', cancel, { once: true });
    image.onload = () => complete(image.naturalWidth > 0 && image.naturalHeight > 0);
    image.onerror = () => complete(false);
    image.src = src;
  });
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function star(context: CanvasRenderingContext2D, x: number, y: number, size: number, alpha = 1) {
  context.save();
  context.globalAlpha = alpha;
  context.fillStyle = '#f5dbab';
  context.beginPath();
  context.moveTo(x, y - size);
  context.quadraticCurveTo(x + size * .12, y - size * .12, x + size * .65, y);
  context.quadraticCurveTo(x + size * .12, y + size * .12, x, y + size);
  context.quadraticCurveTo(x - size * .12, y + size * .12, x - size * .65, y);
  context.quadraticCurveTo(x - size * .12, y - size * .12, x, y - size);
  context.fill();
  context.restore();
}

function spacedText(context: CanvasRenderingContext2D, text: string, y: number, spacing: number) {
  const letters = Array.from(text);
  const width = letters.reduce((total, letter) => total + context.measureText(letter).width, 0) + spacing * (letters.length - 1);
  let x = (WIDTH - width) / 2;
  context.save();
  context.textAlign = 'left';
  for (const letter of letters) {
    context.fillText(letter, x, y);
    x += context.measureText(letter).width + spacing;
  }
  context.restore();
}

function wrapText(context: CanvasRenderingContext2D, text: string, width: number) {
  const lines: string[] = [];
  let line = '';
  for (const letter of Array.from(text)) {
    if (letter === '\n' || (line && context.measureText(line + letter).width > width)) {
      lines.push(line);
      line = letter === '\n' ? '' : letter;
    } else line += letter;
  }
  if (line) lines.push(line);
  return lines;
}

function greeting(context: CanvasRenderingContext2D, value: string) {
  const text = value.trim() || DEFAULT_GIFT_GREETING;
  const christmas = /^(.*?)(圣诞节快乐[！!]?)$/u.exec(text);
  context.textAlign = 'center';
  context.fillStyle = '#f8ead4';
  if (christmas?.[1] && christmas[1].length < 24) {
    context.font = `400 67px ${SERIF}`;
    context.fillText(christmas[1], WIDTH / 2, 263, 980);
    context.font = `400 100px ${SERIF}`;
    context.fillText(christmas[2], WIDTH / 2, 379, 980);
    return;
  }
  let size = 82;
  let lines: string[];
  do {
    context.font = `400 ${size}px ${SERIF}`;
    lines = wrapText(context, text, 980);
    if (lines.length <= 3 || size <= 28) break;
    size -= 4;
  } while (size > 0);
  const lineHeight = Math.min(98, 220 / Math.max(1, lines.length));
  const firstY = 305 - (lines.length - 1) * lineHeight / 2;
  lines.forEach((line, index) => context.fillText(line, WIDTH / 2, firstY + index * lineHeight, 980));
}

function tree(context: CanvasRenderingContext2D, x: number, bottom: number, height: number, alpha: number) {
  context.save();
  context.translate(x, bottom - height);
  context.globalAlpha = alpha;
  const fill = context.createLinearGradient(-height * .3, 0, height * .4, height);
  fill.addColorStop(0, '#9ebca4');
  fill.addColorStop(.5, '#487a62');
  fill.addColorStop(1, '#203f3d');
  context.fillStyle = fill;
  context.strokeStyle = '#d7c7a68c';
  context.lineWidth = 1.6;
  for (let layer = 0; layer < 5; layer++) {
    const tip = height * layer * .145;
    const base = height * (.29 + layer * .165);
    const halfWidth = height * (.13 + layer * .056);
    context.beginPath();
    context.moveTo(0, tip);
    context.quadraticCurveTo(halfWidth * .3, base - height * .05, halfWidth, base);
    context.quadraticCurveTo(0, base + height * .045, -halfWidth, base);
    context.quadraticCurveTo(-halfWidth * .3, base - height * .05, 0, tip);
    context.fill();
    context.stroke();
  }
  context.fillStyle = '#f3dba8';
  for (let light = 0; light < 17; light++) {
    const progress = .15 + light / 22;
    const lightX = Math.sin(light * 2.4) * height * progress * .25;
    context.beginPath();
    context.arc(lightX, progress * height, 2.6, 0, Math.PI * 2);
    context.fill();
  }
  star(context, 0, -7, height * .055);
  context.restore();
}

function background(context: CanvasRenderingContext2D) {
  const night = context.createLinearGradient(0, 0, WIDTH * .7, HEIGHT);
  night.addColorStop(0, '#17364f');
  night.addColorStop(.45, '#2d4857');
  night.addColorStop(1, '#0c2036');
  context.fillStyle = night;
  context.fillRect(0, 0, WIDTH, HEIGHT);
  const halo = context.createRadialGradient(600, 760, 40, 600, 760, 660);
  halo.addColorStop(0, '#edd39930');
  halo.addColorStop(.55, '#e4c99310');
  halo.addColorStop(1, '#e4c99300');
  context.fillStyle = halo;
  context.fillRect(0, 0, WIDTH, HEIGHT);

  let seed = 2749;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let index = 0; index < 140; index++) {
    const x = 84 + random() * 1032;
    const y = 86 + random() * 1628;
    const radius = .7 + random() * 1.8;
    context.fillStyle = `rgba(244,232,212,${.13 + random() * .35})`;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
  context.strokeStyle = '#ddc59b80';
  context.lineWidth = 1.8;
  roundedRect(context, 54, 54, WIDTH - 108, HEIGHT - 108, 34);
  context.stroke();
  context.strokeStyle = '#ddc59b26';
  roundedRect(context, 68, 68, WIDTH - 136, HEIGHT - 136, 25);
  context.stroke();
  for (const [x, y, size] of [[143, 238, 19], [1054, 205, 17], [227, 553, 23], [995, 531, 28], [171, 936, 13], [1020, 1008, 16]]) {
    star(context, x, y, size, .85);
  }
  context.strokeStyle = '#d6bf8a4d';
  context.beginPath();
  context.moveTo(242, 832);
  context.bezierCurveTo(184, 432, 948, 400, 971, 852);
  context.stroke();
}

async function pngBlob(canvas: HTMLCanvasElement, signal: AbortSignal) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (signal.aborted) reject(new DOMException('Card generation cancelled', 'AbortError'));
      else if (blob) resolve(blob);
      else reject(new Error('Unable to export the Christmas card'));
    }, 'image/png');
  });
}

/** Produces a local PNG; no photo or greeting is sent to a server. */
export async function createGiftCard({ url, text, catUrl, signal }: {
  url: string;
  text: string;
  catUrl: string | null;
  signal: AbortSignal;
}): Promise<Blob> {
  checkCancelled(signal);
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable');
  const qrCanvas = document.createElement('canvas');
  let cat: HTMLImageElement | null = null;
  try {
    // Integer module sizes and the full four-module quiet zone survive export.
    const moduleCount = QRCode.create(url, { errorCorrectionLevel: 'M' }).modules.size;
    const qrOptions = { scale: Math.max(1, Math.floor(410 / (moduleCount + 8))), margin: 4, errorCorrectionLevel: 'M' as const, color: { dark: '#18213c', light: '#ffffff' } };
    await QRCode.toCanvas(qrCanvas, url, qrOptions);
    checkCancelled(signal);
    cat = await loadCat(catUrl, signal);
    checkCancelled(signal);
    background(context);
    context.textAlign = 'center';
    context.fillStyle = '#e7cfa5';
    context.font = `400 24px ${SANS}`;
    spacedText(context, 'MERRY CHRISTMAS', 151, 8);
    greeting(context, text);
    context.fillStyle = '#eee0c8';
    context.font = `400 27px ${SERIF}`;
    context.fillText('愿星光与温柔，陪伴每一个美好愿望', WIDTH / 2, 447);

    tree(context, 211, 1140, 340, .48);
    tree(context, 986, 1165, 420, .52);
    const snow = context.createRadialGradient(600, 1080, 12, 600, 1080, 370);
    snow.addColorStop(0, '#c2bcda34');
    snow.addColorStop(1, '#c2bcda00');
    context.fillStyle = snow;
    context.save();
    context.translate(0, 780);
    context.scale(1, .28);
    context.beginPath();
    context.arc(600, 1080, 370, 0, Math.PI * 2);
    context.fill();
    context.restore();
    if (cat) {
      const scale = Math.min(630 / cat.naturalWidth, 620 / cat.naturalHeight);
      const width = cat.naturalWidth * scale;
      const height = cat.naturalHeight * scale;
      context.drawImage(cat, (WIDTH - width) / 2, 1095 - height, width, height);
    } else tree(context, 600, 1087, 535, 1);
    star(context, 600, 498, 15, .7);

    context.fillStyle = '#e0caa7';
    context.font = `400 19px ${SANS}`;
    spacedText(context, 'A LITTLE CHRISTMAS MAGIC', 1135, 3.2);
    // All decorations are below this opaque white panel, never over the QR.
    context.fillStyle = '#ffffff';
    roundedRect(context, 378, 1172, 444, 444, 22);
    context.fill();
    context.imageSmoothingEnabled = false;
    context.drawImage(qrCanvas, Math.round((WIDTH - qrCanvas.width) / 2), 1172 + Math.round((444 - qrCanvas.height) / 2));
    context.imageSmoothingEnabled = true;
    context.fillStyle = '#f3e3c7';
    context.font = `400 29px ${SERIF}`;
    context.fillText('扫码打开圣诞树', WIDTH / 2, 1665);
    context.fillStyle = '#bab6cb';
    context.font = `400 20px ${SANS}`;
    context.fillText(new URL(url).hostname, WIDTH / 2, 1704, 980);
    checkCancelled(signal);
    return await pngBlob(canvas, signal);
  } finally {
    if (cat) cat.src = '';
    canvas.width = canvas.height = 0;
    qrCanvas.width = qrCanvas.height = 0;
  }
}
