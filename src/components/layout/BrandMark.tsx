import React from 'react'

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
      {/* Organic tile with feathered edges and rotating blobs - identical in both themes */}
      <div
        className={`relative rounded-[22%] overflow-hidden bg-[#0A0D0A] shadow-[0_0_24px_rgba(4,117,84,0.18)] p-0.5 transform-gpu shrink-0 ${
          isSmall ? 'w-8 h-8' : 'w-[52px] h-[52px]'
        }`}
      >
        {/* Slow rotating blob container (14s) */}
        <div className="absolute inset-0 animate-blob-rotate origin-center pointer-events-none opacity-85">
          {/* Sage Dark blob */}
          <div className="absolute -top-3 -left-3 w-8 h-8 rounded-full bg-[#395F3D] blur-[7px] animate-blob-drift-a" />
          {/* Sage Mid blob */}
          <div className="absolute top-4 -right-2 w-9 h-9 rounded-full bg-[#047554] blur-[8px] animate-blob-drift-b" />
          {/* Sage Light blob */}
          <div className="absolute -bottom-2 left-2 w-7 h-7 rounded-full bg-[#CBD1CB] blur-[9px] opacity-40 animate-blob-drift-a" />
          {/* Very Dark Green blob */}
          <div className="absolute bottom-3 right-3 w-8 h-8 rounded-full bg-[#082215] blur-[6px]" />
        </div>

        {/* Crisp white F in Syne ExtraBold */}
        <div className="relative z-10 w-full h-full flex items-center justify-center">
          <span
            className={`font-syne font-extrabold text-white leading-none tracking-tight select-none ${
              isSmall ? 'text-base' : 'text-[27px]'
            }`}
          >
            F
          </span>
        </div>
      </div>

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
            className={`font-medium tracking-wider text-muted uppercase ${
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
