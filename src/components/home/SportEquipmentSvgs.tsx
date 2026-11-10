import React from 'react'

interface SportSvgProps {
  className?: string
}

export const CricketIllustration: React.FC<SportSvgProps> = ({ className = 'w-full h-full' }) => (
  <svg
    viewBox="0 0 240 180"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    {/* Background soft geometric accents */}
    <circle cx="120" cy="90" r="70" stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="4 6" opacity="0.35" />
    <line x1="40" y1="135" x2="200" y2="135" stroke="var(--accent)" strokeWidth="2" opacity="0.4" />

    {/* Cricket Stumps & Bails in subtle background */}
    <g opacity="0.5">
      <rect x="156" y="65" width="4" height="70" rx="1.5" fill="var(--accent)" />
      <rect x="165" y="65" width="4" height="70" rx="1.5" fill="var(--accent)" />
      <rect x="174" y="65" width="4" height="70" rx="1.5" fill="var(--accent)" />
      <rect x="154" y="62" width="26" height="3" rx="1" fill="var(--accent-bright)" />
    </g>

    {/* Cricket Bat (angled) */}
    <g transform="rotate(-28 110 95)">
      {/* Handle */}
      <rect x="106" y="24" width="8" height="38" rx="2" fill="var(--surface-2)" stroke="var(--border)" strokeWidth="1" />
      {/* Grip wraps */}
      <line x1="106" y1="32" x2="114" y2="32" stroke="var(--accent)" strokeWidth="1" />
      <line x1="106" y1="40" x2="114" y2="40" stroke="var(--accent)" strokeWidth="1" />
      <line x1="106" y1="48" x2="114" y2="48" stroke="var(--accent)" strokeWidth="1" />
      <line x1="106" y1="56" x2="114" y2="56" stroke="var(--accent)" strokeWidth="1" />
      {/* Shoulder & Blade */}
      <path
        d="M104 62 C104 60 108 58 110 58 C112 58 116 60 116 62 L118 142 C118 146 115 149 110 149 C105 149 102 146 102 142 Z"
        fill="var(--surface-2)"
        stroke="var(--border)"
        strokeWidth="1.5"
      />
      {/* Blade spine highlight */}
      <path
        d="M110 60 L110 148"
        stroke="var(--accent)"
        strokeWidth="1.5"
        opacity="0.6"
      />
      <path
        d="M103 80 L117 80"
        stroke="var(--accent-bright)"
        strokeWidth="3"
        opacity="0.8"
      />
    </g>

    {/* Cricket Ball */}
    <g transform="translate(62, 108)">
      <circle cx="16" cy="16" r="16" fill="var(--accent-bright)" />
      {/* Ball seam */}
      <path
        d="M5 24 C10 18 22 14 27 8"
        stroke="#FFFFFF"
        strokeWidth="2"
        strokeDasharray="2 1.5"
      />
      <circle cx="12" cy="12" r="15" stroke="var(--border)" strokeWidth="1.5" opacity="0.4" fill="none" />
    </g>
  </svg>
)

