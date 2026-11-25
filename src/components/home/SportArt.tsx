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
 * Editorial SVG scenes for the three sports that adapt via CSS custom
 * properties between dark studio lighting and light daylight. Each scene
 * builds in once on scroll and stays still; reduced motion renders immediately.
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
const v = (name: string) => `var(--${name})`

type Stop = [number, string, (number | string)?]
const stops = (s: Stop[]) =>
  s.map(([o, c, op], i) => (
    <stop key={i} offset={`${o}%`} style={{ stopColor: c, ...(op !== undefined ? { stopOpacity: op } : {}) }} />
  ))

const LG: React.FC<{ id: string; c?: [number, number, number, number]; u?: boolean; s: Stop[] }> = ({
  id,
  c = [0, 0, 0, 1],
  u,
  s
}) => (
  <linearGradient id={id} x1={c[0]} y1={c[1]} x2={c[2]} y2={c[3]} gradientUnits={u ? 'userSpaceOnUse' : undefined}>
    {stops(s)}
  </linearGradient>
)

const RG: React.FC<{ id: string; c: [string | number, string | number, string | number]; u?: boolean; s: Stop[] }> = ({
  id,
  c,
  u,
  s
}) => (
  <radialGradient id={id} cx={c[0]} cy={c[1]} r={c[2]} gradientUnits={u ? 'userSpaceOnUse' : undefined}>
    {stops(s)}
  </radialGradient>
)

interface Stage {
  p: string
  glowX: number
  line: [number, number, number]
  postStops: number[]
  ballStops: number[]
  hasShade?: boolean
  ringCx: number
  floorY: number
  blur: number
  r: number
}

