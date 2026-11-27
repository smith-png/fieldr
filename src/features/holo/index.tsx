import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from '@phosphor-icons/react';
import { FIELDR_MARK_PATH } from './logoMask';
import { createRenderer } from './renderer';

const FALLBACK_CHARGE_DURATION_MS = 1600;
const FALLBACK_DRAIN_DURATION_MS = 400;
const FALLBACK_BURST_THRESHOLD = 0.15;
const FALLBACK_BURST_DURATION_MS = 900;
const HOLD_HINT_DURATION_MS = 3000;

function hasWebGpuSupport(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator && Boolean(navigator.gpu);
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

interface FallbackCardProps {
  onFirstInteraction: () => void;
}

function GraphiteFallbackCard({ onFirstInteraction }: FallbackCardProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [sheen, setSheen] = useState({ x: 50, y: 38, active: false });
  const [chargeLevel, setChargeLevel] = useState(0);
  const [burstRing, setBurstRing] = useState<{ key: number; strength: number } | null>(null);
  const [burstExpanding, setBurstExpanding] = useState(false);

  const chargeRef = useRef(0);
  const modeRef = useRef<'idle' | 'charging' | 'draining'>('idle');
  const activePointerIdRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastFrameMsRef = useRef<number>(0);
  const burstTimerRef = useRef<number | null>(null);
  const burstRafRef = useRef<number | null>(null);

  const stopChargeLoop = useCallback(() => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const runChargeLoop = useCallback(() => {
    stopChargeLoop();
    lastFrameMsRef.current = performance.now();

    const step = (now: number) => {
      const dtMs = Math.min(Math.max(1, now - lastFrameMsRef.current), 50);
      lastFrameMsRef.current = now;

      if (modeRef.current === 'charging') {
        const nextRaw = Math.min(1, chargeRef.current + dtMs / FALLBACK_CHARGE_DURATION_MS);
        chargeRef.current = nextRaw;
        const eased = nextRaw * (0.45 + 0.55 * nextRaw);
        setChargeLevel(eased);
        if (nextRaw < 1) {
          rafRef.current = window.requestAnimationFrame(step);
        } else {
          rafRef.current = null;
        }
        return;
      }

      if (modeRef.current === 'draining') {
        const next = Math.max(0, chargeRef.current - dtMs / FALLBACK_DRAIN_DURATION_MS);
        chargeRef.current = next;
        setChargeLevel(next);
        if (next > 0.001) {
          rafRef.current = window.requestAnimationFrame(step);
        } else {
          chargeRef.current = 0;
          setChargeLevel(0);
          modeRef.current = 'idle';
          rafRef.current = null;
        }
        return;
      }

      rafRef.current = null;
    };

    rafRef.current = window.requestAnimationFrame(step);
  }, [stopChargeLoop]);

  useEffect(() => {
    return () => {
      stopChargeLoop();
      if (burstTimerRef.current !== null) window.clearTimeout(burstTimerRef.current);
      if (burstRafRef.current !== null) window.cancelAnimationFrame(burstRafRef.current);
    };
  }, [stopChargeLoop]);

  const updateSheen = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((event.clientX - rect.left) / Math.max(1, rect.width)) * 100));
    const y = Math.max(0, Math.min(100, ((event.clientY - rect.top) / Math.max(1, rect.height)) * 100));
    setSheen({ x, y, active: true });
  }, []);

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!event.isPrimary) return;
      onFirstInteraction();
      updateSheen(event);
    },
    [onFirstInteraction, updateSheen],
  );

  const handleCardPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!event.isPrimary) return;
      onFirstInteraction();
      updateSheen(event);

      activePointerIdRef.current = event.pointerId;
      try {
        cardRef.current?.setPointerCapture(event.pointerId);
      } catch {
        // Ignore if pointer capture is unsupported.
      }

      chargeRef.current = 0;
      setChargeLevel(0);
      modeRef.current = 'charging';
      runChargeLoop();
    },
    [onFirstInteraction, runChargeLoop, updateSheen],
  );

  const releaseCardCapture = useCallback((pointerId: number | null) => {
    if (pointerId === null) return;
    const card = cardRef.current;
    if (!card) return;
    try {
      if (typeof card.hasPointerCapture === 'function' && card.hasPointerCapture(pointerId)) {
        card.releasePointerCapture(pointerId);
      }
    } catch {
      // Ignore release errors.
    }
  }, []);

  const handleCardPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!event.isPrimary) return;
      if (activePointerIdRef.current !== null && event.pointerId !== activePointerIdRef.current) {
        return;
      }

      releaseCardCapture(activePointerIdRef.current);
      activePointerIdRef.current = null;

      if (modeRef.current === 'charging') {
        stopChargeLoop();
        const raw = chargeRef.current;
        const storedCharge = raw * (0.45 + 0.55 * raw);
        modeRef.current = 'idle';
        chargeRef.current = 0;
        setChargeLevel(0);

        if (storedCharge >= FALLBACK_BURST_THRESHOLD && !prefersReducedMotion()) {
          if (burstTimerRef.current !== null) window.clearTimeout(burstTimerRef.current);
          if (burstRafRef.current !== null) window.cancelAnimationFrame(burstRafRef.current);
          setBurstExpanding(false);
          setBurstRing({ key: Date.now(), strength: storedCharge });
          burstRafRef.current = window.requestAnimationFrame(() => {
            burstRafRef.current = window.requestAnimationFrame(() => {
              setBurstExpanding(true);
            });
          });
          burstTimerRef.current = window.setTimeout(() => {
            setBurstRing(null);
            setBurstExpanding(false);
          }, FALLBACK_BURST_DURATION_MS + 80);
        }
      }
    },
    [releaseCardCapture, stopChargeLoop],
  );

  const handleCardCancel = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!event.isPrimary) return;
      releaseCardCapture(activePointerIdRef.current);
      activePointerIdRef.current = null;
      if (modeRef.current === 'charging') {
        const raw = chargeRef.current;
        chargeRef.current = raw * (0.45 + 0.55 * raw);
        modeRef.current = 'draining';
        runChargeLoop();
      }
      setSheen((prev) => ({ ...prev, active: false }));
    },
    [releaseCardCapture, runChargeLoop],
  );

  const handleStageLeave = useCallback(() => {
    setSheen((prev) => ({ ...prev, active: false }));
    const card = cardRef.current;
    const pid = activePointerIdRef.current;
    const isCaptured =
      pid !== null &&
      card !== null &&
      typeof card.hasPointerCapture === 'function' &&
      card.hasPointerCapture(pid);

    if (!isCaptured && modeRef.current === 'charging') {
      const raw = chargeRef.current;
      chargeRef.current = raw * (0.45 + 0.55 * raw);
      modeRef.current = 'draining';
      runChargeLoop();
    }
  }, [runChargeLoop]);

  const outlineAlpha = 0.55 + chargeLevel * 0.42;

  return (
    <div
      ref={stageRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handleStageLeave}
      className="relative flex h-full w-full items-center justify-center touch-none select-none px-6"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.03) 0%, rgba(9,10,12,0) 62%)',
        }}
      />
      <div
        ref={cardRef}
        role="img"
        aria-label="Fieldr graphite holographic card"
        onPointerDown={handleCardPointerDown}
        onPointerUp={handleCardPointerUp}
        onPointerCancel={handleCardCancel}
        className="relative w-full max-w-[330px] sm:max-w-[360px] aspect-[128/182] rounded-[20px] border border-white/15 bg-gradient-to-b from-[#13161b] via-[#101216] to-[#0d0f13] shadow-[0_28px_72px_rgba(0,0,0,0.78)] overflow-hidden flex flex-col items-center justify-center"
      >
        {/* Subtle pointer-following gradient sheen */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 transition-opacity duration-300 motion-reduce:transition-none"
          style={{
            opacity: sheen.active ? 1 : 0.25,
            background: `radial-gradient(240px circle at ${sheen.x}% ${sheen.y}%, rgba(190, 212, 232, 0.22), rgba(140, 178, 210, 0.08) 38%, transparent 70%)`,
          }}
        />

        {/* Hold-to-charge radial pearlescent glow filling around the F */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            opacity: chargeLevel * 0.9,
            background: `radial-gradient(circle at 50% 47%, rgba(226, 234, 244, ${
              (0.14 + chargeLevel * 0.22).toFixed(3)
            }) 0%, rgba(192, 206, 224, ${(0.06 + chargeLevel * 0.14).toFixed(3)}) ${
              (22 + chargeLevel * 24).toFixed(1)
            }%, transparent ${(48 + chargeLevel * 28).toFixed(1)}%)`,
          }}
        />

        {/* Release burst expanding thin ring (skipped under prefers-reduced-motion) */}
        {burstRing && (
          <div
            key={burstRing.key}
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-[47%] rounded-full border border-white/75"
            style={{
              width: '120px',
              height: '120px',
              boxShadow: '0 0 18px rgba(214, 224, 238, 0.35), inset 0 0 12px rgba(214, 224, 238, 0.2)',
              transform: `translate(-50%, -50%) scale(${
                burstExpanding ? (2.2 + burstRing.strength * 1.4).toFixed(2) : '0.35'
              })`,
              opacity: burstExpanding ? 0 : Math.min(0.95, 0.4 + burstRing.strength * 0.55),
              transition: `transform ${FALLBACK_BURST_DURATION_MS}ms cubic-bezier(0.22, 1, 0.36, 1), opacity ${FALLBACK_BURST_DURATION_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`,
            }}
          />
        )}

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-[1px] rounded-[19px] border border-white/[0.06]"
        />

        {/* Centred static Fieldr F outline + matte graphite fill */}
        <svg
          viewBox="17 14 31 36"
          fill="none"
          className="relative z-10 w-[44%] h-auto -translate-y-2"
          aria-hidden="true"
        >
          <path
            d={FIELDR_MARK_PATH}
            fill={`rgba(255, 255, 255, ${(0.04 + chargeLevel * 0.08).toFixed(3)})`}
            stroke={`rgba(196, 208, 224, ${outlineAlpha.toFixed(3)})`}
            strokeWidth="0.6"
            strokeLinejoin="miter"
          />
        </svg>

        {/* Subtle FIELDR / AUCTIONS bottom caption */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-7 flex flex-col items-center gap-1 text-center"
        >
          <span className="font-syne font-extrabold syne-display text-[11px] tracking-[0.18em] text-white/55 leading-none">
            FIELDR
          </span>
          <span className="font-sans font-normal text-[7px] tracking-[0.3em] text-white/35 uppercase leading-none">
            AUCTIONS
          </span>
        </div>
      </div>
    </div>
  );
}

