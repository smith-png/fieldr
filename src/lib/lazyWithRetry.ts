import React, { type ComponentType, type LazyExoticComponent } from 'react'

export const CHUNK_RELOAD_FLAG = 'fieldr_chunk_reload_attempted'

const CHUNK_ERROR_PATTERNS = [
  'failed to fetch dynamically imported module',
  'importing a module script failed',
  'chunkloaderror',
  'unable to preload css'
]

let preloadListenerInstalled = false
let chunkReloadTriggeredInSession = false

export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false

  let name = ''
  let message = ''

  if (typeof error === 'string') {
    message = error
  } else if (typeof error === 'object') {
    const errObj = error as { name?: unknown; message?: unknown }
    if (typeof errObj.name === 'string') name = errObj.name
    if (typeof errObj.message === 'string') message = errObj.message
  }

  const combined = `${name} ${message}`.toLowerCase()
  return CHUNK_ERROR_PATTERNS.some((pattern) => combined.includes(pattern))
}

function hasAttemptedChunkReload(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.sessionStorage.getItem(CHUNK_RELOAD_FLAG) === '1'
  } catch {
    return true
  }
}

function markChunkReloadAttempted(): boolean {
  if (typeof window === 'undefined') return false
  try {
    window.sessionStorage.setItem(CHUNK_RELOAD_FLAG, '1')
    return true
  } catch {
    return false
  }
}

export function clearChunkReloadFlag(): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(CHUNK_RELOAD_FLAG)
  } catch {
    // Ignore storage errors in restricted environments
  }
}

export function triggerChunkReloadOnce(): boolean {
  if (typeof window === 'undefined') return false
  if (hasAttemptedChunkReload()) {
    return false
  }
  if (!markChunkReloadAttempted()) {
    return false
  }
  chunkReloadTriggeredInSession = true
  window.location.reload()
  return true
}

export async function retryDynamicImport<T>(importer: () => Promise<T>): Promise<T> {
  try {
    const mod = await importer()
    clearChunkReloadFlag()
    return mod
  } catch (err) {
    if (isChunkLoadError(err) && triggerChunkReloadOnce()) {
      // Keep the promise pending while the browser reloads so ErrorBoundary does not flash.
      return new Promise<T>(() => {})
    }
    throw err
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithRetry<T extends ComponentType<any>>(
  importer: () => Promise<{ default: T }>
): LazyExoticComponent<T> {
  return React.lazy(() => retryDynamicImport(importer))
}

export function installPreloadErrorHandler(): void {
  if (typeof window === 'undefined' || preloadListenerInstalled) return
  preloadListenerInstalled = true

  window.addEventListener('vite:preloadError', (event) => {
    if (triggerChunkReloadOnce()) {
      event.preventDefault()
    }
  })

  // Clear the reload guard after a clean, settled load so future deploys can still recover once.
  const scheduleFlagClear = () => {
    window.setTimeout(() => {
      if (!chunkReloadTriggeredInSession) {
        clearChunkReloadFlag()
      }
    }, 5000)
  }

  if (document.readyState === 'complete') {
    scheduleFlagClear()
  } else {
    window.addEventListener('load', scheduleFlagClear, { once: true })
  }
}
