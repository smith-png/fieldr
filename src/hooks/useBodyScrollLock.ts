import { useEffect } from 'react'

let activeScrollLocks = 0
let savedBodyOverflow: string | null = null

function acquireBodyScrollLock(): void {
  if (typeof document === 'undefined') return
  if (activeScrollLocks === 0) {
    const current = document.body.style.overflow
    savedBodyOverflow = current === 'hidden' ? '' : current
    document.body.style.overflow = 'hidden'
  }
  activeScrollLocks += 1
}

function releaseBodyScrollLock(): void {
  if (typeof document === 'undefined') return
  if (activeScrollLocks > 0) {
    activeScrollLocks -= 1
  }
  if (activeScrollLocks === 0) {
    document.body.style.overflow = savedBodyOverflow ?? ''
    savedBodyOverflow = null
  }
}

export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return
    acquireBodyScrollLock()
    return () => {
      releaseBodyScrollLock()
    }
  }, [active])
}
