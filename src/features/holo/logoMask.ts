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

const FIELDR_CONTOUR_POINTS: ReadonlyArray<readonly [number, number]> = [
  [19, 16],
  [46, 16],
  [46, 23.5],
  [28.5, 23.5],
  [28.5, 29.5],
  [41, 29.5],
  [41, 36.5],
  [28.5, 36.5],
  [28.5, 48],
  [19, 48],
];

interface ContourSegment {
  ax: number;
  ay: number;
  dx: number;
  dy: number;
  lenSq: number;
  len: number;
  cumStart: number;
}

const FIELDR_CONTOUR_SEGMENTS: readonly ContourSegment[] = (() => {
  const segs: ContourSegment[] = [];
  let cum = 0;
  for (let i = 0; i < FIELDR_CONTOUR_POINTS.length; i++) {
    const [ax, ay] = FIELDR_CONTOUR_POINTS[i];
    const [bx, by] = FIELDR_CONTOUR_POINTS[(i + 1) % FIELDR_CONTOUR_POINTS.length];
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    const len = Math.sqrt(lenSq);
    segs.push({ ax, ay, dx, dy, lenSq, len, cumStart: cum });
    cum += len;
  }
  return segs;
})();

const FIELDR_CONTOUR_TOTAL_LEN = FIELDR_CONTOUR_SEGMENTS.reduce((sum, s) => sum + s.len, 0);

/**
 * Renders the static Fieldr "F" mark and subtle bottom caption to an offscreen
 * canvas and packs an rgba8unorm buffer:
 * - R: alpha mask for the F mark and bottom caption
 * - G, B: 16-bit big-endian continuous arc-length t in [0, 1] along the F outline,
 *   starting at the top-left corner (19, 16) and running clockwise
 * - A: 255 inside the F outline band, 0 elsewhere
 */
export function createFieldrLogoMask(): Uint8Array {
  const [width, height] = LOGO_MASK_SIZE;
  const packed = new Uint8Array(width * height * 4);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return packed;
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
  const pixelCount = width * height;
  for (let i = 0; i < pixelCount; i++) {
    packed[i * 4] = rgba[i * 4 + 3];
  }

  // Bake exact arc-length t in [0, 1] around the F outline in the padded logo bounding box.
  const padPx = 28;
  const minX = Math.max(0, Math.floor(originX - padPx));
  const maxX = Math.min(width - 1, Math.ceil(originX + markWidthPx + padPx));
  const minY = Math.max(0, Math.floor(originY - padPx));
  const maxY = Math.min(height - 1, Math.ceil(originY + markHeightPx + padPx));
  const invScale = 1 / scale;
  const invTotalLen = 1 / FIELDR_CONTOUR_TOTAL_LEN;
  const maxDistSqSvg = (padPx * invScale) * (padPx * invScale);

  for (let y = minY; y <= maxY; y++) {
    const sy = 16 + (y + 0.5 - originY) * invScale;
    const rowOffset = y * width;
    for (let x = minX; x <= maxX; x++) {
      const sx = 19 + (x + 0.5 - originX) * invScale;
      let bestDistSq = Infinity;
      let bestArc = 0;

      for (let sIdx = 0; sIdx < FIELDR_CONTOUR_SEGMENTS.length; sIdx++) {
        const seg = FIELDR_CONTOUR_SEGMENTS[sIdx];
        const px = sx - seg.ax;
        const py = sy - seg.ay;
        let u = (px * seg.dx + py * seg.dy) / seg.lenSq;
        if (u < 0) u = 0;
        else if (u > 1) u = 1;
        const cx = px - seg.dx * u;
        const cy = py - seg.dy * u;
        const distSq = cx * cx + cy * cy;
        if (distSq < bestDistSq) {
          bestDistSq = distSq;
          bestArc = seg.cumStart + u * seg.len;
        }
      }

      if (bestDistSq <= maxDistSqSvg) {
        const t = bestArc * invTotalLen;
        const q = Math.max(0, Math.min(65535, Math.round(t * 65535)));
        const base = (rowOffset + x) * 4;
        packed[base + 1] = (q >> 8) & 255;
        packed[base + 2] = q & 255;
        packed[base + 3] = 255;
      }
    }
  }

  return packed;
}
