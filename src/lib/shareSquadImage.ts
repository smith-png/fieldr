import { formatPoints, getInitials } from './utils'

export interface ShareSquadPlayer {
  name: string
  role: string
  photoUrl?: string | null
  price?: number | null
}

export interface ShareSquadOptions {
  teamName: string
  sport?: string | null
  seasonName?: string | null
  ownerName?: string | null
  teamColor?: string | null
  players: ShareSquadPlayer[]
  showPrices?: boolean
  purseSummary?: {
    spent: number
    remaining: number
  } | null
}

export interface ShareSquadResult {
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
  fallbackAccent: '#395F3D'
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

function resolveRimColor(color?: string | null): string {
  const clean = color?.trim()
  if (!clean) return COLORS.fallbackAccent
  if (DISALLOWED_CSS_COLORS.has(clean.toLowerCase())) return COLORS.fallbackAccent
  if (/[;{}<>]/.test(clean)) return COLORS.fallbackAccent

  if (typeof CSS !== 'undefined' && typeof CSS.supports === 'function') {
    return CSS.supports('color', clean) ? clean : COLORS.fallbackAccent
  }
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(clean)
    ? clean
    : COLORS.fallbackAccent
}

function buildFilename(teamName: string): string {
  const slug = teamName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `fieldr-${slug || 'team'}-squad.png`
}

async function waitForFonts(): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return
  try {
    await Promise.allSettled([
      document.fonts.load('800 56px "Syne"'),
      document.fonts.load('700 20px "Syne"'),
      document.fonts.load('400 18px "DM Sans"'),
      document.fonts.load('500 16px "DM Sans"'),
      document.fonts.load('600 16px "DM Sans"')
    ])
    await document.fonts.ready
  } catch {
    // Proceed with currently available fonts if Font Loading API rejects
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
    if (cursorX + chWidth > limitX) {
      break
    }
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

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const clean = text.trim()
  if (!clean) return []
  if (maxLines <= 1 || ctx.measureText(clean).width <= maxWidth) {
    return [truncateText(ctx, clean, maxWidth)]
  }

  const words = clean.split(/\s+/)
  const lines: string[] = []
  let current = ''

  for (let i = 0; i < words.length; i++) {
    const word = words[i]
    const candidate = current ? `${current} ${word}` : word

    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate
    } else if (!current) {
      lines.push(truncateText(ctx, word, maxWidth))
      if (lines.length === maxLines) return lines
    } else {
      if (lines.length === maxLines - 1) {
        const remaining = [current, ...words.slice(i)].join(' ')
        lines.push(truncateText(ctx, remaining, maxWidth))
        return lines
      }
      lines.push(current)
      current = word
    }
  }

  if (current) {
    lines.push(truncateText(ctx, current, maxWidth))
  }

  return lines.slice(0, maxLines)
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

  // Base dark pine surface matching FooterMark
  ctx.fillStyle = '#06241A'
  ctx.fillRect(x, y, size, size)

  // Soft layered brand blobs matching FooterMark palette
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

  // Inner edge shading
  roundedRectPath(ctx, x + 0.5, y + 0.5, size - 1, size - 1, r)
  ctx.strokeStyle = 'rgba(4, 24, 17, 0.75)'
  ctx.lineWidth = Math.max(1.5, size * 0.05)
  ctx.stroke()

  // Crisp F glyph
  ctx.fillStyle = '#FFFFFF'
  ctx.font = `800 ${Math.round(size * 0.6)}px ${FONT_SYNE}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('F', x + size / 2, y + size * 0.52)

  ctx.restore()
}

function drawPlayerPhotoOrInitials(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  playerName: string,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.save()
  roundedRectPath(ctx, x, y, w, h, r)
  ctx.clip()

  ctx.fillStyle = COLORS.surface2
  ctx.fillRect(x, y, w, h)

  if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
    const imgRatio = img.naturalWidth / img.naturalHeight
    const boxRatio = w / h

    let sx = 0
    let sy = 0
    let sw = img.naturalWidth
    let sh = img.naturalHeight

    if (imgRatio > boxRatio) {
      sw = img.naturalHeight * boxRatio
      sx = (img.naturalWidth - sw) / 2
    } else {
      sh = img.naturalWidth / boxRatio
      // Slight upward portrait bias so faces and heads stay framed
      sy = (img.naturalHeight - sh) * 0.2
    }

    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h)
  } else {
    const initials = getInitials(playerName) || '?'
    const fontSize = Math.max(18, Math.round(Math.min(w, h) * 0.34))
    ctx.fillStyle = COLORS.muted
    ctx.font = `700 ${fontSize}px ${FONT_SYNE}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(initials, x + w / 2, y + h * 0.52)
  }

  ctx.restore()

  // Subtle inner frame border
  ctx.save()
  roundedRectPath(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r)
  ctx.strokeStyle = COLORS.innerBorder
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.restore()
}

