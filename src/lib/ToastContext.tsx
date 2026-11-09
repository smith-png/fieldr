import React, { createContext, useContext, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CheckCircle, WarningCircle, X } from '@phosphor-icons/react'

type ToastType = 'success' | 'error' | 'info'

interface ToastMessage {
  id: string
  type: ToastType
  text: string
}

interface ToastContextType {
  toast: (text: string, type?: ToastType) => void
  success: (text: string) => void
  error: (text: string) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const addToast = (text: string, type: ToastType = 'info') => {
    const id = `toast-${Date.now()}-${Math.random()}`
    setToasts((prev) => [...prev, { id, type, text }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 4000)
  }

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  return (
    <ToastContext.Provider
      value={{
        toast: addToast,
        success: (text) => addToast(text, 'success'),
        error: (text) => addToast(text, 'error')
      }}
    >
      {children}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none max-w-sm w-full px-4">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.25 }}
              className={`pointer-events-auto flex items-center justify-between gap-3 px-4 py-3 rounded-xl border shadow-xl text-sm ${
                t.type === 'success'
                  ? 'bg-[#0E1B13] border-[#047554]/50 text-[#F0F2EE]'
                  : t.type === 'error'
                  ? 'bg-[#1D0E0E] border-[#B91C1C]/50 text-[#F0F2EE]'
                  : 'bg-[#141414] border-white/10 text-[#F0F2EE]'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {t.type === 'success' && (
                  <CheckCircle size={18} weight="fill" className="text-[#047554] shrink-0" />
                )}
                {t.type === 'error' && (
                  <WarningCircle size={18} weight="fill" className="text-[#B91C1C] shrink-0" />
                )}
                <span className="truncate">{t.text}</span>
              </div>
              <button
                type="button"
                onClick={() => removeToast(t.id)}
                aria-label="Dismiss notification"
                className="text-[#8E928C] hover:text-white shrink-0 p-1"
              >
                <X size={14} weight="bold" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}
