import React from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/AuthContext'

export const SiteFooter: React.FC = () => {
  const { user, logout } = useAuth()
  const isOwner = user?.role === 'owner'

  return (
    <footer className="border-t border-border py-12 px-6 md:px-16 lg:px-24 bg-[#F1F1F2] dark:bg-[#171817] text-muted">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div>
          <div className="font-syne font-extrabold text-xl text-text tracking-tight">
            Fieldr
          </div>
          <p className="text-xs text-muted mt-1">
            Real-time athletic player auctions and squad management.
          </p>
        </div>

        <nav aria-label="Footer links" className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-medium">
          <Link
            to="/rosters"
            className="hover:text-text transition-colors"
          >
            Rosters
          </Link>
          <span className="text-border">·</span>
          <Link
            to="/teams"
            className="hover:text-text transition-colors"
          >
            Teams
          </Link>
          <span className="text-border">·</span>
          <Link
            to="/rules"
            className="hover:text-text transition-colors"
          >
            Auction Rules
          </Link>
          <span className="text-border">·</span>
          <Link
            to="/help"
            className="hover:text-text transition-colors"
          >
            Help
          </Link>
          <span className="text-border">·</span>
          <Link
            to="/about"
            className="hover:text-text transition-colors"
          >
            About
          </Link>
          <span className="text-border">·</span>
          {isOwner ? (
            <button
              type="button"
              onClick={() => logout()}
              className="hover:text-text transition-colors cursor-pointer"
            >
              Sign out
            </button>
          ) : (
            <Link
              to="/owner-login"
              className="hover:text-text transition-colors"
            >
              Owner login
            </Link>
          )}
        </nav>
      </div>
    </footer>
  )
}