export function HoloPage() {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fallback, setFallback] = useState<boolean>(() => !hasWebGpuSupport());
  const [hintPhase, setHintPhase] = useState<'move' | 'charge' | 'hidden'>('move');
  const hintShownRef = useRef(false);
  const hintTimerRef = useRef<number | null>(null);

  const handleFirstInteraction = useCallback(() => {
    if (hintShownRef.current) return;
    hintShownRef.current = true;
    setHintPhase('charge');
    hintTimerRef.current = window.setTimeout(() => {
      hintTimerRef.current = null;
      setHintPhase('hidden');
    }, HOLD_HINT_DURATION_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (hintTimerRef.current !== null) {
        window.clearTimeout(hintTimerRef.current);
        hintTimerRef.current = null;
      }
    };
  }, []);

  const handleReturnHome = useCallback(() => {
    navigate('/');
  }, [navigate]);

  // Inject <meta name="robots" content="noindex"> while mounted and restore on unmount.
  useEffect(() => {
    const existing = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (existing) {
      const previousContent = existing.getAttribute('content');
      existing.setAttribute('content', 'noindex');
      return () => {
        if (previousContent === null) {
          existing.removeAttribute('content');
        } else {
          existing.setAttribute('content', previousContent);
        }
      };
    }

    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex';
    document.head.appendChild(meta);
    return () => {
      meta.remove();
    };
  }, []);

  // Escape key returns home.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleReturnHome();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleReturnHome]);

  // Initialize and cleanly dispose the WebGPU holographic card renderer.
  useEffect(() => {
    if (fallback) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let mounted = true;
    const renderer = createRenderer(canvas, {
      onFirstInteraction: handleFirstInteraction,
    });
    void renderer.ready.catch((cause: unknown) => {
      if (!mounted) return;
      console.error('Holographic card initialization failed:', cause);
      setFallback(true);
    });
    return () => {
      mounted = false;
      renderer.dispose();
    };
  }, [fallback, handleFirstInteraction]);

  return (
    <main className="fixed inset-0 h-dvh w-dvw overflow-hidden bg-[#090a0c] select-none">
      {fallback ? (
        <GraphiteFallbackCard onFirstInteraction={handleFirstInteraction} />
      ) : (
        <canvas
          ref={canvasRef}
          className="block h-full w-full touch-none"
          aria-label="Fieldr holographic graphite card with a visible Fieldr F outline; move or hold to charge and release."
        />
      )}

      <button
        type="button"
        onClick={handleReturnHome}
        aria-label="Return home"
        style={{
          top: 'calc(env(safe-area-inset-top, 0px) + 1rem)',
          left: 'calc(env(safe-area-inset-left, 0px) + 1rem)',
        }}
        className="fixed z-20 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/55 backdrop-blur-sm transition-colors hover:border-white/25 hover:bg-white/[0.08] hover:text-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
      >
        <ArrowLeft size={18} weight="bold" aria-hidden="true" />
      </button>

      {fallback ? (
        <p
          style={{
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.25rem)',
          }}
          className="pointer-events-none fixed inset-x-4 z-10 text-center font-mono text-[10px] tracking-[0.2em] text-white/40 uppercase"
        >
          {hintPhase === 'charge' ? 'HOLD TO CHARGE' : 'Best viewed in a WebGPU-capable browser'}
        </p>
      ) : (
        <p
          aria-hidden={hintPhase === 'hidden'}
          style={{
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.25rem)',
          }}
          className={`pointer-events-none fixed inset-x-4 z-10 text-center font-mono text-[10px] tracking-[0.2em] text-white/35 transition-opacity duration-500 motion-reduce:transition-none ${
            hintPhase === 'hidden' ? 'opacity-0' : 'opacity-100'
          }`}
        >
          {hintPhase === 'charge' ? 'HOLD TO CHARGE' : 'MOVE TO REVEAL'}
        </p>
      )}
    </main>
  );
}

export default HoloPage;