const Scene: React.FC<{ s: Stage; defs?: React.ReactNode; children: React.ReactNode }> = ({ s, defs, children }) => {
  const p = s.p
  return (
    <g>
      <defs>
        <LG id={`${p}bg`} c={[0, 0, 1, 1]} s={[[0, v(`${p}bg0`)], [52, v(`${p}bg1`)], [100, v(`${p}bg2`)]]} />
        <RG id={`${p}key`} c={['20%', '14%', '64%']} s={[[0, v(`${p}key0`), v('sa-key-op')], [48, v(`${p}key1`), v('sa-key-mid-op')], [100, v(`${p}bg2`), 0]]} />
        <RG id={`${p}glow`} c={[`${s.glowX}%`, '49%', '45%']} s={[[0, v(`${p}glow0`), v('sa-glow-op')], [56, v(`${p}glow1`), v('sa-glow-mid-op')], [100, v(`${p}bg2`), 0]]} />
        <LG id={`${p}floor`} c={[0, s.floorY, 0, 250]} u s={[[0, v(`${p}fl0`)], [35, v(`${p}fl1`)], [76, v(`${p}fl2`)], [100, v(`${p}fl3`)]]} />
        <LG id={`${p}tex`} c={[0, s.floorY, 0, 217]} u s={[[0, v(`${p}tex0`), v(`${p}tex-op0`)], [56, v(`${p}tex1`), v(`${p}tex-op1`)], [100, v(`${p}fl2`), 0]]} />
        <LG id={`${p}hz`} c={[0, s.floorY - 8, 0, s.floorY + 12]} u s={[[0, v(`${p}hz`), 0], [50, v(`${p}hz`), v('sa-hz-op')], [100, v(`${p}fl1`), 0]]} />
        <LG id={`${p}ring`} c={[108, 36, 318, 210]} u s={[[0, v(`${p}ring0`), v('sa-ring-op')], [56, v(`${p}ring1`), v('sa-ring-mid-op')], [100, v(`${p}bg1`), 0.03]]} />
        <LG id={`${p}line`} c={[s.line[0], s.line[2], s.line[1], s.line[2]]} u s={[[0, v(`${p}line`), 0.06], [25, v(`${p}line`), v(`${p}line-op0`)], [76, v(`${p}line`), v(`${p}line-op1`)], [100, v(`${p}line`), 0.05]]} />
        <LG id={`${p}post`} c={[0, 0, 1, 0]} s={s.postStops.map((o, i) => [o, v(`${p}post${i}`)])} />
        <RG id={`${p}ball`} c={['34%', '28%', '72%']} s={s.ballStops.map((o, i) => [o, v(`${p}ball${i}`)])} />
        <LG id={`${p}prefl`} c={[0, 180, 0, 200]} u s={[[0, v(`${p}prefl`), v(`${p}prefl-op`)], [100, v(`${p}prefl`), 0]]} />
        <RG id={`${p}brefl`} c={['50%', '50%', '50%']} s={[[0, v(`${p}brefl0`), v(`${p}brefl-op`)], [65, v(`${p}brefl1`), 0.11], [100, v(`${p}brefl1`), 0]]} />
        <RG id={`${p}spec`} c={['42%', '38%', '58%']} s={[[0, v(`${p}spec0`), v(`${p}spec-op`)], [50, v(`${p}spec1`), 0.2], [100, v(`${p}spec1`), 0]]} />
        {s.hasShade && (
          <RG id={`${p}shade`} c={['32%', '26%', '74%']} s={[[0, '#FFF', 0], [58, v(`${p}shade0`), 0.06], [88, v(`${p}shade0`), v('sa-shade-mid-op')], [100, v(`${p}shade1`), v('sa-shade-end-op')]]} />
        )}
        <RG id={`${p}vig`} c={['50%', '46%', '64%']} s={[[56, v(`${p}vig`), 0], [100, v(`${p}vig`), v('sa-vig-op')]]} />
        <clipPath id={`${p}clip`}><circle cx="0" cy="0" r={s.r} /></clipPath>
        <filter id={`${p}blur`} x="-40%" y="-120%" width="180%" height="340%">
          <feGaussianBlur stdDeviation={s.blur} />
        </filter>
        {defs}
      </defs>
      <rect width="400" height="250" fill={`url(#${p}bg)`} />
      <g className="sa-fade" style={d(0)}>
        <rect width="400" height="250" fill={`url(#${p}key)`} />
        <ellipse cx={s.glowX * 4} cy="126" rx="148" ry="96" fill={`url(#${p}glow)`} />
      </g>
      <circle className="sa-fade" style={d(0.06)} cx={s.ringCx} cy="125" r="85" fill="none" stroke={`url(#${p}ring)`} strokeWidth="0.9" />
      <circle className="sa-draw" style={d(0.12)} pathLength={1} cx={s.ringCx} cy="125" r="113" fill="none" stroke={`url(#${p}ring)`} strokeWidth="0.85" />
      {children}
      <rect width="400" height="250" fill={`url(#${p}vig)`} />
    </g>
  )
}

const BallStage: React.FC<{ p: string; cx: number; cy: number; r: number; children: React.ReactNode }> = ({
  p,
  cx,
  cy,
  r,
  children
}) => {
  const gy = cy + r
  return (
    <>
      <g className="sa-fade" style={d(0.88)}>
        <ellipse cx={cx} cy={gy + 4.5} rx={r * 1.05} ry={r * 0.31} fill={`url(#${p}brefl)`} style={{ opacity: v('sa-refl-op') }} />
        <ellipse cx={cx + r * 0.54} cy={gy + 0.6} rx={r * 1.3} ry={r * 0.25} filter={`url(#${p}blur)`} style={{ fill: v(`${p}bshd`), fillOpacity: v('sa-shd-op') }} />
        <ellipse cx={cx} cy={gy} rx={r * 0.68} ry={r * 0.14} style={{ fill: v(`${p}bshd`), fillOpacity: v('sa-ao-op') }} />
      </g>
      <g className="sa-pop" style={d(0.82)}>
        <g transform={`translate(${cx} ${cy})`}>
          <g clipPath={`url(#${p}clip)`}>
            <circle cx="0" cy="0" r={r} fill={`url(#${p}ball)`} />
            {children}
            <ellipse cx={-r * 0.34} cy={-r * 0.38} rx={r * 0.38} ry={r * 0.23} transform={`rotate(-30 ${-r * 0.34} ${-r * 0.38})`} fill={`url(#${p}spec)`} />
            <path d={`M${r * 0.3} ${r * 0.86} A${r * 0.93} ${r * 0.93} 0 0 0 ${r * 0.87} ${r * 0.26}`} fill="none" strokeWidth="1.1" strokeLinecap="round" style={{ stroke: v(`${p}rim`), strokeOpacity: 0.35 }} />
          </g>
          <circle cx="0" cy="0" r={r} fill="none" strokeWidth="0.6" style={{ stroke: v(`${p}edge`), strokeOpacity: 0.42 }} />
        </g>
      </g>
    </>
  )
}

