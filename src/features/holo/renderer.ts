import { frame, init, surface, type Gpu } from 'vgpu';
import { waitForBrandFonts } from './logoMask';
import { createScene } from './scene';

export interface CreateRendererOptions {
  onFirstInteraction?: () => void;
  onBurstRelease?: (strength: number) => void;
}

const IDLE_DELAY_MS = 1500;
const RIPPLE_DURATION_SEC = 0.9;
const CHARGE_DURATION_SEC = 1.6;
const CHARGE_DRAIN_SEC = 0.4;
const BURST_THRESHOLD = 0.15;
const BURST_INHALE_SEC = 0.12;
const BURST_ECHO1_AT_SEC = BURST_INHALE_SEC + 0.14;
const BURST_ECHO2_AT_SEC = BURST_INHALE_SEC + 0.3;
const BURST_TOTAL_SEC = 2.2; // 120ms inhale + 1100ms wave + echo rings + ~1.8s F afterglow
const ACTIVE_FPS = 60;
const IDLE_FPS = 30;
const FRAME_INTERVAL_SLACK_MS = 1;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function easeInCharge(t: number): number {
  const c = clamp(t, 0, 1);
  return c * (0.45 + 0.55 * c);
}

function isAndroidDevice(): boolean {
  return typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);
}

function vibrateAndroid(pattern: number | number[]): void {
  if (
    !isAndroidDevice() ||
    typeof navigator === 'undefined' ||
    typeof navigator.vibrate !== 'function'
  ) {
    return;
  }
  try {
    navigator.vibrate(pattern);
  } catch {
    // Ignore vibration errors if blocked by browser policy.
  }
}

