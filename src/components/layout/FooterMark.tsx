import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  getPrimaryIconSnapshot,
  subscribePrimaryIcon
} from '../../lib/data/site';
import { useTheme } from '../../lib/theme';
import type { PrimaryIconVariant } from '../../types';

const ICON_ORDER: readonly PrimaryIconVariant[] = ['classic', 'floodlights', 'flames'];

function getAlternateIcons(
  primary: PrimaryIconVariant
): [PrimaryIconVariant, PrimaryIconVariant] {
  const idx = ICON_ORDER.indexOf(primary);
  return [
    ICON_ORDER[(idx + 1) % ICON_ORDER.length],
    ICON_ORDER[(idx + 2) % ICON_ORDER.length],
  ];
}

const css = `.fmk-egg{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none}
.fmk{position:relative;width:var(--s);height:var(--s);border-radius:22%;overflow:hidden;background:#06241a;flex:none;display:inline-block;isolation:isolate;user-select:none;-webkit-tap-highlight-color:transparent;--b0:rgba(150,245,205,.05);--b1:rgba(200,255,230,.5);--g0:#fff;--g1:#b9f5d6;--f0:rgba(225,255,240,.95);--f1:rgba(120,235,185,.35)}
.fmk-bl{position:absolute;inset:-40%;animation:fmk-sp 14s linear infinite}
.fmk-r{animation-duration:22s;animation-direction:reverse}
.fmk-bl i{position:absolute;border-radius:50%;filter:blur(calc(var(--s)*.07))}
.fmk-bl:not(.fmk-r) i:nth-child(1){width:56%;height:46%;left:8%;top:20%;background:#047554}
.fmk-bl:not(.fmk-r) i:nth-child(2){width:42%;height:58%;right:10%;bottom:8%;background:#395F3D}
.fmk-bl:not(.fmk-r) i:nth-child(3){width:30%;height:22%;left:44%;top:56%;background:#CBD1CB;opacity:.75}
.fmk-r i:nth-child(1){width:34%;height:70%;left:22%;top:6%;background:#0a9a6c;opacity:.7;border-radius:40%}
.fmk-r i:nth-child(2){width:50%;height:26%;right:6%;top:46%;background:#021a12;opacity:.85}
.fmk::after{content:"";position:absolute;inset:0;border-radius:22%;box-shadow:inset 0 0 calc(var(--s)*.12) calc(var(--s)*.02) rgba(4,24,17,.8);z-index:3}
.fmk-f{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:'Syne',sans-serif;font-weight:800;font-size:calc(var(--s)*.6);line-height:1;color:#fff;z-index:4}
@keyframes fmk-sp{to{transform:rotate(360deg)}}

/* light theme classic mark */
.th-l{background:#dff1e7;--b0:rgba(255,255,255,.06);--b1:rgba(255,255,255,.72);--g0:#06241a;--g1:#2f8a68;--f0:rgba(255,255,255,.95);--f1:rgba(190,245,220,.5)}
.th-l .fmk-bl:not(.fmk-r) i:nth-child(1){background:#8fd6b2}
.th-l .fmk-bl:not(.fmk-r) i:nth-child(2){background:#5fbf95}
.th-l .fmk-bl:not(.fmk-r) i:nth-child(3){background:#fff;opacity:.9}
.th-l .fmk-r i:nth-child(1){background:#a8e2c6;opacity:.8}
.th-l .fmk-r i:nth-child(2){background:#3fa97f;opacity:.45}
.th-l::after{box-shadow:inset 0 0 calc(var(--s)*.1) calc(var(--s)*.015) rgba(30,90,64,.28)}
.th-l .fmk-f{color:#06241a}

/* easter egg layers */
.fmk-cl{position:absolute;inset:0;z-index:1}
.fmk-lt{position:absolute;inset:0;z-index:2;opacity:0;background:radial-gradient(120% 90% at 50% 105%,#0a3d2a,#05211a 55%,#020f09);isolation:isolate}
.th-l .fmk-lt{background:linear-gradient(180deg,#7cdcb3 0%,#3cb68b 55%,#1f9a73 100%)}
.fmk-bm{position:absolute;top:0;width:220%;height:220%;mix-blend-mode:screen;filter:blur(calc(var(--s)*.03));will-change:transform}
.fmk-bm.l{left:0;transform-origin:0 0;background:conic-gradient(from 0deg at 0 0,transparent 112deg,var(--b0) 121deg,var(--b1) 135deg,var(--b0) 149deg,transparent 158deg);animation:fmk-swl 3s ease-in-out infinite alternate}
.fmk-bm.r{right:0;transform-origin:100% 0;background:conic-gradient(from 0deg at 100% 0,transparent 202deg,var(--b0) 211deg,var(--b1) 225deg,var(--b0) 239deg,transparent 248deg);animation:fmk-swr 3.6s ease-in-out infinite alternate}
.fmk:not(.is-floodlights):not(.in-floodlights):not(.out-floodlights) .fmk-bm{animation-play-state:paused}
@keyframes fmk-swl{from{transform:rotate(-12deg)}to{transform:rotate(16deg)}}
@keyframes fmk-swr{from{transform:rotate(12deg)}to{transform:rotate(-16deg)}}
.fmk-sh{z-index:5;opacity:0;background:linear-gradient(105deg,var(--g0) 38%,var(--g1) 50%,var(--g0) 62%) 0 0/260% 100%;-webkit-background-clip:text;background-clip:text;color:transparent}
.fmk-fl{position:absolute;inset:0;z-index:3;opacity:0;pointer-events:none}
.in-floodlights .fmk-fl{background:radial-gradient(70% 70% at 50% 40%,var(--f0),var(--f1) 55%,transparent 80%)}
.in-flames .fmk-fl{background:radial-gradient(85% 70% at 50% 100%,var(--f0),var(--f1) 55%,transparent 78%)}
.fmk-fire{position:absolute;inset:0;z-index:2;-webkit-mask-image:linear-gradient(to bottom,transparent 0%,transparent 33%,#000 66%,#000 100%);mask-image:linear-gradient(to bottom,transparent 0%,transparent 33%,#000 66%,#000 100%);-webkit-mask-size:100% 300%;mask-size:100% 300%;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;-webkit-mask-position:0 0%;mask-position:0 0%}
.fmk-fire img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
.out-flames.in-floodlights .fmk-fire{z-index:1}

/* resting states */
.is-classic .fmk-cl{opacity:1}
.is-floodlights .fmk-lt{opacity:1}
.is-floodlights .fmk-sh{opacity:1;animation:fmk-sheen 4s ease-in-out infinite alternate}
.is-flames .fmk-fire{-webkit-mask-position:0 100%;mask-position:0 100%}

/* transitions: surge */
.lit{animation:fmk-surgeA 1.9s ease-in-out forwards}
.th-l.lit{animation:fmk-surgeL 1.9s ease-in-out forwards}
.unlit{animation:fmk-surgeB 1.3s ease-in-out forwards}

/* transitions: outgoing */
.out-classic .fmk-cl{animation:fmk-clOut 1.2s ease-in .3s forwards}
.out-floodlights .fmk-lt{opacity:1;animation:fmk-out .9s linear forwards}
.out-floodlights .fmk-sh{opacity:1;animation:fmk-shOut .4s ease-in forwards}
.out-flames .fmk-fire{-webkit-mask-position:0 100%;mask-position:0 100%;animation:fmk-fall 1s cubic-bezier(.5,0,.8,.4) forwards}

/* transitions: incoming */
.in-classic .fmk-cl{opacity:0;animation:fmk-clIn 1s ease-out .55s forwards}
.in-floodlights .fmk-lt{animation:fmk-ignite 1.4s linear .35s forwards}
.in-floodlights .fmk-fl{animation:fmk-flash .6s ease-out .3s}
.in-floodlights .fmk-sh{animation:fmk-shIn .6s ease-out .9s forwards,fmk-sheen 4s ease-in-out 1.5s infinite alternate}
.in-flames .fmk-fire{animation:fmk-rise 1.3s cubic-bezier(.3,.6,.3,1) .3s forwards}
.in-flames .fmk-fl{animation:fmk-flash .8s ease-out .25s}

@keyframes fmk-clOut{from{opacity:1;filter:blur(0);transform:scale(1)}to{opacity:0;filter:blur(calc(var(--s)*.06));transform:scale(1.2)}}
@keyframes fmk-clIn{from{opacity:0;filter:blur(calc(var(--s)*.06));transform:scale(1.2)}to{opacity:1;filter:blur(0);transform:scale(1)}}
@keyframes fmk-ignite{0%{opacity:0}6%{opacity:.75}11%{opacity:.05}19%{opacity:.9}25%{opacity:.15}34%{opacity:1}40%{opacity:.55}50%,100%{opacity:1}}
@keyframes fmk-out{0%{opacity:1}12%{opacity:.3}22%{opacity:.9}36%{opacity:.15}52%{opacity:.5}70%,100%{opacity:0}}
@keyframes fmk-flash{0%{opacity:0}30%{opacity:.85}100%{opacity:0}}
@keyframes fmk-rise{from{-webkit-mask-position:0 0%;mask-position:0 0%}to{-webkit-mask-position:0 100%;mask-position:0 100%}}
@keyframes fmk-fall{from{-webkit-mask-position:0 100%;mask-position:0 100%}to{-webkit-mask-position:0 0%;mask-position:0 0%}}
@keyframes fmk-surgeA{0%{transform:scale(1);filter:brightness(1)}12%{transform:scale(.95);filter:brightness(.7)}26%{transform:scale(1.05);filter:brightness(1.4)}50%{transform:scale(1);filter:brightness(1.1)}100%{transform:scale(1);filter:brightness(1)}}
@keyframes fmk-surgeL{0%{transform:scale(1);filter:brightness(1)}12%{transform:scale(.95);filter:brightness(.82)}30%{transform:scale(1.04);filter:brightness(1.1)}55%{transform:scale(1);filter:brightness(1.03)}100%{transform:scale(1);filter:brightness(1)}}
@keyframes fmk-surgeB{0%{transform:scale(1);filter:brightness(1)}20%{transform:scale(.97);filter:brightness(.85)}60%{transform:scale(1);filter:brightness(.97)}100%{transform:scale(1);filter:brightness(1)}}
@keyframes fmk-ffin{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:scale(1)}}
@keyframes fmk-ffout{from{opacity:1}to{opacity:0}}
.fmk-ff-in{animation:fmk-ffin .4s ease-out both}
.fmk-ff-out{animation:fmk-ffout .4s ease-out both}
@keyframes fmk-shIn{to{opacity:1}}
@keyframes fmk-shOut{from{opacity:1}to{opacity:0}}
@keyframes fmk-sheen{from{background-position:100% 0}to{background-position:0 0}}

@media (prefers-reduced-motion:reduce){
 .fmk,.fmk *{animation:none!important;transition:none!important}
 .out-classic .fmk-cl,.out-floodlights .fmk-lt,.out-floodlights .fmk-sh{opacity:0}
 .out-flames .fmk-fire{-webkit-mask-position:0 0%;mask-position:0 0%}
 .in-classic .fmk-cl,.is-classic .fmk-cl{opacity:1}
 .in-floodlights .fmk-lt,.is-floodlights .fmk-lt,.in-floodlights .fmk-sh,.is-floodlights .fmk-sh{opacity:1}
 .in-flames .fmk-fire,.is-flames .fmk-fire{-webkit-mask-position:0 100%;mask-position:0 100%}
}`;