const PostGround: React.FC<{ p: string; xs: number[]; y: number; w: number; delay: number; extra?: React.ReactNode }> = ({
  p,
  xs,
  y,
  w,
  delay,
  extra
}) => (
  <g className="sa-fade" style={d(delay)}>
    {extra}
    <g filter={`url(#${p}blur)`}>
      {xs.map((x) => (
        <polygon key={`s-${x}`} points={`${x - w / 2},${y} ${x + w / 2},${y} ${x + 25},${y + 10} ${x + 18},${y + 10}`} style={{ fill: v(`${p}shd`), fillOpacity: v('sa-post-shd-op') }} />
      ))}
    </g>
    {xs.map((x) => (
      <g key={`r-${x}`}>
        <rect x={x - w / 2} y={y} width={w} height="18" fill={`url(#${p}prefl)`} style={{ opacity: v('sa-refl-op') }} />
        <ellipse cx={x} cy={y + 0.5} rx="5.8" ry="1.8" style={{ fill: v(`${p}ao`), fillOpacity: v('sa-post-ao-op') }} />
      </g>
    ))}
  </g>
)

const CR_STAGE: Stage = {
  p: 'sa-cr-', glowX: 57, line: [184, 368, 191], postStops: [0, 26, 68, 90, 100], ballStops: [0, 30, 70, 100],
  ringCx: 216, floorY: 172, blur: 2.4, r: 13.5
}

