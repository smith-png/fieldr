import React, { useEffect, useRef, useState } from 'react'
import type { SportSlug } from '../../lib/sports'

/** True once the element has scrolled into view (stays true afterwards). */
export function useInViewOnce<T extends Element>(threshold = 0.25) {
  const ref = useRef<T | null>(null)
  const [seen, setSeen] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (typeof IntersectionObserver === 'undefined') {
      setSeen(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true)
          io.disconnect()
        }
      },
      { threshold }
    )
    io.observe(node)
    return () => io.disconnect()
  }, [threshold])

  return [ref, seen] as const
}

interface SportArtProps {
  slug: SportSlug
  /** Start the build-in animation (true once the card is on screen). */
  play: boolean
  className?: string
  /** Extra delay (seconds) so neighbouring cards build one after another. */
  delay?: number
}

/**
 * Flat SVG scenes for the three sports. Each scene "builds" once when its
 * card scrolls into view (lines draw, ball drops in) and then stays still.
 * With reduced motion the finished picture is shown straight away.
 */
export const SportArt: React.FC<SportArtProps> = ({ slug, play, className = '', delay = 0 }) => (
  <svg
    viewBox="0 0 400 250"
    preserveAspectRatio="xMidYMid slice"
    role="img"
    aria-label={LABELS[slug]}
    className={`sa ${play ? 'sa-play' : ''} ${className}`}
    style={{ ['--sa-base' as string]: `${delay}s` } as React.CSSProperties}
  >
    {slug === 'cricket' && <Cricket />}
    {slug === 'futsal' && <Futsal />}
    {slug === 'volleyball' && <Volleyball />}
  </svg>
)

const LABELS: Record<SportSlug, string> = {
  cricket: 'Illustration of a cricket ball and stumps',
  futsal: 'Illustration of a futsal ball and goal',
  volleyball: 'Illustration of a volleyball and net'
}

const d = (s: number): React.CSSProperties => ({ ['--d' as string]: `${s}s` } as React.CSSProperties)

const Cricket: React.FC = () => (
  <g>
    {/* Proportions follow the real game: stumps 71 cm tall and 23 cm wide, ball 7 cm across */}
    <rect width="400" height="250" fill="#14241A" />
    <circle className="sa-fade" style={d(0)} cx="200" cy="120" r="88" fill="none" stroke="#2A4B35" strokeWidth="1" opacity="0.6" />
    <circle className="sa-draw" style={d(0.1)} pathLength={1} cx="200" cy="120" r="112" fill="none" stroke="#2A4B35" strokeWidth="1" />
    <circle className="sa-fade" style={d(0.1)} cx="330" cy="40" r="16" fill="#1F3A2A" />
    <rect className="sa-fade" style={d(0.05)} x="0" y="178" width="400" height="72" fill="#1F4A32" />
    <rect className="sa-fade" style={d(0.15)} x="0" y="178" width="400" height="12" fill="#2A6044" />
    <line className="sa-draw" style={d(0.35)} pathLength={1} x1="200" y1="203" x2="400" y2="203" stroke="#E9E4D2" strokeWidth="2" />
    <line className="sa-draw" style={d(0.55)} pathLength={1} x1="322" y1="178" x2="322" y2="250" stroke="#E9E4D2" strokeWidth="2" />
    <ellipse className="sa-fade" style={d(0.8)} cx="270" cy="184" rx="30" ry="4" fill="#0B1710" opacity="0.6" />
    {[253, 270, 287].map((x, i) => (
      <rect key={x} className="sa-rise" style={d(0.45 + i * 0.1)} x={x - 4} y="50" width="8" height="130" rx="3" fill="#E9DDB4" />
    ))}
    <rect className="sa-fade" style={d(1.0)} x="253" y="44" width="17" height="4" rx="2" fill="#F3EBCB" />
    <rect className="sa-fade" style={d(1.05)} x="270" y="44" width="17" height="4" rx="2" fill="#F3EBCB" />
    <ellipse className="sa-fade" style={d(0.8)} cx="170" cy="184" rx="8" ry="1.8" fill="#0B1710" opacity="0.7" />
    <g className="sa-pop" style={d(0.7)}>
      <circle cx="170" cy="150" r="7" fill="#C2312A" />
      <path d="M163.5 148.5c2.5 1.6 10.5 1.6 13 0" fill="none" stroke="#F3E3C8" strokeWidth="0.8" />
      <path d="M163.5 152c2.5 -1.4 10.5 -1.4 13 0" fill="none" stroke="#F3E3C8" strokeWidth="0.8" />
      <path d="M165 146a6 6 0 0 1 4 -3" fill="none" stroke="#fff" strokeWidth="1" strokeLinecap="round" opacity="0.45" />
    </g>
  </g>
)

