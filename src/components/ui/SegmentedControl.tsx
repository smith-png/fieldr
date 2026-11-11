import React, { useRef } from 'react'
import type { Icon } from '@phosphor-icons/react'

export interface SegmentedControlOption<T extends string> {
  value: T
  label: string
  icon?: Icon
  badge?: number | string
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentedControlOption<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel?: string
  className?: string
  size?: 'sm' | 'md'
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel = 'Options',
  className = '',
  size = 'md'
}: SegmentedControlProps<T>) {
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([])

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    let nextIndex = -1
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      nextIndex = (index + 1) % options.length
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      nextIndex = (index - 1 + options.length) % options.length
    }

    if (nextIndex !== -1) {
      onChange(options[nextIndex].value)
      buttonRefs.current[nextIndex]?.focus()
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`inline-flex items-center p-1 bg-surface-2 border border-border rounded-xl gap-1 ${className}`}
    >
      {options.map((opt, idx) => {
        const isSelected = value === opt.value
        const IconComponent = opt.icon

        return (
          <button
            key={opt.value}
            ref={(el) => {
              buttonRefs.current[idx] = el
            }}
            type="button"
            role="radio"
            aria-checked={isSelected}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            className={`min-h-[36px] px-3.5 py-1.5 rounded-lg flex items-center gap-2 text-xs font-sans tracking-normal leading-normal transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright ${
              size === 'sm' ? 'text-[11px] py-1 px-2.5 min-h-[30px]' : ''
            } ${
              isSelected
                ? 'bg-surface text-text font-medium border border-border shadow-sm'
                : 'text-muted font-normal hover:text-text hover:bg-surface/50 border border-transparent'
            }`}
          >
            {IconComponent && <IconComponent size={size === 'sm' ? 14 : 16} weight="regular" />}
            <span>{opt.label}</span>
            {opt.badge !== undefined && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono font-normal bg-surface-2 text-muted">
                {opt.badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
