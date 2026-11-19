import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BrandMark } from './BrandMark'
import { prefetchRoute } from '../../lib/queryCache'

interface HeaderBarProps {
  onOpenMenu: () => void
}

export const HeaderBar: React.FC<HeaderBarProps> = ({ onOpenMenu }) => {
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
        <div className="inline-flex items-center gap-3 shrink-0">
          <BrandMark onClick={onOpenMenu} showWordmark={false} size="sm" />
          <Link
            to="/"
            onMouseEnter={() => prefetchRoute('/')}
            onFocus={() => prefetchRoute('/')}
            onTouchStart={() => prefetchRoute('/')}
            className="group flex flex-col text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright rounded-lg"
          >
            <span className="font-syne font-extrabold text-base sm:text-lg tracking-tight text-text leading-none group-hover:text-accent-bright transition-colors">
              Fieldr
            </span>
            <span className="font-sans font-normal text-[9px] tracking-[0.22em] text-muted uppercase mt-1 leading-none">
              AUCTIONS
            </span>
          </Link>
        </div>
      </div>
    </header>
  )
}

