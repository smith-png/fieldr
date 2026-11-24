import { useEffect, useState } from 'react'
import { getCachedReelSettings, getReelSettings } from './data'

/** True when the Reels page is switched on in Setup. One small cached read, no polling or realtime. */
export function useReelsVisible(): boolean {
  const [visible, setVisible] = useState<boolean>(
    () => getCachedReelSettings()?.is_visible ?? false
  )

  useEffect(() => {
    let alive = true
    const run = () => {
      void getReelSettings().then((s) => {
        if (alive) setVisible(s.is_visible)
      })
    }
    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(run, { timeout: 2000 })
      return () => {
        alive = false
        window.cancelIdleCallback(handle)
      }
    }
    const timer = window.setTimeout(run, 800)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [])

  return visible
}