const Cricket: React.FC = () => (
  <Scene
    s={CR_STAGE}
    defs={
      <>
        <LG id="sa-cr-strip" c={[0, 172, 0, 216]} u s={[[0, v('sa-cr-strip0'), v('sa-cr-strip-op0')], [58, v('sa-cr-strip1'), v('sa-cr-strip-op1')], [100, v('sa-cr-fl2'), 0]]} />
        <LG id="sa-cr-chalk-v" c={[316, 173, 334, 210]} u s={[[0, v('sa-cr-line'), 0.14], [45, v('sa-cr-line'), v('sa-cr-chalk-v-op')], [100, v('sa-cr-line'), 0]]} />
        <LG id="sa-cr-wood-b" s={[[0, v('sa-cr-wood-b'), 0], [100, v('sa-cr-wood-b'), v('sa-cr-wood-b-op')]]} />
        <LG id="sa-cr-bail" s={[[0, v('sa-cr-bail0')], [45, v('sa-cr-bail1')], [100, v('sa-cr-bail2')]]} />
      </>
    }
  >
    <g className="sa-fade" style={d(0.06)}>
      <rect x="0" y="172" width="400" height="78" fill="url(#sa-cr-floor)" />
      <path d="M32 172H88L48 218H-24ZM132 172H184L166 218H104ZM222 172H276L292 218H226ZM318 172H368L414 218H352Z" fill="url(#sa-cr-tex)" />
      <polygon points="214,172 324,172 344,214 196,214" fill="url(#sa-cr-strip)" />
      <rect x="0" y="164" width="400" height="20" fill="url(#sa-cr-hz)" />
    </g>
    <line className="sa-draw" style={d(0.26)} pathLength={1} x1="184" y1="191" x2="368" y2="191" stroke="url(#sa-cr-line)" strokeWidth="1.6" />
    <line className="sa-draw" style={d(0.36)} pathLength={1} x1="316" y1="173" x2="334" y2="210" stroke="url(#sa-cr-chalk-v)" strokeWidth="1.5" />
    <PostGround
      p="sa-cr-" xs={[248, 268, 288]} y={181} w={7} delay={0.56}
      extra={<ellipse cx="272" cy="183" rx="34" ry="4.5" filter="url(#sa-cr-blur)" style={{ fill: v('sa-cr-shd'), fillOpacity: v('sa-post-shd-op') }} />}
    />
    {[248, 268, 288].map((x, i) => (
      <g key={x} className="sa-rise" style={d(0.38 + i * 0.08)}>
        <rect x={x - 4.25} y="52" width="8.5" height="129" rx="3.4" fill="url(#sa-cr-post)" strokeWidth="0.6" style={{ stroke: v('sa-cr-wood-edge'), strokeOpacity: v('sa-cr-wood-edge-op') }} />
        <rect x={x - 2.6} y="54" width="1.5" height="124" rx="0.75" fill="#FFFDF5" fillOpacity="0.38" />
        <rect x={x - 4.1} y="56.5" width="8.2" height="1.2" fill="#6B5434" fillOpacity="0.45" />
        <rect x={x - 4.25} y="168" width="8.5" height="13" rx="2" fill="url(#sa-cr-wood-b)" />
      </g>
    ))}
    {[247, 268.8].map((x, i) => (
      <g key={x} className="sa-fade" style={d(0.66 + i * 0.05)}>
        <rect x={x} y="48.4" width="20.2" height="3.2" rx="1.6" style={{ fill: v('sa-cr-bail-shd'), fillOpacity: 0.36 }} />
        <rect x={x} y="47" width="20.2" height="4" rx="2" fill="url(#sa-cr-bail)" strokeWidth="0.55" style={{ stroke: v('sa-cr-wood-edge'), strokeOpacity: v('sa-cr-wood-edge-op') }} />
        <rect x={x + 4.5} y="45.8" width="11.2" height="5.2" rx="2.4" fill="url(#sa-cr-bail)" strokeWidth="0.5" style={{ stroke: v('sa-cr-wood-edge'), strokeOpacity: v('sa-cr-wood-edge-op') }} />
        <line x1={x + 5.5} y1="47.2" x2={x + 14.5} y2="47.2" stroke="#FFFDF6" strokeOpacity="0.65" strokeWidth="0.8" strokeLinecap="round" />
      </g>
    ))}
    <BallStage p="sa-cr-" cx={168} cy={171} r={13.5}>
      <g transform="rotate(-20)">
        <path d="M-15 1.8 Q0 5.4 15 1.8" fill="none" stroke="#240504" strokeWidth="2.4" strokeOpacity="0.55" />
        <path d="M-15 0.6 Q0 4.2 15 0.6" fill="none" stroke="#9B231E" strokeWidth="1.9" />
        <path d="M-15 0.1 Q-2 3.3 9 2.2" fill="none" stroke="#E06254" strokeWidth="0.55" strokeOpacity="0.45" />
        <path d="M-15 0.6 Q0 4.2 15 0.6" fill="none" stroke="#3B0908" strokeWidth="0.65" />
        <path d="M-15 -0.8 Q0 2.8 15 -0.8" fill="none" stroke="#F6E8CE" strokeWidth="0.95" strokeDasharray="1.6 1.35" strokeLinecap="round" strokeOpacity="0.92" />
        <path d="M-15 2.0 Q0 5.6 15 2.0" fill="none" stroke="#E6D2B0" strokeWidth="0.85" strokeDasharray="1.6 1.35" strokeLinecap="round" strokeOpacity="0.72" />
      </g>
      <circle cx="-5.5" cy="-5.8" r="1.2" fill="#FFF8F4" fillOpacity="0.65" />
    </BallStage>
  </Scene>
)

const FU_STAGE: Stage = {
  p: 'sa-fu-', glowX: 50, line: [20, 380, 181], postStops: [0, 32, 74, 100], ballStops: [0, 42, 82, 100],
  hasShade: true, ringCx: 212, floorY: 172, blur: 2.6, r: 20
}

