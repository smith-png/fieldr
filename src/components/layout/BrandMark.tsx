import React from 'react'
import FooterMark from './FooterMark'

interface BrandMarkProps {
  onClick?: () => void
  showWordmark?: boolean
  size?: 'sm' | 'md'
  className?: string
}

export const BrandMark: React.FC<BrandMarkProps> = ({
  onClick,
  showWordmark = true,
  size = 'md',
  className = ''
}) => {
  const isSmall = size === 'sm'

  const content = (
    <>
      <FooterMark size={isSmall ? 32 : 52} eggEnabled={false} />

      {showWordmark && (
        <div className="flex flex-col text-left">
          <span
            className={`font-syne font-extrabold tracking-tight text-text leading-none transition-colors ${
              isSmall ? 'text-sm' : 'text-[21px] group-hover:text-accent-bright'
            }`}
          >
            Fieldr
          </span>
          <span
            className={`font-normal tracking-wider text-muted uppercase ${
              isSmall ? 'text-[9px] mt-0.5' : 'text-[11px] mt-1'
            }`}
          >
            Auctions
          </span>
        </div>
      )}
    </>
  )

  if (!onClick) {
    return (
      <div className={`inline-flex items-center ${isSmall ? 'gap-2.5' : 'gap-3.5'} ${className}`}>
        {content}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Open menu"
      className={`group relative flex items-center ${
        isSmall ? 'gap-2.5' : 'gap-3.5'
      } text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright rounded-2xl transition-transform active:scale-95 ${className}`}
    >
      {content}
    </button>
  )
}