export const FutsalIllustration: React.FC<SportSvgProps> = ({ className = 'w-full h-full' }) => (
  <svg
    viewBox="0 0 240 180"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    {/* Pitch arc / penalty mark */}
    <circle cx="120" cy="90" r="72" stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="5 5" opacity="0.35" />
    <line x1="30" y1="90" x2="210" y2="90" stroke="var(--accent)" strokeWidth="1.5" opacity="0.3" />

    {/* Futsal Goal Posts in background */}
    <g opacity="0.4">
      <path
        d="M48 50 L48 135 M192 50 L192 135 M48 50 L192 50"
        stroke="var(--accent)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Net lines */}
      <path
        d="M58 50 L70 135 M88 50 L100 135 M118 50 L130 135 M148 50 L160 135 M178 50 L188 135"
        stroke="var(--accent)"
        strokeWidth="1"
        strokeDasharray="3 3"
        opacity="0.5"
      />
    </g>

    {/* Futsal Match Ball */}
    <g transform="translate(90, 60)">
      {/* Outer Sphere */}
      <circle cx="30" cy="30" r="30" fill="var(--surface-2)" stroke="var(--border)" strokeWidth="2" />
      {/* Central pentagon */}
      <polygon
        points="30,18 41,26 37,39 23,39 19,26"
        fill="var(--accent-bright)"
      />
      {/* Radiating panel seams */}
      <line x1="30" y1="18" x2="30" y2="3" stroke="var(--accent)" strokeWidth="2" />
      <line x1="41" y1="26" x2="55" y2="18" stroke="var(--accent)" strokeWidth="2" />
      <line x1="37" y1="39" x2="48" y2="52" stroke="var(--accent)" strokeWidth="2" />
      <line x1="23" y1="39" x2="12" y2="52" stroke="var(--accent)" strokeWidth="2" />
      <line x1="19" y1="26" x2="5" y2="18" stroke="var(--accent)" strokeWidth="2" />

      {/* Outer corner panels */}
      <path d="M12 52 C18 57 26 59 30 60" stroke="var(--accent-bright)" strokeWidth="3" />
      <path d="M48 52 C42 57 34 59 30 60" stroke="var(--accent-bright)" strokeWidth="3" />
      <path d="M5 18 C3 25 3 35 7 42" stroke="var(--accent-bright)" strokeWidth="3" />
      <path d="M55 18 C57 25 57 35 53 42" stroke="var(--accent-bright)" strokeWidth="3" />
      <path d="M18 5 C23 3 37 3 42 5" stroke="var(--accent-bright)" strokeWidth="3" />
    </g>
  </svg>
)

export const VolleyballIllustration: React.FC<SportSvgProps> = ({ className = 'w-full h-full' }) => (
  <svg
    viewBox="0 0 240 180"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    {/* Court line */}
    <line x1="35" y1="140" x2="205" y2="140" stroke="var(--accent)" strokeWidth="2" opacity="0.4" />

    {/* Volleyball Net Mesh */}
    <g opacity="0.6">
      {/* Top band of net */}
      <rect x="25" y="80" width="190" height="7" rx="1" fill="var(--border)" />
      {/* Net grid */}
      <line x1="25" y1="95" x2="215" y2="95" stroke="var(--accent)" strokeWidth="1" strokeDasharray="3 3" />
      <line x1="25" y1="110" x2="215" y2="110" stroke="var(--accent)" strokeWidth="1" strokeDasharray="3 3" />
      <line x1="25" y1="125" x2="215" y2="125" stroke="var(--accent)" strokeWidth="1" strokeDasharray="3 3" />
      {/* Vertical meshes */}
      {[45, 65, 85, 105, 125, 145, 165, 185, 205].map((x) => (
        <line key={x} x1={x} y1="87" x2={x} y2="135" stroke="var(--accent)" strokeWidth="1" opacity="0.4" />
      ))}
      {/* Antenna marker */}
      <rect x="175" y="45" width="3" height="90" rx="1" fill="var(--accent-bright)" />
    </g>

    {/* Volleyball Ball (above net) */}
    <g transform="translate(85, 28)">
      <circle cx="28" cy="28" r="28" fill="var(--surface-2)" stroke="var(--border)" strokeWidth="2" />
      {/* Curved panels signature to volleyball */}
      <path
        d="M10 8 C22 18 24 38 18 52"
        stroke="var(--accent-bright)"
        strokeWidth="2.5"
      />
      <path
        d="M20 4 C32 16 34 36 28 50"
        stroke="var(--accent)"
        strokeWidth="2.5"
      />
      <path
        d="M8 32 C22 28 42 34 52 44"
        stroke="var(--accent-bright)"
        strokeWidth="2.5"
      />
      <path
        d="M28 2 C38 12 44 24 48 38"
        stroke="var(--border)"
        strokeWidth="2.5"
      />
    </g>
  </svg>
)