const Futsal: React.FC = () => (
  <Scene
    s={FU_STAGE}
    defs={
      <>
        <LG id="sa-fu-arc" c={[100, 181, 234, 198]} u s={[[0, v('sa-fu-arc0'), v('sa-fu-arc-op0')], [55, v('sa-fu-arc1'), v('sa-fu-arc-op1')], [100, v('sa-fu-arc0'), v('sa-fu-arc-op0')]]} />
        <LG id="sa-fu-net" c={[96, 78, 238, 178]} u s={[[0, v('sa-fu-net0'), v('sa-fu-net-op0')], [55, v('sa-fu-net1'), v('sa-fu-net-op1')], [100, v('sa-fu-net2'), v('sa-fu-net-op2')]]} />
        <LG id="sa-fu-bar" c={[94, 76, 94, 82]} u s={[[0, v('sa-fu-bar0')], [45, v('sa-fu-bar1')], [100, v('sa-fu-bar2')]]} />
        <LG id="sa-fu-panel" c={[0, 0, 1, 1]} s={[[0, v('sa-fu-panel0')], [55, v('sa-fu-panel1')], [100, v('sa-fu-panel2')]]} />
      </>
    }
  >
    <g className="sa-fade" style={d(0.06)}>
      <rect x="0" y="172" width="400" height="78" fill="url(#sa-fu-floor)" />
      <path d="M18 172H68L28 216H-32ZM108 172H158L138 216H80ZM198 172H248L256 216H196ZM288 172H338L372 216H310Z" fill="url(#sa-fu-tex)" />
      <rect x="0" y="164" width="400" height="20" fill="url(#sa-fu-hz)" />
    </g>
    <line className="sa-draw" style={d(0.24)} pathLength={1} x1="20" y1="181" x2="380" y2="181" stroke="url(#sa-fu-line)" strokeWidth="1.5" />
    <path className="sa-draw" style={d(0.34)} pathLength={1} d="M100 181 C124 198 210 198 234 181" fill="none" stroke="url(#sa-fu-arc)" strokeWidth="1.35" />
    <PostGround
      p="sa-fu-" xs={[96.2, 237.8]} y={180} w={4.5} delay={0.62}
      extra={<polygon points="96,180 116,166 226,166 238,180" style={{ fill: v('sa-fu-box'), fillOpacity: v('sa-fu-box-op') }} />}
    />
    <path className="sa-draw" style={{ ...d(0.34), stroke: v('sa-fu-rear') }} pathLength={1} d="M116 166V92H226V166M96 78L116 92M238 78L226 92M96 180L116 166H226L238 180" fill="none" strokeWidth="1.4" strokeLinejoin="round" />
    <path className="sa-draw" style={d(0.48)} pathLength={1} d="M116 107H226M116 122H226M116 137H226M116 152H226M134 92V166M152 92V166M171 92V166M190 92V166M208 92V166M96 100L116 107M96 120L116 122M96 140L116 137M96 160L116 152M106 85V173M238 100L226 107M238 120L226 122M238 140L226 137M238 160L226 152M232 85V173M122 78L134 92M148 78L152 92M174 78L171 92M200 78L190 92M222 78L208 92" fill="none" stroke="url(#sa-fu-net)" strokeWidth="0.85" />
    {[93.5, 235].map((x, i) => (
      <g key={x} className="sa-rise" style={d(0.4 + i * 0.08)}>
        <rect x={x} y="76" width="5.5" height="104.5" rx="2.2" fill="url(#sa-fu-post)" strokeWidth="0.8" style={{ stroke: v('sa-fu-frame-edge'), strokeOpacity: v('sa-fu-frame-edge-op') }} />
        <rect x={x + 1.2} y="78" width="1.2" height="101" rx="0.6" fill="#FFF" fillOpacity="0.6" />
      </g>
    ))}
    <path className="sa-draw" style={{ ...d(0.56), stroke: v('sa-fu-bar-shd'), strokeOpacity: v('sa-fu-bar-shd-op') }} pathLength={1} d="M97 80.5H239" fill="none" strokeWidth="5.4" strokeLinecap="round" />
    <path className="sa-draw" style={{ ...d(0.56), stroke: v('sa-fu-frame-edge'), strokeOpacity: v('sa-fu-frame-edge-op') }} pathLength={1} d="M96 78.5H238" fill="none" strokeWidth="6.8" strokeLinecap="round" />
    <path className="sa-draw" style={d(0.56)} pathLength={1} d="M96 78.5H238" fill="none" stroke="url(#sa-fu-bar)" strokeWidth="5.4" strokeLinecap="round" />
    <path className="sa-draw" style={d(0.62)} pathLength={1} d="M96.5 77H237.5" fill="none" stroke="#FFF" strokeOpacity="0.65" strokeWidth="1" strokeLinecap="round" />
    <BallStage p="sa-fu-" cx={282} cy={166} r={20}>
      <path d="M-1 -9.5 Q-1 -15 0 -21 M6.8 -3.8 Q13 -6.5 19.5 -7 M3.8 5.4 Q8.5 11.5 12 18.5 M-5.8 5.4 Q-10.5 11.5 -14 18 M-8.8 -3.8 Q-14.5 -6.5 -20.5 -5.8" fill="none" stroke="#5D718A" strokeWidth="0.95" strokeOpacity="0.72" />
      <path d="M-13 -16 Q-5.5 -12 5.5 -13 M14 -13.5 Q14 -2.5 11 7.5 M-14.5 11 Q-2.5 14.5 9.5 12 M-15.5 -11.5 Q-14.5 -0.5 -11.5 9" fill="none" stroke="#7B8FA8" strokeWidth="0.75" strokeOpacity="0.45" />
      <path d="M-1 -9.5 L6.8 -3.8 L3.8 5.4 L-5.8 5.4 L-8.8 -3.8 ZM-7 -21 H4 L6 -15.8 L-1 -14.2 L-8 -16.2 ZM16 -11.5 L22 -9.5 L21 -0.8 L15.5 -2.2 L13.5 -8.2 ZM9 13 L16 11 L19 18 L11 21 L7 18 ZM-16 11 L-9 13 L-11 20 L-18 18 ZM-21 -9.5 L-16 -10.5 L-15 -4.2 L-21 -1.2 Z" fill="url(#sa-fu-panel)" />
      <path d="M-1 -9.5 L6.8 -3.8" fill="none" stroke="#FFF" strokeOpacity="0.3" strokeWidth="0.65" />
      <circle cx="0" cy="0" r="20" fill="url(#sa-fu-shade)" />
    </BallStage>
  </Scene>
)

