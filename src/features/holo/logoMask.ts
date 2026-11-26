export const FIELDR_MARK_PATH = 'M19 16H46V23.5H28.5V29.5H41V36.5H28.5V48H19V16Z';

// 1024 x 1456 matches the card aspect ratio (1.28 : 1.82) with square texels
// and satisfies WebGPU's 256-byte bytesPerRow alignment (1024 = 4 * 256).
export const LOGO_MASK_SIZE: readonly [number, number] = [1024, 1456];

const FONT_WAIT_TIMEOUT_MS = 600;

export async function waitForBrandFonts(): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  try {
    await Promise.race([
      Promise.allSettled([
        document.fonts.load('800 30px "Syne"'),
        document.fonts.load('400 15px "DM Sans"'),
        document.fonts.ready,
      ]),
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, FONT_WAIT_TIMEOUT_MS);
      }),
    ]);
  } catch {
    // Proceed with fallback system sans if font loading fails.
  }
}

function drawTrackedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  y: number,
  trackingPx: number,
): void {
  const chars = Array.from(text);
  if (chars.length === 0) return;

  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const totalWidth =
    widths.reduce((sum, width) => sum + width, 0) +
    trackingPx * Math.max(0, chars.length - 1);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  let cursor = centerX - totalWidth / 2;
  for (let i = 0; i < chars.length; i++) {
    ctx.fillText(chars[i], cursor, y);
    cursor += widths[i] + trackingPx;
  }
}

/**
 * Renders the static Fieldr "F" mark and subtle bottom caption to an offscreen
 * canvas as a white-on-transparent alpha mask and returns single-channel r8unorm bytes.
 */
export function createFieldrLogoMask(): Uint8Array {
  const [width, height] = LOGO_MASK_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return new Uint8Array(width * height);
  }

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#ffffff';

  // Draw the static Fieldr "F" mark centred at the triangle's visual scale.
  // Source geometry bounds: x in [19, 46] (w=27), y in [16, 48] (h=32).
  const markHeightPx = 536;
  const scale = markHeightPx / 32;
  const markWidthPx = 27 * scale;
  const originX = (width - markWidthPx) / 2 + 12;
  const originY = 706 - markHeightPx / 2;

  ctx.save();
  ctx.translate(originX - 19 * scale, originY - 16 * scale);
  ctx.scale(scale, scale);
  const path = new Path2D(FIELDR_MARK_PATH);
  ctx.fill(path);
  ctx.restore();

  // Subtle bottom caption in the same mask texture (y >= 0.82 * height),
  // matching HeaderBar's Syne 800 + DM Sans uppercase brandmark lockup.
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 30px "Syne", sans-serif';
  drawTrackedText(ctx, 'FIELDR', width / 2, 1326, 4.2);

  ctx.font = '400 14px "DM Sans", sans-serif';
  drawTrackedText(ctx, 'AUCTIONS', width / 2, 1356, 4.4);
  ctx.restore();

  const rgba = ctx.getImageData(0, 0, width, height).data;
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i++) {
    mask[i] = rgba[i * 4 + 3];
  }
  return mask;
}