async function renderSquadCanvas(options: ShareSquadOptions): Promise<HTMLCanvasElement> {
  await waitForFonts()

  const loadedImages = await Promise.all(
    options.players.map((p) => loadImageAnonymous(p.photoUrl))
  )

  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_WIDTH
  canvas.height = CANVAS_HEIGHT

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Canvas 2D context is unavailable.')
  }

  const rimColor = resolveRimColor(options.teamColor)
  const showPrices = Boolean(options.showPrices)
  const players = options.players

  // 1. Pure near-black background (no tint)
  ctx.fillStyle = COLORS.bg
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

  // 2. Thin outer rim in the team colour (no tint, no glow)
  ctx.save()
  roundedRectPath(ctx, 26, 26, CANVAS_WIDTH - 52, CANVAS_HEIGHT - 52, 34)
  ctx.strokeStyle = rimColor
  ctx.lineWidth = 2.5
  ctx.stroke()
  ctx.restore()

  const padX = 68
  const contentW = CANVAS_WIDTH - padX * 2

  // 3. Top bar: F tile + "Fieldr" wordmark on left, quiet sport/count metadata on right
  const topTileSize = 44
  const topY = 66
  drawFieldrTile(ctx, padX, topY, topTileSize)

  ctx.save()
  ctx.fillStyle = COLORS.text
  ctx.font = `800 26px ${FONT_SYNE}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText('Fieldr', padX + topTileSize + 14, topY + topTileSize / 2 + 1)

  const countLabel = `${players.length} ${players.length === 1 ? 'player' : 'players'}`
  const metaText = options.sport?.trim()
    ? `${options.sport.trim()}  ·  ${countLabel}`
    : countLabel
  ctx.fillStyle = COLORS.muted
  ctx.font = `500 16px ${FONT_SANS}`
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  ctx.fillText(metaText, padX + contentW, topY + topTileSize / 2)
  ctx.restore()

  // 4. Hero block: Season eyebrow, Team name (Syne ExtraBold), Owner name below
  let cursorY = 148

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

  // Team name in Syne ExtraBold with automatic size fit
  const cleanTeamName = options.teamName.trim() || 'Team Squad'
  let teamFontSize = 56
  let teamLines: string[] = [cleanTeamName]

  ctx.save()
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'

  for (const candidateSize of [56, 50, 44]) {
    ctx.font = `800 ${candidateSize}px ${FONT_SYNE}`
    if (ctx.measureText(cleanTeamName).width <= contentW) {
      teamFontSize = candidateSize
      teamLines = [cleanTeamName]
      break
    }
    teamFontSize = candidateSize
    teamLines = wrapTextLines(ctx, cleanTeamName, contentW, 2)
  }

  if (teamLines.length > 1) {
    teamFontSize = 42
    ctx.font = `800 ${teamFontSize}px ${FONT_SYNE}`
    teamLines = wrapTextLines(ctx, cleanTeamName, contentW, 2)
  } else {
    ctx.font = `800 ${teamFontSize}px ${FONT_SYNE}`
  }

  const teamLineHeight = Math.round(teamFontSize * 1.1)
  ctx.fillStyle = COLORS.text
  for (let i = 0; i < teamLines.length; i++) {
    ctx.fillText(teamLines[i], padX, cursorY + i * teamLineHeight)
  }
  ctx.restore()

  cursorY += teamLines.length * teamLineHeight

  const cleanOwner = options.ownerName?.trim()
  if (cleanOwner) {
    cursorY += 12
    ctx.save()
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'

    const prefix = 'Owner  '
    ctx.font = `400 19px ${FONT_SANS}`
    const prefixW = ctx.measureText(prefix).width
    ctx.fillStyle = COLORS.mutedSubtle
    ctx.fillText(prefix, padX, cursorY)

    ctx.font = `500 19px ${FONT_SANS}`
    ctx.fillStyle = COLORS.muted
    const ownerFitted = truncateText(ctx, cleanOwner, contentW - prefixW)
    ctx.fillText(ownerFitted, padX + prefixW, cursorY)
    ctx.restore()

    cursorY += 26
  }

  if (options.purseSummary) {
    cursorY += 14
    const spentVal = `${formatPoints(options.purseSummary.spent)} PTS`
    const remainingVal = `${formatPoints(options.purseSummary.remaining)} PTS`

    ctx.save()
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'

    let px = padX
    const spentLabel = 'Purse spent  '
    ctx.font = `400 17px ${FONT_SANS}`
    ctx.fillStyle = COLORS.mutedSubtle
    ctx.fillText(spentLabel, px, cursorY + 1)
    px += ctx.measureText(spentLabel).width

    ctx.font = `600 18px ${FONT_MONO}`
    ctx.fillStyle = COLORS.text
    ctx.fillText(spentVal, px, cursorY)
    px += ctx.measureText(spentVal).width

    const sep = '   ·   '
    ctx.font = `400 17px ${FONT_SANS}`
    ctx.fillStyle = COLORS.mutedSubtle
    ctx.fillText(sep, px, cursorY + 1)
    px += ctx.measureText(sep).width

    const remLabel = 'Purse remaining  '
    ctx.font = `400 17px ${FONT_SANS}`
    ctx.fillStyle = COLORS.mutedSubtle
    ctx.fillText(remLabel, px, cursorY + 1)
    px += ctx.measureText(remLabel).width

    ctx.font = `600 18px ${FONT_MONO}`
    ctx.fillStyle = COLORS.points
    ctx.fillText(remainingVal, px, cursorY)
    ctx.restore()

    cursorY += 24
  }

  // Subtle divider above squad grid
  const topDividerY = cursorY + 20
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(padX, topDividerY)
  ctx.lineTo(padX + contentW, topDividerY)
  ctx.strokeStyle = COLORS.border
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.restore()

  // 5. Footer layout coordinates
  const footerDividerY = CANVAS_HEIGHT - 116
  const footerMidY = CANVAS_HEIGHT - 74

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

  // 6. Squad grid: 3 columns, automatically scaled to fit the available vertical space
  const gridTop = topDividerY + 28
  const gridBottom = footerDividerY - 26
  const gridHeight = gridBottom - gridTop

  const cols = 3
  const rows = Math.ceil(players.length / cols)
  const useVerticalCards = rows <= 3

  if (useVerticalCards) {
    const gapX = 22
    const gapY = 22
    const cellW = (contentW - gapX * (cols - 1)) / cols
    const maxCellH = (gridHeight - gapY * (rows - 1)) / rows
    const cellH = Math.min(maxCellH, rows === 1 ? 370 : rows === 2 ? 350 : 284)
    const totalGridH = rows * cellH + (rows - 1) * gapY
    const startY = gridTop + Math.max(0, (gridHeight - totalGridH) * 0.4)

    const cardRadius = 22
    const pad = rows === 3 ? 12 : 14
    const nameSize = rows === 3 ? 18 : 20
    const roleSize = rows === 3 ? 13.5 : 14.5
    const priceSize = rows === 3 ? 13 : 14
    const lineGap = 6
    const photoToTextGap = rows === 3 ? 12 : 14
    const textBlockH = showPrices
      ? nameSize + roleSize + priceSize + lineGap * 2 + 4
      : nameSize + roleSize + lineGap + 4

    for (let i = 0; i < players.length; i++) {
      const player = players[i]
      const row = Math.floor(i / cols)
      const col = i % cols
      const rowCount = Math.min(cols, players.length - row * cols)
      const rowWidth = rowCount * cellW + (rowCount - 1) * gapX
      const rowStartX = padX + (contentW - rowWidth) / 2

      const cellX = rowStartX + col * (cellW + gapX)
      const cellY = startY + row * (cellH + gapY)

      // Cell card
      ctx.save()
      roundedRectPath(ctx, cellX, cellY, cellW, cellH, cardRadius)
      ctx.fillStyle = COLORS.surface
      ctx.fill()
      ctx.strokeStyle = COLORS.border
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.restore()

      // Thumbnail tile
      const photoX = cellX + pad
      const photoY = cellY + pad
      const photoW = cellW - pad * 2
      const photoH = Math.max(80, cellH - pad * 2 - textBlockH - photoToTextGap)
      const photoR = Math.max(12, cardRadius - Math.round(pad * 0.55))

      drawPlayerPhotoOrInitials(
        ctx,
        loadedImages[i],
        player.name,
        photoX,
        photoY,
        photoW,
        photoH,
        photoR
      )

      // Name, role, optional price
      let textY = photoY + photoH + photoToTextGap
      ctx.save()
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'

      ctx.fillStyle = COLORS.text
      ctx.font = `700 ${nameSize}px ${FONT_SYNE}`
      ctx.fillText(truncateText(ctx, player.name, photoW), photoX, textY)
      textY += nameSize + lineGap

      ctx.fillStyle = COLORS.muted
      ctx.font = `400 ${roleSize}px ${FONT_SANS}`
      ctx.fillText(truncateText(ctx, player.role, photoW), photoX, textY)

      if (showPrices && player.price !== undefined && player.price !== null) {
        textY += roleSize + lineGap
        ctx.fillStyle = COLORS.points
        ctx.font = `600 ${priceSize}px ${FONT_MONO}`
        ctx.fillText(
          truncateText(ctx, `${formatPoints(player.price)} PTS`, photoW),
          photoX,
          textY
        )
      }
      ctx.restore()
    }
  } else {
    // 10+ players: 3-column horizontal rounded tiles so square thumbnails remain clear and uncropped
    const gapX = rows <= 5 ? 18 : 14
    const gapY = rows <= 5 ? 16 : rows <= 7 ? 12 : 10
    const cellW = (contentW - gapX * (cols - 1)) / cols
    const maxCellH = (gridHeight - gapY * (rows - 1)) / rows
    const cellH = Math.min(maxCellH, rows === 4 ? 196 : 168)
    const totalGridH = rows * cellH + (rows - 1) * gapY
    const startY = gridTop + Math.max(0, (gridHeight - totalGridH) * 0.4)

    const cardRadius = Math.max(14, Math.min(20, Math.round(cellH * 0.12)))
    const pad = Math.max(8, Math.min(14, Math.round(cellH * 0.09)))
    const photoSize = Math.min(cellH - pad * 2, Math.round(cellW * 0.36))
    const photoR = Math.max(10, Math.round(photoSize * 0.16))
    const innerGap = Math.max(10, Math.min(14, pad))

    const nameSize = Math.max(12, Math.min(17.5, Math.round(cellH * 0.115)))
    const roleSize = Math.max(10.5, Math.min(13.5, Math.round(cellH * 0.09)))
    const priceSize = Math.max(10.5, Math.min(13, Math.round(cellH * 0.085)))
    const allowTwoLineName = cellH >= 112
    const nameLineH = Math.round(nameSize * 1.18)
    const metaGap = Math.max(4, Math.round(cellH * 0.045))

    for (let i = 0; i < players.length; i++) {
      const player = players[i]
      const row = Math.floor(i / cols)
      const col = i % cols
      const rowCount = Math.min(cols, players.length - row * cols)
      const rowWidth = rowCount * cellW + (rowCount - 1) * gapX
      const rowStartX = padX + (contentW - rowWidth) / 2

      const cellX = rowStartX + col * (cellW + gapX)
      const cellY = startY + row * (cellH + gapY)

      // Cell card
      ctx.save()
      roundedRectPath(ctx, cellX, cellY, cellW, cellH, cardRadius)
      ctx.fillStyle = COLORS.surface
      ctx.fill()
      ctx.strokeStyle = COLORS.border
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.restore()

      // Left square thumbnail tile
      const photoX = cellX + pad
      const photoY = cellY + (cellH - photoSize) / 2

      drawPlayerPhotoOrInitials(
        ctx,
        loadedImages[i],
        player.name,
        photoX,
        photoY,
        photoSize,
        photoSize,
        photoR
      )

      // Right text stack, vertically centered
      const textX = photoX + photoSize + innerGap
      const textMaxW = Math.max(40, cellX + cellW - pad - textX)

      ctx.save()
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'

      ctx.font = `700 ${nameSize}px ${FONT_SYNE}`
      const nameLines = wrapTextLines(ctx, player.name, textMaxW, allowTwoLineName ? 2 : 1)
      const hasPrice = showPrices && player.price !== undefined && player.price !== null

      const stackH =
        nameLines.length * nameLineH +
        metaGap +
        roleSize +
        (hasPrice ? metaGap + priceSize : 0)

      let textY = cellY + Math.max(pad, (cellH - stackH) / 2)

      ctx.fillStyle = COLORS.text
      for (let l = 0; l < nameLines.length; l++) {
        ctx.fillText(nameLines[l], textX, textY)
        textY += nameLineH
      }

      textY += metaGap
      ctx.fillStyle = COLORS.muted
      ctx.font = `400 ${roleSize}px ${FONT_SANS}`
      ctx.fillText(truncateText(ctx, player.role, textMaxW), textX, textY)

      if (hasPrice) {
        textY += roleSize + metaGap
        ctx.fillStyle = COLORS.points
        ctx.font = `600 ${priceSize}px ${FONT_MONO}`
        ctx.fillText(
          truncateText(ctx, `${formatPoints(player.price)} PTS`, textMaxW),
          textX,
          textY
        )
      }
      ctx.restore()
    }
  }

  return canvas
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
      } else {
        reject(new Error('Failed to export squad image.'))
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

export async function shareSquadImage(
  options: ShareSquadOptions
): Promise<ShareSquadResult> {
  if (!options.players || options.players.length === 0) {
    return { outcome: 'empty' }
  }

  const canvas = await renderSquadCanvas(options)
  const blob = await canvasToPngBlob(canvas)
  const filename = buildFilename(options.teamName)

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
          title: `${options.teamName} Squad`
        })
        return { outcome: 'shared', filename }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return { outcome: 'cancelled', filename }
        }
        // Fall through to PNG download if native share fails (e.g. gesture timeout)
      }
    }
  }

  triggerDownload(blob, filename)
  return { outcome: 'downloaded', filename }
}
