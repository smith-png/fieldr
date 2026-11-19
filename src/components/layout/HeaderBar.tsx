import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BrandMark } from './BrandMark'
import { readCachedPublicHome } from '../../lib/data'
import { publicCache } from '../../lib/publicCache'
import { prefetchRoute } from '../../lib/queryCache'
import type { Season } from '../../types'

interface HeaderBarProps {
  onOpenMenu: () => void
}

type MenuListener = (open: boolean) => void
type SeasonListener = (state: { loaded: boolean; value: Season | null }) => void

const menuListeners = new Set<MenuListener>()
const seasonListeners = new Set<SeasonListener>()
let currentMenuOpen = false

let isCacheIntercepted = false
function ensureActiveSeasonInterceptor() {
  if (isCacheIntercepted) return
  isCacheIntercepted = true
  let internalState = publicCache.activeSeason
  try {
    Object.defineProperty(publicCache, 'activeSeason', {
      configurable: true,
      enumerable: true,
      get() {
        return internalState
      },
      set(next: { loaded: boolean; value: Season | null }) {
        internalState = next
        seasonListeners.forEach((fn) => fn(next))
      }
    })
  } catch {
    // fallback if defineProperty is restricted
  }
}

ensureActiveSeasonInterceptor()

export function notifyPublicMenuOpenChange(isOpen: boolean): void {
  currentMenuOpen = isOpen
  menuListeners.forEach((fn) => fn(isOpen))
}

export function notifyPublicActiveSeasonChange(season: Season | null): void {
  if (season) {
    seasonListeners.forEach((fn) => fn({ loaded: true, value: season }))
  }
}

function getInitialSeasonState(): { loaded: boolean; value: Season | null } {
  if (publicCache.activeSeason.loaded) {
    return publicCache.activeSeason
  }
  const cachedHome = readCachedPublicHome()
  if (cachedHome && cachedHome.activeSeason) {
    return { loaded: true, value: cachedHome.activeSeason }
  }
  return { loaded: false, value: null }
}

export const HeaderBar: React.FC<HeaderBarProps> = ({ onOpenMenu }) => {
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(currentMenuOpen)
  const [isScrolled, setIsScrolled] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.scrollY > 8 : false
  )
  const [seasonState, setSeasonState] = useState<{
    loaded: boolean
    value: Season | null
  }>(() => getInitialSeasonState())

  useEffect(() => {
    ensureActiveSeasonInterceptor()
    if (publicCache.activeSeason.loaded) {
      setSeasonState(publicCache.activeSeason)
    }

    const onMenuChange: MenuListener = (open) => setIsMenuOpen(open)
    const onSeasonChange: SeasonListener = (next) => setSeasonState(next)

    menuListeners.add(onMenuChange)
    seasonListeners.add(onSeasonChange)

    return () => {
      menuListeners.delete(onMenuChange)
      seasonListeners.delete(onSeasonChange)
    }
  }, [])

  useEffect(() => {
    let crossed = window.scrollY > 8
    setIsScrolled(crossed)

    const onScroll = () => {
      const next = window.scrollY > 8
      if (next !== crossed) {
        crossed = next
        setIsScrolled(next)
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
    }
  }, [])

  const handleOpenMenuClick = () => {
    notifyPublicMenuOpenChange(true)
    onOpenMenu()
  }

  const seasonName = seasonState.loaded ? seasonState.value?.name?.trim() || '' : ''

  return (
    <header
      className={`public-site-header sticky top-0 left-0 right-0 z-40 w-full border-b ${
        isScrolled ? 'public-site-header--scrolled border-border/60' : 'border-transparent'
      }`}
    >
      <style>{`
        .public-site-header {
          padding-top: env(safe-area-inset-top, 0px);
          background-color: transparent;
          backdrop-filter: none;
          -webkit-backdrop-filter: none;
          transition: background-color 200ms ease, border-color 200ms ease, opacity 200ms ease;
        }
        .public-site-header.public-site-header--scrolled {
          background-color: color-mix(in srgb, var(--bg) 92%, transparent);
          backdrop-filter: none;
          -webkit-backdrop-filter: none;
        }
        @supports ((backdrop-filter: blur(14px)) or (-webkit-backdrop-filter: blur(14px))) {
          .public-site-header.public-site-header--scrolled {
            background-color: color-mix(in srgb, var(--bg) 65%, transparent);
            backdrop-filter: blur(14px) saturate(140%);
            -webkit-backdrop-filter: blur(14px) saturate(140%);
          }
        }
        @media (prefers-reduced-transparency: reduce) {
          .public-site-header.public-site-header--scrolled {
            background-color: color-mix(in srgb, var(--bg) 92%, transparent);
            backdrop-filter: none;
            -webkit-backdrop-filter: none;
          }
        }
      `}</style>
      <div className="max-w-7xl mx-auto w-full h-16 px-6 md:px-16 lg:px-24 flex items-center justify-between gap-4">
        <Link
          to="/"
          onMouseEnter={() => prefetchRoute('/')}
          onFocus={() => prefetchRoute('/')}
          onTouchStart={() => prefetchRoute('/')}
          className="group inline-flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright rounded-xl shrink-0"
        >
          <BrandMark showWordmark={false} size="sm" />
          <div className="flex flex-col text-left">
            <span className="font-syne font-extrabold text-base sm:text-lg tracking-tight text-text leading-none group-hover:text-accent-bright transition-colors">
              Fieldr
            </span>
            <span className="font-sans font-normal text-[9px] tracking-[0.22em] text-muted uppercase mt-1 leading-none">
              AUCTIONS
            </span>
          </div>
        </Link>

        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
          {seasonName ? (
            <div className="hidden min-[400px]:inline-flex items-center gap-2 h-8 px-3.5 rounded-full bg-surface border border-border/80 font-sans text-[11px] font-medium uppercase tracking-[0.18em] text-text max-w-[180px] sm:max-w-[240px]">
              <span
                aria-hidden="true"
                className="w-1.5 h-1.5 rounded-full bg-accent shrink-0"
              />
              <span className="truncate">{seasonName}</span>
            </div>
          ) : null}

          <button
            id="public-menu-trigger-button"
            type="button"
            onClick={handleOpenMenuClick}
            aria-label="Open menu"
            aria-expanded={isMenuOpen}
            aria-controls="public-navigation-sheet"
            className="inline-flex items-center justify-center gap-2.5 h-9 px-4 rounded-full bg-surface hover:bg-surface-2 border border-border font-sans text-[11px] font-medium uppercase tracking-[0.2em] text-text transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright shrink-0"
          >
            <span>Menu</span>
            <span
              aria-hidden="true"
              className="w-1.5 h-1.5 rounded-full bg-accent shrink-0"
            />
          </button>
        </div>
      </div>
    </header>
  )
}

