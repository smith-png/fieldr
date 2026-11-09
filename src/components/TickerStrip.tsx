import React from 'react'
import type { Player, Season, Sport, Team } from '../lib/types'

interface TickerStripProps {
  season: Season | null
  sports: Sport[]
  teams: Team[]
  players: PlayersSummary
}

interface PlayersSummary {
  total: number
  available: number
  sold: number
}

export const TickerStrip: React.FC<TickerStripProps> = ({
  season,
  sports,
  teams,
  players
}) => {
  const sportNames = sports.map((s) => s.name).join(' / ')
  const totalPurse = teams.reduce((acc, t) => acc + (t.current_purse || 0), 0)

  const tickerItems = [
    `SEASON: ${season?.name ? season.name.toUpperCase() : 'DRGMC TOURNAMENT 2026'}`,
    `SPORTS: ${sportNames.toUpperCase() || 'CRICKET / FUTSAL / VOLLEYBALL'}`,
    `TEAMS REGISTERED: ${teams.length}`,
    `PLAYERS DRAFTED: ${players.sold} / ${players.total}`,
    `AVAILABLE POOL: ${players.available}`,
    `TOTAL PURSE CAPITAL: ${totalPurse.toLocaleString()} PTS`,
    'OFFICIAL AUCTION SYSTEM - DRGMC COLLEGE'
  ]

  const repeatedString = tickerItems.join('   /   ')

  return (
    <div
      role="region"
      aria-label="Live season statistics ticker"
      className="w-full bg-[#111411] border-y border-[#395F3D]/30 py-2.5 overflow-hidden select-none"
    >
      <div className="flex animate-ticker whitespace-nowrap font-dot text-xs md:text-sm tracking-widest text-[#CBD1CB]">
        <div className="flex items-center gap-10 pr-10">
          <span>{repeatedString}</span>
        </div>
        <div className="flex items-center gap-10 pr-10" aria-hidden="true">
          <span>{repeatedString}</span>
        </div>
      </div>
    </div>
  )
}
