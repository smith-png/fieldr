import React, { useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowRight, X } from '@phosphor-icons/react'
import { useAuth } from '../lib/AuthContext'
import type { Season } from '../lib/types'

interface NavigationMenuProps {
  isOpen: boolean
  onClose: () => void
  activeSeason: Season | null
}

export const NavigationMenu: React.FC<NavigationMenuProps> = ({
  isOpen,
  onClose,
  activeSeason
}) => {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const menuRef = useRef<HTMLDivElement>(null)
  const shouldReduceMotion = useReducedMotion()

  // Lock body scroll and trap Esc key
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose()
      }
      window.addEventListener('keydown', handleKeyDown)
      return () => {
        document.body.style.overflow = ''
        window.removeEventListener('keydown', handleKeyDown)
      }
    }
  }, [isOpen, onClose])

  const links = [
    { title: 'Home', path: '/', visible: true },
    { title: 'Admin', path: '/admin', visible: user?.role === 'admin' },
    { title: 'Projector', path: '/projector', visible: user?.role === 'admin' || user?.role === 'projector' }
  ]

  const handleSignOut = async () => {
    await logout()
    onClose()
    navigate('/login')
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={menuRef}
          role="dialog"
          aria-modal="true"
          aria-label="Navigation Menu"
          className="fixed inset-0 z-50 overflow-hidden p-6 md:p-12 text-[#F0F2EE]"
        >
          {/* Expanding Circle Background */}
          <motion.div
            aria-hidden="true"
            className="absolute rounded-full bg-[#0B0B0B] pointer-events-none"
            style={{
              width: '300vmax',
              height: '300vmax',
              left: 'calc(46px - 150vmax)',
              top: 'calc(46px - 150vmax)',
              transformOrigin: 'center',
              willChange: 'transform'
            }}
            initial={shouldReduceMotion ? { opacity: 0 } : { scale: 0 }}
            animate={shouldReduceMotion ? { opacity: 1 } : { scale: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { scale: 0 }}
            transition={
              shouldReduceMotion
                ? { duration: 0.15 }
                : { duration: 0.55, ease: [0.22, 1, 0.36, 1] }
            }
          />

          {/* Menu Content Wrapper Above Circle */}
          <motion.div
            className="relative z-10 w-full h-full flex flex-col justify-between"
            initial={{ opacity: 0 }}
            animate={{
              opacity: 1,
              transition: {
                duration: shouldReduceMotion ? 0.15 : 0.25,
                delay: shouldReduceMotion ? 0 : 0.2
              }
            }}
            exit={{
              opacity: 0,
              transition: {
                duration: 0.12,
                delay: 0
              }
            }}
          >
            {/* Top Row: Close button positioned identically to the top-left icon */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={onClose}
                aria-label="Close menu"
                className="w-[52px] h-[52px] rounded-[22%] bg-[#151715] border border-white/10 flex items-center justify-center text-[#F0F2EE] hover:text-white hover:border-[#047554] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#047554]"
              >
                <X size={24} weight="bold" />
              </button>

              {user && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-[#CBD1CB]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#047554]" />
                  <span className="font-medium tracking-wide uppercase">{user.role}</span>
                  <span className="text-white/40">·</span>
                  <span className="text-white/70">{user.email}</span>
                </div>
              )}
            </div>

            {/* Staggered Navigation Links */}
            <div className="flex flex-col gap-5 md:gap-8 max-w-2xl my-auto">
              {links.filter((l) => l.visible).map((link, idx) => (
                <motion.div
                  key={link.path}
                  initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 35 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.5,
                    delay: shouldReduceMotion ? 0 : 0.15 + idx * 0.08,
                    ease: [0.22, 1, 0.36, 1]
                  }}
                >
                  <Link
                    to={link.path}
                    onClick={onClose}
                    className="group flex items-center gap-4 text-4xl sm:text-6xl md:text-7xl font-syne font-extrabold tracking-tight text-[#CBD1CB] hover:text-white transition-colors transition-transform transform hover:translate-x-3"
                  >
                    <span>{link.title}</span>
                    <ArrowRight
                      size={36}
                      weight="bold"
                      className="opacity-0 -translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-[opacity,transform] text-[#047554]"
                    />
                  </Link>
                </motion.div>
              ))}

              {/* Auth Action */}
              <motion.div
                initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 35 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.5,
                  delay: shouldReduceMotion ? 0 : 0.15 + links.length * 0.08,
                  ease: [0.22, 1, 0.36, 1]
                }}
                className="pt-4 border-t border-white/10"
              >
                {user ? (
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="group flex items-center gap-3 text-2xl sm:text-3xl font-syne font-bold text-[#8E928C] hover:text-[#B91C1C] transition-colors transition-transform transform hover:translate-x-2"
                  >
                    <span>Sign out</span>
                    <ArrowRight
                      size={24}
                      weight="bold"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    />
                  </button>
                ) : (
                  <Link
                    to="/login"
                    onClick={onClose}
                    className="group flex items-center gap-3 text-2xl sm:text-3xl font-syne font-bold text-[#F0F2EE] hover:text-white transition-colors transition-transform transform hover:translate-x-2"
                  >
                    <span>Sign in</span>
                    <ArrowRight
                      size={24}
                      weight="bold"
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-[#047554]"
                    />
                  </Link>
                )}
              </motion.div>
            </div>

            {/* Footer Metadata */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-6 border-t border-white/10 text-xs text-[#8E928C]">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[#CBD1CB]">
                  {activeSeason?.name || 'DRGMC Sports'}
                </span>
                <span>·</span>
                <span>Tournament Console</span>
              </div>
              <div className="font-syne font-bold tracking-widest text-[#047554] uppercase">
                Draft. Bid. Win.
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