const Futsal: React.FC = () => (
  <g>
    <rect width="400" height="250" fill="#0F1E33" />
    <circle className="sa-fade" style={d(0)} cx="255" cy="118" r="88" fill="none" stroke="#1F3A5C" strokeWidth="1" opacity="0.7" />
    <circle className="sa-draw" style={d(0.1)} pathLength={1} cx="255" cy="118" r="112" fill="none" stroke="#1F3A5C" strokeWidth="1" />
    <rect className="sa-fade" style={d(0.05)} x="0" y="172" width="400" height="78" fill="#1B3A5C" />
    <line className="sa-draw" style={d(0.3)} pathLength={1} x1="0" y1="196" x2="400" y2="196" stroke="#8FB0CF" strokeWidth="2" />
    <circle className="sa-draw" style={d(0.5)} pathLength={1} cx="255" cy="250" r="46" fill="none" stroke="#8FB0CF" strokeWidth="2" />
    {/* goal */}
    <path className="sa-draw" style={d(0.35)} pathLength={1} d="M100 176V98H176V176" fill="none" stroke="#F0F2EE" strokeWidth="3" strokeLinejoin="round" />
    <path
      className="sa-draw"
      style={d(0.7)}
      pathLength={1}
      d="M100 118H176M100 138H176M100 158H176M118 98V176M138 98V176M158 98V176"
      fill="none"
      stroke="#9FB6CF"
      strokeWidth="1"
    />
    <ellipse className="sa-fade" style={d(0.9)} cx="255" cy="183" rx="42" ry="6" fill="#08121F" opacity="0.7" />
    <g className="sa-pop" style={d(0.75)}>
      <circle cx="255" cy="130" r="42" fill="#F1EEE3" />
      <path d="M255 110l17 12-6 20h-22l-6-20z" fill="#12263F" />
      <path d="M255 110V95M272 122l15-7M266 142l10 14M244 142l-10 14M238 122l-15-7" stroke="#12263F" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <path d="M230 104a40 40 0 0 1 22 -12" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity="0.5" />
    </g>
  </g>
)

const Volleyball: React.FC = () => (
  <g>
    <defs>
      <clipPath id="sa-vb-clip">
        <circle cx="0" cy="0" r="40" />
      </clipPath>
    </defs>
    <rect width="400" height="250" fill="#1E1812" />
    <circle className="sa-fade" style={d(0)} cx="200" cy="130" r="92" fill="none" stroke="#3A2E22" strokeWidth="1" opacity="0.8" />
    <rect className="sa-fade" style={d(0.05)} x="0" y="182" width="400" height="68" fill="#4A3622" />
    <line className="sa-draw" style={d(0.3)} pathLength={1} x1="0" y1="206" x2="400" y2="206" stroke="#E6D8BC" strokeWidth="2" />
    {/* net */}
    <rect className="sa-rise" style={d(0.2)} x="108" y="52" width="5" height="130" rx="2" fill="#7A6E62" />
    <rect className="sa-rise" style={d(0.3)} x="287" y="52" width="5" height="130" rx="2" fill="#7A6E62" />
    <path
      className="sa-draw"
      style={d(0.5)}
      pathLength={1}
      d="M113 72H287M113 88H287M113 104H287M113 120H287M130 60V126M150 60V126M170 60V126M190 60V126M210 60V126M230 60V126M250 60V126M270 60V126"
      fill="none"
      stroke="#8C7F70"
      strokeWidth="1"
    />
    <rect className="sa-draw" style={d(0.4)} pathLength={1} x="108" y="56" width="184" height="7" rx="2" fill="none" stroke="#F1E9D8" strokeWidth="2.5" />
    <ellipse className="sa-fade" style={d(0.9)} cx="200" cy="186" rx="30" ry="4" fill="#120D08" opacity="0.7" />
    <g className="sa-pop" style={d(0.75)}>
      <g transform="translate(200 154) scale(0.75)">
        <circle cx="0" cy="0" r="40" fill="#F1E3B5" />
        <g clipPath="url(#sa-vb-clip)">
          <path d="M-44 -14C-20 -34 14 -38 44 -22L44 -6C16 -20 -18 -16 -44 4Z" fill="#2F66B3" />
          <path d="M-44 16C-18 -2 16 2 44 18L44 36C16 22 -18 24 -44 42Z" fill="#E59B2D" />
          <path d="M-12 -44C-6 -26 -4 -8 -8 10C-12 26 -20 38 -30 46" fill="none" stroke="#C9B67E" strokeWidth="1.5" />
          <path d="M16 -44C22 -26 22 -4 16 14C12 28 6 40 -2 46" fill="none" stroke="#C9B67E" strokeWidth="1.5" />
        </g>
        <path d="M-26 -22a36 36 0 0 1 20 -14" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" opacity="0.5" />
      </g>
    </g>
  </g>
)
