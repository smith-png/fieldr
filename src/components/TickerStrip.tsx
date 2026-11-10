import React from 'react'

interface TickerStripProps {
  items?: string[]
}

const DEFAULT_TICKER_TEXTS = [
  'LIVE PLAYER AUCTIONS - OFFICIAL TOURNAMENT SYSTEM',
  'DRAFT. BID. WIN. - REAL-TIME BIG SCREEN DISPLAY',
  'CRICKET / FUTSAL / VOLLEYBALL SQUADS',
  'BALANCED PURSES - LIVE AUDITED FRANCHISE LEDGER'
]

export const TickerStrip: React.FC<TickerStripProps> = ({ items }) => {
  const displayItems = items && items.length > 0 ? items : DEFAULT_TICKER_TEXTS
  const repeatedString = displayItems.join('   /   ')

  return (
    <div
      role="region"
      aria-label="Live season statistics ticker"
      className="w-full bg-[#111411] border-y border-[#395F3D]/30 py-3 overflow-hidden select-none"
    >
      <div className="flex animate-ticker whitespace-nowrap font-dot text-sm md:text-base tracking-widest text-[#CBD1CB]">
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
