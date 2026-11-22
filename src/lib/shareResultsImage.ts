import { formatPoints, getInitials } from './utils'

export interface ShareResultsTopBuy {
  name: string
  role: string
  sport: string
  teamName: string | null
  teamColor: string | null
  price: number
  photoUrl?: string | null
}

export interface ShareResultsTeamSpend {
  teamName: string
  teamColor: string | null
  totalSpend: number
  playerCount: number
}

export interface ShareResultsOptions {
  seasonName?: string | null
  totalSpent: number
  soldCount: number
  unsoldCount: number
  remainingCount: number
  averagePrice: number
  topBuys: ShareResultsTopBuy[]
  teamSpends: ShareResultsTeamSpend[]
}

export interface ShareResultsOutcome {
  outcome: 'shared' | 'downloaded' | 'cancelled' | 'empty'
  filename?: string
}

const CANVAS_WIDTH = 1080
const CANVAS_HEIGHT = 1350

const COLORS = {
  bg: '#0B0B0B',
  surface: '#121412',
  surface2: '#1A1D1A',
  text: '#F0F2EE',
  muted: '#9AA097',
  mutedSubtle: '#7A8178',
  border: 'rgba(240, 242, 238, 0.10)',
  innerBorder: 'rgba(240, 242, 238, 0.08)',
  points: '#C88B0F',
  accent: '#395F3D',
  accentBright: '#047554'
} as const

const FONT_SYNE = '"Syne", -apple-system, BlinkMacSystemFont, sans-serif'
const FONT_SANS = '"DM Sans", -apple-system, BlinkMacSystemFont, sans-serif'
const FONT_MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'

const IMAGE_TIMEOUT_MS = 8000

const DISALLOWED_CSS_COLORS = new Set([
  'transparent',
  'currentcolor',
  'inherit',
  'initial',
  'unset',
  'revert',
  'revert-layer'
])

function resolveColor(color?: string | null, fallback: string = COLORS.accentBright): string {
  const clean = color?.trim()
  if (!clean) return fallback
  if (DISALLOWED_CSS_COLORS.has(clean.toLowerCase())) return fallback
  if (/[;{}<>]/.test(clean)) return fallback

  if (typeof CSS !== 'undefined' && typeof CSS.supports === 'function') {
    return CSS.supports('color', clean) ? clean : fallback
  }
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(clean)
    ? clean
    : fallback
}

function buildFilename(seasonName?: string | null): string {
  const slug = (seasonName || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
  return `fieldr-${slug || 'auction'}-results.png`
}

async function waitForFonts(): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return
  try {
    await Promise.allSettled([
      document.fonts.load('800 54px "Syne"'),
      document.fonts.load('700 22px "Syne"'),
      document.fonts.load('400 18px "DM Sans"'),
      document.fonts.load('500 16px "DM Sans"'),
      document.fonts.load('600 16px "DM Sans"')
    ])
    await document.fonts.ready
  } catch {
    // Continue with currently loaded fonts if Font Loading API rejects
  }
}

