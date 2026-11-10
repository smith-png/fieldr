import React, { useEffect, useRef } from 'react'
import { X } from '@phosphor-icons/react'

export interface DialogProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  description?: string
  children: React.ReactNode
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl'
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl'
  className?: string
  showCloseButton?: boolean
}

const maxWidthMap = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl'
}

export const Dialog: React.FC<DialogProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  maxWidth,
  size = 'md',
  className = '',
  showCloseButton = true
}) => {
  const effectiveWidth = maxWidth || size
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'dialog-title' : undefined}
      aria-describedby={description ? 'dialog-description' : undefined}
      className="fixed inset-0 z-50 bg-scrim flex items-center justify-center p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      <div
        ref={dialogRef}
        className={`bg-surface border border-border rounded-2xl p-6 shadow-2xl w-full ${maxWidthMap[effectiveWidth]} max-h-[90vh] overflow-y-auto my-auto ${className}`}
      >
        {(title || showCloseButton) && (
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              {title && (
                <h3
                  id="dialog-title"
                  className="text-lg font-bold text-text tracking-tight"
                >
                  {title}
                </h3>
              )}
              {description && (
                <p
                  id="dialog-description"
                  className="text-xs text-muted mt-1 leading-relaxed"
                >
                  {description}
                </p>
              )}
            </div>
            {showCloseButton && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close dialog"
                className="p-1.5 rounded-lg text-muted hover:text-text hover:bg-surface-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright"
              >
                <X size={18} weight="bold" />
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
