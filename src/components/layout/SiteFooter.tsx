import React from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/AuthContext'
import { prefetchRoute } from '../../lib/queryCache'
import FooterMark from './FooterMark'

const FOOTER_GROUP_HEADING =
  'font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-muted'

const FOOTER_PILL_CLASS =
  'inline-flex items-center justify-center min-h-[48px] px-5 py-2.5 rounded-full bg-surface/75 dark:bg-white/[0.05] backdrop-blur-md backdrop-saturate-150 border border-border/90 text-sm font-medium text-text whitespace-nowrap touch-manipulation select-none transition-[background-color,border-color,color,transform,box-shadow] duration-150 motion-reduce:transition-none hover:bg-surface dark:hover:bg-white/[0.10] hover:border-accent-bright/60 hover:text-accent-bright dark:hover:text-white hover:shadow-sm active:scale-[0.97] active:bg-surface-2 dark:active:bg-white/[0.14] motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright focus-visible:ring-offset-2 focus-visible:ring-offset-[#F1F1F2] dark:focus-visible:ring-offset-[#171817] cursor-pointer'

export const SiteFooter: React.FC = () => {
  const { user, logout } = useAuth()
  const isOwner = user?.role === 'owner'

  return (
    <footer className="border-t border-border py-12 px-6 md:px-16 lg:px-24 bg-[#F1F1F2] dark:bg-[#171817] text-muted">
      <div className="max-w-7xl mx-auto flex flex-col gap-8">
        <div className="flex items-center gap-4">
          <FooterMark size={44} />
          <div>
            <div className="font-syne font-extrabold text-xl text-text tracking-tight">
              Fieldr
            </div>
            <p className="text-xs text-muted mt-1">
              Real-time athletic player auctions and squad management.
            </p>
          </div>
        </div>

        <nav
          aria-label="Footer links"
          className="grid grid-cols-2 gap-x-5 gap-y-7 lg:flex lg:flex-row lg:items-start lg:justify-between lg:gap-10"
        >
          <div aria-labelledby="footer-group-explore" className="space-y-3 min-w-0">
            <h2 id="footer-group-explore" className={FOOTER_GROUP_HEADING}>
              Explore
            </h2>
            <ul className="flex flex-wrap gap-2.5 sm:gap-3">
              <li>
                <Link
                  to="/rosters"
                  onMouseEnter={() => prefetchRoute('/rosters')}
                  onFocus={() => prefetchRoute('/rosters')}
                  onTouchStart={() => prefetchRoute('/rosters')}
                  className={FOOTER_PILL_CLASS}
                >
                  Rosters
                </Link>
              </li>
              <li>
                <Link
                  to="/teams"
                  onMouseEnter={() => prefetchRoute('/teams')}
                  onFocus={() => prefetchRoute('/teams')}
                  onTouchStart={() => prefetchRoute('/teams')}
                  className={FOOTER_PILL_CLASS}
                >
                  Teams
                </Link>
              </li>
              <li>
                <Link
                  to="/results"
                  onMouseEnter={() => prefetchRoute('/results')}
                  onFocus={() => prefetchRoute('/results')}
                  onTouchStart={() => prefetchRoute('/results')}
                  className={FOOTER_PILL_CLASS}
                >
                  Results
                </Link>
              </li>
            </ul>
          </div>

          <div aria-labelledby="footer-group-auction" className="space-y-3 min-w-0">
            <h2 id="footer-group-auction" className={FOOTER_GROUP_HEADING}>
              Auction
            </h2>
            <ul className="flex flex-wrap gap-2.5 sm:gap-3">
              <li>
                <Link
                  to="/rules"
                  onMouseEnter={() => prefetchRoute('/rules')}
                  onFocus={() => prefetchRoute('/rules')}
                  onTouchStart={() => prefetchRoute('/rules')}
                  className={FOOTER_PILL_CLASS}
                >
                  Auction Rules
                </Link>
              </li>
            </ul>
          </div>

          <div
            aria-labelledby="footer-group-info"
            className="space-y-3 min-w-0 col-span-2 lg:col-span-1"
          >
            <h2 id="footer-group-info" className={FOOTER_GROUP_HEADING}>
              Info
            </h2>
            <ul className="flex flex-wrap gap-2.5 sm:gap-3">
              <li>
                <Link
                  to="/help"
                  onMouseEnter={() => prefetchRoute('/help')}
                  onFocus={() => prefetchRoute('/help')}
                  onTouchStart={() => prefetchRoute('/help')}
                  className={FOOTER_PILL_CLASS}
                >
                  Help
                </Link>
              </li>
              <li>
                <Link
                  to="/about"
                  onMouseEnter={() => prefetchRoute('/about')}
                  onFocus={() => prefetchRoute('/about')}
                  onTouchStart={() => prefetchRoute('/about')}
                  className={FOOTER_PILL_CLASS}
                >
                  About
                </Link>
              </li>
              <li>
                {isOwner ? (
                  <button
                    type="button"
                    onClick={() => logout()}
                    className={FOOTER_PILL_CLASS}
                  >
                    Sign out
                  </button>
                ) : (
                  <Link
                    to="/owner-login"
                    onMouseEnter={() => prefetchRoute('/owner-login')}
                    onFocus={() => prefetchRoute('/owner-login')}
                    onTouchStart={() => prefetchRoute('/owner-login')}
                    className={FOOTER_PILL_CLASS}
                  >
                    Owner login
                  </Link>
                )}
              </li>
            </ul>
          </div>
        </nav>
      </div>
    </footer>
  )
}