function loadImageAnonymous(url?: string | null): Promise<HTMLImageElement | null> {
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

function roundedRectPath(
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

function drawTrackedText(
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

function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
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

function drawFieldrTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number
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

  roundedRectPath(ctx, x + 0.5, y + 0.5, size - 1, size - 1, r)
  ctx.strokeStyle = 'rgba(4, 24, 17, 0.75)'
  ctx.lineWidth = Math.max(1.5, size * 0.05)
  ctx.stroke()

  ctx.fillStyle = '#FFFFFF'
  ctx.font = `800 ${Math.round(size * 0.6)}px ${FONT_SYNE}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('F', x + size / 2, y + size * 0.52)

  ctx.restore()
}

function drawAvatarOrInitials(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  name: string,
  x: number,
  y: number,
  size: number,
  r: number
): void {
  ctx.save()
  roundedRectPath(ctx, x, y, size, size, r)
  ctx.clip()

  ctx.fillStyle = COLORS.surface2
  ctx.fillRect(x, y, size, size)

  if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
    const imgRatio = img.naturalWidth / img.naturalHeight
    let sx = 0
    let sy = 0
    let sw = img.naturalWidth
    let sh = img.naturalHeight

    if (imgRatio > 1) {
      sw = img.naturalHeight
      sx = (img.naturalWidth - sw) / 2
    } else {
      sh = img.naturalWidth
      sy = (img.naturalHeight - sh) * 0.2
    }
    ctx.drawImage(img, sx, sy, sw, sh, x, y, size, size)
  } else {
    const initials = getInitials(name) || '?'
    ctx.fillStyle = COLORS.muted
    ctx.font = `700 ${Math.round(size * 0.34)}px ${FONT_SYNE}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(initials, x + size / 2, y + size * 0.52)
  }
  ctx.restore()

  ctx.save()
  roundedRectPath(ctx, x + 0.5, y + 0.5, size - 1, size - 1, r)
  ctx.strokeStyle = COLORS.innerBorder
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.restore()
}

async function renderResultsCanvas(
  options: ShareResultsOptions
): Promise<HTMLCanvasElement> {
  await waitForFonts()

  const topBuys = options.topBuys.slice(0, 3)
  const loadedPhotos = await Promise.all(
    topBuys.map((buy) => loadImageAnonymous(buy.photoUrl))
  )

  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_WIDTH
  canvas.height = CANVAS_HEIGHT

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Canvas 2D context is unavailable.')
  }

  // 1. Near-black Fieldr background
  ctx.fillStyle = COLORS.bg
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

  // 2. Subtle outer frame rim
  ctx.save()
  roundedRectPath(ctx, 26, 26, CANVAS_WIDTH - 52, CANVAS_HEIGHT - 52, 34)
  ctx.strokeStyle = COLORS.accent
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.restore()

  const padX = 68
  const contentW = CANVAS_WIDTH - padX * 2

  // 3. Top bar: F tile + Fieldr wordmark
  const topTileSize = 44
  const topY = 64
  drawFieldrTile(ctx, padX, topY, topTileSize)

  ctx.save()
  ctx.fillStyle = COLORS.text
  ctx.font = `800 26px ${FONT_SYNE}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText('Fieldr', padX + topTileSize + 14, topY + topTileSize / 2 + 1)

  const totalPool = options.soldCount + options.unsoldCount + options.remainingCount
  ctx.fillStyle = COLORS.muted
  ctx.font = `500 16px ${FONT_SANS}`
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  ctx.fillText(
    `${options.soldCount} of ${totalPool} sold`,
    padX + contentW,
    topY + topTileSize / 2
  )
  ctx.restore()

  // 4. Season eyebrow & Headline
  let cursorY = 142
  const seasonLabel = options.seasonName?.trim()
  if (seasonLabel) {
    ctx.save()
    ctx.fillStyle = COLORS.muted
    ctx.font = `500 14px ${FONT_SANS}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    drawTrackedText(ctx, seasonLabel.toUpperCase(), padX, cursorY, 3.6, contentW)
    ctx.restore()
    cursorY += 28
  }

  ctx.save()
  ctx.fillStyle = COLORS.text
  ctx.font = `800 52px ${FONT_SYNE}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText('Auction Results', padX, cursorY)
  ctx.restore()
  cursorY += 74

  // 5. Headline totals strip (4 compact stat tiles)
  const statGap = 16
  const statCount = 4
  const statW = (contentW - statGap * (statCount - 1)) / statCount
  const statH = 104

  const headlineStats: Array<{ label: string; value: string; accent?: string }> = [
    {
      label: 'TOTAL SPENT',
      value: formatPoints(options.totalSpent),
      accent: COLORS.points
    },
    {
      label: 'SOLD',
      value: String(options.soldCount),
      accent: COLORS.accentBright
    },
    {
      label: 'UNSOLD',
      value: String(options.unsoldCount)
    },
    {
      label: 'AVG PRICE',
      value: formatPoints(Math.round(options.averagePrice)),
      accent: COLORS.points
    }
  ]

  headlineStats.forEach((stat, idx) => {
    const sx = padX + idx * (statW + statGap)
    ctx.save()
    roundedRectPath(ctx, sx, cursorY, statW, statH, 20)
    ctx.fillStyle = COLORS.surface
    ctx.fill()
    ctx.strokeStyle = COLORS.border
    ctx.lineWidth = 1
    ctx.stroke()

    ctx.fillStyle = COLORS.mutedSubtle
    ctx.font = `500 12px ${FONT_SANS}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    drawTrackedText(ctx, stat.label, sx + 20, cursorY + 20, 2.2, statW - 40)

    ctx.fillStyle = stat.accent || COLORS.text
    ctx.font = `700 32px ${FONT_MONO}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'bottom'
    ctx.fillText(truncateText(ctx, stat.value, statW - 40), sx + 20, cursorY + statH - 18)
    ctx.restore()
  })

  cursorY += statH + 34

  // 6. Top 3 Buys section
  ctx.save()
  ctx.fillStyle = COLORS.muted
  ctx.font = `500 13px ${FONT_SANS}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  drawTrackedText(ctx, 'TOP BUYS', padX, cursorY, 3.0)
  ctx.restore()
  cursorY += 26

  const buyRowH = 88
  const buyGap = 12
  topBuys.forEach((buy, idx) => {
    const rowY = cursorY + idx * (buyRowH + buyGap)
    const teamColor = resolveColor(buy.teamColor, COLORS.accentBright)

    ctx.save()
    roundedRectPath(ctx, padX, rowY, contentW, buyRowH, 20)
    ctx.fillStyle = COLORS.surface
    ctx.fill()
    ctx.strokeStyle = COLORS.border
    ctx.lineWidth = 1
    ctx.stroke()

    // Rank badge
    ctx.fillStyle = COLORS.mutedSubtle
    ctx.font = `700 18px ${FONT_MONO}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`0${idx + 1}`, padX + 32, rowY + buyRowH / 2)

    // Thumbnail
    const avatarSize = 56
    const avatarX = padX + 60
    const avatarY = rowY + (buyRowH - avatarSize) / 2
    drawAvatarOrInitials(ctx, loadedPhotos[idx], buy.name, avatarX, avatarY, avatarSize, 14)

    // Price on the right
    const priceText = `${formatPoints(buy.price)} PTS`
    ctx.font = `700 24px ${FONT_MONO}`
    const priceW = ctx.measureText(priceText).width
    ctx.fillStyle = COLORS.points
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.fillText(priceText, padX + contentW - 24, rowY + buyRowH / 2)

    // Player name + role + team pill
    const textX = avatarX + avatarSize + 18
    const maxTextW = Math.max(120, padX + contentW - 24 - priceW - 24 - textX)

    ctx.fillStyle = COLORS.text
    ctx.font = `700 22px ${FONT_SYNE}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(truncateText(ctx, buy.name, maxTextW), textX, rowY + 18)

    const metaY = rowY + 50
    let metaX = textX

    if (buy.teamName) {
      ctx.beginPath()
      ctx.arc(metaX + 5, metaY + 8, 5, 0, Math.PI * 2)
      ctx.fillStyle = teamColor
      ctx.fill()
      metaX += 16

      ctx.fillStyle = COLORS.text
      ctx.font = `500 15px ${FONT_SANS}`
      const teamLabel = truncateText(ctx, buy.teamName, maxTextW * 0.55)
      ctx.fillText(teamLabel, metaX, metaY)
      metaX += ctx.measureText(teamLabel).width + 12
    }

    const roleSport = [buy.role, buy.sport].filter(Boolean).join(' · ')
    if (roleSport && metaX < textX + maxTextW) {
      ctx.fillStyle = COLORS.muted
      ctx.font = `400 15px ${FONT_SANS}`
      ctx.fillText(
        truncateText(ctx, roleSport, textX + maxTextW - metaX),
        metaX,
        metaY
      )
    }

    ctx.restore()
  })

  cursorY += topBuys.length * (buyRowH + buyGap) + 22

  // 7. Footer geometry
  const footerDividerY = CANVAS_HEIGHT - 114
  const footerMidY = CANVAS_HEIGHT - 72

  // 8. Spend per team bars (scaled cleanly to fill remaining height above footer)
  const teamsAvailableH = footerDividerY - 26 - cursorY
  if (options.teamSpends.length > 0 && teamsAvailableH >= 120) {
    ctx.save()
    ctx.fillStyle = COLORS.muted
    ctx.font = `500 13px ${FONT_SANS}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    drawTrackedText(ctx, 'SPEND PER TEAM', padX, cursorY, 3.0)
    ctx.restore()

    const panelY = cursorY + 26
    const panelH = footerDividerY - 24 - panelY

    ctx.save()
    roundedRectPath(ctx, padX, panelY, contentW, panelH, 24)
    ctx.fillStyle = COLORS.surface
    ctx.fill()
    ctx.strokeStyle = COLORS.border
    ctx.lineWidth = 1
    ctx.stroke()

    const innerPadX = 28
    const innerPadY = 22
    const innerW = contentW - innerPadX * 2
    const innerH = panelH - innerPadY * 2

    const maxTeamsToShow = Math.min(options.teamSpends.length, 10)
    const teams = options.teamSpends.slice(0, maxTeamsToShow)
    const maxSpend = Math.max(1, ...teams.map((t) => t.totalSpend))

    const rowSlotH = innerH / teams.length
    const compact = teams.length >= 7
    const labelFontSize = compact ? 15 : 17
    const valueFontSize = compact ? 15 : 17
    const barH = compact ? 8 : 11
    const labelToBarGap = compact ? 6 : 8

    teams.forEach((team, idx) => {
      const teamColor = resolveColor(team.teamColor, COLORS.accentBright)
      const blockH = labelFontSize + labelToBarGap + barH
      const rowTop = panelY + innerPadY + idx * rowSlotH + Math.max(0, (rowSlotH - blockH) / 2)

      // Team dot + name + buy count
      ctx.beginPath()
      ctx.arc(padX + innerPadX + 5, rowTop + labelFontSize * 0.55, 4.5, 0, Math.PI * 2)
      ctx.fillStyle = teamColor
      ctx.fill()

      const spendLabel = `${formatPoints(team.totalSpend)} PTS`
      ctx.font = `600 ${valueFontSize}px ${FONT_MONO}`
      const spendW = ctx.measureText(spendLabel).width
      ctx.fillStyle = COLORS.points
      ctx.textAlign = 'right'
      ctx.textBaseline = 'top'
      ctx.fillText(spendLabel, padX + innerPadX + innerW, rowTop)

      const countText = `  (${team.playerCount})`
      ctx.font = `400 ${labelFontSize - 2}px ${FONT_MONO}`
      const countW = ctx.measureText(countText).width

      const nameX = padX + innerPadX + 16
      const nameMaxW = Math.max(80, innerW - 16 - spendW - countW - 20)
      ctx.fillStyle = COLORS.text
      ctx.font = `600 ${labelFontSize}px ${FONT_SANS}`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      const fittedName = truncateText(ctx, team.teamName, nameMaxW)
      ctx.fillText(fittedName, nameX, rowTop)

      const nameRenderedW = ctx.measureText(fittedName).width
      ctx.fillStyle = COLORS.mutedSubtle
      ctx.font = `400 ${labelFontSize - 2}px ${FONT_MONO}`
      ctx.fillText(countText, nameX + nameRenderedW, rowTop + 1)

      // Horizontal bar track + fill in team color
      const barY = rowTop + labelFontSize + labelToBarGap
      roundedRectPath(ctx, padX + innerPadX, barY, innerW, barH, barH / 2)
      ctx.fillStyle = COLORS.surface2
      ctx.fill()

      const fillW = Math.max(barH, Math.round((team.totalSpend / maxSpend) * innerW))
      roundedRectPath(ctx, padX + innerPadX, barY, fillW, barH, barH / 2)
      ctx.fillStyle = teamColor
      ctx.fill()
    })

    ctx.restore()
  }

  // 9. Footer divider & wordmark
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(padX, footerDividerY)
  ctx.lineTo(padX + contentW, footerDividerY)
  ctx.strokeStyle = COLORS.border
  ctx.lineWidth = 1
  ctx.stroke()

  ctx.fillStyle = COLORS.muted
  ctx.font = `500 18px ${FONT_SANS}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  drawTrackedText(ctx, 'Draft. Bid. Win.', padX, footerMidY, 0.8)

  ctx.fillStyle = COLORS.text
  ctx.font = `800 21px ${FONT_SYNE}`
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  const wordmarkW = ctx.measureText('Fieldr').width
  ctx.fillText('Fieldr', padX + contentW, footerMidY + 1)

  const footerTileSize = 26
  drawFieldrTile(
    ctx,
    padX + contentW - wordmarkW - footerTileSize - 10,
    footerMidY - footerTileSize / 2,
    footerTileSize
  )
  ctx.restore()

  return canvas
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
      } else {
        reject(new Error('Failed to export results image.'))
      }
    }, 'image/png')
  })
}

function triggerDownload(blob: Blob, filename: string): void {
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

export async function shareResultsImage(
  options: ShareResultsOptions
): Promise<ShareResultsOutcome> {
  if (options.soldCount <= 0) {
    return { outcome: 'empty' }
  }

  const canvas = await renderResultsCanvas(options)
  const blob = await canvasToPngBlob(canvas)
  const filename = buildFilename(options.seasonName)

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
          title: options.seasonName
            ? `${options.seasonName} Auction Results`
            : 'Fieldr Auction Results'
        })
        return { outcome: 'shared', filename }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return { outcome: 'cancelled', filename }
        }
        // Fall through to PNG download if Web Share fails
      }
    }
  }

  triggerDownload(blob, filename)
  return { outcome: 'downloaded', filename }
}
