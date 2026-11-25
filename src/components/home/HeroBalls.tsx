import React from 'react'

const BALL_CLASS = 'w-7 h-7 sm:w-9 sm:h-9 shrink-0'

export const HeroBalls: React.FC = () => (
  <div
    aria-hidden="true"
    className="relative z-10 flex items-center justify-center gap-3 sm:gap-5 mt-4 sm:mt-6 select-none"
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
      <defs>
        <clipPath id="hero-ball-clip">
          <circle cx="20" cy="20" r="18" />
        </clipPath>
      </defs>
      <circle cx="20" cy="20" r="18" fill="var(--surface)" />
      <g clipPath="url(#hero-ball-clip)" fill="var(--accent-bright)">
        <polygon points="20.0,6.5 15.3,3.1 17.1,-2.4 22.9,-2.4 24.7,3.1" />
        <polygon points="32.8,15.8 34.6,10.3 40.4,10.3 42.2,15.8 37.5,19.2" />
        <polygon points="27.9,30.9 33.7,30.9 35.5,36.4 30.8,39.8 26.2,36.4" />
        <polygon points="12.1,30.9 13.8,36.4 9.2,39.8 4.5,36.4 6.3,30.9" />
        <polygon points="7.2,15.8 2.5,19.2 -2.2,15.8 -0.4,10.3 5.4,10.3" />
      </g>
      <polygon
        points="20.0,14.6 25.1,18.3 23.2,24.4 16.8,24.4 14.9,18.3"
        fill="var(--accent-bright)"
      />
      <path
        d="M20.0 14.6L20.0 6.8M25.1 18.3L32.6 15.9M23.2 24.4L27.8 30.7M16.8 24.4L12.2 30.7M14.9 18.3L7.4 15.9"
        stroke="var(--accent-bright)"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle
        cx="20"
        cy="20"
        r="17.3"
        stroke="var(--accent-bright)"
        strokeWidth="1.4"
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
