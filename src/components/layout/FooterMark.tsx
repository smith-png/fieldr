import type { CSSProperties } from 'react';

const css = `
.fmk{position:relative;width:var(--s);height:var(--s);border-radius:22%;overflow:hidden;background:#06241a;flex:none;display:inline-block}
.fmk-bl{position:absolute;inset:-40%;animation:fmk-sp 14s linear infinite}
.fmk-r{animation-duration:22s;animation-direction:reverse}
.fmk-bl i{position:absolute;border-radius:50%;filter:blur(calc(var(--s)*.07))}
.fmk-bl:not(.fmk-r) i:nth-child(1){width:56%;height:46%;left:8%;top:20%;background:#047554}
.fmk-bl:not(.fmk-r) i:nth-child(2){width:42%;height:58%;right:10%;bottom:8%;background:#395F3D}
.fmk-bl:not(.fmk-r) i:nth-child(3){width:30%;height:22%;left:44%;top:56%;background:#CBD1CB;opacity:.75}
.fmk-r i:nth-child(1){width:34%;height:70%;left:22%;top:6%;background:#0a9a6c;opacity:.7;border-radius:40%}
.fmk-r i:nth-child(2){width:50%;height:26%;right:6%;top:46%;background:#021a12;opacity:.85}
.fmk::after{content:"";position:absolute;inset:0;border-radius:22%;box-shadow:inset 0 0 calc(var(--s)*.12) calc(var(--s)*.02) rgba(4,24,17,.8)}
.fmk-f{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:'Syne',sans-serif;font-weight:800;font-size:calc(var(--s)*.6);line-height:1;color:#fff;z-index:2}
@keyframes fmk-sp{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.fmk-bl{animation:none}}
`;

export default function FooterMark({ size = 44 }: { size?: number }) {
  return (
    <span className="fmk" style={{ '--s': `${size}px` } as CSSProperties} aria-hidden="true">
      <style>{css}</style>
      <span className="fmk-bl"><i /><i /><i /></span>
      <span className="fmk-bl fmk-r"><i /><i /></span>
      <span className="fmk-f">F</span>
    </span>
  );
}
