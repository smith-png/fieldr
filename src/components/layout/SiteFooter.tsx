import React from 'react'
import { Link } from 'react-router-dom'
import { prefetchRoute } from '../../lib/queryCache'
import FooterMark from './FooterMark'

const FOOTER_GROUP_HEADING =
  'font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-muted'

const FOOTER_PILL_CLASS =
  'inline-flex items-center justify-center min-h-[40px] px-4 py-1.5 rounded-full bg-surface/75 dark:bg-white/[0.05] backdrop-blur-md backdrop-saturate-150 border border-border/90 text-[13px] font-medium text-text whitespace-nowrap touch-manipulation select-none transition-[background-color,border-color,color,transform,box-shadow] duration-150 motion-reduce:transition-none hover:bg-surface dark:hover:bg-white/[0.10] hover:border-accent-bright/60 hover:text-accent-bright dark:hover:text-white hover:shadow-sm active:scale-[0.97] active:bg-surface-2 dark:active:bg-white/[0.14] motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright focus-visible:ring-offset-2 focus-visible:ring-offset-[#F1F1F2] dark:focus-visible:ring-offset-[#171817] cursor-pointer'

export const SiteFooter: React.FC = () => {
  return (
    <footer className="border-t border-border py-12 px-6 md:px-16 lg:px-24 bg-[#F1F1F2] dark:bg-[#171817] text-muted">
      <div className="max-w-7xl mx-auto flex flex-col gap-8">
        <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <FooterMark size={44} />
            <div>
              <div className="font-syne font-extrabold syne-display text-xl text-text tracking-tight">
                Fieldr
              </div>
              <p className="text-xs text-muted mt-1">
                Real-time athletic player auctions and squad management.
              </p>
            </div>
          </div>

          <nav aria-label="Footer links">
            <div aria-labelledby="footer-group-info" className="space-y-3 min-w-0">
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
                  <Link
                    to="/login"
                    onMouseEnter={() => prefetchRoute('/login')}
                    onFocus={() => prefetchRoute('/login')}
                    onTouchStart={() => prefetchRoute('/login')}
                    className={FOOTER_PILL_CLASS}
                  >
                    Admin login
                  </Link>
                </li>
              </ul>
            </div>
          </nav>
        </div>

        <p className="font-dot text-[11px] sm:text-xs uppercase tracking-[0.14em] text-accent-bright">
          &copy; Smit Bhute 2026
        </p>
      </div>
    </footer>
  )
}
