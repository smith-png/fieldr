import React from 'react'
import { CaretLeft, CaretRight } from '@phosphor-icons/react'

export interface PaginationProps {
  currentPage: number
  totalPages: number
  totalCount?: number
  pageSize?: number
  onPageChange: (page: number) => void
  isLoading?: boolean
  className?: string
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  totalCount,
  pageSize,
  onPageChange,
  isLoading = false,
  className = ''
}) => {
  const safeTotalPages = Math.max(1, totalPages)
  const canPrev = currentPage > 1 && !isLoading
  const canNext = currentPage < safeTotalPages && !isLoading

  return (
    <div
      className={`flex items-center justify-between text-xs text-muted font-mono ${className}`}
    >
      <div>
        {totalCount !== undefined && pageSize !== undefined ? (
          <span>
            Showing{' '}
            <span className="text-text font-bold">
              {totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1}
            </span>
            -
            <span className="text-text font-bold">
              {Math.min(currentPage * pageSize, totalCount)}
            </span>{' '}
            of <span className="text-text font-bold">{totalCount}</span>
          </span>
        ) : (
          totalCount !== undefined && (
            <span>
              Total: <span className="text-text font-bold">{totalCount}</span>
            </span>
          )
        )}
      </div>

      <div className="flex items-center gap-3">
        <span className="text-[11px]">
          Page <span className="text-text font-bold">{currentPage}</span> of{' '}
          <span className="text-text font-bold">{safeTotalPages}</span>
        </span>

        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={!canPrev}
            onClick={() => onPageChange(currentPage - 1)}
            aria-label="Previous page"
            className="p-1.5 rounded-lg border border-border text-text disabled:opacity-30 disabled:pointer-events-none hover:bg-surface-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright"
          >
            <CaretLeft size={14} weight="bold" />
          </button>
          <button
            type="button"
            disabled={!canNext}
            onClick={() => onPageChange(currentPage + 1)}
            aria-label="Next page"
            className="p-1.5 rounded-lg border border-border text-text disabled:opacity-30 disabled:pointer-events-none hover:bg-surface-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright"
          >
            <CaretRight size={14} weight="bold" />
          </button>
        </div>
      </div>
    </div>
  )
}
