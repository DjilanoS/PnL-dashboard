/**
 * Renders a shareable, Instagram-sized (1080×1080) PnL card onto a canvas.
 * Pure canvas 2D — no DOM snapshotting — so every style is pixel-identical
 * across browsers and exports cleanly to PNG.
 */
import type { PnlRange } from '@pnl/types';
import logoUrl from '@/assets/logo.png';
import { fmtPct, fmtSignedUsd } from '@/lib/format';

export type ShareStyle = 'beams' | 'minimal' | 'aurora';

export const SHARE_STYLES: { value: ShareStyle; label: string }[] = [
  { value: 'beams', label: 'Beams' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'aurora', label: 'Aurora' },
];

export const SHARE_SIZE = 1080;

export interface ShareData {
  roi: number;
  total: number;
  range: PnlRange;
}

const RANGE_LABEL: Record<PnlRange, string> = {
  '24h': 'Last 24 hours',
  '30d': 'Last 30 days',
  lifetime: 'All time',
};

const FONT = 'Inter, ui-sans-serif, system-ui, -apple-system, sans-serif';
const S = SHARE_SIZE;
const PAD = 88;

type Tone = 'up' | 'down' | 'flat';
function toneOf(n: number): Tone {
  return n > 0 ? 'up' : n < 0 ? 'down' : 'flat';
}

// ---------- asset loading ----------

let assetsReady: Promise<HTMLImageElement> | null = null;

/** Loads the logo and makes sure Inter is ready before any text is drawn. */
function loadAssets(): Promise<HTMLImageElement> {
  if (!assetsReady) {
    const fonts = Promise.all(
      ['500', '600', '700'].map((w) => document.fonts.load(`${w} 64px Inter`).catch(() => [])),
    );
    const logo = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = logoUrl;
    });
    assetsReady = Promise.all([fonts, logo]).then(([, img]) => img);
    // Don't cache a failure — let the next render retry.
    assetsReady.catch(() => (assetsReady = null));
  }
  return assetsReady;
}

// ---------- drawing helpers ----------

function font(weight: number, size: number): string {
  return `${weight} ${size}px ${FONT}`;
}

/** Largest font size (≤ max) at which `text` fits in `maxWidth`. */
function fitSize(ctx: CanvasRenderingContext2D, text: string, weight: number, max: number, maxWidth: number): number {
  let size = max;
  ctx.font = font(weight, size);
  while (size > 24 && ctx.measureText(text).width > maxWidth) {
    size -= 4;
    ctx.font = font(weight, size);
  }
  return size;
}

/** Text with manual letter-spacing (canvas letterSpacing isn't universal yet). */
function spacedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number, align: 'left' | 'center' = 'left'): void {
  const chars = [...text];
  const width = chars.reduce((w, c) => w + ctx.measureText(c).width, 0) + spacing * (chars.length - 1);
  let cx = align === 'center' ? x - width / 2 : x;
  const prev = ctx.textAlign;
  ctx.textAlign = 'left';
  for (const c of chars) {
    ctx.fillText(c, cx, y);
    cx += ctx.measureText(c).width + spacing;
  }
  ctx.textAlign = prev;
}

function triangle(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, up: boolean): void {
  const h = size * 0.87;
  ctx.beginPath();
  if (up) {
    ctx.moveTo(cx, cy - h / 2);
    ctx.lineTo(cx + size / 2, cy + h / 2);
    ctx.lineTo(cx - size / 2, cy + h / 2);
  } else {
    ctx.moveTo(cx, cy + h / 2);
    ctx.lineTo(cx + size / 2, cy - h / 2);
    ctx.lineTo(cx - size / 2, cy - h / 2);
  }
  ctx.closePath();
  ctx.fill();
}

/** Deterministic PRNG so previews don't reshuffle on every render. */
function rng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

