import React from 'react'

interface BrandMarkProps {
  onClick?: () => void
  showWordmark?: boolean
  className?: string
}

export const BrandMark: React.FC<BrandMarkProps> = ({
  onClick,
  showWordmark = true,
  className = ''
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Open menu"
      className={`group relative flex items-center gap-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#047554] rounded-2xl transition-transform active:scale-95 ${className}`}
    >
      {/* 52px organic tile with feathered edges and rotating blobs */}
      <div className="relative w-[52px] h-[52px] rounded-[22%] overflow-hidden bg-[#0A0D0A] shadow-[0_0_24px_rgba(4,117,84,0.18)] p-0.5 transform-gpu">
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
          <span className="font-syne font-extrabold text-[27px] text-white leading-none tracking-tight select-none">
            F
          </span>
        </div>
      </div>

      {showWordmark && (
        <div className="flex flex-col">
          <span className="font-syne font-extrabold text-[21px] tracking-tight text-[#F0F2EE] leading-none group-hover:text-white transition-colors">
            Fieldr
          </span>
          <span className="text-[11px] font-medium tracking-wider text-[#8E928C] uppercase mt-1">
            DRGMC
          </span>
        </div>
      )}
    </button>
  )
}
