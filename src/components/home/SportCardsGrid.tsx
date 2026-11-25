import React from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight } from '@phosphor-icons/react'
import { SPORTS, type SportSlug } from '../../lib/sports'
import { prefetchRoute } from '../../lib/queryCache'
import type { Sport } from '../../types'
import { SportArt, useInViewOnce } from './SportArt'

interface SportCardsGridProps {
  playerCounts: Record<SportSlug, number>
  sports?: Sport[]
  countsLoaded?: boolean
}

interface SportCardProps {
  slug: SportSlug
  label: string
  index: number
  count: number
  countsLoaded: boolean
}

const SportCard: React.FC<SportCardProps> = ({ slug, label, index, count, countsLoaded }) => {
  const [ref, seen] = useInViewOnce<HTMLAnchorElement>(0.3)
  const indexLabel = String(index + 1).padStart(2, '0')
  const delay = index * 0.12

  return (
    <Link
      ref={ref}
      to={`/rosters/${slug}`}
      onMouseEnter={() => prefetchRoute(`/rosters/${slug}`)}
      onFocus={() => prefetchRoute(`/rosters/${slug}`)}
      onTouchStart={() => prefetchRoute(`/rosters/${slug}`)}
      style={{ ['--sa-base' as string]: `${delay}s` } as React.CSSProperties}
      className={`sa-card ${
        seen ? 'sa-card-play' : ''
      } group relative flex flex-col justify-between bg-surface dark:bg-[#0a0a0c] border border-border rounded-2xl p-4 md:p-7 hover:border-accent-bright transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright overflow-hidden`}
    >
      {/* Illustration + themed bottom gradient for legible text */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <SportArt slug={slug} play={seen} delay={delay} className="w-full h-full block" />
        <div aria-hidden="true" className="sa-card-scrim absolute inset-0" />
      </div>

      <div className="flex items-center justify-between gap-4 z-10">
        <span className="inline-flex items-center justify-center px-3 py-1 rounded-full bg-surface/80 dark:bg-black/45 border border-border dark:border-white/15 font-mono text-xs font-medium text-text dark:text-zinc-200 tabular-nums">
          {indexLabel}
        </span>
        <div className="w-9 h-9 rounded-full bg-surface/80 dark:bg-black/45 border border-border dark:border-white/15 flex items-center justify-center text-text dark:text-zinc-200 group-hover:text-accent-bright dark:group-hover:text-white group-hover:border-accent-bright transition-colors shrink-0">
          <ArrowUpRight size={18} weight="bold" />
        </div>
      </div>

      {/* Height spacer: compact on phones, a little taller from md up */}
      <div aria-hidden="true" className="h-16 md:my-4 md:h-40 pointer-events-none" />

      <div className="relative z-10">
        <div className="sa-line absolute top-0 left-0 right-0 h-px bg-text/15 dark:bg-white/15" />
        <div className="pt-3 md:pt-4 flex items-baseline justify-between gap-4 min-h-[2.75rem] md:min-h-[3rem]">
          <h3 className="sa-text font-syne font-bold text-xl md:text-2xl text-text dark:text-white group-hover:text-accent-bright transition-colors tracking-tight">
            {label}
          </h3>
          {countsLoaded && (
            <div className="sa-text flex items-baseline gap-1.5 shrink-0">
              <span className="font-mono font-semibold text-sm text-text dark:text-white tabular-nums">{count}</span>
              <span className="font-sans text-xs text-muted dark:text-zinc-300">athletes</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}

export const SportCardsGrid: React.FC<SportCardsGridProps> = ({
  playerCounts,
  countsLoaded = true
}) => {
  return (
    <section
      id="rosters-section"
      className="w-full max-w-7xl mx-auto px-6 md:px-16 lg:px-24 py-16 md:py-24"
    >
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10 pb-5 border-b border-border/60">
        <div>
          <span className="font-sans text-[11px] sm:text-xs font-medium uppercase tracking-[0.2em] text-accent block mb-2">
            TOURNAMENT SQUADS
          </span>
          <h2 className="font-syne font-extrabold text-3xl sm:text-4xl text-text tracking-tight">
            Explore
          </h2>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8">
        {SPORTS.map((sport, index) => (
          <SportCard
            key={sport.slug}
            slug={sport.slug as SportSlug}
            label={sport.label}
            index={index}
            count={playerCounts[sport.slug as SportSlug] ?? 0}
            countsLoaded={countsLoaded}
          />
        ))}
      </div>
    </section>
  )
}
