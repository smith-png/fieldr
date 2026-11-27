/**
 * Screen-wide "energy release" 2D canvas glitter overlay for /holo.
 *
 * - Zero idle cost: the single front overlay canvas is created only on trigger and removed
 *   300ms after the last particle dies.
 * - Point-sized shiny foil glitter sprites (white pin-point, 1px 4-point cross flare on ~12%,
 *   and faintly tinted pin-points) spawned along invisible expanding wavefronts leaving the card.
 * - Zero per-frame allocations in the hot rAF loop (pre-allocated SoA particle pool & offscreen sprites).
 */

export type EnergyReleaseMode = 'webgpu' | 'fallback';

export interface EnergyReleaseTriggerOptions {
  /** DOM element representing the card (WebGPU canvas or fallback card div). Re-measured at trigger time. */
  element: HTMLElement;
  /** Render mode used to determine card bounds. */
  mode: EnergyReleaseMode;
  /** Charge burst strength in [0.15, 1]. Below 0.15 does nothing. */
  strength: number;
  /** Container element (<main>) where the overlay canvas is lazily mounted. */
  container: HTMLElement;
}

export interface EnergyReleaseController {
  trigger: (options: EnergyReleaseTriggerOptions) => void;
  dispose: () => void;
}

const BURST_MIN_STRENGTH = 0.15;
const FIRST_WAVE_DELAY_SEC = 0.35; // Synced with card shockwave reaching the card edge
const WAVE_STAGGER_SEC = 0.11;
const WAVE_MIN_DURATION_SEC = 1.12;
const WAVE_MAX_DURATION_SEC = 1.48;
const TEARDOWN_DELAY_MS = 300;
const MAX_DPR = 1.5;

const MAX_PARTICLES_DESKTOP = 900;
const MAX_PARTICLES_MOBILE = 450;
const MOBILE_BREAKPOINT_PX = 640;

const MAX_WAVES = 16;
const TWO_PI = Math.PI * 2;

// Faint tints for coloured pin-point glitter sprites (white-dominant + cyan, magenta, amber)
const GLITTER_TINTS: readonly string[] = [
  '#9ceeff', // cyan tint
  '#f4a8ea', // magenta tint
  '#fad8a4', // amber tint
];

const SPRITE_KIND_WHITE_PIN = 0;
const SPRITE_KIND_CROSS_FLARE = 1;
const SPRITE_KIND_TINTED_PIN = 2;

interface SpriteAtlas {
  whitePin: HTMLCanvasElement;
  crossFlare: HTMLCanvasElement;
  tintedPins: HTMLCanvasElement[];
}

interface CardBounds {
  cx: number;
  cy: number;
  startRadius: number;
}

