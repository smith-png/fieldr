/**
 * Full-viewport 2D canvas starfield scene for /holo.
 *
 * - Single fixed canvas layer behind the card, mounted for the entire time /holo is open.
 * - Pure black space with non-uniform stars (Gaussian blobs + diagonal Milky-Way band,
 *   tight star clusters, and sparse filler) generated once per mount via a seeded PRNG
 *   and stored as normalized viewport fractions so layout stays stable on resize.
 * - Charge anticipation: stars brighten up to +60% and drift up to 5px toward the card,
 *   easing back over 400ms on cancel.
 * - Coordinated radial shine on release (strength >= 0.15): ease-out virtual wavefront
 *   reaching the farthest corner in ~1.6s + fainter echo wave 260ms later at 45% strength.
 * - Pre-rendered offscreen sprites, zero per-frame allocations, 30fps idle / 60fps for 3s
 *   after release, document.hidden pause, DPR <= 1.5, and static dim stars under reduced motion.
 */

import {
  DEFAULT_HOLO_GLITTER,
  clampHoloGlitter,
  type HoloGlitterSettings,
} from './glitterSettings';

export type StarfieldCardMode = 'webgpu' | 'fallback';

export interface StarfieldController {
  mount: (container: HTMLElement) => void;
  setCardTarget: (element: HTMLElement | null, mode: StarfieldCardMode) => void;
  setCharge: (charge: number) => void;
  triggerRelease: (element: HTMLElement, mode: StarfieldCardMode, strength: number) => void;
  setSettings: (raw: unknown) => void;
  dispose: () => void;
}

const BURST_MIN_STRENGTH = 0.15;
const MOBILE_BREAKPOINT_PX = 640;
const MAX_DPR = 1.5;

const BASE_STARS_DESKTOP = 260;
const BASE_STARS_MOBILE = 140;
const MAX_STARS_DESKTOP = 900;
const MAX_STARS_MOBILE = 450;

const IDLE_FPS = 30;
const POST_RELEASE_HIGH_FPS_SEC = 3.0;
const CHARGE_CANCEL_DRAIN_SEC = 0.4;
const CHARGE_RELEASE_SETTLE_SEC = 0.18;
const MAX_CHARGE_DRIFT_PX = 5;

const WAVE_DURATION_SEC = 1.6;
const WAVE_ECHO_DELAY_SEC = 0.26;
const WAVE_ECHO_AMPLITUDE = 0.45;
const FLARE_RISE_SEC = 0.09;
const MAX_DECAY_SEC = 1.4;
const MAX_ACTIVE_WAVES = 8;

const TWO_PI = Math.PI * 2;

const TIER_TINY = 0;
const TIER_SMALL = 1;
const TIER_MEDIUM = 2;
const TIER_BRIGHT = 3;

const STAR_TINTS: readonly [number, number, number][] = [
  [255, 255, 255], // pure white
  [255, 236, 200], // warm
  [200, 220, 255], // cool
  [212, 240, 255], // faint pearl cyan
  [244, 222, 250], // faint pearl rose
];

interface StarSpriteAtlas {
  dots: HTMLCanvasElement[];
  mediumCrosses: HTMLCanvasElement[];
  brightCores: HTMLCanvasElement[];
  spikes: HTMLCanvasElement[];
}

interface CardRect {
  cx: number;
  cy: number;
  halfW: number;
  halfH: number;
  cornerRadius: number;
}

interface RadialWave {
  active: boolean;
  cx: number;
  cy: number;
  maxDist: number;
  delay: number;
  elapsed: number;
  amplitude: number;
  joinFraction: number;
  flareBrightnessMul: number;
  chargeSmooth: number;
  salt: number;
}

