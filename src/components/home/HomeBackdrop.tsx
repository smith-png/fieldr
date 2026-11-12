import React from 'react'
import { useTheme } from '../../lib/theme'

export const HomeBackdrop: React.FC = () => {
  const { resolvedTheme } = useTheme()

  return (
    <div
      aria-hidden="true"
      data-hb-theme={resolvedTheme}
      className="home-backdrop-root absolute inset-0 pointer-events-none select-none overflow-hidden z-0"
    >
      <style>{`
        .home-backdrop-root {
          --hb-base: #f4f2ee;
          --hb-stroke: rgba(18, 20, 18, 0.05);
          --hb-beam-left: conic-gradient(
            from 122deg at -2% -2%,
            transparent 0deg,
            rgba(200, 139, 15, 0.06) 12deg,
            rgba(217, 155, 26, 0.04) 22deg,
            transparent 38deg
          );
          --hb-beam-right: conic-gradient(
            from 200deg at 102% -2%,
            transparent 0deg,
            rgba(217, 155, 26, 0.04) 16deg,
            rgba(200, 139, 15, 0.06) 26deg,
            transparent 38deg
          );
          --hb-vignette: none;
          background-color: var(--hb-base);
        }

        [data-theme="dark"] .home-backdrop-root,
        .home-backdrop-root[data-hb-theme="dark"] {
          --hb-base: #0a0a0a;
          --hb-stroke: rgba(255, 255, 255, 0.055);
          --hb-beam-left: conic-gradient(
            from 122deg at -2% -2%,
            transparent 0deg,
            rgba(255, 255, 255, 0.038) 12deg,
            rgba(255, 255, 255, 0.022) 22deg,
            transparent 38deg
          );
          --hb-beam-right: conic-gradient(
            from 200deg at 102% -2%,
            transparent 0deg,
            rgba(255, 255, 255, 0.022) 16deg,
            rgba(255, 255, 255, 0.038) 26deg,
            transparent 38deg
          );
          --hb-vignette: radial-gradient(
            ellipse 78% 78% at 50% 50%,
            transparent 48%,
            rgba(0, 0, 0, 0.40) 100%
          );
        }

        .hb-floodlight-left {
          background-image: var(--hb-beam-left);
          mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 0.5) 45%, transparent 82%);
          -webkit-mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 0.5) 45%, transparent 82%);
        }

        .hb-floodlight-right {
          background-image: var(--hb-beam-right);
          mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 0.5) 45%, transparent 82%);
          -webkit-mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 0.5) 45%, transparent 82%);
        }

        .hb-vignette {
          background-image: var(--hb-vignette);
        }

        .hb-ghost-numeral {
          font-family: 'Syne', sans-serif;
          font-weight: 800;
          line-height: 0.85;
          letter-spacing: -0.04em;
          color: transparent;
          -webkit-text-stroke: 1px var(--hb-stroke);
          white-space: nowrap;
          user-select: none;
          pointer-events: none;
        }

        @keyframes hbDriftOne {
          0% {
            transform: translate3d(0px, 0px, 0);
          }
          50% {
            transform: translate3d(-28px, 18px, 0);
          }
          100% {
            transform: translate3d(0px, 0px, 0);
          }
        }

        @keyframes hbDriftTwo {
          0% {
            transform: translate3d(0px, 0px, 0);
          }
          50% {
            transform: translate3d(26px, -20px, 0);
          }
          100% {
            transform: translate3d(0px, 0px, 0);
          }
        }

        @keyframes hbDriftThree {
          0% {
            transform: translate3d(0px, 0px, 0);
          }
          50% {
            transform: translate3d(-22px, -24px, 0);
          }
          100% {
            transform: translate3d(0px, 0px, 0);
          }
        }

        .hb-drift-1 {
          will-change: transform;
          animation: hbDriftOne 44s ease-in-out infinite;
        }

        .hb-drift-2 {
          will-change: transform;
          animation: hbDriftTwo 52s ease-in-out infinite;
        }

        .hb-drift-3 {
          will-change: transform;
          animation: hbDriftThree 58s ease-in-out infinite;
        }

        @media (prefers-reduced-motion: reduce) {
          .hb-drift-1,
          .hb-drift-2,
          .hb-drift-3 {
            animation: none !important;
            will-change: auto;
          }
        }
      `}</style>

      {/* Top-left and top-right narrowed floodlight shafts toward the centre */}
      <div className="hb-floodlight-left absolute inset-0" />
      <div className="hb-floodlight-right absolute inset-0" />

      {/* Three oversized outlined Syne ghost numerals partly clipped by screen edges */}
      <div className="hb-drift-1 absolute top-[3%] -right-[14%] sm:-right-[10%]">
        <span className="hb-ghost-numeral block text-[46vw] sm:text-[40vw] -rotate-12">
          0007
        </span>
      </div>

      <div className="hb-drift-2 absolute top-[34%] -left-[16%] sm:-left-[11%]">
        <span className="hb-ghost-numeral block text-[54vw] sm:text-[46vw] rotate-8">
          0014
        </span>
      </div>

      <div className="hb-drift-3 absolute bottom-[4%] -right-[15%] sm:-right-[9%]">
        <span className="hb-ghost-numeral block text-[48vw] sm:text-[38vw] -rotate-6">
          0023
        </span>
      </div>

      {/* Soft corner vignette in dark theme */}
      <div className="hb-vignette absolute inset-0" />
    </div>
  )
}


