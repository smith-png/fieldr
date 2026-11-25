import React from 'react'

const BALL_CLASS = 'w-8 h-8 sm:w-9 sm:h-9 shrink-0'

export const HeroBalls: React.FC = () => (
  <div
    aria-hidden="true"
    className="flex items-center justify-center gap-4 sm:gap-5 mt-5 sm:mt-6 select-none"
  >
    <svg viewBox="0 0 40 40" fill="none" className={BALL_CLASS}>
      <circle cx="20" cy="20" r="18" fill="var(--error)" />
      <path
        d="M8 11Q20 20 8 29M32 11Q20 20 32 29"
        stroke="var(--bg)"
        strokeWidth="1.6"
        strokeDasharray="2.5 2.5"
        strokeLinecap="round"
      />
    </svg>

    <svg viewBox="0 0 40 40" fill="none" className={BALL_CLASS}>
      <circle cx="20" cy="20" r="18" fill="var(--accent)" />
      <polygon
        points="20,13 26.7,17.9 24.2,25.7 15.8,25.7 13.3,17.9"
        fill="var(--bg)"
      />
      <path
        d="M20 13V5M26.7 17.9L34.3 15.4M24.2 25.7L28.9 32.2M15.8 25.7L11.1 32.2M13.3 17.9L5.7 15.4"
        stroke="var(--bg)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>

    <svg viewBox="0 0 40 40" fill="none" className={BALL_CLASS}>
      <circle
        cx="20"
        cy="20"
        r="17.2"
        fill="var(--surface)"
        stroke="var(--accent-bright)"
        strokeWidth="1.6"
      />
      <path
        d="M3.5 17Q20 8 36.5 14M4.5 27Q20 20 35.5 28M20 3Q12 20 22 37"
        stroke="var(--accent-bright)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  </div>
)
