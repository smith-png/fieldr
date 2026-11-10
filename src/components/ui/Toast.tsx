import React from 'react'
import {
  CheckCircle,
  WarningCircle,
  Info,
  X
} from '@phosphor-icons/react'

export type ToastType = 'success' | 'error' | 'info'

export interface ToastItemProps {
  id: string
  message: string
  type: ToastType
  onDismiss: (id: string) => void
}

export const ToastItem: React.FC<ToastItemProps> = ({
  id,
  message,
  type,
  onDismiss
}) => {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border border-border bg-surface text-text shadow-xl text-xs font-mono tracking-wide max-w-sm transition-all"
    >
      {type === 'success' && (
        <CheckCircle size={18} weight="fill" className="text-accent-bright shrink-0" />
      )}
      {type === 'error' && (
        <WarningCircle size={18} weight="fill" className="text-error shrink-0" />
      )}
      {type === 'info' && (
        <Info size={18} weight="fill" className="text-accent shrink-0" />
      )}
      <span className="flex-1 break-words">{message}</span>
      <button
        type="button"
        onClick={() => onDismiss(id)}
        aria-label="Dismiss toast"
        className="text-muted hover:text-text p-1 transition-colors shrink-0"
      >
        <X size={14} weight="bold" />
      </button>
    </div>
  )
}
