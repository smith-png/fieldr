import React from 'react'
import { useTheme } from '../../lib/theme'

export const HomeBackdrop: React.FC = () => {
  const { resolvedTheme } = useTheme()
  const strokeOpacityClass =
    resolvedTheme === 'dark' ? 'opacity-[0.05]' : 'opacity-[0.06]'

  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 pointer-events-none select-none overflow-hidden z-0"
    >
      <svg
        viewBox="0 0 1600 1800"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`w-full h-full text-text ${strokeOpacityClass}`}
      >
        <defs>
          <linearGradient id="home-backdrop-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="white" stopOpacity="0" />
            <stop offset="12%" stopColor="white" stopOpacity="1" />
            <stop offset="86%" stopColor="white" stopOpacity="1" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
          <mask id="home-backdrop-mask">
            <rect width="1600" height="1800" fill="url(#home-backdrop-fade)" />
          </mask>
        </defs>

        <g
          mask="url(#home-backdrop-mask)"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* Soft sweeping trajectory curves */}
          <path d="M -120 340 C 320 180, 880 260, 1720 90" />
          <path d="M -80 1060 C 460 880, 1080 1140, 1690 920" />
          <path d="M 180 1760 C 640 1440, 1180 1520, 1700 1320" />

          {/* Upper-left cropped: Cricket Pitch Crease, Stumps & Boundary Arc */}
          <g transform="translate(-90, 110) rotate(-14)">
            {/* Boundary / 30-yard oval arc */}
            <circle cx="220" cy="260" r="340" />
            {/* Pitch rectangle & popping crease */}
            <rect x="110" y="90" width="220" height="420" rx="4" />
            <line x1="65" y1="165" x2="375" y2="165" />
            <line x1="110" y1="125" x2="330" y2="125" />
            <line x1="155" y1="90" x2="155" y2="165" />
            <line x1="285" y1="90" x2="285" y2="165" />
            {/* Three stumps & bails */}
            <line x1="196" y1="52" x2="196" y2="125" />
            <line x1="220" y1="52" x2="220" y2="125" />
            <line x1="244" y1="52" x2="244" y2="125" />
            <line x1="193" y1="52" x2="218" y2="52" />
            <line x1="222" y1="52" x2="247" y2="52" />
          </g>

          {/* Top-right cropped: Large Cricket Bat & Cricket Ball */}
          <g transform="translate(1360, 120) rotate(28)">
            {/* Cricket Bat Handle */}
            <rect x="-18" y="-140" width="36" height="190" rx="14" />
            <line x1="-18" y1="-100" x2="18" y2="-100" />
            <line x1="-18" y1="-65" x2="18" y2="-65" />
            <line x1="-18" y1="-30" x2="18" y2="-30" />
            <line x1="-18" y1="5" x2="18" y2="5" />
            {/* Handle splice V */}
            <path d="M -18 50 L 0 115 L 18 50" />
            {/* Cricket Bat Blade */}
            <path d="M -18 50 L -64 95 L -64 470 C -64 505, -34 524, 0 524 C 34 524, 64 505, 64 470 L 64 95 L 18 50 Z" />
            {/* Central spine ridge */}
            <path d="M 0 115 L 0 512" />
            <path d="M -64 95 C -24 112, 24 112, 64 95" />
          </g>

          {/* Cricket Ball near upper-right */}
          <g transform="translate(1150, 520) rotate(-22)">
            <circle cx="0" cy="0" r="105" />
            {/* Seam primary & secondary lines */}
            <path d="M -74 -74 C -18 -26, -18 26, -74 74" />
            <path d="M 74 -74 C 18 -26, 18 26, 74 74" />
            <ellipse cx="0" cy="0" rx="34" ry="104" />
            <ellipse cx="0" cy="0" rx="22" ry="102" strokeDasharray="6 8" />
          </g>

          {/* Mid-right cropped: Large Futsal Ball & Pitch Penalty Area */}
          <g transform="translate(1480, 980)">
            {/* Outer sphere */}
            <circle cx="0" cy="0" r="230" />
            {/* Center pentagon */}
            <polygon points="0,-78 74,-24 46,63 -46,63 -74,-24" />
            {/* Radiating hexagon seams */}
            <line x1="0" y1="-78" x2="0" y2="-168" />
            <line x1="74" y1="-24" x2="160" y2="-52" />
            <line x1="46" y1="63" x2="99" y2="136" />
            <line x1="-46" y1="63" x2="-99" y2="136" />
            <line x1="-74" y1="-24" x2="-160" y2="-52" />
            {/* Outer hexagon ring segments */}
            <path d="M 0 -168 L 88 -138 L 160 -52" />
            <path d="M 160 -52 L 168 44 L 99 136" />
            <path d="M 99 136 L 0 172 L -99 136" />
            <path d="M -99 136 L -168 44 L -160 -52" />
            <path d="M -160 -52 L -88 -138 L 0 -168" />
            {/* Edge connecting struts to sphere rim */}
            <line x1="88" y1="-138" x2="128" y2="-190" />
            <line x1="168" y1="44" x2="224" y2="54" />
            <line x1="0" y1="172" x2="0" y2="230" />
            <line x1="-168" y1="44" x2="-224" y2="54" />
            <line x1="-88" y1="-138" x2="-128" y2="-190" />
          </g>

          {/* Lower-left cropped: Large Volleyball & Court Lines */}
          <g transform="translate(110, 1280) rotate(16)">
            <circle cx="0" cy="0" r="240" />
            {/* Curved 3-panel volleyball seam system */}
            {/* Top-left panel group */}
            <path d="M -236 -42 C -110 -130, 35 -115, 130 -18" />
            <path d="M -212 -112 C -95 -182, 42 -168, 158 -68" />
            <path d="M -240 22 C -120 -68, 15 -58, 92 24" />
            {/* Right panel group */}
            <path d="M 130 -18 C 148 92, 95 190, -12 240" />
            <path d="M 92 24 C 102 114, 56 196, -58 232" />
            <path d="M 168 -56 C 194 68, 148 176, 46 235" />
            {/* Bottom-left panel group */}
            <path d="M -218 98 C -126 142, -32 132, 92 24" />
            <path d="M -182 156 C -98 188, -8 178, 100 84" />
          </g>

          {/* Subtle court & pitch geometry lines at bottom-right / center-left */}
          <g transform="translate(1060, 1480) rotate(-8)">
            <rect x="0" y="0" width="640" height="380" rx="6" />
            <line x1="320" y1="0" x2="320" y2="380" />
            <line x1="210" y1="0" x2="210" y2="380" strokeDasharray="10 10" />
            <line x1="430" y1="0" x2="430" y2="380" strokeDasharray="10 10" />
            <circle cx="320" cy="190" r="76" />
          </g>
        </g>
      </svg>

      {/* Extra gentle top and bottom fade into background */}
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-bg to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-bg to-transparent" />
    </div>
  )
}