export function createRenderer(
  canvas: HTMLCanvasElement,
  options?: CreateRendererOptions,
) {
  let disposed = false;
  let gpu: Gpu | undefined;
  let removeInput = () => {};

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    removeInput();
    gpu?.dispose();
  };

  const ready = (async () => {
    if (typeof navigator === 'undefined' || !('gpu' in navigator) || !navigator.gpu) {
      throw new Error('WebGPU is not available in this browser.');
    }

    const [context] = await Promise.all([init(), waitForBrandFonts()]);
    if (disposed) {
      context.dispose();
      return;
    }
    gpu = context;

    const maxDpr = typeof window !== 'undefined' && window.innerWidth < 640 ? 1.5 : 2;
    const output = surface(context, canvas, { dpr: [1, maxDpr] });
    const shader = createScene(context, output);
    await shader.compile({ colors: [output.format] });
    if (disposed) return;

    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let interacted = false;
    let isPointerDown = false;
    let activePointerId: number | null = null;
    let isMouseHovering = false;
    let pointerTargetHover = 0;
    let pointerX = 0;
    let pointerY = 0;
    let tiltX = 0;
    let tiltY = 0;
    let hover = 0;
    let lightX = 0.2;
    let lightY = -0.25;

    // Idle Lissajous + F glow state
    let lastInputMs = performance.now();
    let idleBlend = 0;
    let idleTime = 0;
    let idleGlow = 0;

    // Expanding pointer-down ripple state
    let rippleOriginX = 0;
    let rippleOriginY = 0;
    let rippleElapsed = -1;

    // Hold-to-charge & release-to-burst state
    let isCharging = false;
    let isDraining = false;
    let rawCharge = 0;
    let charge = 0;
    let chargeTime = 0;
    let heartbeatPhase = 0;
    let ripplePhase = 0;
    let shimmerTime = 0;
    let burstElapsed = -1;
    let burstStrength = 0;
    let hapticTickAccumSec = 0;
    let echo1HapticFired = false;
    let echo2HapticFired = false;

    const markInteracted = () => {
      if (!interacted) {
        interacted = true;
        options?.onFirstInteraction?.();
      }
    };

    const releaseCapture = (pointerId: number | null) => {
      if (pointerId === null) return;
      try {
        if (typeof canvas.hasPointerCapture === 'function' && canvas.hasPointerCapture(pointerId)) {
          canvas.releasePointerCapture(pointerId);
        }
      } catch {
        // Ignore if pointer capture is already released or unsupported.
      }
    };

    const startChargeDrain = () => {
      isCharging = false;
      hapticTickAccumSec = 0;
      if (charge > 0.001) {
        isDraining = true;
      } else {
        rawCharge = 0;
        charge = 0;
        isDraining = false;
      }
    };

    const updatePointerFromEvent = (event: PointerEvent) => {
      markInteracted();
      lastInputMs = performance.now();
      const rect = canvas.getBoundingClientRect();
      const scale = Math.min(rect.height, rect.width * 1.35);
      // Match the shader's card coordinates and reveal the foil as the pointer approaches.
      pointerX =
        ((event.clientX - rect.left - rect.width / 2) / Math.max(1, scale)) * 2.5 / 0.64;
      pointerY =
        ((event.clientY - rect.top - rect.height / 2) / Math.max(1, scale)) * 2.5 / 0.91;
      const distanceX = (Math.max(0, Math.abs(pointerX) - 1) * scale * 0.64) / 2.5;
      const distanceY = (Math.max(0, Math.abs(pointerY) - 1) * scale * 0.91) / 2.5;
      // Begin revealing one full rendered card width beyond its edges.
      const approachDistance = (Math.max(1, scale) * 1.28) / 2.5;
      const proximity = Math.max(0, 1 - Math.hypot(distanceX, distanceY) / approachDistance);
      pointerTargetHover = proximity * proximity * (3 - 2 * proximity);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!event.isPrimary) return;
      isPointerDown = true;
      activePointerId = event.pointerId;
      if (event.pointerType === 'mouse') {
        isMouseHovering = true;
      }
      updatePointerFromEvent(event);

      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        // Ignore if pointer capture is unavailable (e.g. synthetic pointer event).
      }

      const onCard = Math.abs(pointerX) <= 1.15 && Math.abs(pointerY) <= 1.15;
      if (onCard) {
        isCharging = true;
        isDraining = false;
        rawCharge = 0;
        charge = 0;
        hapticTickAccumSec = 0;
      }

      if (!motion.matches) {
        rippleOriginX = pointerX;
        rippleOriginY = pointerY;
        rippleElapsed = 0;
        vibrateAndroid(8);
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!event.isPrimary) return;
      if (event.pointerType === 'mouse') {
        isMouseHovering = true;
      }
      updatePointerFromEvent(event);
    };

    const onPointerUp = (event: PointerEvent) => {
      if (!event.isPrimary) return;
      if (activePointerId !== null && event.pointerId !== activePointerId) return;

      releaseCapture(activePointerId);
      activePointerId = null;
      isPointerDown = false;
      lastInputMs = performance.now();

      if (isCharging) {
        const storedCharge = charge;
        isCharging = false;
        isDraining = false;
        rawCharge = 0;
        charge = 0;
        hapticTickAccumSec = 0;

        if (storedCharge >= BURST_THRESHOLD) {
          burstElapsed = 0;
          burstStrength = storedCharge;
          echo1HapticFired = false;
          echo2HapticFired = false;
          if (!motion.matches) {
            vibrateAndroid(40);
          }
          options?.onBurstRelease?.(storedCharge);
        }
      }

      if (event.pointerType !== 'mouse') {
        isMouseHovering = false;
        pointerTargetHover = 0;
      }
    };

    const onPointerCancel = (event: PointerEvent) => {
      if (!event.isPrimary) return;
      releaseCapture(activePointerId);
      activePointerId = null;
      isPointerDown = false;
      isMouseHovering = false;
      pointerTargetHover = 0;
      startChargeDrain();
    };

    const onPointerLeave = () => {
      // While captured, dragging outside the canvas keeps charging until pointerup.
      if (
        activePointerId !== null &&
        typeof canvas.hasPointerCapture === 'function' &&
        canvas.hasPointerCapture(activePointerId)
      ) {
        return;
      }
      isPointerDown = false;
      isMouseHovering = false;
      pointerTargetHover = 0;
      if (isCharging) {
        startChargeDrain();
      }
    };

    const onLostPointerCapture = () => {
      activePointerId = null;
      if (isCharging) {
        isPointerDown = false;
        startChargeDrain();
      }
    };

    canvas.addEventListener('pointermove', onPointerMove, { passive: true });
    canvas.addEventListener('pointerdown', onPointerDown, { passive: true });
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerCancel);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('lostpointercapture', onLostPointerCapture);

    const unsubscribeResize = output.onResize(() => {
      shader.set({ params: { resolution: output.size } });
    });

    // Visibility & off-screen pausing with dynamic 60fps active / ~30fps idle rate
    let isDocumentVisible = typeof document === 'undefined' ? true : !document.hidden;
    let isCanvasVisible = true;
    let rafId: number | null = null;
    let lastRenderMs: number | undefined;

    const stopLoop = () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
    };

    const tick = (now: number) => {
      rafId = null;
      if (disposed || !isDocumentVisible || !isCanvasVisible) return;

      const reduced = motion.matches;
      const isPointerActive = isPointerDown || (isMouseHovering && pointerTargetHover > 0.001);
      const isChargeOrBurstActive =
        isCharging || isDraining || charge > 0.001 || burstElapsed >= 0;
      const isIdle =
        !reduced &&
        !isPointerActive &&
        !isChargeOrBurstActive &&
        now - lastInputMs >= IDLE_DELAY_MS;

      const isLowPowerIdle =
        !isPointerActive && !isChargeOrBurstActive && rippleElapsed < 0 && (isIdle || reduced);
      const targetFps = isLowPowerIdle ? IDLE_FPS : ACTIVE_FPS;
      const minIntervalMs = 1000 / targetFps;

      if (
        lastRenderMs !== undefined &&
        now - lastRenderMs < minIntervalMs - FRAME_INTERVAL_SLACK_MS
      ) {
        rafId = window.requestAnimationFrame(tick);
        return;
      }

      const dt =
        lastRenderMs === undefined
          ? 1 / ACTIVE_FPS
          : Math.min(Math.max(0, now - lastRenderMs) / 1000, 0.1);
      lastRenderMs = now;

      if (reduced) {
        idleBlend = 0;
        idleGlow = 0;
        rippleElapsed = -1;
      } else {
        idleTime += dt;
        const targetIdleBlend = isIdle ? 1 : 0;
        const idleBlendRate = isIdle ? 3.2 : 10;
        idleBlend += (targetIdleBlend - idleBlend) * (1 - Math.exp(-idleBlendRate * dt));
      }

      // Update hold-to-charge, cancel-drain, integrated shader phases, Android haptics, and release burst
      if (isCharging) {
        lastInputMs = now;
        rawCharge = clamp(rawCharge + dt / CHARGE_DURATION_SEC, 0, 1);
        charge = easeInCharge(rawCharge);
        if (!reduced) {
          chargeTime += dt;
          shimmerTime += dt;
          const stage3Blend = smoothstep(0.7, 1, charge);
          const hbHz = 1.2 + 1.2 * stage3Blend;
          heartbeatPhase += dt * hbHz;
          const rippleHz = 0.85 + 1.95 * smoothstep(0.25, 1, charge);
          ripplePhase += dt * rippleHz;
          if (charge > 0.08) {
            hapticTickAccumSec += dt;
            const hapticHz = 1.15 + 1.25 * charge;
            const tickIntervalSec = 1 / hapticHz;
            if (hapticTickAccumSec >= tickIntervalSec) {
              hapticTickAccumSec = 0;
              vibrateAndroid([10, 70, 10]);
            }
          }
        }
      } else if (isDraining) {
        charge = Math.max(0, charge - dt / CHARGE_DRAIN_SEC);
        rawCharge = charge;
        if (!reduced && charge > 0.001) {
          shimmerTime += dt;
          heartbeatPhase += dt * (1.2 + 1.2 * smoothstep(0.7, 1, charge));
          ripplePhase += dt * (0.85 + 1.95 * smoothstep(0.25, 1, charge));
        }
        if (charge <= 0.0001) {
          charge = 0;
          rawCharge = 0;
          isDraining = false;
        }
      }

      let burstProgress = 0;
      let currentBurstTime = 0;
      if (burstElapsed >= 0) {
        burstElapsed += dt;
        if (!reduced) {
          if (!echo1HapticFired && burstElapsed >= BURST_ECHO1_AT_SEC) {
            echo1HapticFired = true;
            vibrateAndroid(15);
          }
          if (!echo2HapticFired && burstElapsed >= BURST_ECHO2_AT_SEC) {
            echo2HapticFired = true;
            vibrateAndroid(15);
          }
        }
        if (burstElapsed >= BURST_TOTAL_SEC) {
          burstElapsed = -1;
          burstStrength = 0;
          burstProgress = 0;
          currentBurstTime = 0;
          echo1HapticFired = false;
          echo2HapticFired = false;
        } else {
          burstProgress = clamp(burstElapsed / BURST_TOTAL_SEC, 0, 1);
          currentBurstTime = burstElapsed;
        }
      }

      const idleLightX = Math.sin(idleTime * 0.55) * 0.78;
      const idleLightY = Math.sin(idleTime * 0.85 + 0.7) * 0.72;
      const pulse = 0.5 + 0.5 * Math.sin(idleTime * 1.45 - Math.PI / 2);
      const targetIdleGlow = reduced ? 0 : idleBlend * (0.28 + 0.72 * pulse);

      const activeX = pointerX;
      const activeY = pointerY;
      const activeHover = isPointerActive ? pointerTargetHover : 0;

      const desiredHover = Math.max(activeHover, idleBlend * 0.72);
      const desiredTiltX = reduced
        ? 0
        : clamp(activeX, -1, 1) * 0.16 * activeHover * (1 - idleBlend) +
          idleLightX * 0.075 * idleBlend;
      const desiredTiltY = reduced
        ? 0
        : -clamp(activeY, -1, 1) * 0.12 * activeHover * (1 - idleBlend) +
          -idleLightY * 0.055 * idleBlend;

      const blend = reduced ? 1 : 1 - Math.exp(-10 * dt);
      tiltX += (desiredTiltX - tiltX) * blend;
      tiltY += (desiredTiltY - tiltY) * blend;
      hover += (desiredHover - hover) * blend;
      idleGlow += (targetIdleGlow - idleGlow) * blend;

      if (isPointerActive) {
        lightX += (activeX - lightX) * blend;
        lightY += (activeY - lightY) * blend;
      } else if (idleBlend > 0.001) {
        const idleFollow = 1 - Math.exp(-4.5 * dt);
        lightX += (idleLightX - lightX) * idleFollow;
        lightY += (idleLightY - lightY) * idleFollow;
      }

      const currentRippleTime = !reduced && rippleElapsed >= 0 ? rippleElapsed : -1;
      if (!reduced && rippleElapsed >= 0) {
        rippleElapsed += dt;
        if (rippleElapsed >= RIPPLE_DURATION_SEC) {
          rippleElapsed = -1;
        }
      }

      try {
        frame(context, (currentFrame) => {
          shader.set({
            params: {
              tilt: [tiltX, tiltY],
              pointer: [lightX, lightY],
              rippleOrigin: [rippleOriginX, rippleOriginY],
              hover,
              rippleTime: currentRippleTime,
              idleGlow,
              charge,
              burst: burstProgress,
              burstStrength,
              chargeTime,
              reducedMotion: reduced ? 1 : 0,
              heartbeatPhase,
              burstTime: currentBurstTime,
              ripplePhase,
              shimmerTime,
            },
          });
          currentFrame.pass(output, shader);
        });
      } catch {
        stopLoop();
        return;
      }

      if (!disposed && isDocumentVisible && isCanvasVisible) {
        rafId = window.requestAnimationFrame(tick);
      }
    };

    const syncLoop = () => {
      if (disposed || !isDocumentVisible || !isCanvasVisible) {
        stopLoop();
        return;
      }
      if (rafId === null) {
        lastRenderMs = undefined;
        rafId = window.requestAnimationFrame(tick);
      }
    };

    const onVisibilityChange = () => {
      isDocumentVisible = !document.hidden;
      syncLoop();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (!entry) return;
          isCanvasVisible = entry.isIntersecting;
          syncLoop();
        },
        { threshold: 0.01 },
      );
      observer.observe(canvas);
    }

    removeInput = () => {
      stopLoop();
      releaseCapture(activePointerId);
      activePointerId = null;
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('lostpointercapture', onLostPointerCapture);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      observer?.disconnect();
      unsubscribeResize();
    };

    syncLoop();
  })().catch((error: unknown) => {
    if (disposed) return;
    dispose();
    throw error;
  });

  return { ready, dispose };
}