interface DensityBlob {
  u: number;
  v: number;
  invTwoSigmaSq: number;
  weight: number;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function createPrng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStarWave(starIndex: number, salt: number): number {
  let h = (Math.imul(starIndex + 1, 374761393) ^ Math.imul(salt, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function rgba(rgb: readonly [number, number, number], alpha: number): string {
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

function createDotSprite(tint: readonly [number, number, number]): HTMLCanvasElement {
  const size = 16;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const c = size * 0.5;
  const grad = ctx.createRadialGradient(c, c, 0, c, c, c * 0.85);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(0.28, rgba(tint, 0.96));
  grad.addColorStop(0.56, rgba(tint, 0.36));
  grad.addColorStop(1, rgba(tint, 0));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

function createMediumCrossSprite(tint: readonly [number, number, number]): HTMLCanvasElement {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const c = size * 0.5;

  // Thin 4-point cross arms
  const hGrad = ctx.createLinearGradient(2, c, size - 2, c);
  hGrad.addColorStop(0, rgba(tint, 0));
  hGrad.addColorStop(0.32, rgba(tint, 0.32));
  hGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.92)');
  hGrad.addColorStop(0.68, rgba(tint, 0.32));
  hGrad.addColorStop(1, rgba(tint, 0));
  ctx.fillStyle = hGrad;
  ctx.fillRect(2, c - 0.55, size - 4, 1.1);

  const vGrad = ctx.createLinearGradient(c, 2, c, size - 2);
  vGrad.addColorStop(0, rgba(tint, 0));
  vGrad.addColorStop(0.32, rgba(tint, 0.32));
  vGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.92)');
  vGrad.addColorStop(0.68, rgba(tint, 0.32));
  vGrad.addColorStop(1, rgba(tint, 0));
  ctx.fillStyle = vGrad;
  ctx.fillRect(c - 0.55, 2, 1.1, size - 4);

  // Tight crisp core
  const core = ctx.createRadialGradient(c, c, 0, c, c, 6.2);
  core.addColorStop(0, 'rgba(255, 255, 255, 1)');
  core.addColorStop(0.34, rgba(tint, 0.92));
  core.addColorStop(0.66, rgba(tint, 0.28));
  core.addColorStop(1, rgba(tint, 0));
  ctx.fillStyle = core;
  ctx.fillRect(0, 0, size, size);

  return canvas;
}

function createBrightCoreSprite(tint: readonly [number, number, number]): HTMLCanvasElement {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const c = size * 0.5;
  const grad = ctx.createRadialGradient(c, c, 0, c, c, c * 0.88);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(0.24, 'rgba(255, 255, 255, 0.96)');
  grad.addColorStop(0.46, rgba(tint, 0.62));
  grad.addColorStop(0.72, rgba(tint, 0.16));
  grad.addColorStop(1, rgba(tint, 0));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

function createSpikeSprite(tint: readonly [number, number, number]): HTMLCanvasElement {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const c = size * 0.5;

  const hGrad = ctx.createLinearGradient(1, c, size - 1, c);
  hGrad.addColorStop(0, rgba(tint, 0));
  hGrad.addColorStop(0.24, rgba(tint, 0.16));
  hGrad.addColorStop(0.42, rgba(tint, 0.56));
  hGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.98)');
  hGrad.addColorStop(0.58, rgba(tint, 0.56));
  hGrad.addColorStop(0.76, rgba(tint, 0.16));
  hGrad.addColorStop(1, rgba(tint, 0));
  ctx.fillStyle = hGrad;
  ctx.fillRect(1, c - 0.65, size - 2, 1.3);

  const vGrad = ctx.createLinearGradient(c, 1, c, size - 1);
  vGrad.addColorStop(0, rgba(tint, 0));
  vGrad.addColorStop(0.24, rgba(tint, 0.16));
  vGrad.addColorStop(0.42, rgba(tint, 0.56));
  vGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.98)');
  vGrad.addColorStop(0.58, rgba(tint, 0.56));
  vGrad.addColorStop(0.76, rgba(tint, 0.16));
  vGrad.addColorStop(1, rgba(tint, 0));
  ctx.fillStyle = vGrad;
  ctx.fillRect(c - 0.65, 1, 1.3, size - 2);

  return canvas;
}

function buildStarSpriteAtlas(): StarSpriteAtlas {
  return {
    dots: STAR_TINTS.map(createDotSprite),
    mediumCrosses: STAR_TINTS.map(createMediumCrossSprite),
    brightCores: STAR_TINTS.map(createBrightCoreSprite),
    spikes: STAR_TINTS.map(createSpikeSprite),
  };
}

function createEmptyWave(): RadialWave {
  return {
    active: false,
    cx: 0,
    cy: 0,
    maxDist: 1000,
    delay: 0,
    elapsed: 0,
    amplitude: 1,
    joinFraction: 1,
    flareBrightnessMul: 1,
    chargeSmooth: 1,
    salt: 1,
  };
}

function measureCardRect(
  element: HTMLElement | null,
  mode: StarfieldCardMode,
  viewW: number,
  viewH: number,
): CardRect {
  if (element) {
    const rect = element.getBoundingClientRect();
    if (rect.width > 1 && rect.height > 1) {
      const cx = rect.left + rect.width * 0.5;
      const cy = rect.top + rect.height * 0.5;
      if (mode === 'webgpu') {
        const scale = Math.min(rect.height, rect.width * 1.35);
        return {
          cx,
          cy,
          halfW: (0.64 / 2.5) * scale,
          halfH: (0.91 / 2.5) * scale,
          cornerRadius: (0.055 / 2.5) * scale,
        };
      }
      return {
        cx,
        cy,
        halfW: rect.width * 0.5,
        halfH: rect.height * 0.5,
        cornerRadius: 20,
      };
    }
  }

  // Fallback geometry matching the centred card layout before first DOM measurement
  const scale = Math.min(viewH, viewW * 1.35);
  return {
    cx: viewW * 0.5,
    cy: viewH * 0.5,
    halfW: (0.64 / 2.5) * scale,
    halfH: (0.91 / 2.5) * scale,
    cornerRadius: (0.055 / 2.5) * scale,
  };
}

function fillRoundedRectBlack(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rad = clamp(r, 0, Math.min(w, h) * 0.5);
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
  ctx.fill();
}

export function createStarfieldController(): StarfieldController {
  // Pre-allocated SoA star buffers (max 900 stars, zero per-frame allocations)
  const starU = new Float32Array(MAX_STARS_DESKTOP);
  const starV = new Float32Array(MAX_STARS_DESKTOP);
  const starRadius = new Float32Array(MAX_STARS_DESKTOP);
  const starSpikeLen = new Float32Array(MAX_STARS_DESKTOP);
  const starFreq = new Float32Array(MAX_STARS_DESKTOP);
  const starPhase = new Float32Array(MAX_STARS_DESKTOP);
  const starBaseAlpha = new Float32Array(MAX_STARS_DESKTOP);
  const starDecaySec = new Float32Array(MAX_STARS_DESKTOP);
  const starFlareSizeBoost = new Float32Array(MAX_STARS_DESKTOP);
  const starTier = new Uint8Array(MAX_STARS_DESKTOP);
  const starTint = new Uint8Array(MAX_STARS_DESKTOP);
  const starInCluster = new Uint8Array(MAX_STARS_DESKTOP);
  let starCount = 0;

  const waves: RadialWave[] = Array.from({ length: MAX_ACTIVE_WAVES }, createEmptyWave);
  const mountSeed = ((Date.now() & 0xffffffff) ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  let currentSettings: HoloGlitterSettings = { ...DEFAULT_HOLO_GLITTER };

  let spriteAtlas: StarSpriteAtlas | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let cardElement: HTMLElement | null = null;
  let cardMode: StarfieldCardMode = 'webgpu';
  let cardRect: CardRect = { cx: 0, cy: 0, halfW: 0, halfH: 0, cornerRadius: 16 };

  let viewW = 1;
  let viewH = 1;
  let dpr = 1;
  let lastGeneratedMobile = false;
  let lastGeneratedDensity = -1;
  let lastGeneratedCluster = -1;

  let rafId: number | null = null;
  let lastFrameMs = 0;
  let simTime = 0;
  let highFpsUntilSec = 0;
  let waveSaltCounter = 1;

  let targetCharge = 0;
  let visualCharge = 0;
  let chargeReleasing = false;

  let disposed = false;
  let listenersAttached = false;
  let reducedMotionQuery: MediaQueryList | null = null;
  let reducedMotion = false;

  const isInsideCardNormalized = (u: number, v: number, marginPx: number): boolean => {
    const x = u * viewW;
    const y = v * viewH;
    return (
      Math.abs(x - cardRect.cx) < cardRect.halfW + marginPx &&
      Math.abs(y - cardRect.cy) < cardRect.halfH + marginPx
    );
  };

  const assignStarProperties = (
    idx: number,
    u: number,
    v: number,
    inCluster: boolean,
    rng: () => number,
    forceBright: boolean,
  ) => {
    starU[idx] = u;
    starV[idx] = v;
    starInCluster[idx] = inCluster ? 1 : 0;

    // Power-law magnitudes: ~70% tiny, ~22% small, ~7% medium, ~1% bright
    let tier: number;
    if (forceBright) {
      tier = TIER_BRIGHT;
    } else {
      const mRoll = rng();
      if (mRoll < 0.7) {
        tier = TIER_TINY;
      } else if (mRoll < 0.92) {
        tier = TIER_SMALL;
      } else if (mRoll < 0.99) {
        tier = TIER_MEDIUM;
      } else {
        tier = TIER_BRIGHT;
      }
    }
    starTier[idx] = tier;

    if (tier === TIER_TINY) {
      starRadius[idx] = 0.5 + rng() * 0.4; // 0.5 - 0.9 px
      starSpikeLen[idx] = 0;
      starDecaySec[idx] = 0.7 + rng() * 0.18; // 700 - 880 ms
      starFlareSizeBoost[idx] = 1.6 + rng() * 0.45;
    } else if (tier === TIER_SMALL) {
      starRadius[idx] = 1.0 + rng() * 0.5; // 1.0 - 1.5 px
      starSpikeLen[idx] = 0;
      starDecaySec[idx] = 0.85 + rng() * 0.22; // 850 - 1070 ms
      starFlareSizeBoost[idx] = 1.7 + rng() * 0.5;
    } else if (tier === TIER_MEDIUM) {
      starRadius[idx] = 1.8 + rng() * 0.8; // 1.8 - 2.6 px
      starSpikeLen[idx] = 7 + rng() * 4;
      starDecaySec[idx] = 1.05 + rng() * 0.2; // 1050 - 1250 ms
      starFlareSizeBoost[idx] = 1.8 + rng() * 0.5;
    } else {
      starRadius[idx] = 3.0 + rng() * 1.0; // 3.0 - 4.0 px
      starSpikeLen[idx] = 14 + rng() * 14; // 14 - 28 px
      starDecaySec[idx] = 1.2 + rng() * 0.2; // 1200 - 1400 ms
      starFlareSizeBoost[idx] = 1.85 + rng() * 0.55; // up to 2.4x
    }

    // Tints: mostly white, some warm, some cool, a few faint pearl tints
    const tintRoll = rng();
    if (tintRoll < 0.54) {
      starTint[idx] = 0; // white
    } else if (tintRoll < 0.72) {
      starTint[idx] = 1; // warm (255,236,200)
    } else if (tintRoll < 0.9) {
      starTint[idx] = 2; // cool (200,220,255)
    } else if (tintRoll < 0.95) {
      starTint[idx] = 3; // faint pearl cyan
    } else {
      starTint[idx] = 4; // faint pearl rose
    }

    starFreq[idx] = 0.3 + rng() * 1.7; // 0.3 - 2.0 Hz
    starPhase[idx] = rng() * TWO_PI;
    starBaseAlpha[idx] = 0.25 + rng() * 0.35; // 0.25 - 0.60
  };

  const generateStarfield = () => {
    const settings = currentSettings;
    const isMobile = viewW < MOBILE_BREAKPOINT_PX;
    const baseCount = isMobile ? BASE_STARS_MOBILE : BASE_STARS_DESKTOP;
    const cap = isMobile ? MAX_STARS_MOBILE : MAX_STARS_DESKTOP;
    const targetCount = clamp(Math.round(baseCount * settings.density), 1, cap);

    lastGeneratedMobile = isMobile;
    lastGeneratedDensity = settings.density;
    lastGeneratedCluster = settings.cluster;

    const rng = createPrng(mountSeed);
    const marginPx = 8;
    let count = 0;

    // (a) Density field: 3-4 large soft Gaussian blobs + 1 faint diagonal Milky-Way band
    const blobCount = 3 + Math.floor(rng() * 2);
    const blobs: DensityBlob[] = [];
    for (let i = 0; i < blobCount; i++) {
      const sigma = 0.14 + rng() * 0.11;
      blobs.push({
        u: 0.1 + rng() * 0.8,
        v: 0.1 + rng() * 0.8,
        invTwoSigmaSq: 1 / (2 * sigma * sigma),
        weight: 0.65 + rng() * 0.35,
      });
    }

    const bandAngle = (rng() < 0.5 ? 0.42 : 2.15) + (rng() - 0.5) * 0.36;
    const bandNx = -Math.sin(bandAngle);
    const bandNy = Math.cos(bandAngle);
    const bandOffset = (rng() - 0.5) * 0.16;
    const bandSigma = 0.115 + rng() * 0.04;
    const bandInvTwoSigmaSq = 1 / (2 * bandSigma * bandSigma);
    const bandPhase = rng() * TWO_PI;

    const evaluateDensityField = (u: number, v: number): number => {
      let d = 0;
      for (let i = 0; i < blobs.length; i++) {
        const b = blobs[i];
        const du = u - b.u;
        const dv = v - b.v;
        d += b.weight * Math.exp(-(du * du + dv * dv) * b.invTwoSigmaSq);
      }
      const du = u - 0.5;
      const dv = v - 0.5;
      const perp = du * bandNx + dv * bandNy - bandOffset;
      const along = du * bandNy - dv * bandNx;
      const bandMod = 0.72 + 0.28 * Math.sin(along * 7.5 + bandPhase);
      d += 0.72 * bandMod * Math.exp(-(perp * perp) * bandInvTwoSigmaSq);
      return clamp(d / 1.45, 0.03, 1);
    };

    // (b) 6-10 tight clusters of 8-25 stars (radius 20-70 px), scaled smoothly with cluster setting
    const clusterShare = settings.cluster <= 0.001 ? 0 : lerp(0.14, 0.48, settings.cluster);
    const clusterStarBudget = Math.round(targetCount * clusterShare);
    const clusterCount = clusterStarBudget > 0 ? 6 + Math.floor(rng() * 5) : 0; // 6-10 clusters

    let remainingClusterStars = clusterStarBudget;
    for (let c = 0; c < clusterCount && remainingClusterStars > 0 && count < targetCount; c++) {
      // Pick a cluster centre outside the card rectangle, biased gently toward the density field
      let cu = 0.1;
      let cv = 0.1;
      let foundCentre = false;
      for (let attempt = 0; attempt < 40; attempt++) {
        const tu = 0.06 + rng() * 0.88;
        const tv = 0.06 + rng() * 0.88;
        if (isInsideCardNormalized(tu, tv, marginPx + 24)) continue;
        if (attempt < 24 && rng() > evaluateDensityField(tu, tv) * 1.15) continue;
        cu = tu;
        cv = tv;
        foundCentre = true;
        break;
      }
      if (!foundCentre) continue;

      const clustersLeft = clusterCount - c;
      const desiredInCluster = clamp(
        Math.round(8 + rng() * 17), // 8 - 25 stars
        Math.min(8, remainingClusterStars),
        Math.min(25, remainingClusterStars),
      );
      const starsForThis =
        c === clusterCount - 1
          ? Math.min(25, remainingClusterStars)
          : Math.min(desiredInCluster, Math.max(4, Math.ceil(remainingClusterStars / clustersLeft) + 4));
      remainingClusterStars -= starsForThis;

      const radiusPx = 20 + rng() * 50; // 20 - 70 px
      const sigmaU = (radiusPx * 0.46) / Math.max(1, viewW);
      const sigmaV = (radiusPx * 0.46) / Math.max(1, viewH);
      const maxU = (radiusPx * 1.6) / Math.max(1, viewW);
      const maxV = (radiusPx * 1.6) / Math.max(1, viewH);

      for (let s = 0; s < starsForThis && count < targetCount; s++) {
        for (let attempt = 0; attempt < 16; attempt++) {
          const u1 = Math.max(1e-6, rng());
          const u2 = rng();
          const g = Math.sqrt(-2 * Math.log(u1));
          const angle = TWO_PI * u2;
          const offU = clamp(Math.cos(angle) * g * sigmaU, -maxU, maxU);
          const offV = clamp(Math.sin(angle) * g * sigmaV, -maxV, maxV);
          const u = cu + offU;
          const v = cv + offV;
          if (u < 0.008 || u > 0.992 || v < 0.008 || v > 0.992) continue;
          if (isInsideCardNormalized(u, v, marginPx)) continue;
          assignStarProperties(count, u, v, true, rng, false);
          count += 1;
          break;
        }
      }
    }

    // Remaining non-cluster stars: ~78% density-field rejection sampled, ~22% sparse filler
    const remainingTotal = Math.max(0, targetCount - count);
    const fieldTarget = Math.round(remainingTotal * 0.78);
    let fieldPlaced = 0;
    const maxFieldAttempts = fieldTarget * 18 + 200;

    for (let attempt = 0; attempt < maxFieldAttempts && fieldPlaced < fieldTarget && count < targetCount; attempt++) {
      const u = 0.008 + rng() * 0.984;
      const v = 0.008 + rng() * 0.984;
      if (isInsideCardNormalized(u, v, marginPx)) continue;
      if (rng() > evaluateDensityField(u, v)) continue;
      assignStarProperties(count, u, v, false, rng, false);
      count += 1;
      fieldPlaced += 1;
    }

    // (c) Sparse filler so empty patches remain
    const maxFillerAttempts = (targetCount - count) * 12 + 120;
    for (let attempt = 0; attempt < maxFillerAttempts && count < targetCount; attempt++) {
      const u = 0.008 + rng() * 0.984;
      const v = 0.008 + rng() * 0.984;
      if (isInsideCardNormalized(u, v, marginPx)) continue;
      assignStarProperties(count, u, v, false, rng, false);
      count += 1;
    }

    // Guarantee at least 1 bright hero star on larger fields if random rolls produced none
    if (count >= 80) {
      let hasBright = false;
      for (let i = 0; i < count; i++) {
        if (starTier[i] === TIER_BRIGHT) {
          hasBright = true;
          break;
        }
      }
      if (!hasBright) {
        const pick = Math.floor(rng() * count);
        assignStarProperties(pick, starU[pick], starV[pick], starInCluster[pick] === 1, rng, true);
      }
    }

    starCount = count;
  };

  const updateViewportMetrics = () => {
    if (!canvas || !ctx) return;
    viewW = Math.max(1, window.innerWidth);
    viewH = Math.max(1, window.innerHeight);
    dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);

    const backingW = Math.round(viewW * dpr);
    const backingH = Math.round(viewH * dpr);

    if (canvas.width !== backingW || canvas.height !== backingH) {
      canvas.width = backingW;
      canvas.height = backingH;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cardRect = measureCardRect(cardElement, cardMode, viewW, viewH);
  };

  const hasActiveWaves = (): boolean => {
    for (let i = 0; i < MAX_ACTIVE_WAVES; i++) {
      if (waves[i].active) return true;
    }
    return false;
  };

  const renderFrame = (dt: number) => {
    if (!ctx || !spriteAtlas) return;

    const settings = currentSettings;
    const sizeSetting = settings.size;
    const brightSetting = settings.brightness;

    // Advance charge anticipation visual state
    if (!reducedMotion) {
      if (targetCharge > visualCharge) {
        // Track rising hold charge responsively
        const follow = 1 - Math.exp(-18 * dt);
        visualCharge += (targetCharge - visualCharge) * follow;
        if (Math.abs(targetCharge - visualCharge) < 0.0005) visualCharge = targetCharge;
      } else if (visualCharge > targetCharge) {
        const drainDuration = chargeReleasing ? CHARGE_RELEASE_SETTLE_SEC : CHARGE_CANCEL_DRAIN_SEC;
        visualCharge = Math.max(targetCharge, visualCharge - dt / drainDuration);
        if (visualCharge <= 0.0005 && targetCharge <= 0.0005) {
          visualCharge = 0;
          chargeReleasing = false;
        }
      }
    } else {
      visualCharge = 0;
      chargeReleasing = false;
    }

    // Step active radial waves
    let anyWaveActive = false;
    if (!reducedMotion) {
      const maxWaveLife = WAVE_DURATION_SEC + MAX_DECAY_SEC + FLARE_RISE_SEC + 0.45;
      for (let w = 0; w < MAX_ACTIVE_WAVES; w++) {
        const wave = waves[w];
        if (!wave.active) continue;
        wave.elapsed += dt;
        if (wave.elapsed > wave.delay + maxWaveLife) {
          wave.active = false;
          continue;
        }
        anyWaveActive = true;
      }
    }

    // Pure black space background: no gradients, no nebula, no big glows
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, viewW, viewH);

    // Draw stars with additive compositing using pre-rendered sprites
    ctx.globalCompositeOperation = 'lighter';

    const invDpr = 1 / dpr;
    const cCx = cardRect.cx;
    const cCy = cardRect.cy;
    const chargeBrightMul = reducedMotion ? 1 : 1 + 0.6 * visualCharge;
    const chargePullPx = reducedMotion ? 0 : MAX_CHARGE_DRIFT_PX * visualCharge;

    const dots = spriteAtlas.dots;
    const mediumCrosses = spriteAtlas.mediumCrosses;
    const brightCores = spriteAtlas.brightCores;
    const spikes = spriteAtlas.spikes;

    for (let i = 0; i < starCount; i++) {
      const baseX = starU[i] * viewW;
      const baseY = starV[i] * viewH;

      // Subtle inward charge drift toward the card (clamped <= 5 px)
      let drawX = baseX;
      let drawY = baseY;
      if (chargePullPx > 0.01) {
        const dxToCard = cCx - baseX;
        const dyToCard = cCy - baseY;
        const distToCard = Math.hypot(dxToCard, dyToCard);
        if (distToCard > 1) {
          const shift = Math.min(MAX_CHARGE_DRIFT_PX, chargePullPx * Math.min(1, distToCard / 110));
          drawX += (dxToCard / distToCard) * shift;
          drawY += (dyToCard / distToCard) * shift;
        }
      }

      // Ambient twinkle (static dim under prefers-reduced-motion)
      let ambientAlpha: number;
      if (reducedMotion) {
        ambientAlpha = starBaseAlpha[i] * 0.72;
      } else {
        const freq = starFreq[i];
        const phase = starPhase[i];
        const waveAngle = simTime * TWO_PI * freq + phase;
        const s = Math.sin(waveAngle);
        let glint = 0;
        if (s > 0) {
          const s2 = s * s;
          const s4 = s2 * s2;
          glint = s4 * s4 * s4; // pow(max(0, sin), 12)
        }
        const breath = 0.8 + 0.2 * Math.sin(simTime * TWO_PI * freq * 0.45 + phase * 1.7);
        ambientAlpha = starBaseAlpha[i] * breath + glint * 0.48;
      }

      // Coordinated radial wave flares
      let flareEnv = 0;
      let flareBright = 0;
      let flareSpikeExtend = 0;

      if (anyWaveActive) {
        const clusterBoost = starInCluster[i] === 1 ? 1.25 : 1.0;
        for (let w = 0; w < MAX_ACTIVE_WAVES; w++) {
          const wave = waves[w];
          if (!wave.active) continue;
          const waveTime = wave.elapsed - wave.delay;
          if (waveTime < 0) continue;

          if (wave.joinFraction < 0.999 && hashStarWave(i, wave.salt) > wave.joinFraction) {
            continue;
          }

          const dist = Math.hypot(baseX - wave.cx, baseY - wave.cy);
          const frac = clamp(dist / wave.maxDist, 0, 1);
          // Exact inverse of ease-out cubic: r(u) = maxDist * (1 - (1 - u)^3)
          const hitDelay = WAVE_DURATION_SEC * (1 - Math.cbrt(1 - frac));
          const localT = waveTime - hitDelay;
          if (localT <= 0) continue;

          let env: number;
          if (localT < FLARE_RISE_SEC) {
            const rise = localT / FLARE_RISE_SEC;
            env = rise * (2 - rise);
          } else {
            const afterPeak = localT - FLARE_RISE_SEC;
            env = Math.exp(-3.5 * (afterPeak / starDecaySec[i]));
            if (env < 0.004) continue;
          }

          // Peak fades with distance to 55% at the farthest corner; clusters pop +25%
          const distFade = 1 - 0.45 * frac;
          const strengthEnv = env * distFade * clusterBoost * wave.amplitude;

          if (strengthEnv > flareEnv) {
            flareEnv = strengthEnv;
          }
          flareBright += strengthEnv * wave.flareBrightnessMul;
          const ext = strengthEnv * (0.65 + 0.55 * wave.chargeSmooth);
          if (ext > flareSpikeExtend) {
            flareSpikeExtend = ext;
          }
        }
      }

      const intensity =
        ambientAlpha * chargeBrightMul * brightSetting +
        flareBright * (0.48 + 0.28 * brightSetting);

      if (intensity <= 0.015) continue;

      const tier = starTier[i];
      const tint = starTint[i];
      const clampedFlareEnv = clamp(flareEnv, 0, 1.25);
      const sizeBoost = 1 + (starFlareSizeBoost[i] - 1) * Math.min(1, clampedFlareEnv);
      const coreRadius = starRadius[i] * sizeSetting * sizeBoost;
      const primaryAlpha = clamp(intensity, 0, 1);

      if (tier === TIER_TINY || tier === TIER_SMALL) {
        const drawSize = Math.max(1.2, coreRadius * 3.1);
        const half = drawSize * 0.5;
        const px = Math.round((drawX - half) * dpr) * invDpr;
        const py = Math.round((drawY - half) * dpr) * invDpr;

        ctx.globalAlpha = primaryAlpha;
        ctx.drawImage(dots[tint], px, py, drawSize, drawSize);

        if (intensity > 1.04) {
          const punchSize = drawSize * 0.72;
          const punchHalf = punchSize * 0.5;
          ctx.globalAlpha = clamp((intensity - 1.0) * 0.75, 0, 0.9);
          ctx.drawImage(
            dots[0],
            Math.round((drawX - punchHalf) * dpr) * invDpr,
            Math.round((drawY - punchHalf) * dpr) * invDpr,
            punchSize,
            punchSize,
          );
        }
      } else if (tier === TIER_MEDIUM) {
        const crossSize = Math.max(5, coreRadius * 4.4);
        const half = crossSize * 0.5;
        ctx.globalAlpha = primaryAlpha;
        ctx.drawImage(
          mediumCrosses[tint],
          Math.round((drawX - half) * dpr) * invDpr,
          Math.round((drawY - half) * dpr) * invDpr,
          crossSize,
          crossSize,
        );

        // Extend thin cross spikes cleanly during flare
        if (flareSpikeExtend > 0.04) {
          const spikeSpan = starSpikeLen[i] * 2 * sizeSetting * (0.85 + flareSpikeExtend * 1.15);
          const sHalf = spikeSpan * 0.5;
          ctx.globalAlpha = clamp(primaryAlpha * clamp(flareSpikeExtend * 0.9, 0, 1), 0, 0.95);
          ctx.drawImage(
            spikes[tint],
            Math.round((drawX - sHalf) * dpr) * invDpr,
            Math.round((drawY - sHalf) * dpr) * invDpr,
            spikeSpan,
            spikeSpan,
          );
        }

        if (intensity > 1.05) {
          const punchSize = coreRadius * 2.2;
          const pHalf = punchSize * 0.5;
          ctx.globalAlpha = clamp((intensity - 1.0) * 0.72, 0, 0.92);
          ctx.drawImage(
            dots[0],
            Math.round((drawX - pHalf) * dpr) * invDpr,
            Math.round((drawY - pHalf) * dpr) * invDpr,
            punchSize,
            punchSize,
          );
        }
      } else {
        // Tier 3 (bright): 3-4px core + thin 14-28px spikes that extend further on flare
        const coreSize = Math.max(6, coreRadius * 3.2);
        const cHalf = coreSize * 0.5;
        ctx.globalAlpha = primaryAlpha;
        ctx.drawImage(
          brightCores[tint],
          Math.round((drawX - cHalf) * dpr) * invDpr,
          Math.round((drawY - cHalf) * dpr) * invDpr,
          coreSize,
          coreSize,
        );

        const spikeSpan = starSpikeLen[i] * 2 * sizeSetting * (1 + flareSpikeExtend * 0.95);
        const sHalf = spikeSpan * 0.5;
        ctx.globalAlpha = clamp(primaryAlpha * (0.78 + Math.min(0.22, flareSpikeExtend * 0.28)), 0, 1);
        ctx.drawImage(
          spikes[tint],
          Math.round((drawX - sHalf) * dpr) * invDpr,
          Math.round((drawY - sHalf) * dpr) * invDpr,
          spikeSpan,
          spikeSpan,
        );

        if (intensity > 1.05) {
          const punchSize = coreRadius * 2.4;
          const pHalf = punchSize * 0.5;
          ctx.globalAlpha = clamp((intensity - 1.0) * 0.78, 0, 0.95);
          ctx.drawImage(
            dots[0],
            Math.round((drawX - pHalf) * dpr) * invDpr,
            Math.round((drawY - pHalf) * dpr) * invDpr,
            punchSize,
            punchSize,
          );
        }
      }
    }

    // Mask the card silhouette to pure black so spikes/drift never bleed across the card face
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    if (cardRect.halfW > 2 && cardRect.halfH > 2) {
      fillRoundedRectBlack(
        ctx,
        cardRect.cx - cardRect.halfW + 1,
        cardRect.cy - cardRect.halfH + 1,
        Math.max(0, cardRect.halfW * 2 - 2),
        Math.max(0, cardRect.halfH * 2 - 2),
        cardRect.cornerRadius,
      );
    }
  };

  const stopLoop = () => {
    if (rafId !== null) {
      window.cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  const tick = (now: number) => {
    rafId = null;
    if (disposed || document.hidden || reducedMotion) return;

    const isHighFps =
      hasActiveWaves() ||
      targetCharge > 0.001 ||
      visualCharge > 0.001 ||
      simTime < highFpsUntilSec;

    if (!isHighFps && lastFrameMs > 0) {
      const minIntervalMs = 1000 / IDLE_FPS - 1.5;
      if (now - lastFrameMs < minIntervalMs) {
        rafId = window.requestAnimationFrame(tick);
        return;
      }
    }

    const dt = lastFrameMs > 0 ? clamp((now - lastFrameMs) / 1000, 0.001, 0.06) : 1 / IDLE_FPS;
    lastFrameMs = now;
    simTime += dt;

    renderFrame(dt);

    if (!disposed && !document.hidden && !reducedMotion) {
      rafId = window.requestAnimationFrame(tick);
    }
  };

  const syncLoop = () => {
    if (disposed || !canvas) return;
    if (reducedMotion) {
      stopLoop();
      renderFrame(0);
      return;
    }
    if (document.hidden) {
      stopLoop();
      return;
    }
    if (rafId === null) {
      lastFrameMs = 0;
      rafId = window.requestAnimationFrame(tick);
    }
  };

  const onResize = () => {
    if (disposed || !canvas) return;
    updateViewportMetrics();
    const isMobile = viewW < MOBILE_BREAKPOINT_PX;
    if (isMobile !== lastGeneratedMobile) {
      generateStarfield();
    }
    if (reducedMotion) {
      renderFrame(0);
    }
  };

  const onVisibilityChange = () => {
    syncLoop();
  };

  const onReducedMotionChange = () => {
    reducedMotion = Boolean(reducedMotionQuery?.matches);
    if (reducedMotion) {
      for (let i = 0; i < MAX_ACTIVE_WAVES; i++) waves[i].active = false;
      targetCharge = 0;
      visualCharge = 0;
      chargeReleasing = false;
    }
    syncLoop();
  };

  const attachListeners = () => {
    if (listenersAttached) return;
    listenersAttached = true;
    window.addEventListener('resize', onResize, { passive: true });
    document.addEventListener('visibilitychange', onVisibilityChange);
    if (typeof window.matchMedia === 'function') {
      reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      reducedMotion = reducedMotionQuery.matches;
      if (typeof reducedMotionQuery.addEventListener === 'function') {
        reducedMotionQuery.addEventListener('change', onReducedMotionChange);
      }
    }
  };

  const detachListeners = () => {
    if (!listenersAttached) return;
    listenersAttached = false;
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    if (reducedMotionQuery && typeof reducedMotionQuery.removeEventListener === 'function') {
      reducedMotionQuery.removeEventListener('change', onReducedMotionChange);
    }
    reducedMotionQuery = null;
  };

  const acquireWaveSlot = (): RadialWave => {
    let oldestIdx = 0;
    let oldestElapsed = -Infinity;
    for (let i = 0; i < MAX_ACTIVE_WAVES; i++) {
      if (!waves[i].active) return waves[i];
      if (waves[i].elapsed > oldestElapsed) {
        oldestElapsed = waves[i].elapsed;
        oldestIdx = i;
      }
    }
    return waves[oldestIdx];
  };

  const mount = (container: HTMLElement) => {
    if (disposed || canvas) return;

    spriteAtlas = buildStarSpriteAtlas();
    const el = document.createElement('canvas');
    el.setAttribute('aria-hidden', 'true');
    el.style.position = 'fixed';
    el.style.inset = '0';
    el.style.width = '100%';
    el.style.height = '100%';
    el.style.pointerEvents = 'none';
    el.style.display = 'block';
    el.style.zIndex = '1';

    const context = el.getContext('2d');
    if (!context) return;

    container.insertBefore(el, container.firstChild);
    canvas = el;
    ctx = context;

    attachListeners();
    updateViewportMetrics();
    generateStarfield();
    renderFrame(0);
    syncLoop();
  };

  const setCardTarget = (element: HTMLElement | null, mode: StarfieldCardMode) => {
    cardElement = element;
    cardMode = mode;
    if (!canvas) return;
    const prevHalfW = cardRect.halfW;
    const prevHalfH = cardRect.halfH;
    cardRect = measureCardRect(cardElement, cardMode, viewW, viewH);
    // If card bounds changed noticeably after initial mount (e.g. WebGPU -> fallback), regenerate exclusion
    if (Math.abs(cardRect.halfW - prevHalfW) > 6 || Math.abs(cardRect.halfH - prevHalfH) > 6) {
      generateStarfield();
    }
    if (reducedMotion) {
      renderFrame(0);
    }
  };

  const setCharge = (charge: number) => {
    if (disposed || reducedMotion) return;
    const clamped = clamp(charge, 0, 1);
    if (clamped > 0.001) {
      chargeReleasing = false;
    }
    targetCharge = clamped;
  };

  const triggerRelease = (element: HTMLElement, mode: StarfieldCardMode, strength: number) => {
    if (disposed || reducedMotion || !canvas) return;
    if (strength < BURST_MIN_STRENGTH) return;

    const clampedStrength = clamp(strength, BURST_MIN_STRENGTH, 1);
    cardElement = element;
    cardMode = mode;
    cardRect = measureCardRect(element, mode, viewW, viewH);

    // Release charge anticipation smoothly as the radial shine launches
    targetCharge = 0;
    chargeReleasing = true;

    const settings = currentSettings;
    const chargeSmooth = smoothstep(BURST_MIN_STRENGTH, 1.0, clampedStrength);
    const joinFraction = lerp(0.35, 1.0, chargeSmooth);
    const flareBrightnessMul = lerp(settings.minMul, settings.maxMul, chargeSmooth);

    const maxCornerDist = Math.max(
      1,
      Math.hypot(
        Math.max(cardRect.cx, viewW - cardRect.cx),
        Math.max(cardRect.cy, viewH - cardRect.cy),
      ),
    );
    const salt = waveSaltCounter++;

    // Primary outward radial shine wave (~1.6s ease-out to farthest corner)
    const primary = acquireWaveSlot();
    primary.active = true;
    primary.cx = cardRect.cx;
    primary.cy = cardRect.cy;
    primary.maxDist = maxCornerDist;
    primary.delay = 0;
    primary.elapsed = 0;
    primary.amplitude = 1.0;
    primary.joinFraction = joinFraction;
    primary.flareBrightnessMul = flareBrightnessMul;
    primary.chargeSmooth = chargeSmooth;
    primary.salt = salt;

    // Fainter echo wave following 260ms later at 45% strength
    const echo = acquireWaveSlot();
    echo.active = true;
    echo.cx = cardRect.cx;
    echo.cy = cardRect.cy;
    echo.maxDist = maxCornerDist;
    echo.delay = WAVE_ECHO_DELAY_SEC;
    echo.elapsed = 0;
    echo.amplitude = WAVE_ECHO_AMPLITUDE;
    echo.joinFraction = joinFraction;
    echo.flareBrightnessMul = flareBrightnessMul;
    echo.chargeSmooth = chargeSmooth;
    echo.salt = salt;

    highFpsUntilSec = Math.max(highFpsUntilSec, simTime + POST_RELEASE_HIGH_FPS_SEC);
    syncLoop();
  };

  const setSettings = (raw: unknown) => {
    currentSettings = clampHoloGlitter(raw);
    if (disposed || !canvas) return;
    if (
      currentSettings.density !== lastGeneratedDensity ||
      currentSettings.cluster !== lastGeneratedCluster
    ) {
      generateStarfield();
    }
    if (reducedMotion) {
      renderFrame(0);
    }
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    stopLoop();
    detachListeners();
    for (let i = 0; i < MAX_ACTIVE_WAVES; i++) waves[i].active = false;
    if (canvas) {
      canvas.remove();
      canvas = null;
      ctx = null;
    }
    cardElement = null;
    spriteAtlas = null;
    starCount = 0;
  };

  return {
    mount,
    setCardTarget,
    setCharge,
    triggerRelease,
    setSettings,
    dispose,
  };
}
