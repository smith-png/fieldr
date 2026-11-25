import React from 'react'

interface HeroWordProps {
  word: string
  playIntro: boolean
}

export const HeroWord: React.FC<HeroWordProps> = ({ word, playIntro }) => {
  const letters = Array.from(word)

  return (
    <div className="hero-word-stage">
      {/* Large faint circular pitch/stadium arc rotating slowly behind the wordmark */}
      <div aria-hidden="true" className="hero-arc-wrap">
        <svg viewBox="0 0 400 400" fill="none" className="hero-arc-spin">
          <circle
            cx="200"
            cy="200"
            r="186"
            stroke="currentColor"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
            strokeDasharray="860 309"
            strokeLinecap="round"
          />
        </svg>
      </div>

      {/* Static 1px sage outline echo offset 4px right and 4px down */}
      <span aria-hidden="true" className="hero-word hero-word-echo">
        {letters.map((char, idx) => (
          <span key={`echo-${idx}`} className="hero-word-echo-letter">
            {char === ' ' ? '\u00A0' : char}
          </span>
        ))}
      </span>

      {/* Solid Syne 800 wordmark with vertical token gradient and per-letter entrance */}
      <h1 aria-label={word} className="hero-word hero-word-main">
        {letters.map((char, idx) => (
          <span
            key={`letter-${idx}`}
            aria-hidden="true"
            className={`hero-word-letter${playIntro ? ' hero-word-letter-enter' : ''}`}
            style={
              playIntro
                ? ({ '--hero-i': idx } as React.CSSProperties)
                : undefined
            }
          >
            {char === ' ' ? '\u00A0' : char}
          </span>
        ))}
      </h1>
    </div>
  )
}
