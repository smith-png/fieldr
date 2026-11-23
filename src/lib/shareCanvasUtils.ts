import { getValidTeamColor } from './utils'

export const SHARE_FONT_SYNE = '"Syne", -apple-system, BlinkMacSystemFont, sans-serif'
export const SHARE_FONT_SANS = '"DM Sans", -apple-system, BlinkMacSystemFont, sans-serif'
export const SHARE_FONT_MONO =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'

const IMAGE_TIMEOUT_MS = 8000

export function resolveShareColor(
  color: string | null | undefined,
  fallback: string
): string {
  return getValidTeamColor(color) ?? fallback
}

export async function waitForShareFonts(fontSpecs: string[]): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return
  try {
    await Promise.allSettled(fontSpecs.map((spec) => document.fonts.load(spec)))
    await document.fonts.ready
  } catch {
    // Proceed with currently available fonts if Font Loading API rejects
  }
}

export function loadImageAnonymous(
  url?: string | null
): Promise<HTMLImageElement | null> {
  const clean = url?.trim()
  if (!clean) return Promise.resolve(null)

  return new Promise((resolve) => {
    let settled = false
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.referrerPolicy = 'no-referrer'

    const finish = (result: HTMLImageElement | null) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      img.onload = null
      img.onerror = null
      resolve(result)
    }

    const timer = window.setTimeout(() => finish(null), IMAGE_TIMEOUT_MS)

    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        if (typeof img.decode === 'function') {
          img
            .decode()
            .then(() => finish(img))
            .catch(() => finish(img))
        } else {
          finish(img)
        }
      } else {
        finish(null)
      }
    }

    img.onerror = () => finish(null)
    img.src = clean
  })
}

export function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + w - radius, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius)
  ctx.lineTo(x + w, y + h - radius)
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
  ctx.lineTo(x + radius, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

export function drawTrackedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  tracking: number,
  maxWidth?: number
): void {
  if (!text) return
  if (tracking === 0) {
    ctx.fillText(text, x, y, maxWidth)
    return
  }

  let cursorX = x
  const limitX = maxWidth !== undefined ? x + maxWidth : Infinity

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const chWidth = ctx.measureText(ch).width
    if (cursorX + chWidth > limitX) break
    ctx.fillText(ch, cursorX, y)
    cursorX += chWidth + tracking
  }
}

export function truncateText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  const clean = text.trim()
  if (!clean) return ''
  if (ctx.measureText(clean).width <= maxWidth) return clean

  const ellipsis = '...'
  const ellipsisW = ctx.measureText(ellipsis).width
  if (ellipsisW >= maxWidth) return ''

  let low = 0
  let high = clean.length
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (ctx.measureText(clean.slice(0, mid)).width + ellipsisW <= maxWidth) {
      low = mid
    } else {
      high = mid - 1
    }
  }
  return clean.slice(0, Math.max(0, low)).trimEnd() + ellipsis
}

export function drawFieldrTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  includeHighlightBlob = false
): void {
  const r = Math.round(size * 0.22)

  ctx.save()
  roundedRectPath(ctx, x, y, size, size, r)
  ctx.clip()

  ctx.fillStyle = '#06241A'
  ctx.fillRect(x, y, size, size)

  const blob1 = ctx.createRadialGradient(
    x + size * 0.26,
    y + size * 0.34,
    0,
    x + size * 0.26,
    y + size * 0.34,
    size * 0.62
  )
  blob1.addColorStop(0, 'rgba(4, 117, 84, 0.95)')
  blob1.addColorStop(1, 'rgba(4, 117, 84, 0)')
  ctx.fillStyle = blob1
  ctx.fillRect(x, y, size, size)

  const blob2 = ctx.createRadialGradient(
    x + size * 0.78,
    y + size * 0.78,
    0,
    x + size * 0.78,
    y + size * 0.78,
    size * 0.6
  )
  blob2.addColorStop(0, 'rgba(57, 95, 61, 0.9)')
  blob2.addColorStop(1, 'rgba(57, 95, 61, 0)')
  ctx.fillStyle = blob2
  ctx.fillRect(x, y, size, size)

  const blob3 = ctx.createRadialGradient(
    x + size * 0.45,
    y + size * 0.2,
    0,
    x + size * 0.45,
    y + size * 0.2,
    size * 0.5
  )
  blob3.addColorStop(0, 'rgba(10, 154, 108, 0.55)')
  blob3.addColorStop(1, 'rgba(10, 154, 108, 0)')
  ctx.fillStyle = blob3
  ctx.fillRect(x, y, size, size)

  if (includeHighlightBlob) {
    const blob4 = ctx.createRadialGradient(
      x + size * 0.58,
      y + size * 0.68,
      0,
      x + size * 0.58,
      y + size * 0.68,
      size * 0.34
    )
    blob4.addColorStop(0, 'rgba(203, 209, 203, 0.35)')
    blob4.addColorStop(1, 'rgba(203, 209, 203, 0)')
    ctx.fillStyle = blob4
    ctx.fillRect(x, y, size, size)
  }

  roundedRectPath(ctx, x + 0.5, y + 0.5, size - 1, size - 1, r)
  ctx.strokeStyle = 'rgba(4, 24, 17, 0.75)'
  ctx.lineWidth = Math.max(1.5, size * 0.05)
  ctx.stroke()

  ctx.fillStyle = '#FFFFFF'
  ctx.font = `800 ${Math.round(size * 0.6)}px ${SHARE_FONT_SYNE}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('F', x + size / 2, y + size * 0.52)

  ctx.restore()
}

export function canvasToPngBlob(
  canvas: HTMLCanvasElement,
  errorMessage: string
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
      } else {
        reject(new Error(errorMessage))
      }
    }, 'image/png')
  })
}

export function triggerDownload(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = filename
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl)
  }, 10_000)
}

export async function shareOrDownloadPng(
  blob: Blob,
  filename: string,
  title: string
): Promise<{ outcome: 'shared' | 'downloaded' | 'cancelled'; filename: string }> {
  const canShareFiles =
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    typeof File !== 'undefined'

  if (canShareFiles) {
    const file = new File([blob], filename, { type: 'image/png' })
    let supported = false
    try {
      supported = navigator.canShare({ files: [file] })
    } catch {
      supported = false
    }

    if (supported) {
      try {
        await navigator.share({
          files: [file],
          title
        })
        return { outcome: 'shared', filename }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return { outcome: 'cancelled', filename }
        }
        // Fall through to PNG download if native share fails
      }
    }
  }

  triggerDownload(blob, filename)
  return { outcome: 'downloaded', filename }
}