let grainTile: HTMLCanvasElement | null = null;
function grain(ctx: CanvasRenderingContext2D, alpha: number): void {
  if (!grainTile) {
    grainTile = document.createElement('canvas');
    grainTile.width = grainTile.height = 256;
    const g = grainTile.getContext('2d')!;
    const img = g.createImageData(256, 256);
    const r = rng(7);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.floor(r() * 255);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = ctx.createPattern(grainTile, 'repeat')!;
  ctx.fillRect(0, 0, S, S);
  ctx.restore();
}

function dateLabel(): string {
  return new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Logo + wordmark, top-left. `badge` puts the (light) logo on a dark tile for light backgrounds. */
function brand(ctx: CanvasRenderingContext2D, logo: HTMLImageElement, color: string, badge = false): void {
  const size = 64;
  if (badge) {
    ctx.fillStyle = '#111114';
    ctx.beginPath();
    ctx.roundRect(PAD, PAD, size, size, 16);
    ctx.fill();
    ctx.drawImage(logo, PAD + 8, PAD + 8, size - 16, size - 16);
  } else {
    ctx.drawImage(logo, PAD, PAD, size, size);
  }
  ctx.fillStyle = color;
  ctx.font = font(600, 36);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('Gainly', PAD + size + 18, PAD + size / 2 + 1);
}

/** Rounded pill with text; returns its width. Anchored at its right edge when `alignRight`. */
function pill(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  cy: number,
  opts: { size: number; weight: number; fg: string; bg: string; border?: string; padX: number; height: number; alignRight?: boolean },
): number {
  ctx.font = font(opts.weight, opts.size);
  const w = ctx.measureText(text).width + opts.padX * 2;
  const left = opts.alignRight ? x - w : x;
  ctx.beginPath();
  ctx.roundRect(left, cy - opts.height / 2, w, opts.height, opts.height / 2);
  ctx.fillStyle = opts.bg;
  ctx.fill();
  if (opts.border) {
    ctx.strokeStyle = opts.border;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.fillStyle = opts.fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, left + w / 2, cy + 1);
  return w;
}

// ---------- styles ----------

const BEAM_COLOR: Record<Tone, string> = { up: '#34d399', down: '#f6465d', flat: '#64748b' };

/** Dark card with diagonal light beams — mirrors the dashboard hero card. */
function drawBeams(ctx: CanvasRenderingContext2D, d: ShareData, logo: HTMLImageElement): void {
  const tone = toneOf(d.total);
  const color = BEAM_COLOR[tone];

  ctx.fillStyle = '#050507';
  ctx.fillRect(0, 0, S, S);

  // Beams: soft-edged stripes rotated 30°, additively blended.
  ctx.save();
  ctx.translate(S / 2, S / 2);
  ctx.rotate((30 * Math.PI) / 180);
  ctx.globalCompositeOperation = 'lighter';
  const r = rng(42);
  const count = 12;
  const span = S * 1.9;
  for (let i = 0; i < count; i++) {
    const w = 70 + r() * 50;
    const x = -span / 2 + (i / (count - 1)) * span - w / 2;
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, 'transparent');
    g.addColorStop(0.5, color);
    g.addColorStop(1, 'transparent');
    ctx.globalAlpha = 0.35 + r() * 0.5;
    ctx.fillStyle = g;
    ctx.fillRect(x, -S, w, S * 2);
  }
  ctx.restore();

  // Fade the beams out along their length, like the shader's noise falloff.
  const fade = ctx.createLinearGradient(0, 0, 0, S);
  fade.addColorStop(0, 'rgba(5,5,7,0.15)');
  fade.addColorStop(0.55, 'rgba(5,5,7,0.55)');
  fade.addColorStop(1, 'rgba(5,5,7,0.2)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, S, S);

  // Scrim (bottom-left dark → top-right clear), same as the hero card.
  const scrim = ctx.createLinearGradient(0, S, S, 0);
  scrim.addColorStop(0, 'rgba(0,0,0,0.88)');
  scrim.addColorStop(0.5, 'rgba(0,0,0,0.5)');
  scrim.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, S, S);
  grain(ctx, 0.06);

  brand(ctx, logo, '#ffffff');
  pill(ctx, `${d.range === 'lifetime' ? 'LIFETIME' : d.range.toUpperCase()} PNL`, S - PAD, PAD + 32, {
    size: 26, weight: 600, fg: '#ffffff', bg: 'rgba(255,255,255,0.08)', border: 'rgba(255,255,255,0.2)',
    padX: 26, height: 60, alignRight: true,
  });

  const fg = tone === 'flat' ? '#ffffff' : color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = font(500, 30);
  ctx.fillText(`${dateLabel()}`, PAD, S - PAD);

  ctx.fillStyle = fg;
  ctx.font = font(600, 76);
  ctx.fillText(fmtSignedUsd(d.total), PAD, S - PAD - 92);

  const roi = fmtPct(d.roi);
  ctx.font = font(700, fitSize(ctx, roi, 700, 210, S - PAD * 2));
  ctx.fillText(roi, PAD - 6, S - PAD - 200);

  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = font(500, 34);
  ctx.fillText(`PnL · ${RANGE_LABEL[d.range]}`, PAD, S - PAD - 430);
}

const MINIMAL_FG: Record<Tone, string> = { up: '#047857', down: '#be123c', flat: '#18181b' };
const MINIMAL_BG: Record<Tone, string> = { up: '#d1fae5', down: '#fecdd3', flat: '#e4e4e7' };

/** Light, editorial: cream background, centered oversized number. */
function drawMinimal(ctx: CanvasRenderingContext2D, d: ShareData, logo: HTMLImageElement): void {
  const tone = toneOf(d.total);
  ctx.fillStyle = '#f5f3ee';
  ctx.fillRect(0, 0, S, S);
  grain(ctx, 0.05);

  brand(ctx, logo, '#18181b', true);
  ctx.fillStyle = '#71717a';
  ctx.font = font(500, 30);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(dateLabel(), S - PAD, PAD + 33);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#71717a';
  ctx.font = font(600, 30);
  spacedText(ctx, `${RANGE_LABEL[d.range].toUpperCase()} PNL`, S / 2, 400, 6, 'center');

  const roi = fmtPct(d.roi);
  ctx.fillStyle = MINIMAL_FG[tone];
  ctx.font = font(700, fitSize(ctx, roi, 700, 230, S - PAD * 2));
  ctx.fillText(roi, S / 2, 610);

  // $ value in a tinted pill, with a direction arrow.
  const usd = fmtSignedUsd(d.total);
  ctx.font = font(600, 54);
  const arrow = tone === 'flat' ? 0 : 44;
  const w = ctx.measureText(usd).width + 64 + arrow;
  const cy = 730;
  ctx.beginPath();
  ctx.roundRect(S / 2 - w / 2, cy - 48, w, 96, 48);
  ctx.fillStyle = MINIMAL_BG[tone];
  ctx.fill();
  ctx.fillStyle = MINIMAL_FG[tone];
  if (arrow) triangle(ctx, S / 2 - w / 2 + 32 + 14, cy, 28, tone === 'up');
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(usd, S / 2 - w / 2 + 32 + arrow, cy + 2);

  // Footer rule.
  ctx.fillStyle = '#d4d4d8';
  ctx.fillRect(PAD, S - PAD - 40, S - PAD * 2, 2);
  ctx.fillStyle = '#a1a1aa';
  ctx.font = font(500, 26);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('Tracked with Gainly', S / 2, S - PAD + 10);
}

const AURORA: Record<Tone, string[]> = {
  up: ['#10b981', '#06b6d4', '#84cc16'],
  down: ['#f43f5e', '#f97316', '#d946ef'],
  flat: ['#6366f1', '#64748b', '#0ea5e9'],
};
const AURORA_ACCENT: Record<Tone, string> = { up: '#6ee7b7', down: '#fda4af', flat: '#e4e4e7' };

/** Vibrant gradient blobs behind a frosted-glass card. */
function drawAurora(ctx: CanvasRenderingContext2D, d: ShareData, logo: HTMLImageElement): void {
  const tone = toneOf(d.total);
  const [c1, c2, c3] = AURORA[tone];
  ctx.fillStyle = '#09090f';
  ctx.fillRect(0, 0, S, S);

  const blobs: [number, number, number, string][] = [
    [S * 0.15, S * 0.2, S * 0.75, c1!],
    [S * 0.95, S * 0.35, S * 0.65, c2!],
    [S * 0.45, S * 1.0, S * 0.7, c3!],
  ];
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (const [x, y, rad, c] of blobs) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, c);
    g.addColorStop(1, 'transparent');
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  }
  ctx.restore();
  grain(ctx, 0.12);

  // Frosted card.
  const cw = S - PAD * 2;
  const ch = 560;
  const cx = PAD;
  const cy = (S - ch) / 2 + 30;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 20;
  ctx.beginPath();
  ctx.roundRect(cx, cy, cw, ch, 48);
  ctx.fillStyle = 'rgba(10,10,18,0.45)';
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.roundRect(cx, cy, cw, ch, 48);
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 2;
  ctx.stroke();

  brand(ctx, logo, '#ffffff');
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = font(500, 30);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(dateLabel(), S - PAD, PAD + 33);

  const inner = cx + 64;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = font(600, 28);
  spacedText(ctx, `${RANGE_LABEL[d.range].toUpperCase()} PNL`, inner, cy + 110, 5);

  const roi = fmtPct(d.roi);
  ctx.fillStyle = '#ffffff';
  ctx.font = font(700, fitSize(ctx, roi, 700, 200, cw - 128));
  ctx.fillText(roi, inner - 4, cy + 320);

  const accent = AURORA_ACCENT[tone];
  ctx.fillStyle = accent;
  const usdY = cy + ch - 100;
  let tx = inner;
  if (tone !== 'flat') {
    triangle(ctx, inner + 18, usdY - 22, 34, tone === 'up');
    tx += 56;
  }
  ctx.font = font(600, 64);
  ctx.fillText(fmtSignedUsd(d.total), tx, usdY);
}

const DRAW: Record<ShareStyle, typeof drawBeams> = {
  beams: drawBeams,
  minimal: drawMinimal,
  aurora: drawAurora,
};

/** Draws the card for `style` and returns the 1080×1080 canvas. */
export async function renderShareImage(data: ShareData, style: ShareStyle): Promise<HTMLCanvasElement> {
  const logo = await loadAssets();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  DRAW[style](ctx, data, logo);
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode image'))), 'image/png'),
  );
}

export function shareFileName(data: ShareData, style: ShareStyle): string {
  return `gainly-pnl-${data.range}-${style}.png`;
}