const VB_STAGE: Stage = {
  p: 'sa-vb-', glowX: 50, line: [20, 380, 193], postStops: [0, 28, 74, 100], ballStops: [0, 46, 86, 100],
  hasShade: true, ringCx: 200, floorY: 174, blur: 2.5, r: 18
}

const Volleyball: React.FC = () => (
  <Scene
    s={VB_STAGE}
    defs={
      <>
        <RG id="sa-vb-sheen" c={[184, 176, 145]} u s={[[0, v('sa-vb-sheen0'), v('sa-vb-sheen-op0')], [55, v('sa-vb-sheen1'), v('sa-vb-sheen-op1')], [100, v('sa-vb-fl2'), 0]]} />
        <LG id="sa-vb-tape" s={[[0, v('sa-vb-tape0')], [55, v('sa-vb-tape1')], [100, v('sa-vb-tape2')]]} />
        <LG id="sa-vb-net" c={[106, 62, 294, 124]} u s={[[0, v('sa-vb-net0'), v('sa-vb-net-op0')], [50, v('sa-vb-net1'), v('sa-vb-net-op1')], [100, v('sa-vb-net2'), v('sa-vb-net-op2')]]} />
        <LG id="sa-vb-blue" c={[0, 0, 1, 1]} s={[[0, v('sa-vb-blue0')], [52, v('sa-vb-blue1')], [100, v('sa-vb-blue2')]]} />
        <LG id="sa-vb-gold" c={[0, 0, 1, 1]} s={[[0, v('sa-vb-gold0')], [54, v('sa-vb-gold1')], [100, v('sa-vb-gold2')]]} />
      </>
    }
  >
    <g className="sa-fade" style={d(0.06)}>
      <rect x="0" y="174" width="400" height="76" fill="url(#sa-vb-floor)" />
      <path d="M0 178H400V182.5H0ZM0 187H400V192.5H0ZM0 198H400V204H0Z" fill="url(#sa-vb-tex)" />
      <path d="M0 183H400M0 193H400M0 204H400" strokeWidth="0.7" style={{ stroke: v('sa-vb-seam'), strokeOpacity: v('sa-vb-seam-op') }} />
      <rect x="0" y="174" width="400" height="42" fill="url(#sa-vb-sheen)" />
      <rect x="0" y="166" width="400" height="20" fill="url(#sa-vb-hz)" />
    </g>
    <line className="sa-draw" style={d(0.24)} pathLength={1} x1="20" y1="193" x2="380" y2="193" stroke="url(#sa-vb-line)" strokeWidth="1.5" />
    <PostGround p="sa-vb-" xs={[104, 296]} y={180} w={4.5} delay={0.56} />
    {[101, 293].map((x, i) => (
      <g key={x} className="sa-rise" style={d(0.32 + i * 0.08)}>
        <rect x={x} y="48" width="6" height="132.5" rx="2.5" fill="url(#sa-vb-post)" />
        <rect x={x + 1.3} y="50" width="1.2" height="128" rx="0.6" fill="#F5EBDC" fillOpacity="0.42" />
        <rect x={x - 1} y="176" width="8" height="4.5" rx="1.4" style={{ fill: v('sa-vb-collar') }} />
      </g>
    ))}
    <path className="sa-draw" style={d(0.46)} pathLength={1} d="M107 72H293M107 85H293M107 98H293M107 111H293M124 61V124M141 61V124M158 61V124M175 61V124M192 61V124M209 61V124M226 61V124M243 61V124M260 61V124M277 61V124" fill="none" stroke="url(#sa-vb-net)" strokeWidth="0.9" />
    <g className="sa-fade" style={d(0.52)}>
      <rect x="106.5" y="61" width="187" height="2" style={{ fill: v('sa-vb-tape-shd'), fillOpacity: v('sa-vb-tape-shd-op') }} />
      <rect x="106.5" y="54.5" width="187" height="6.8" rx="1.2" fill="url(#sa-vb-tape)" strokeWidth="0.8" style={{ stroke: v('sa-vb-tape-edge'), strokeOpacity: v('sa-vb-tape-edge-op') }} />
    </g>
    <line className="sa-draw" style={d(0.46)} pathLength={1} x1="106.5" y1="55.2" x2="293.5" y2="55.2" stroke="#FFFDF7" strokeOpacity="0.85" strokeWidth="1.2" />
    <line className="sa-draw" style={{ ...d(0.54), stroke: v('sa-vb-cord'), strokeOpacity: v('sa-vb-cord-op') }} pathLength={1} x1="107" y1="123.5" x2="293" y2="123.5" strokeWidth="1.8" />
    <BallStage p="sa-vb-" cx={200} cy={166} r={18}>
      <path d="M-21 -6 C-9 -16 7 -18 21 -10 L21 -2 C8 -9 -8 -7 -21 3 Z" fill="url(#sa-vb-blue)" />
      <path d="M-21 7 C-8 -1 8 1 21 8 L21 17 C8 10 -8 11 -21 20 Z" fill="url(#sa-vb-gold)" />
      <path d="M-21 -6 C-9 -16 7 -18 21 -10 M-21 3 C-8 -7 8 -9 21 -2 M-21 7 C-8 -1 8 1 21 8 M-6 -20 C-2 -11 -2 -2 -4 7 C-6 13 -10 18 -14 21 M8 -20 C11 -11 11 -1 8 8 C6 14 3 18 -1 21" fill="none" stroke="#362818" strokeOpacity="0.38" strokeWidth="0.9" />
      <path d="M-20 -5.2 C-9 -15 7 -17 20 -9.2 M-20 7.8 C-8 -0.2 8 1.8 20 8.8 M-5.2 -20 C-1.2 -11 -1.2 -2 -3.2 7" fill="none" stroke="#FFF9EB" strokeOpacity="0.34" strokeWidth="0.55" />
      <circle cx="0" cy="0" r="18" fill="url(#sa-vb-shade)" />
    </BallStage>
  </Scene>
)
