import React, { createContext, useContext, useEffect, useState } from 'react'

export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'fieldr-theme'

// In-memory fallback if localStorage is disabled or throws
let memoryPreference: ThemePreference = 'system'

export function getStoredPreference(): ThemePreference {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const val = localStorage.getItem(STORAGE_KEY)
      if (val === 'light' || val === 'dark' || val === 'system') {
        return val
      }
    }
  } catch {
    // fallback to in-memory
  }
  return memoryPreference
}

export function setStoredPreference(pref: ThemePreference): void {
  memoryPreference = pref
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(STORAGE_KEY, pref)
    }
  } catch {
    // storage unavailable
  }
}

export function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'dark'
  try {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
  } catch {
    return 'dark'
  }
}

export function resolveTheme(pref: ThemePreference): ResolvedTheme {
  if (pref === 'light') return 'light'
  if (pref === 'dark') return 'dark'
  return getSystemTheme()
}

export function applyThemeToDom(resolved: ResolvedTheme, disableTransitions = true): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement

  const isReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  if (disableTransitions && !isReducedMotion) {
    root.classList.add('no-transitions')
  }

  root.setAttribute('data-theme', resolved)
  if (resolved === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }

  // Update <meta name="theme-color">
  const metaThemeColor = document.querySelector('meta[name="theme-color"]')
  const bgHex = resolved === 'dark' ? '#0B0B0B' : '#F4F5F1'
  if (metaThemeColor) {
    metaThemeColor.setAttribute('content', bgHex)
  }

  if (disableTransitions && !isReducedMotion) {
    // Re-enable transitions on next frame
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        root.classList.remove('no-transitions')
      })
    })
  }
}

interface ThemeContextValue {
  preference: ThemePreference
  resolvedTheme: ResolvedTheme
  setPreference: (pref: ThemePreference) => void
}

const ThemeContext = createContext<ThemeContextValue>({
  preference: 'system',
  resolvedTheme: 'dark',
  setPreference: () => {}
})

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => getStoredPreference())
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolveTheme(getStoredPreference()))

  const setPreference = (newPref: ThemePreference) => {
    setPreferenceState(newPref)
    setStoredPreference(newPref)
    const newResolved = resolveTheme(newPref)
    setResolvedTheme(newResolved)
    applyThemeToDom(newResolved, true)
  }

  // Listen to system prefers-color-scheme media query changes when preference is 'system'
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')

    const handleMediaChange = () => {
      if (preference === 'system') {
        const newResolved = mq.matches ? 'dark' : 'light'
        setResolvedTheme(newResolved)
        applyThemeToDom(newResolved, true)
      }
    }

    mq.addEventListener('change', handleMediaChange)
    return () => mq.removeEventListener('change', handleMediaChange)
  }, [preference])

  // Sync preference changes across tabs via storage event
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        const updatedPref = getStoredPreference()
        setPreferenceState(updatedPref)
        const updatedResolved = resolveTheme(updatedPref)
        setResolvedTheme(updatedResolved)
        applyThemeToDom(updatedResolved, true)
      }
    }

    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  // Sync on mount
  useEffect(() => {
    const currentPref = getStoredPreference()
    const currentResolved = resolveTheme(currentPref)
    setResolvedTheme(currentResolved)
    applyThemeToDom(currentResolved, false)
  }, [])

  return (
    <ThemeContext.Provider value={{ preference, resolvedTheme, setPreference }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext)
}

/**
 * Hook used on the /projector route:
 * Forces data-theme="dark" while mounted, and restores the user's preference on unmount,
 * without modifying localStorage.
 */
export function useForceDarkTheme(): void {
  const { preference } = useTheme()

  useEffect(() => {
    applyThemeToDom('dark', false)
    return () => {
      const restored = resolveTheme(preference)
      applyThemeToDom(restored, false)
    }
  }, [preference])
}