type EggPhase = '' | 'lit' | 'unlit';

const noopSubscribe = () => () => {};

const HOLD_MS = 800;
const HOLD_MOVE_TOLERANCE_PX = 10;

export type FlameColor = 'green' | 'red' | 'orange' | 'blue';

function getFlameAssetUrl(
  isLight: boolean,
  reducedMotion: boolean,
  color: FlameColor = 'green'
): string {
  if (reducedMotion) {
    return isLight
      ? '/images/fieldr-flame-still-light.png'
      : '/images/fieldr-flame-still-dark.png';
  }
  const base = color === 'green' ? 'fieldr-flame-loop' : `fieldr-flame-loop-${color}`;
  return `/images/${base}${isLight ? '-light' : ''}.webp`;
}

export default function FooterMark({
  size = 44,
  previewVariant,
  eggEnabled = true,
  flameColor = 'green',
  onFlameTap,
}: {
  size?: number;
  previewVariant?: PrimaryIconVariant;
  eggEnabled?: boolean;
  flameColor?: FlameColor;
  /** Single tap while the flame is the resting primary icon. Ignored otherwise. */
  onFlameTap?: () => void;
}) {
  const { resolvedTheme } = useTheme();
  const storedPrimary = useSyncExternalStore(
    previewVariant ? noopSubscribe : subscribePrimaryIcon,
    previewVariant ? () => previewVariant : getPrimaryIconSnapshot,
    previewVariant ? () => previewVariant : getPrimaryIconSnapshot
  );
  const primary: PrimaryIconVariant = previewVariant ?? storedPrimary;
  const isPreview = Boolean(previewVariant);
  const interactive = eggEnabled && !isPreview;

  const [activeTheme, setActiveTheme] = useState<'light' | 'dark'>(() => {
    if (typeof document !== 'undefined') {
      const rootAttr = document.documentElement.getAttribute('data-theme');
      if (rootAttr === 'light' || rootAttr === 'dark') return rootAttr;
    }
    return resolvedTheme;
  });

  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  );

  const [displayColor, setDisplayColor] = useState<FlameColor>(flameColor);
  const [fadeFromSrc, setFadeFromSrc] = useState<string | null>(null);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [phase, setPhase] = useState<EggPhase>('');
  const [fromVariant, setFromVariant] = useState<PrimaryIconVariant | null>(null);
  const [toVariant, setToVariant] = useState<PrimaryIconVariant | null>(null);

  const rootRef = useRef<HTMLSpanElement | null>(null);
  const activationCountRef = useRef(0);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdStartRef = useRef<{ x: number; y: number } | null>(null);
  const holdFiredRef = useRef(false);
  const lockedRef = useRef(false);
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preloadedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setPrefersReducedMotion(mq.matches);
    onChange();
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    }
    mq.addListener(onChange);
    return () => mq.removeListener(onChange);
  }, []);

  useEffect(() => {
    const syncTheme = () => {
      const scoped = rootRef.current?.closest('[data-theme]')?.getAttribute('data-theme');
      if (scoped === 'light' || scoped === 'dark') {
        setActiveTheme(scoped);
        return;
      }
      const rootAttr = document.documentElement.getAttribute('data-theme');
      if (rootAttr === 'light' || rootAttr === 'dark') {
        setActiveTheme(rootAttr);
        return;
      }
      setActiveTheme(resolvedTheme);
    };

    syncTheme();

    if (typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    const scopedEl = rootRef.current?.closest('[data-theme]');
    if (scopedEl && scopedEl !== document.documentElement) {
      observer.observe(scopedEl, {
        attributes: true,
        attributeFilter: ['data-theme'],
      });
    }
    return () => observer.disconnect();
  }, [resolvedTheme]);

  // Reset easter egg state cleanly if the configured primary icon changes
  useEffect(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    holdStartRef.current = null;
    holdFiredRef.current = false;
    if (lockTimerRef.current) {
      clearTimeout(lockTimerRef.current);
      lockTimerRef.current = null;
    }
    lockedRef.current = false;
    activationCountRef.current = 0;
    setPhase('');
    setFromVariant(null);
    setToVariant(null);
  }, [primary]);

  useEffect(() => {
    return () => {
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
    };
  }, []);

  const light = activeTheme === 'light';

  const flameVisibleNow =
    phase !== '' && fromVariant !== null && toVariant !== null
      ? fromVariant === 'flames' || toVariant === 'flames'
      : primary === 'flames';

  // Crossfade between flame colours. The new colour's file is loaded only when
  // it is chosen, and the old one fades out once the new one is ready.
  useEffect(() => {
    if (flameColor === displayColor) return;
    if (!flameVisibleNow || prefersReducedMotion) {
      setDisplayColor(flameColor);
      return;
    }
    let cancelled = false;
    const oldSrc = getFlameAssetUrl(light, false, displayColor);
    const newSrc = getFlameAssetUrl(light, false, flameColor);
    const swap = () => {
      if (cancelled) return;
      setFadeFromSrc(oldSrc);
      setDisplayColor(flameColor);
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = setTimeout(() => {
        setFadeFromSrc(null);
        fadeTimerRef.current = null;
      }, 450);
    };
    const img = new Image();
    img.onload = swap;
    img.onerror = swap;
    img.src = newSrc;
    return () => {
      cancelled = true;
    };
  }, [flameColor, displayColor, flameVisibleNow, prefersReducedMotion, light]);

  useEffect(() => {
    return () => {
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    };
  }, []);

  const preloadFlame = (isLight: boolean) => {
    const url = getFlameAssetUrl(isLight, prefersReducedMotion);
    if (preloadedRef.current.has(url)) return;
    preloadedRef.current.add(url);
    const img = new Image();
    img.src = url;
  };

  const activate = () => {
    if (!interactive || lockedRef.current) return;

    const alternates = getAlternateIcons(primary);
    const nextAlt = alternates[activationCountRef.current % alternates.length];

    const turningOn = phase !== 'lit';
    const el = rootRef.current;

    if (turningOn) {
      lockedRef.current = true;
      if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
      lockTimerRef.current = setTimeout(() => {
        lockedRef.current = false;
        lockTimerRef.current = null;
      }, 2000);

      if (el) {
        el.classList.remove('lit', 'unlit');
        void el.offsetWidth;
      }

      setFromVariant(primary);
      setToVariant(nextAlt);
      setPhase('lit');
    } else {
      const currentAlt = toVariant ?? nextAlt;
      lockedRef.current = true;
      if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
      lockTimerRef.current = setTimeout(() => {
        lockedRef.current = false;
        lockTimerRef.current = null;
        activationCountRef.current += 1;
        setPhase('');
        setFromVariant(null);
        setToVariant(null);
      }, 1600);

      if (el) {
        el.classList.remove('lit', 'unlit');
        void el.offsetWidth;
      }

      setFromVariant(currentAlt);
      setToVariant(primary);
      setPhase('unlit');
    }
  };

  const cancelHold = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    holdStartRef.current = null;
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLSpanElement>) => {
    if (!interactive || lockedRef.current) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    cancelHold();
    holdFiredRef.current = false;
    holdStartRef.current = { x: e.clientX, y: e.clientY };

    const alternates = getAlternateIcons(primary);
    const nextAlt = alternates[activationCountRef.current % alternates.length];
    if (phase !== 'lit' && nextAlt === 'flames') {
      preloadFlame(light);
    }

    holdTimerRef.current = setTimeout(() => {
      holdTimerRef.current = null;
      holdStartRef.current = null;
      holdFiredRef.current = true;
      activate();
    }, HOLD_MS);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLSpanElement>) => {
    const start = holdStartRef.current;
    if (!start || !holdTimerRef.current) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (dx * dx + dy * dy > HOLD_MOVE_TOLERANCE_PX * HOLD_MOVE_TOLERANCE_PX) {
      cancelHold();
    }
  };

  const onClickCapture = (e: ReactMouseEvent<HTMLSpanElement>) => {
    if (holdFiredRef.current) {
      holdFiredRef.current = false;
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const onContextMenu = (e: ReactMouseEvent<HTMLSpanElement>) => {
    e.preventDefault();
  };

  const onClick = () => {
    if (!onFlameTap) return;
    // Active only while the flame is the primary icon and sitting at rest
    if (primary !== 'flames' || phase !== '' || prefersReducedMotion) return;
    onFlameTap();
  };

  const isTransitioning = phase !== '' && fromVariant !== null && toVariant !== null;
  const showClassic = isTransitioning
    ? fromVariant === 'classic' || toVariant === 'classic'
    : primary === 'classic';
  const showFlood = isTransitioning
    ? fromVariant === 'floodlights' || toVariant === 'floodlights'
    : primary === 'floodlights';
  const showFlame = isTransitioning
    ? fromVariant === 'flames' || toVariant === 'flames'
    : primary === 'flames';
  const showFlash =
    isTransitioning && (toVariant === 'floodlights' || toVariant === 'flames');

  const stateClass = isTransitioning
    ? `${phase} out-${fromVariant} in-${toVariant}`
    : `is-${primary}`;

  const flameSrc = showFlame
    ? getFlameAssetUrl(light, prefersReducedMotion, displayColor)
    : '';

  return (
    <span
      ref={rootRef}
      className={`fmk th-${light ? 'l' : 'd'} ${stateClass}${interactive ? ' fmk-egg' : ''}`}
      style={{ '--s': size + 'px' } as CSSProperties}
      aria-hidden="true"
      {...(interactive
        ? {
            onPointerDown,
            onPointerMove,
            onPointerUp: cancelHold,
            onPointerCancel: cancelHold,
            onPointerLeave: cancelHold,
            onClickCapture,
            onClick,
            onContextMenu,
          }
        : {})}
    >
      <style>{css}</style>
      {showClassic && (
        <span className="fmk-cl">
          <span className="fmk-bl"><i /><i /><i /></span>
          <span className="fmk-bl fmk-r"><i /><i /></span>
        </span>
      )}
      {showFlood && (
        <span className="fmk-lt">
          <i className="fmk-bm l" />
          <i className="fmk-bm r" />
        </span>
      )}
      {showFlame && (
        <span className="fmk-fire">
          {fadeFromSrc && (
            <img
              key={`out-${fadeFromSrc}`}
              className="fmk-ff-out"
              alt=""
              src={fadeFromSrc}
              decoding="async"
            />
          )}
          <img
            key={flameSrc}
            className={fadeFromSrc ? 'fmk-ff-in' : undefined}
            alt=""
            src={flameSrc}
            decoding="async"
          />
        </span>
      )}
      {showFlash && <span className="fmk-fl" />}
      <span className="fmk-f">F</span>
      {showFlood && <span className="fmk-f fmk-sh" aria-hidden="true">F</span>}
    </span>
  );
}