interface SpawnWave {
  active: boolean;
  cx: number;
  cy: number;
  startRadius: number;
  maxRadius: number;
  delay: number;
  elapsed: number;
  duration: number;
  strength: number;
  wobbleAmp: number;
  phase2: number;
  phase3: number;
  phase5: number;
  initialSpawnBudget: number;
  spawnBudget: number;
  spawnCarry: number;
  lastRadius: number;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Exact solver for cubic-bezier(0.16, 1, 0.3, 1) — fast initial burst, smooth long deceleration.
 */
function easeOutExpoBezier(x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const cx = 3 * 0.16;
  const bx = 3 * (0.3 - 0.16) - cx;
  const ax = 1 - cx - bx;

  let t = x;
  for (let i = 0; i < 4; i++) {
    const xt = ((ax * t + bx) * t + cx) * t - x;
    const dx = (3 * ax * t + 2 * bx) * t + cx;
    if (Math.abs(dx) < 1e-5) break;
    t = clamp(t - xt / dx, 0, 1);
  }
  const inv = 1 - t;
  return 1 - inv * inv * inv;
}

function measureCardBounds(element: HTMLElement, mode: EnergyReleaseMode): CardBounds {
  const rect = element.getBoundingClientRect();
  const cx = rect.left + rect.width * 0.5;
  const cy = rect.top + rect.height * 0.5;

  if (mode === 'webgpu') {
    const scale = Math.min(rect.height, rect.width * 1.35);
    const halfW = (0.64 / 2.5) * scale;
    const halfH = (0.91 / 2.5) * scale;
    return { cx, cy, startRadius: Math.hypot(halfW, halfH) * 0.74 };
  }

  const halfW = rect.width * 0.5;
  const halfH = rect.height * 0.5;
  return { cx, cy, startRadius: Math.hypot(halfW, halfH) * 0.74 };
}

/**
 * Sprite 1 (10x10): Crisp pin-point white core with sharp falloff.
 */
function createWhitePinSprite(): HTMLCanvasElement {
  const size = 10;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const c = size * 0.5;
  const grad = ctx.createRadialGradient(c, c, 0, c, c, c * 0.9);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(0.28, 'rgba(255, 255, 255, 0.95)');
  grad.addColorStop(0.55, 'rgba(244, 248, 255, 0.28)');
  grad.addColorStop(1, 'rgba(244, 248, 255, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

/**
 * Sprite 2 (12x12): Pin-point core with a crisp 1px-wide 4-point cross flare (arms <= 7px when drawn).
 */
function createCrossFlareSprite(): HTMLCanvasElement {
  const size = 12;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const c = size * 0.5;

  const hGrad = ctx.createLinearGradient(1, c, size - 1, c);
  hGrad.addColorStop(0, 'rgba(245, 250, 255, 0)');
  hGrad.addColorStop(0.32, 'rgba(245, 250, 255, 0.34)');
  hGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.95)');
  hGrad.addColorStop(0.68, 'rgba(245, 250, 255, 0.34)');
  hGrad.addColorStop(1, 'rgba(245, 250, 255, 0)');
  ctx.fillStyle = hGrad;
  ctx.fillRect(1, c - 0.5, size - 2, 1);

  const vGrad = ctx.createLinearGradient(c, 1, c, size - 1);
  vGrad.addColorStop(0, 'rgba(245, 250, 255, 0)');
  vGrad.addColorStop(0.32, 'rgba(245, 250, 255, 0.34)');
  vGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.95)');
  vGrad.addColorStop(0.68, 'rgba(245, 250, 255, 0.34)');
  vGrad.addColorStop(1, 'rgba(245, 250, 255, 0)');
  ctx.fillStyle = vGrad;
  ctx.fillRect(c - 0.5, 1, 1, size - 2);

  const core = ctx.createRadialGradient(c, c, 0, c, c, 2.4);
  core.addColorStop(0, 'rgba(255, 255, 255, 1)');
  core.addColorStop(0.45, 'rgba(255, 255, 255, 0.88)');
  core.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(c, c, 2.4, 0, TWO_PI);
  ctx.fill();

  return canvas;
}

/**
 * Sprite 3 (10x10): White-hot pin-point core with a crisp narrow tinted rim (cyan, magenta, amber).
 */
function createTintedPinSprite(tintHex: string): HTMLCanvasElement {
  const size = 10;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const c = size * 0.5;
  const grad = ctx.createRadialGradient(c, c, 0, c, c, c * 0.9);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.24, '#ffffff');
  grad.addColorStop(0.48, tintHex);
  grad.addColorStop(0.76, tintHex + '30');
  grad.addColorStop(1, tintHex + '00');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

function buildSpriteAtlas(): SpriteAtlas {
  return {
    whitePin: createWhitePinSprite(),
    crossFlare: createCrossFlareSprite(),
    tintedPins: GLITTER_TINTS.map(createTintedPinSprite),
  };
}

function createEmptyWave(): SpawnWave {
  return {
    active: false,
    cx: 0,
    cy: 0,
    startRadius: 120,
    maxRadius: 900,
    delay: 0,
    elapsed: 0,
    duration: 1.25,
    strength: 1,
    wobbleAmp: 0.024,
    phase2: 0,
    phase3: 0,
    phase5: 0,
    initialSpawnBudget: 0,
    spawnBudget: 0,
    spawnCarry: 0,
    lastRadius: 120,
  };
}

export function createEnergyReleaseController(): EnergyReleaseController {
  // Pre-allocated SoA particle pool (max 900 particles, O(1) swap-remove, zero GC churn)
  const pX = new Float32Array(MAX_PARTICLES_DESKTOP);
  const pY = new Float32Array(MAX_PARTICLES_DESKTOP);
  const pVx = new Float32Array(MAX_PARTICLES_DESKTOP);
  const pVy = new Float32Array(MAX_PARTICLES_DESKTOP);
  const pAge = new Float32Array(MAX_PARTICLES_DESKTOP);
  const pLife = new Float32Array(MAX_PARTICLES_DESKTOP);
  const pRadius = new Float32Array(MAX_PARTICLES_DESKTOP);
  const pTwinkleFreq = new Float32Array(MAX_PARTICLES_DESKTOP);
  const pTwinklePhase = new Float32Array(MAX_PARTICLES_DESKTOP);
  const pDrag = new Float32Array(MAX_PARTICLES_DESKTOP);
  const pGravity = new Float32Array(MAX_PARTICLES_DESKTOP);
  const pBaseAlpha = new Float32Array(MAX_PARTICLES_DESKTOP);
  const pBoostAlpha = new Float32Array(MAX_PARTICLES_DESKTOP);
  const pTintIdx = new Uint8Array(MAX_PARTICLES_DESKTOP);
  const pKind = new Uint8Array(MAX_PARTICLES_DESKTOP);
  const pCanFlare = new Uint8Array(MAX_PARTICLES_DESKTOP);
  let activeParticleCount = 0;

  // Invisible expanding wavefront spawners (drive outward glitter emission without drawing ripples)
  const waves: SpawnWave[] = Array.from({ length: MAX_WAVES }, createEmptyWave);

  let spriteAtlas: SpriteAtlas | null = null;
  let containerEl: HTMLElement | null = null;
  let frontCanvas: HTMLCanvasElement | null = null;
  let frontCtx: CanvasRenderingContext2D | null = null;

  let viewW = 0;
  let viewH = 0;
  let dpr = 1;
  let rafId: number | null = null;
  let teardownTimerId: number | null = null;
  let lastFrameMs = 0;
  let simTime = 0;
  let disposed = false;
  let listenersAttached = false;

  const clearTeardownTimer = () => {
    if (teardownTimerId !== null) {
      window.clearTimeout(teardownTimerId);
      teardownTimerId = null;
    }
  };

  const stopLoop = () => {
    if (rafId !== null) {
      window.cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  const resizeCanvas = () => {
    if (!frontCanvas || !frontCtx) return;
    viewW = Math.max(1, window.innerWidth);
    viewH = Math.max(1, window.innerHeight);
    dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);

    const backingW = Math.round(viewW * dpr);
    const backingH = Math.round(viewH * dpr);

    if (frontCanvas.width !== backingW || frontCanvas.height !== backingH) {
      frontCanvas.width = backingW;
      frontCanvas.height = backingH;
    }

    frontCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const onResize = () => {
    resizeCanvas();
  };

  const onVisibilityChange = () => {
    if (disposed) return;
    if (document.hidden) {
      stopLoop();
    } else if (frontCanvas && hasActiveWork()) {
      lastFrameMs = performance.now();
      startLoop();
    }
  };

  const detachGlobalListeners = () => {
    if (!listenersAttached) return;
    listenersAttached = false;
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };

  const attachGlobalListeners = () => {
    if (listenersAttached) return;
    listenersAttached = true;
    window.addEventListener('resize', onResize, { passive: true });
    document.addEventListener('visibilitychange', onVisibilityChange);
  };

  const unmountCanvas = () => {
    clearTeardownTimer();
    stopLoop();
    detachGlobalListeners();
    if (frontCanvas) {
      frontCanvas.remove();
      frontCanvas = null;
      frontCtx = null;
    }
    containerEl = null;
  };

  const ensureCanvasMounted = (container: HTMLElement): boolean => {
    clearTeardownTimer();

    if (!spriteAtlas) {
      spriteAtlas = buildSpriteAtlas();
    }

    if (frontCanvas && containerEl === container) {
      return true;
    }

    if (frontCanvas) {
      unmountCanvas();
    }

    const front = document.createElement('canvas');
    front.setAttribute('aria-hidden', 'true');
    front.style.position = 'fixed';
    front.style.inset = '0';
    front.style.width = '100%';
    front.style.height = '100%';
    front.style.pointerEvents = 'none';
    front.style.display = 'block';
    front.style.zIndex = '15';

    const fCtx = front.getContext('2d');
    if (!fCtx) {
      return false;
    }

    container.appendChild(front);

    containerEl = container;
    frontCanvas = front;
    frontCtx = fCtx;
    resizeCanvas();
    attachGlobalListeners();
    return true;
  };

  const getCurrentParticleCap = (): number => {
    return viewW < MOBILE_BREAKPOINT_PX ? MAX_PARTICLES_MOBILE : MAX_PARTICLES_DESKTOP;
  };

  const allocateParticleSlot = (): number => {
    const cap = getCurrentParticleCap();
    if (activeParticleCount < cap) {
      const idx = activeParticleCount;
      activeParticleCount += 1;
      return idx;
    }

    // At cap: recycle the oldest particle past 65% of its life, else skip
    let bestIdx = -1;
    let bestRatio = 0.65;
    for (let i = 0; i < activeParticleCount; i++) {
      const ratio = pAge[i] / pLife[i];
      if (ratio > bestRatio) {
        bestRatio = ratio;
        bestIdx = i;
      }
    }
    return bestIdx;
  };

  const removeParticleAt = (idx: number) => {
    const last = activeParticleCount - 1;
    if (idx !== last) {
      pX[idx] = pX[last];
      pY[idx] = pY[last];
      pVx[idx] = pVx[last];
      pVy[idx] = pVy[last];
      pAge[idx] = pAge[last];
      pLife[idx] = pLife[last];
      pRadius[idx] = pRadius[last];
      pTwinkleFreq[idx] = pTwinkleFreq[last];
      pTwinklePhase[idx] = pTwinklePhase[last];
      pDrag[idx] = pDrag[last];
      pGravity[idx] = pGravity[last];
      pBaseAlpha[idx] = pBaseAlpha[last];
      pBoostAlpha[idx] = pBoostAlpha[last];
      pTintIdx[idx] = pTintIdx[last];
      pKind[idx] = pKind[last];
      pCanFlare[idx] = pCanFlare[last];
    }
    activeParticleCount = last;
  };

  const spawnParticleOnWave = (
    wave: SpawnWave,
    leadRadius: number,
    expandProgress: number,
    radialSpeedPx: number,
  ) => {
    const theta = Math.random() * TWO_PI;
    const amp = wave.wobbleAmp * (0.48 + 0.52 * expandProgress);
    const drift = expandProgress * 0.85;
    const wobble =
      1 +
      amp *
        (0.52 * Math.sin(theta * 3 + wave.phase3 + drift) +
          0.3 * Math.cos(theta * 5 - wave.phase5 - drift * 0.7) +
          0.18 * Math.sin(theta * 2 + wave.phase2 + drift * 0.4));
    const trailOffset = Math.random() * Math.random() * 58;
    const r = Math.max(8, leadRadius * wobble - trailOffset);

    const cosA = Math.cos(theta);
    const sinA = Math.sin(theta);
    const x = wave.cx + cosA * r;
    const y = wave.cy + sinA * r;

    const margin = 24;
    if (x < -margin || x > viewW + margin || y < -margin || y > viewH + margin) {
      return;
    }

    const slot = allocateParticleSlot();
    if (slot < 0) return;

    // Inherit outward velocity from the passing wavefront
    const speedFactor = 0.13 + Math.random() * 0.22;
    const inheritedSpeed =
      clamp(radialSpeedPx * speedFactor, 24, 210) * (0.62 + 0.38 * wave.strength);
    const tangSpeed = (Math.random() - 0.5) * 30;

    pX[slot] = x;
    pY[slot] = y;
    pVx[slot] = cosA * inheritedSpeed - sinA * tangSpeed;
    pVy[slot] = sinA * inheritedSpeed + cosA * tangSpeed;
    pAge[slot] = 0;
    pLife[slot] = 2.5 + Math.random() * 2.0; // 2.5 - 4.5 s lifetime

    // Point-sized particles: core radius 0.5 - 1.2 px (rare few up to 1.6 px)
    const sizeRoll = Math.random();
    if (sizeRoll < 0.92) {
      pRadius[slot] = 0.5 + Math.random() * 0.7;
    } else {
      pRadius[slot] = 1.2 + Math.random() * 0.4;
    }

    // White-dominant distribution: ~58% white pin-point, ~12% 1px cross flare, ~30% faintly tinted pin-point
    const kindRoll = Math.random();
    if (kindRoll < 0.12) {
      pKind[slot] = SPRITE_KIND_CROSS_FLARE;
      pTintIdx[slot] = 0;
    } else if (kindRoll < 0.7) {
      pKind[slot] = SPRITE_KIND_WHITE_PIN;
      pTintIdx[slot] = 0;
    } else {
      pKind[slot] = SPRITE_KIND_TINTED_PIN;
      pTintIdx[slot] = Math.floor(Math.random() * GLITTER_TINTS.length);
    }

    // Independent 2 - 8 Hz twinkle for sharp specular foil glints (pow(max(0, sin(phase)), 10))
    pTwinkleFreq[slot] = 2 + Math.random() * 6;
    pTwinklePhase[slot] = Math.random() * TWO_PI;

    // ~18% of particles briefly flare up to ~2.2px core radius during a hard glint then shrink
    pCanFlare[slot] = Math.random() < 0.18 ? 1 : 0;

    pDrag[slot] = 2.2 + Math.random() * 1.4;
    pGravity[slot] = 5 + Math.random() * 9;

    const powerScale = 0.58 + 0.42 * wave.strength;
    pBaseAlpha[slot] = (0.12 + Math.random() * 0.16) * powerScale;
    pBoostAlpha[slot] = (0.68 + Math.random() * 0.28) * powerScale;
  };

  const hasActiveWork = (): boolean => {
    if (activeParticleCount > 0) return true;
    for (let i = 0; i < MAX_WAVES; i++) {
      if (waves[i].active) return true;
    }
    return false;
  };

  const stepSpawnWaves = (dt: number) => {
    for (let i = 0; i < MAX_WAVES; i++) {
      const wave = waves[i];
      if (!wave.active) continue;

      wave.elapsed += dt;
      const t = wave.elapsed - wave.delay;
      if (t < 0) continue;

      const progress = t / wave.duration;
      if (progress >= 1 || wave.spawnBudget <= 0) {
        wave.active = false;
        continue;
      }

      const eased = easeOutExpoBezier(progress);
      const leadRadius = wave.startRadius + (wave.maxRadius - wave.startRadius) * eased;
      const radialSpeedPx = Math.max(0, (leadRadius - wave.lastRadius) / Math.max(0.004, dt));
      wave.lastRadius = leadRadius;

      if (progress >= 0.01 && progress <= 0.86) {
        const rateBias = 1.35 - 0.85 * progress;
        const desired =
          wave.initialSpawnBudget * (dt / (wave.duration * 0.62)) * rateBias + wave.spawnCarry;
        const count = Math.min(wave.spawnBudget, Math.floor(desired));
        wave.spawnCarry = desired - count;
        wave.spawnBudget -= count;

        for (let s = 0; s < count; s++) {
          spawnParticleOnWave(wave, leadRadius, progress, radialSpeedPx);
        }
      }
    }
  };

  const renderFrontLayer = (dt: number) => {
    const ctx = frontCtx;
    const atlas = spriteAtlas;
    if (!ctx || !atlas) return;

    ctx.clearRect(0, 0, viewW, viewH);
    if (activeParticleCount === 0) return;

    ctx.globalCompositeOperation = 'lighter';

    const curlFreq = 0.0052;
    const tSlow = simTime * 0.62;
    const invDpr = 1 / dpr;

    let i = 0;
    while (i < activeParticleCount) {
      const age = pAge[i] + dt;
      const life = pLife[i];
      if (age >= life) {
        removeParticleAt(i);
        continue;
      }
      pAge[i] = age;

      // Decelerate inherited radial velocity via exponential drag
      const decay = Math.exp(-pDrag[i] * dt);
      const vx = pVx[i] * decay;
      const vy = pVy[i] * decay;
      pVx[i] = vx;
      pVy[i] = vy;

      // Divergence-free 2D curl noise drift + subtle downward float
      const x = pX[i];
      const y = pY[i];
      const nx = x * curlFreq;
      const ny = y * curlFreq;
      const curlVx =
        (Math.cos(ny * 1.9 + tSlow) * Math.sin(nx * 1.4 - tSlow * 0.7) +
          0.55 * Math.cos(ny * 3.1 - nx * 1.7 + tSlow * 1.1)) *
        14;
      const curlVy =
        (-Math.cos(nx * 1.4 - tSlow * 0.7) * Math.sin(ny * 1.9 + tSlow) -
          0.55 * Math.cos(nx * 2.7 + ny * 1.3 - tSlow * 0.9)) *
        14;

      const driftBlend = smoothstep(0.15, 1.1, age);
      const nextX = x + (vx + curlVx * driftBlend) * dt;
      const nextY = y + (vy + (curlVy + pGravity[i]) * driftBlend) * dt;
      pX[i] = nextX;
      pY[i] = nextY;

      if (nextX < -24 || nextX > viewW + 24 || nextY < -24 || nextY > viewH + 24) {
        removeParticleAt(i);
        continue;
      }

      const lifeT = age / life;
      const fadeIn = smoothstep(0, 0.06, lifeT);
      const invLife = 1 - lifeT;
      const fadeOut = invLife * invLife; // ease-out alpha fade

      // Sharp specular glint: alpha = base + pow(max(0, sin(phase)), 10) * boost
      const s = Math.sin(age * TWO_PI * pTwinkleFreq[i] + pTwinklePhase[i]);
      let glint = 0;
      if (s > 0) {
        const s2 = s * s;
        const s4 = s2 * s2;
        glint = s4 * s4 * s2;
      }

      const rawAlpha = pBaseAlpha[i] + glint * pBoostAlpha[i];
      const alpha = clamp(rawAlpha * fadeIn * fadeOut, 0, 1);

      if (alpha > 0.015) {
        const kind = pKind[i];
        let coreR = pRadius[i];

        if (pCanFlare[i] === 1 && glint > 0.02) {
          coreR = coreR + glint * Math.max(0, 2.2 - coreR);
        }

        let sprite: HTMLCanvasElement;
        let drawSize: number;

        if (kind === SPRITE_KIND_CROSS_FLARE) {
          sprite = atlas.crossFlare;
          drawSize = clamp(5.6 + coreR * 1.4 + glint * 1.4, 5.5, 8.4);
        } else if (kind === SPRITE_KIND_TINTED_PIN) {
          sprite = atlas.tintedPins[pTintIdx[i]];
          drawSize = coreR * 3.4;
        } else {
          sprite = atlas.whitePin;
          drawSize = coreR * 3.4;
        }

        const half = drawSize * 0.5;
        const drawX = Math.round((nextX - half) * dpr) * invDpr;
        const drawY = Math.round((nextY - half) * dpr) * invDpr;

        ctx.globalAlpha = alpha;
        ctx.drawImage(sprite, drawX, drawY, drawSize, drawSize);
      }

      i += 1;
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  };

  const tick = (now: number) => {
    rafId = null;
    if (disposed || document.hidden) return;

    const dt = clamp((now - lastFrameMs) / 1000, 0.001, 0.05);
    lastFrameMs = now;
    simTime += dt;

    stepSpawnWaves(dt);
    renderFrontLayer(dt);

    if (hasActiveWork()) {
      rafId = window.requestAnimationFrame(tick);
    } else {
      clearTeardownTimer();
      teardownTimerId = window.setTimeout(() => {
        teardownTimerId = null;
        if (!disposed && !hasActiveWork()) {
          unmountCanvas();
        }
      }, TEARDOWN_DELAY_MS);
    }
  };

  const startLoop = () => {
    if (disposed || document.hidden || rafId !== null) return;
    lastFrameMs = performance.now();
    rafId = window.requestAnimationFrame(tick);
  };

  const acquireWaveSlot = (): SpawnWave => {
    let oldestIdx = 0;
    let oldestElapsed = -Infinity;
    for (let i = 0; i < MAX_WAVES; i++) {
      if (!waves[i].active) return waves[i];
      if (waves[i].elapsed > oldestElapsed) {
        oldestElapsed = waves[i].elapsed;
        oldestIdx = i;
      }
    }
    return waves[oldestIdx];
  };

  const trigger = ({ element, mode, strength, container }: EnergyReleaseTriggerOptions) => {
    if (disposed) return;
    if (prefersReducedMotion()) return;
    if (strength < BURST_MIN_STRENGTH) return;

    const clampedStrength = clamp(strength, BURST_MIN_STRENGTH, 1);
    const normalized = clamp(
      (clampedStrength - BURST_MIN_STRENGTH) / (1 - BURST_MIN_STRENGTH),
      0,
      1,
    );
    const power = 0.25 + 0.75 * normalized;

    if (!ensureCanvasMounted(container)) return;

    const bounds = measureCardBounds(element, mode);
    const maxCornerDist = Math.hypot(
      Math.max(bounds.cx, viewW - bounds.cx),
      Math.max(bounds.cy, viewH - bounds.cy),
    );
    const maxRadius = maxCornerDist + 140;

    const waveCount = clampedStrength < 0.35 ? 2 : clampedStrength < 0.65 ? 3 : 4;
    const isMobile = viewW < MOBILE_BREAKPOINT_PX;
    const totalParticlesForBurst = Math.round(
      (isMobile ? MAX_PARTICLES_MOBILE : MAX_PARTICLES_DESKTOP) * (0.28 + 0.72 * normalized),
    );

    const waveWeights =
      waveCount === 4
        ? [0.34, 0.28, 0.22, 0.16]
        : waveCount === 3
          ? [0.42, 0.34, 0.24]
          : [0.58, 0.42];

    for (let i = 0; i < waveCount; i++) {
      const wave = acquireWaveSlot();
      const waveFactor = 1 - i * 0.15;
      wave.active = true;
      wave.cx = bounds.cx;
      wave.cy = bounds.cy;
      wave.startRadius = bounds.startRadius * (0.94 + i * 0.025);
      wave.maxRadius = maxRadius * (1.0 + i * 0.05);
      wave.delay = FIRST_WAVE_DELAY_SEC + i * WAVE_STAGGER_SEC;
      wave.elapsed = 0;
      wave.duration =
        WAVE_MIN_DURATION_SEC +
        (WAVE_MAX_DURATION_SEC - WAVE_MIN_DURATION_SEC) * (i / Math.max(1, waveCount - 1));
      wave.strength = power * waveFactor;
      wave.wobbleAmp = 0.022 + 0.011 * (i / 3);
      wave.phase2 = Math.random() * TWO_PI;
      wave.phase3 = Math.random() * TWO_PI;
      wave.phase5 = Math.random() * TWO_PI;
      const budget = Math.max(12, Math.round(totalParticlesForBurst * waveWeights[i]));
      wave.initialSpawnBudget = budget;
      wave.spawnBudget = budget;
      wave.spawnCarry = 0;
      wave.lastRadius = wave.startRadius;
    }

    startLoop();
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    activeParticleCount = 0;
    for (let i = 0; i < MAX_WAVES; i++) waves[i].active = false;
    unmountCanvas();
    spriteAtlas = null;
  };

  return { trigger, dispose };
}
