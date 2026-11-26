import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from '@phosphor-icons/react';
import { FIELDR_MARK_PATH } from './logoMask';
import { createRenderer } from './renderer';

function hasWebGpuSupport(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator && Boolean(navigator.gpu);
}

interface FallbackCardProps {
  onFirstInteraction: () => void;
}

function GraphiteFallbackCard({ onFirstInteraction }: FallbackCardProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [sheen, setSheen] = useState({ x: 50, y: 38, active: false });

  const handlePointer = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!event.isPrimary) return;
      onFirstInteraction();
      const stage = stageRef.current;
      if (!stage) return;
      const rect = stage.getBoundingClientRect();
      const x = Math.max(0, Math.min(100, ((event.clientX - rect.left) / Math.max(1, rect.width)) * 100));
      const y = Math.max(0, Math.min(100, ((event.clientY - rect.top) / Math.max(1, rect.height)) * 100));
      setSheen({ x, y, active: true });
    },
    [onFirstInteraction],
  );

  const handleLeave = useCallback(() => {
    setSheen((prev) => ({ ...prev, active: false }));
  }, []);

  return (
    <div
      ref={stageRef}
      onPointerMove={handlePointer}
      onPointerDown={handlePointer}
      onPointerLeave={handleLeave}
      onPointerCancel={handleLeave}
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
        role="img"
        aria-label="Fieldr graphite holographic card"
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
            fill="rgba(255, 255, 255, 0.04)"
            stroke="rgba(148, 160, 176, 0.55)"
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
  const [hasInteracted, setHasInteracted] = useState(false);

  const handleFirstInteraction = useCallback(() => {
    setHasInteracted(true);
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
          aria-label="Fieldr holographic graphite card with a visible Fieldr F outline; move or drag to reveal its holographic engraving."
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
          Best viewed in a WebGPU-capable browser
        </p>
      ) : (
        <p
          aria-hidden={hasInteracted}
          style={{
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.25rem)',
          }}
          className={`pointer-events-none fixed inset-x-4 z-10 text-center font-mono text-[10px] tracking-[0.2em] text-white/35 transition-opacity duration-500 motion-reduce:transition-none ${
            hasInteracted ? 'opacity-0' : 'opacity-100'
          }`}
        >
          MOVE TO REVEAL
        </p>
      )}
    </main>
  );
}

export default HoloPage;
