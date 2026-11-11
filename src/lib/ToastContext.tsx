import React, { createContext, useContext, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ToastItem, type ToastType } from '../components/ui/Toast'

interface ToastMessage {
  id: string
  type: ToastType
  text: string
}

interface ToastContextType {
  toast: (text: string, type?: ToastType) => void
  showToast: (text: string, type?: ToastType) => void
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
        showToast: addToast,
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
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ duration: 0.2 }}
            >
              <ToastItem
                id={t.id}
                message={t.text}
                type={t.type}
                onDismiss={removeToast}
              />
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
