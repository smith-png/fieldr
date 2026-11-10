import React, { useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowRight, Monitor, Moon, Sun, X, type Icon } from '@phosphor-icons/react'
import { useAuth } from '../../lib/AuthContext'
import { type ThemePreference, useTheme } from '../../lib/theme'
import type { Season } from '../../types'

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
  const { preference, setPreference } = useTheme()
  const navigate = useNavigate()
  const menuRef = useRef<HTMLDivElement>(null)
  const shouldReduceMotion = useReducedMotion()

  const optionRefs = useRef<(HTMLButtonElement | null)[]>([])

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
    { title: 'Teams', path: '/teams', visible: true },
    { title: 'Season', path: '/season', visible: true },
    { title: 'Dashboard', path: '/admin', visible: !!user },
    { title: 'Projector', path: '/projector', visible: user?.role === 'admin' || user?.role === 'projector' }
  ]

  const appearanceOptions: { value: ThemePreference; label: string; icon: Icon }[] = [
    { value: 'system', label: 'System', icon: Monitor },
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon }
  ]

  const handleKeyDownAppearance = (e: React.KeyboardEvent, currentIndex: number) => {
    let nextIndex = -1
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      nextIndex = (currentIndex + 1) % appearanceOptions.length
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      nextIndex = (currentIndex - 1 + appearanceOptions.length) % appearanceOptions.length
    }

    if (nextIndex !== -1) {
      const nextOpt = appearanceOptions[nextIndex]
      setPreference(nextOpt.value)
      optionRefs.current[nextIndex]?.focus()
    }
  }

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
          className="fixed inset-0 z-50 overflow-hidden p-6 md:p-12 text-white"
        >
          {/* Expanding Circle Background in deep sage (--menu-bg) */}
          <motion.div
            aria-hidden="true"
            className="absolute rounded-full bg-menu-bg pointer-events-none"
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
                className="w-[52px] h-[52px] rounded-[22%] bg-white/10 border border-white/15 flex items-center justify-center text-white hover:text-white hover:border-accent-bright transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright"
              >
                <X size={24} weight="bold" />
              </button>

              {user && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-xs text-white/80">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-bright" />
                  <span className="font-medium tracking-wide uppercase">{user.role}</span>
                  <span className="text-white/40">·</span>
                  <span className="text-white/70">{user.email}</span>
                </div>
              )}
            </div>

            {/* Staggered Navigation Links */}
            <div className="flex flex-col gap-5 md:gap-7 max-w-2xl my-auto">
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
                    className="group flex items-center gap-4 text-4xl sm:text-6xl md:text-7xl font-syne font-extrabold tracking-tight text-white/85 hover:text-white transition-colors transition-transform transform hover:translate-x-3"
                  >
                    <span>{link.title}</span>
                    <ArrowRight
                      size={36}
                      weight="bold"
                      className="opacity-0 -translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-[opacity,transform] text-accent-bright"
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
                className="pt-4 border-t border-white/15"
              >
                {user ? (
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="group flex items-center gap-3 text-2xl sm:text-3xl font-syne font-bold text-white/60 hover:text-error transition-colors transition-transform transform hover:translate-x-2"
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
                    className="group flex items-center gap-3 text-2xl sm:text-3xl font-syne font-bold text-white/90 hover:text-white transition-colors transition-transform transform hover:translate-x-2"
                  >
                    <span>Sign in</span>
                    <ArrowRight
                      size={24}
                      weight="bold"
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-accent-bright"
                    />
                  </Link>
                )}
              </motion.div>

              {/* Appearance Segmented Control */}
              <motion.div
                initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 35 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.5,
                  delay: shouldReduceMotion ? 0 : 0.15 + (links.length + 1) * 0.08,
                  ease: [0.22, 1, 0.36, 1]
                }}
                className="pt-4"
              >
                <span
                  id="appearance-label"
                  className="text-xs font-mono uppercase tracking-widest text-white/60 block mb-2.5"
                >
                  Appearance
                </span>
                <div
                  role="radiogroup"
                  aria-labelledby="appearance-label"
                  className="inline-flex items-center p-1 bg-white/10 border border-white/15 rounded-xl gap-1"
                >
                  {appearanceOptions.map((opt, idx) => {
                    const IconComponent = opt.icon
                    const isSelected = preference === opt.value
                    return (
                      <button
                        key={opt.value}
                        ref={(el) => {
                          optionRefs.current[idx] = el
                        }}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        tabIndex={isSelected ? 0 : -1}
                        onClick={() => setPreference(opt.value)}
                        onKeyDown={(e) => handleKeyDownAppearance(e, idx)}
                        className={`min-h-[44px] min-w-[44px] px-3.5 py-2 rounded-lg flex items-center gap-2 text-xs font-mono tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright ${
                          isSelected
                            ? 'bg-white/25 text-white font-bold border border-white/30 shadow-sm'
                            : 'text-white/65 hover:text-white hover:bg-white/10 border border-transparent'
                        }`}
                      >
                        <IconComponent size={16} weight={isSelected ? 'bold' : 'regular'} />
                        <span>{opt.label}</span>
                      </button>
                    )
                  })}
                </div>
              </motion.div>
            </div>

            {/* Footer Metadata */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-6 border-t border-white/15 text-xs text-white/60">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-white/90">
                  {activeSeason?.name || 'Fieldr Tournaments'}
                </span>
                <span>·</span>
                <span>Tournament Console</span>
              </div>
              <div className="font-syne font-bold tracking-widest text-accent-bright uppercase">
                Draft. Bid. Win.
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
