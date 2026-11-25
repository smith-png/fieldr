import React from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowUpRight,
  BookOpen,
  FilmSlate,
  ListChecks,
  Trophy,
  UserPlus,
  type Icon
} from '@phosphor-icons/react'
import { prefetchRoute } from '../../lib/queryCache'

interface QuickLinkItem {
  title: string
  description: string
  path: string
  icon: Icon
  span: string
}

// Always shown. Each destination page handles its own locked or closed state.
const QUICK_LINKS: QuickLinkItem[] = [
  {
    title: 'Results',
    description: 'Auction results',
    path: '/results',
    icon: Trophy,
    span: 'md:col-span-2 lg:col-span-1'
  },
  {
    title: 'Register',
    description: 'Player registration',
    path: '/register',
    icon: UserPlus,
    span: 'md:col-span-2 lg:col-span-1'
  },
  {
    title: 'Rules',
    description: 'Auction rules',
    path: '/rules',
    icon: ListChecks,
    span: 'md:col-span-2 lg:col-span-1'
  },
  {
    title: 'Handbook',
    description: 'Official handbook',
    path: '/handbook',
    icon: BookOpen,
    span: 'md:col-span-3 lg:col-span-1'
  },
  {
    title: 'Reels',
    description: 'Reels and submissions',
    path: '/reels',
    icon: FilmSlate,
    span: 'col-span-2 md:col-span-3 lg:col-span-1'
  }
]

export const QuickLinks: React.FC = () => (
  <section
    id="quick-links-section"
    aria-labelledby="quick-links-heading"
    className="w-full max-w-7xl mx-auto px-6 md:px-16 lg:px-24 pb-16 md:pb-24"
  >
    <div className="pub-rule flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8 pb-5">
      <div>
        <span className="block font-dot text-[11px] sm:text-xs uppercase tracking-[0.18em] text-accent-bright mb-1.5">
          JUMP STRAIGHT IN
        </span>
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-xs tabular-nums text-muted select-none">02</span>
          <h2
            id="quick-links-heading"
            className="font-syne font-extrabold text-3xl sm:text-4xl text-text tracking-tight"
          >
            Quick links
          </h2>
        </div>
      </div>
    </div>

    <div className="grid grid-cols-2 md:grid-cols-6 lg:grid-cols-5 gap-3 md:gap-4">
      {QUICK_LINKS.map((item) => {
        const IconComponent = item.icon
        return (
          <Link
            key={item.path}
            to={item.path}
            onMouseEnter={() => prefetchRoute(item.path)}
            onFocus={() => prefetchRoute(item.path)}
            onTouchStart={() => prefetchRoute(item.path)}
            className={`${item.span} pub-card-lift group flex flex-col justify-between gap-6 min-h-[132px] bg-surface border border-border rounded-2xl p-4 md:p-5 hover:border-accent-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright`}
          >
            <div className="flex items-center justify-between gap-3">
              <IconComponent
                size={22}
                weight="regular"
                aria-hidden="true"
                className="text-accent-bright"
              />
              <ArrowUpRight
                size={16}
                weight="bold"
                aria-hidden="true"
                className="text-muted group-hover:text-accent-bright group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-[transform,color] duration-150 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0 motion-reduce:group-hover:translate-y-0"
              />
            </div>
            <div className="min-w-0">
              <h3 className="font-syne font-bold text-lg md:text-xl text-text group-hover:text-accent-bright transition-colors tracking-tight leading-tight">
                {item.title}
              </h3>
              <p className="font-sans text-xs text-muted mt-1">{item.description}</p>
            </div>
          </Link>
        )
      })}
    </div>
  </section>
)
