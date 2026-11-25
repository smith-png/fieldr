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
    <rect width="400" height="250" fill="#14241A" />
    <circle className="sa-fade" style={d(0)} cx="165" cy="115" r="88" fill="none" stroke="#2A4B35" strokeWidth="1" opacity="0.6" />
    <circle className="sa-draw" style={d(0.1)} pathLength={1} cx="165" cy="115" r="112" fill="none" stroke="#2A4B35" strokeWidth="1" />
    <circle className="sa-fade" style={d(0.1)} cx="330" cy="40" r="16" fill="#1F3A2A" />
    <rect className="sa-fade" style={d(0.05)} x="0" y="172" width="400" height="78" fill="#1F4A32" />
    <rect className="sa-fade" style={d(0.15)} x="0" y="172" width="400" height="14" fill="#2A6044" />
    <line className="sa-draw" style={d(0.35)} pathLength={1} x1="210" y1="198" x2="400" y2="198" stroke="#E9E4D2" strokeWidth="2" />
    <line className="sa-draw" style={d(0.55)} pathLength={1} x1="318" y1="172" x2="318" y2="250" stroke="#E9E4D2" strokeWidth="2" />
    <ellipse className="sa-fade" style={d(0.8)} cx="165" cy="180" rx="44" ry="6" fill="#0B1710" opacity="0.7" />
    <ellipse className="sa-fade" style={d(0.8)} cx="268" cy="182" rx="30" ry="4" fill="#0B1710" opacity="0.6" />
    {[255, 267, 279].map((x, i) => (
      <rect key={x} className="sa-rise" style={d(0.45 + i * 0.1)} x={x - 3} y="96" width="6" height="84" rx="2" fill="#E9DDB4" />
    ))}
    <rect className="sa-fade" style={d(1.0)} x="252" y="90" width="14" height="4" rx="2" fill="#F3EBCB" />
    <rect className="sa-fade" style={d(1.05)} x="268" y="90" width="14" height="4" rx="2" fill="#F3EBCB" />
    <g className="sa-pop" style={d(0.7)}>
      <circle cx="165" cy="115" r="44" fill="#C2312A" />
      <path d="M121 115a44 44 0 0 1 88 0" fill="none" stroke="#8F1F1A" strokeWidth="3" opacity="0.55" transform="rotate(-18 165 115)" />
      <path d="M130 90c18 10 52 10 70 0M127 140c20 -10 56 -10 76 0" fill="none" stroke="#F3E3C8" strokeWidth="1.5" />
      <path d="M130 90c18 10 52 10 70 0M127 140c20 -10 56 -10 76 0" fill="none" stroke="#F3E3C8" strokeWidth="5" strokeDasharray="1 5" opacity="0.8" />
      <path d="M140 92a40 40 0 0 1 22 -20" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity="0.3" />
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
    <rect width="400" height="250" fill="#1E1812" />
    <circle className="sa-fade" style={d(0)} cx="200" cy="130" r="92" fill="none" stroke="#3A2E22" strokeWidth="1" opacity="0.8" />
    <rect className="sa-fade" style={d(0.05)} x="0" y="190" width="400" height="60" fill="#4A3622" />
    <line className="sa-draw" style={d(0.3)} pathLength={1} x1="0" y1="222" x2="400" y2="222" stroke="#E6D8BC" strokeWidth="2" />
    {/* net */}
    <rect className="sa-rise" style={d(0.2)} x="96" y="48" width="6" height="146" rx="2" fill="#7A6E62" />
    <rect className="sa-rise" style={d(0.3)} x="298" y="48" width="6" height="146" rx="2" fill="#7A6E62" />
    <path
      className="sa-draw"
      style={d(0.5)}
      pathLength={1}
      d="M102 70H298M102 86H298M102 102H298M102 118H298M102 134H298M120 58V140M140 58V140M160 58V140M180 58V140M200 58V140M220 58V140M240 58V140M260 58V140M280 58V140"
      fill="none"
      stroke="#8C7F70"
      strokeWidth="1"
    />
    <rect className="sa-draw" style={d(0.4)} pathLength={1} x="96" y="52" width="208" height="8" rx="2" fill="none" stroke="#F1E9D8" strokeWidth="3" />
    <ellipse className="sa-fade" style={d(0.9)} cx="200" cy="204" rx="40" ry="5" fill="#120D08" opacity="0.7" />
    <g className="sa-pop" style={d(0.75)}>
      <circle cx="200" cy="158" r="42" fill="#F1E3B5" />
      <path d="M158 158c0 -20 12 -34 30 -40c-6 14 -4 32 8 44c-12 6 -26 8 -38 -4z" fill="#2F66B3" />
      <path d="M214 118c18 6 28 22 28 40c-12 -4 -22 -2 -30 6c-6 -14 -4 -34 2 -46z" fill="#E59B2D" />
      <path d="M170 196c10 4 22 4 32 0c-4 -8 -12 -14 -20 -18c-6 4 -10 10 -12 18z" fill="#2F66B3" opacity="0.9" />
      <path d="M172 128a40 40 0 0 1 20 -10" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity="0.5" />
    </g>
  </g>
)
