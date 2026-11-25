import React, { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { BrandMark } from './BrandMark'
import { prefetchRoute } from '../../lib/queryCache'

interface HeaderBarProps {
  onOpenMenu: () => void
}

export const HeaderBar: React.FC<HeaderBarProps> = ({ onOpenMenu }) => {
  const { pathname } = useLocation()
  const [isScrolled, setIsScrolled] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.scrollY > 8 : false
  )

  useEffect(() => {
    let crossed = window.scrollY > 8
    setIsScrolled(crossed)
    let rafId: number | null = null

    const evaluate = () => {
      rafId = null
      const y = window.scrollY
      const next = crossed ? y >= 4 : y > 8
      if (next !== crossed) {
        crossed = next
        setIsScrolled(next)
      }
    }

    const onScroll = () => {
      if (rafId === null) {
        rafId = window.requestAnimationFrame(evaluate)
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId)
      }
    }
  }, [])

  return (
    <header
      className={`public-site-header sticky top-0 left-0 right-0 z-40 w-full ${
        isScrolled ? 'public-site-header--scrolled' : ''
      }`}
    >
      <style>{`
        .public-site-header {
          padding-top: env(safe-area-inset-top, 0px);
        }
        .public-site-header__backdrop {
          opacity: 0;
          transition: opacity 200ms ease;
          will-change: opacity;
        }
        .public-site-header--scrolled .public-site-header__backdrop {
          opacity: 1;
        }
        @media (prefers-reduced-motion: reduce) {
          .public-site-header__backdrop {
            transition: none;
          }
        }
      `}</style>
      <div
        aria-hidden="true"
        className="public-site-header__backdrop frost absolute inset-0 z-0 pointer-events-none border-b border-border/60"
      />
      <div className="relative z-10 max-w-7xl mx-auto w-full h-16 px-6 md:px-16 lg:px-24 flex items-center justify-between gap-4">
        <Link
          to="/"
          aria-label="Fieldr home"
          onClick={() => {
            if (pathname === '/') {
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }
          }}
          onMouseEnter={() => prefetchRoute('/')}
          onFocus={() => prefetchRoute('/')}
          onTouchStart={() => prefetchRoute('/')}
          className="group inline-flex items-center gap-3 shrink-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright rounded-lg"
        >
          <BrandMark showWordmark={false} size="sm" />
          <span className="flex flex-col">
            <span className="font-syne font-extrabold syne-display text-base sm:text-lg tracking-tight text-text leading-none group-hover:text-accent-bright transition-colors">
              Fieldr
            </span>
            <span className="font-sans font-normal text-[9px] tracking-[0.22em] text-muted uppercase mt-1 leading-none">
              AUCTIONS
            </span>
          </span>
        </Link>

        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Open menu"
          aria-haspopup="dialog"
          className="hit-44 relative inline-flex items-center justify-center h-9 px-4 rounded-full bg-surface/70 hover:bg-surface-2 border border-border/80 font-sans text-[11px] font-medium uppercase tracking-[0.18em] text-text transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright shrink-0"
        >
          Menu
        </button>
      </div>
    </header>
  )
}

