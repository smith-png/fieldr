import { useEffect, useRef, useState, type CSSProperties } from 'react';

const css = `
.fmk{position:relative;width:var(--s);height:var(--s);border-radius:22%;overflow:hidden;background:#06241a;flex:none;display:inline-block;isolation:isolate;user-select:none;-webkit-tap-highlight-color:transparent}
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
.fmk-cl{position:absolute;inset:0;z-index:1}
.fmk-lt{position:absolute;inset:0;z-index:2;opacity:0;background:radial-gradient(120% 90% at 50% 105%,#0a3d2a,#05211a 55%,#020f09);isolation:isolate}
.fmk-bm{position:absolute;top:0;width:220%;height:220%;mix-blend-mode:screen;filter:blur(calc(var(--s)*.03))}
.fmk-bm.l{left:0;transform-origin:0 0;background:conic-gradient(from 0deg at 0 0,transparent 112deg,rgba(150,245,205,.05) 121deg,rgba(200,255,230,.5) 135deg,rgba(150,245,205,.05) 149deg,transparent 158deg);animation:fmk-swl 3s ease-in-out infinite alternate}
.fmk-bm.r{right:0;transform-origin:100% 0;background:conic-gradient(from 0deg at 100% 0,transparent 202deg,rgba(150,245,205,.05) 211deg,rgba(200,255,230,.5) 225deg,rgba(150,245,205,.05) 239deg,transparent 248deg);animation:fmk-swr 3.6s ease-in-out infinite alternate}
.fmk:not(.lit) .fmk-bm{animation-play-state:paused}
@keyframes fmk-swl{from{transform:rotate(-12deg)}to{transform:rotate(16deg)}}
@keyframes fmk-swr{from{transform:rotate(12deg)}to{transform:rotate(-16deg)}}
.fmk-fl{position:absolute;inset:0;z-index:3;opacity:0;pointer-events:none;background:radial-gradient(70% 70% at 50% 40%,rgba(225,255,240,.95),rgba(120,235,185,.35) 55%,transparent 80%)}
.fmk-sh{z-index:5;opacity:0;background:linear-gradient(105deg,#fff 38%,#b9f5d6 50%,#fff 62%) 0 0/260% 100%;-webkit-background-clip:text;background-clip:text;color:transparent}
.fmk.lit{animation:fmk-surgeA 1.9s ease-in-out forwards}
.lit .fmk-cl{animation:fmk-clOut 1.2s ease-in .3s forwards}
.lit .fmk-lt{animation:fmk-ignite 1.4s linear .35s forwards}
.lit .fmk-fl{animation:fmk-flash .6s ease-out .3s}
.lit .fmk-sh{animation:fmk-shIn .6s ease-out .9s forwards,fmk-sheen 4s ease-in-out 1.5s infinite alternate}
.fmk.unlit{animation:fmk-surgeB 1.3s ease-in-out forwards}
.unlit .fmk-lt{animation:fmk-out .9s linear forwards}
.unlit .fmk-cl{animation:fmk-clIn 1s ease-out .5s forwards}
.unlit .fmk-sh{animation:fmk-shOut .4s ease-in forwards}
@keyframes fmk-clOut{from{opacity:1;filter:blur(0);transform:scale(1)}to{opacity:0;filter:blur(calc(var(--s)*.06));transform:scale(1.2)}}
@keyframes fmk-clIn{from{opacity:0;filter:blur(calc(var(--s)*.06));transform:scale(1.2)}to{opacity:1;filter:blur(0);transform:scale(1)}}
@keyframes fmk-ignite{0%{opacity:0}6%{opacity:.75}11%{opacity:.05}19%{opacity:.9}25%{opacity:.15}34%{opacity:1}40%{opacity:.55}50%,100%{opacity:1}}
@keyframes fmk-out{0%{opacity:1}12%{opacity:.3}22%{opacity:.9}36%{opacity:.15}52%{opacity:.5}70%,100%{opacity:0}}
@keyframes fmk-flash{0%{opacity:0}25%{opacity:.85}100%{opacity:0}}
@keyframes fmk-surgeA{0%{transform:scale(1);filter:brightness(1)}12%{transform:scale(.95);filter:brightness(.7)}26%{transform:scale(1.05);filter:brightness(1.45)}50%{transform:scale(1);filter:brightness(1.1)}100%{transform:scale(1);filter:brightness(1)}}
@keyframes fmk-surgeB{0%{transform:scale(1);filter:brightness(1)}20%{transform:scale(.97);filter:brightness(.8)}60%{transform:scale(1);filter:brightness(.95)}100%{transform:scale(1);filter:brightness(1)}}
@keyframes fmk-shIn{to{opacity:1}}
@keyframes fmk-shOut{from{opacity:1}to{opacity:0}}
@keyframes fmk-sheen{from{background-position:100% 0}to{background-position:0 0}}
@media (prefers-reduced-motion:reduce){.fmk-bl,.fmk-bm,.fmk.lit,.fmk.unlit,.lit .fmk-cl,.lit .fmk-lt,.lit .fmk-fl,.lit .fmk-sh,.unlit .fmk-cl,.unlit .fmk-lt,.unlit .fmk-sh{animation:none}.lit .fmk-cl{opacity:0}.lit .fmk-lt,.lit .fmk-sh{opacity:1}.unlit .fmk-cl{opacity:1}.unlit .fmk-lt,.unlit .fmk-sh{opacity:0}}
`;

type MarkMode = 'idle' | 'lit' | 'unlit';

export default function FooterMark({ size = 44 }: { size?: number }) {
  const [mode, setMode] = useState<MarkMode>('idle');
  const [armed, setArmed] = useState(false);

  const rootRef = useRef<HTMLSpanElement | null>(null);
  const tapsRef = useRef(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lockedRef = useRef(false);
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
      if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
    };
  }, []);

  const handleTap = () => {
    if (lockedRef.current) return;

    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    tapsRef.current += 1;

    if (tapsRef.current >= 5) {
      tapsRef.current = 0;
      tapTimerRef.current = null;

      const nextMode: MarkMode = mode === 'lit' ? 'unlit' : 'lit';
      const lockMs = nextMode === 'lit' ? 2000 : 1600;

      lockedRef.current = true;
      if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
      lockTimerRef.current = setTimeout(() => {
        lockedRef.current = false;
        lockTimerRef.current = null;
      }, lockMs);

      const el = rootRef.current;
      if (el) {
        el.classList.remove('lit', 'unlit');
        void el.offsetWidth;
      }

      if (!armed) setArmed(true);
      setMode(nextMode);
      return;
    }

    tapTimerRef.current = setTimeout(() => {
      tapsRef.current = 0;
      tapTimerRef.current = null;
    }, 1500);
  };

  return (
    <span
      ref={rootRef}
      className={mode === 'idle' ? 'fmk' : `fmk ${mode}`}
      style={{ '--s': `${size}px` } as CSSProperties}
      aria-hidden="true"
      onClick={handleTap}
    >
      <style>{css}</style>
      <span className="fmk-cl">
        <span className="fmk-bl"><i /><i /><i /></span>
        <span className="fmk-bl fmk-r"><i /><i /></span>
      </span>
      {armed && (<>
        <span className="fmk-lt"><i className="fmk-bm l" /><i className="fmk-bm r" /></span>
        <span className="fmk-fl" />
      </>)}
      <span className="fmk-f">F</span>
      {armed && <span className="fmk-f fmk-sh" aria-hidden="true">F</span>}
    </span>
  );
}
