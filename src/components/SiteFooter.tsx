import React from 'react'
import { Link } from 'react-router-dom'

export const SiteFooter: React.FC = () => {
  return (
    <footer className="border-t border-white/10 py-12 px-6 md:px-16 lg:px-24 bg-[#0B0B0B] text-[#8E928C]">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div>
          <div className="font-syne font-extrabold text-xl text-white tracking-tight">
            Fieldr
          </div>
          <p className="text-xs text-[#8E928C] mt-1">
            Real-time athletic player auctions and squad management.
          </p>
        </div>

        <nav aria-label="Footer links" className="flex items-center gap-6 text-xs font-medium">
          <Link
            to="/rosters"
            className="hover:text-white transition-colors"
          >
            Rosters
          </Link>
          <span className="text-white/20">·</span>
          <Link
            to="/teams"
            className="hover:text-white transition-colors"
          >
            Teams
          </Link>
          <span className="text-white/20">·</span>
          <Link
            to="/season"
            className="hover:text-white transition-colors"
          >
            Season
          </Link>
          <span className="text-white/20">·</span>
          <Link
            to="/help"
            className="hover:text-white transition-colors"
          >
            Help
          </Link>
          <span className="text-white/20">·</span>
          <Link
            to="/about"
            className="hover:text-white transition-colors"
          >
            About
          </Link>
        </nav>
      </div>
    </footer>
  )
}
