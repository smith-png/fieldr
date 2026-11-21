import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

interface PwaInstallSnapshot {
  canPromptInstall: boolean
  isInstalled: boolean
  isIOSSafari: boolean
}

type Listener = () => void

let initialized = false
let deferredPrompt: BeforeInstallPromptEvent | null = null
let installed = false
let iosSafari = false
const listeners = new Set<Listener>()

function notify(): void {
  for (const listener of listeners) {
    listener()
  }
}

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const mqStandalone =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches
  const iosStandalone =
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  return mqStandalone || iosStandalone
}

function detectIOSSafari(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  const isIOS =
    /iP(hone|ad|od)/i.test(ua) ||
    (/Macintosh/i.test(ua) && (navigator.maxTouchPoints ?? 0) > 1)
  if (!isIOS) return false
  const isSafari = /Safari/i.test(ua)
  const isOtherIOSBrowser =
    /CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser|DuckDuckGo|GSA|FBAN|FBAV|Instagram/i.test(ua)
  return isSafari && !isOtherIOSBrowser
}

function getSnapshot(): PwaInstallSnapshot {
  return {
    canPromptInstall: deferredPrompt !== null && !installed,
    isInstalled: installed,
    isIOSSafari: iosSafari
  }
}

export function initPwaInstall(): void {
  if (initialized || typeof window === 'undefined') return
  initialized = true

  installed = detectStandalone()
  iosSafari = detectIOSSafari()

  window.addEventListener('beforeinstallprompt', (event: Event) => {
    event.preventDefault()
    deferredPrompt = event as BeforeInstallPromptEvent
    notify()
  })

  window.addEventListener('appinstalled', () => {
    installed = true
    deferredPrompt = null
    notify()
  })

  if (typeof window.matchMedia === 'function') {
    const standaloneQuery = window.matchMedia('(display-mode: standalone)')
    const handleDisplayModeChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        installed = true
        deferredPrompt = null
        notify()
      }
    }
    if (typeof standaloneQuery.addEventListener === 'function') {
      standaloneQuery.addEventListener('change', handleDisplayModeChange)
    }
  }

  if ('serviceWorker' in navigator && window.isSecureContext) {
    const registerSw = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // Ignore registration failures in restricted environments
      })
    }
    if (document.readyState === 'complete') {
      registerSw()
    } else {
      window.addEventListener('load', registerSw, { once: true })
    }
  }
}

export async function triggerPwaInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredPrompt) return 'unavailable'
  const promptEvent = deferredPrompt
  deferredPrompt = null
  notify()

  try {
    await promptEvent.prompt()
    const choice = await promptEvent.userChoice
    if (choice?.outcome === 'accepted') {
      installed = true
      notify()
      return 'accepted'
    }
    return 'dismissed'
  } catch {
    return 'dismissed'
  }
}

export function usePwaInstall(): PwaInstallSnapshot {
  initPwaInstall()
  const [snapshot, setSnapshot] = useState<PwaInstallSnapshot>(getSnapshot)

  useEffect(() => {
    const update = () => setSnapshot(getSnapshot())
    listeners.add(update)
    update()
    return () => {
      listeners.delete(update)
    }
  }, [])

  return snapshot
}
