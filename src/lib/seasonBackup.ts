import type { Season } from '../types'
import { AppError } from './errors'
import { markLocalMutation, supabase } from './data/client'
import { invalidateSeasonCaches } from './data/seasons'
import { isRecord, toFiniteNumber, toNullableFiniteNumber } from './utils'

export const SEASON_BACKUP_SCHEMA_VERSION = 1 as const
const PAGE_SIZE = 500
const ID_BATCH_SIZE = 100
const MAX_BACKUP_FILE_BYTES = 25 * 1024 * 1024 // 25 MB safety limit

export interface SeasonBackupSeasonRow {
  id: string
  name: string
  is_active: boolean
  start_date: string | null
  end_date: string | null
  description: string | null
  created_at: string | null
}

export interface SeasonBackupAuctionSettingsRow {
  season_id: string
  bid_increments: number[]
  max_squad_size: number | null
  secured_enabled: boolean
  secured_duration_seconds: number
  price_countup_seconds: number
  bid_update_ms: number
  catchup_window_seconds: number
}

export interface SeasonBackupTeamRow {
  id: string
  season_id: string
  sport: string
  name: string
  short_code: string | null
  color: string
  logo_url: string | null
  owner_display_name: string | null
  owner_photo_url: string | null
  starting_purse: number
  current_purse: number
  created_at: string | null
}

export interface SeasonBackupAthleteRow {
  id: string
  athlete_code: number
  name: string
  academic_year: string
  photo_url: string | null
  photo_thumb_url: string | null
  roll_no: string | null
  notes: string | null
  created_at: string | null
}

export interface SeasonBackupPlayerRow {
  id: string
  season_id: string
  athlete_id: string
  sport: string
  playing_role: string
  academic_year: string
  base_points: number
  status: string
  team_id: string | null
  purchase_price: number | null
  created_at: string | null
}

export interface SeasonBackupPurseTransactionRow {
  id: string
  season_id: string
  team_id: string
  type: string
  amount: number
  balance_after: number
  reason: string | null
  created_at: string | null
}

export interface SeasonBackupQueueRow {
  season_id: string
  sport: string
  player_id: string
  sort_order: number
}

export interface SeasonBackupBidRow {
  id: string
  player_id: string
  team_id: string
  amount: number
  voided: boolean
  created_at: string | null
}

export interface SeasonBackupSaleRow {
  id: string
  season_id: string | null
  player_id: string
  team_id: string
  price: number
  reversed_at: string | null
  created_at: string | null
}

export interface SeasonBackupCounts {
  auction_settings: number
  teams: number
  athletes: number
  players: number
  purse_transactions: number
  auction_queue: number
  auction_bids: number
  auction_sales: number
}

export interface SeasonBackupV1 {
  schema_version: typeof SEASON_BACKUP_SCHEMA_VERSION
  exported_at: string
  counts: SeasonBackupCounts
  season: SeasonBackupSeasonRow
  auction_settings: SeasonBackupAuctionSettingsRow | null
  teams: SeasonBackupTeamRow[]
  athletes: SeasonBackupAthleteRow[]
  players: SeasonBackupPlayerRow[]
  purse_transactions: SeasonBackupPurseTransactionRow[]
  auction_queue: SeasonBackupQueueRow[]
  auction_bids: SeasonBackupBidRow[]
  auction_sales: SeasonBackupSaleRow[]
}

export interface BackupProgress {
  step: number
  totalSteps: number
  label: string
}

export interface ExportSeasonBackupResult {
  filename: string
  counts: SeasonBackupCounts
}

export interface ValidatedSeasonBackup {
  backup: SeasonBackupV1
  targetSeasonName: string
  previewSummary: string
}

export interface RestoreSeasonBackupResult {
  season_id: string
  season_name: string
  counts: {
    auction_settings: number
    teams: number
    athletes_matched: number
    athletes_created: number
    players: number
    purse_transactions: number
    auction_queue: number
    auction_bids: number
    auction_sales: number
  }
}

function toNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null
  return String(value)
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function slugifySeasonName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return slug || 'season'
}

function formatDateStamp(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function isMissingSeasonIdColumnError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false
  return (
    err.code === '42703' ||
    err.code === 'PGRST204' ||
    Boolean(err.message && err.message.includes('season_id'))
  )
}

async function fetchPagedRows<T>(
  fetchPage: (
    from: number,
    to: number
  ) => Promise<{ data: T[] | null; error: { code?: string; message: string } | null }>,
  onPage?: (countSoFar: number) => void
): Promise<T[]> {
  const all: T[] = []
  let from = 0

  while (true) {
    const to = from + PAGE_SIZE - 1
    const { data, error } = await fetchPage(from, to)
    if (error) {
      throw new AppError(error.message, { original: error })
    }
    const batch = Array.isArray(data) ? data : []
    all.push(...batch)
    onPage?.(all.length)
    if (batch.length < PAGE_SIZE) {
      break
    }
    from += PAGE_SIZE
  }

  return all
}

async function fetchBatchedByIdsPaged<T>(
  ids: string[],
  fetchChunkPage: (
    chunk: string[],
    from: number,
    to: number
  ) => Promise<{ data: T[] | null; error: { code?: string; message: string } | null }>,
  onPage?: (countSoFar: number) => void
): Promise<T[]> {
  if (ids.length === 0) return []
  const all: T[] = []

  for (let i = 0; i < ids.length; i += ID_BATCH_SIZE) {
    const chunk = ids.slice(i, i + ID_BATCH_SIZE)
    let from = 0
    while (true) {
      const to = from + PAGE_SIZE - 1
      const { data, error } = await fetchChunkPage(chunk, from, to)
      if (error) {
        throw new AppError(error.message, { original: error })
      }
      const batch = Array.isArray(data) ? data : []
      all.push(...batch)
      onPage?.(all.length)
      if (batch.length < PAGE_SIZE) {
        break
      }
      from += PAGE_SIZE
    }
  }

  return all
}

function triggerJsonDownload(filename: string, payload: SeasonBackupV1): void {
  const json = JSON.stringify(payload, null, 2)
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function formatBackupCountsSummary(counts: SeasonBackupCounts): string {
  const parts: string[] = [
    `${counts.teams} ${counts.teams === 1 ? 'team' : 'teams'}`,
    `${counts.players} ${counts.players === 1 ? 'player' : 'players'}`,
    `${counts.athletes} ${counts.athletes === 1 ? 'athlete' : 'athletes'}`,
    `${counts.purse_transactions} purse tx`,
    `${counts.auction_queue} queued`,
    `${counts.auction_bids} ${counts.auction_bids === 1 ? 'bid' : 'bids'}`,
    `${counts.auction_sales} ${counts.auction_sales === 1 ? 'sale' : 'sales'}`
  ]
  return parts.join(', ')
}

export async function exportSeasonBackup(
  season: Pick<Season, 'id' | 'name'>,
  onProgress?: (progress: BackupProgress) => void
): Promise<ExportSeasonBackupResult> {
  if (!supabase) {
    throw new AppError('Backup requires a connected Supabase database.')
  }
  const client = supabase
  const totalSteps = 9
  const report = (step: number, label: string) => {
    onProgress?.({ step, totalSteps, label })
  }

  // 1. Season row
  report(1, 'Reading season...')
  const { data: seasonRaw, error: seasonErr } = await client
    .from('seasons')
    .select('id, name, is_active, start_date, end_date, description, created_at')
    .eq('id', season.id)
    .single()

  if (seasonErr || !seasonRaw) {
    throw new AppError(seasonErr?.message || 'Season not found', { original: seasonErr })
  }

  const seasonRow: SeasonBackupSeasonRow = {
    id: String(seasonRaw.id),
    name: String(seasonRaw.name),
    is_active: Boolean(seasonRaw.is_active),
    start_date: toNullableString(seasonRaw.start_date),
    end_date: toNullableString(seasonRaw.end_date),
    description: toNullableString(seasonRaw.description),
    created_at: toNullableString(seasonRaw.created_at)
  }

  // 2. Auction settings
  report(2, 'Reading auction settings...')
  const { data: settingsRaw, error: settingsErr } = await client
    .from('auction_settings')
    .select(
      'season_id, bid_increments, max_squad_size, secured_enabled, secured_duration_seconds, price_countup_seconds, bid_update_ms, catchup_window_seconds'
    )
    .eq('season_id', season.id)
    .maybeSingle()

  if (settingsErr) {
    throw new AppError(settingsErr.message, { original: settingsErr })
  }

  const auctionSettingsRow: SeasonBackupAuctionSettingsRow | null = settingsRaw
    ? {
        season_id: String(settingsRaw.season_id),
        bid_increments: Array.isArray(settingsRaw.bid_increments)
          ? settingsRaw.bid_increments
              .map((v: unknown) => Number(v))
              .filter((v: number) => Number.isFinite(v) && v > 0)
          : [10, 25, 50, 100],
        max_squad_size: toNullableFiniteNumber(settingsRaw.max_squad_size),
        secured_enabled: Boolean(settingsRaw.secured_enabled),
        secured_duration_seconds: toFiniteNumber(settingsRaw.secured_duration_seconds, 10),
        price_countup_seconds: toFiniteNumber(settingsRaw.price_countup_seconds, 2),
        bid_update_ms: toFiniteNumber(settingsRaw.bid_update_ms, 500),
        catchup_window_seconds: toFiniteNumber(settingsRaw.catchup_window_seconds, 5)
      }
    : null

  // 3. Teams (explicit columns — never includes owner_user_id or credentials)
  report(3, 'Reading teams...')
  const teamsRaw = await fetchPagedRows<Record<string, unknown>>(
    async (from, to) => {
      const res = await client
        .from('teams')
        .select(
          'id, season_id, sport, name, short_code, color, logo_url, owner_display_name, owner_photo_url, starting_purse, current_purse, created_at'
        )
        .eq('season_id', season.id)
        .order('id', { ascending: true })
        .range(from, to)
      return {
        data: (res.data as Array<Record<string, unknown>> | null) ?? null,
        error: res.error
      }
    },
    (count) => report(3, `Reading teams (${count})...`)
  )

  const teams: SeasonBackupTeamRow[] = teamsRaw.map((row) => ({
    id: String(row.id),
    season_id: String(row.season_id),
    sport: String(row.sport),
    name: String(row.name),
    short_code: toNullableString(row.short_code),
    color: String(row.color || '#6366F1'),
    logo_url: toNullableString(row.logo_url),
    owner_display_name: toNullableString(row.owner_display_name),
    owner_photo_url: toNullableString(row.owner_photo_url),
    starting_purse: toFiniteNumber(row.starting_purse, 0),
    current_purse: toFiniteNumber(row.current_purse, 0),
    created_at: toNullableString(row.created_at)
  }))

  // 4. Players
  report(4, 'Reading players...')
  const playersRaw = await fetchPagedRows<Record<string, unknown>>(
    async (from, to) => {
      const res = await client
        .from('players')
        .select(
          'id, season_id, athlete_id, sport, playing_role, base_points, academic_year, status, team_id, purchase_price, created_at'
        )
        .eq('season_id', season.id)
        .order('id', { ascending: true })
        .range(from, to)
      return {
        data: (res.data as Array<Record<string, unknown>> | null) ?? null,
        error: res.error
      }
    },
    (count) => report(4, `Reading players (${count})...`)
  )

  const players: SeasonBackupPlayerRow[] = playersRaw.map((row) => ({
    id: String(row.id),
    season_id: String(row.season_id),
    athlete_id: String(row.athlete_id),
    sport: String(row.sport),
    playing_role: String(row.playing_role || ''),
    academic_year: String(row.academic_year || '1st'),
    base_points: toFiniteNumber(row.base_points, 0),
    status: String(row.status || 'available'),
    team_id: toNullableString(row.team_id),
    purchase_price: toNullableFiniteNumber(row.purchase_price),
    created_at: toNullableString(row.created_at)
  }))

  // 5. Referenced Athletes (batched by unique athlete_id, keeping photo URLs only)
  report(5, 'Reading athletes...')
  const uniqueAthleteIds = Array.from(
    new Set(players.map((p) => p.athlete_id).filter((id) => id.length > 0))
  ).sort()

  const athletesRaw = await fetchBatchedByIdsPaged<Record<string, unknown>>(
    uniqueAthleteIds,
    async (chunk, from, to) => {
      const res = await client
        .from('athletes')
        .select(
          'id, athlete_code, name, academic_year, photo_url, photo_thumb_url, roll_no, notes, created_at'
        )
        .in('id', chunk)
        .order('id', { ascending: true })
        .range(from, to)
      return {
        data: (res.data as Array<Record<string, unknown>> | null) ?? null,
        error: res.error
      }
    },
    (count) => report(5, `Reading athletes (${count})...`)
  )

  const athletes: SeasonBackupAthleteRow[] = athletesRaw
    .map((row) => ({
      id: String(row.id),
      athlete_code: Math.trunc(toFiniteNumber(row.athlete_code, 0)),
      name: String(row.name),
      academic_year: String(row.academic_year || '1st'),
      photo_url: toNullableString(row.photo_url),
      photo_thumb_url: toNullableString(row.photo_thumb_url),
      roll_no: toNullableString(row.roll_no),
      notes: toNullableString(row.notes),
      created_at: toNullableString(row.created_at)
    }))
    .sort((a, b) => a.athlete_code - b.athlete_code || a.id.localeCompare(b.id))

  // 6. Purse transactions (explicit columns — omits created_by so no account IDs/emails are exported)
  report(6, 'Reading purse transactions...')
  const purseTxRaw = await fetchPagedRows<Record<string, unknown>>(
    async (from, to) => {
      const res = await client
        .from('purse_transactions')
        .select('id, season_id, team_id, type, amount, balance_after, reason, created_at')
        .eq('season_id', season.id)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)
      return {
        data: (res.data as Array<Record<string, unknown>> | null) ?? null,
        error: res.error
      }
    },
    (count) => report(6, `Reading purse transactions (${count})...`)
  )

  const purse_transactions: SeasonBackupPurseTransactionRow[] = purseTxRaw.map((row) => ({
    id: String(row.id),
    season_id: String(row.season_id),
    team_id: String(row.team_id),
    type: String(row.type),
    amount: toFiniteNumber(row.amount, 0),
    balance_after: toFiniteNumber(row.balance_after, 0),
    reason: toNullableString(row.reason),
    created_at: toNullableString(row.created_at)
  }))

  // 7. Auction queue
  report(7, 'Reading auction queue...')
  const queueRaw = await fetchPagedRows<Record<string, unknown>>(
    async (from, to) => {
      const res = await client
        .from('auction_queue')
        .select('season_id, sport, player_id, sort_order')
        .eq('season_id', season.id)
        .order('sport', { ascending: true })
        .order('sort_order', { ascending: true })
        .order('player_id', { ascending: true })
        .range(from, to)
      return {
        data: (res.data as Array<Record<string, unknown>> | null) ?? null,
        error: res.error
      }
    },
    (count) => report(7, `Reading auction queue (${count})...`)
  )

  const auction_queue: SeasonBackupQueueRow[] = queueRaw.map((row) => ({
    season_id: String(row.season_id),
    sport: String(row.sport),
    player_id: String(row.player_id),
    sort_order: Math.trunc(toFiniteNumber(row.sort_order, 0))
  }))

  const playerIds = players.map((p) => p.id)

  // 8. Auction bids (batched by player_id + paged so row limits are never hit)
  report(8, 'Reading auction bids...')
  const bidsRaw = await fetchBatchedByIdsPaged<Record<string, unknown>>(
    playerIds,
    async (chunk, from, to) => {
      const res = await client
        .from('auction_bids')
        .select('id, player_id, team_id, amount, voided, created_at')
        .in('player_id', chunk)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)
      return {
        data: (res.data as Array<Record<string, unknown>> | null) ?? null,
        error: res.error
      }
    },
    (count) => report(8, `Reading auction bids (${count})...`)
  )

  const auction_bids: SeasonBackupBidRow[] = bidsRaw.map((row) => ({
    id: String(row.id),
    player_id: String(row.player_id),
    team_id: String(row.team_id),
    amount: toFiniteNumber(row.amount, 0),
    voided: Boolean(row.voided),
    created_at: toNullableString(row.created_at)
  }))

  // 9. Auction sales (paged by season_id, with fallback to batched player_id if season_id column absent)
  report(9, 'Reading auction sales...')
  let salesRaw: Array<Record<string, unknown>> = []
  try {
    salesRaw = await fetchPagedRows<Record<string, unknown>>(
      async (from, to) => {
        const res = await client
          .from('auction_sales')
          .select('id, season_id, player_id, team_id, price, reversed_at, created_at')
          .eq('season_id', season.id)
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to)
        return {
          data: (res.data as Array<Record<string, unknown>> | null) ?? null,
          error: res.error
        }
      },
      (count) => report(9, `Reading auction sales (${count})...`)
    )
  } catch (err: unknown) {
    const orig =
      err instanceof AppError
        ? (err.originalError as { code?: string; message?: string } | undefined)
        : undefined
    if (!isMissingSeasonIdColumnError(orig ?? null)) {
      throw err
    }
    salesRaw = await fetchBatchedByIdsPaged<Record<string, unknown>>(
      playerIds,
      async (chunk, from, to) => {
        const res = await client
          .from('auction_sales')
          .select('id, player_id, team_id, price, reversed_at, created_at')
          .in('player_id', chunk)
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to)
        return {
          data: (res.data as Array<Record<string, unknown>> | null) ?? null,
          error: res.error
        }
      },
      (count) => report(9, `Reading auction sales (${count})...`)
    )
  }

  const auction_sales: SeasonBackupSaleRow[] = salesRaw.map((row) => ({
    id: String(row.id),
    season_id: toNullableString(row.season_id ?? season.id),
    player_id: String(row.player_id),
    team_id: String(row.team_id),
    price: toFiniteNumber(row.price, 0),
    reversed_at: toNullableString(row.reversed_at),
    created_at: toNullableString(row.created_at)
  }))

  const counts: SeasonBackupCounts = {
    auction_settings: auctionSettingsRow ? 1 : 0,
    teams: teams.length,
    athletes: athletes.length,
    players: players.length,
    purse_transactions: purse_transactions.length,
    auction_queue: auction_queue.length,
    auction_bids: auction_bids.length,
    auction_sales: auction_sales.length
  }

  const now = new Date()
  const payload: SeasonBackupV1 = {
    schema_version: SEASON_BACKUP_SCHEMA_VERSION,
    exported_at: now.toISOString(),
    counts,
    season: seasonRow,
    auction_settings: auctionSettingsRow,
    teams,
    athletes,
    players,
    purse_transactions,
    auction_queue,
    auction_bids,
    auction_sales
  }

  const filename = `fieldr-backup-${slugifySeasonName(seasonRow.name)}-${formatDateStamp(now)}.json`
  triggerJsonDownload(filename, payload)

  return { filename, counts }
}

export async function parseAndValidateBackupFile(file: File): Promise<ValidatedSeasonBackup> {
  if (file.size > MAX_BACKUP_FILE_BYTES) {
    throw new AppError('Backup file exceeds the 25 MB limit.')
  }

  let rawText: string
  try {
    rawText = await file.text()
  } catch {
    throw new AppError('Could not read the selected file.')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawText)
  } catch {
    throw new AppError('Selected file is not valid JSON.')
  }

  return validateSeasonBackup(parsed)
}

export function validateSeasonBackup(raw: unknown): ValidatedSeasonBackup {
  if (!isRecord(raw)) {
    throw new AppError('Backup file must contain a JSON object.')
  }

  if (raw.schema_version !== SEASON_BACKUP_SCHEMA_VERSION) {
    throw new AppError(
      `Unsupported backup schema version (${String(raw.schema_version ?? 'missing')}). Expected version ${SEASON_BACKUP_SCHEMA_VERSION}.`
    )
  }

  if (typeof raw.exported_at !== 'string' || !raw.exported_at.trim()) {
    throw new AppError('Backup is missing a valid exported_at timestamp.')
  }

  if (!isRecord(raw.season)) {
    throw new AppError('Backup is missing season metadata.')
  }

  const seasonName = typeof raw.season.name === 'string' ? raw.season.name.trim() : ''
  if (!seasonName) {
    throw new AppError('Backup season name is empty or invalid.')
  }

  if (!isRecord(raw.counts)) {
    throw new AppError('Backup is missing per-table counts.')
  }

  const arrayKeys = [
    'teams',
    'athletes',
    'players',
    'purse_transactions',
    'auction_queue',
    'auction_bids',
    'auction_sales'
  ] as const

  for (const key of arrayKeys) {
    if (!Array.isArray(raw[key])) {
      throw new AppError(`Backup field "${key}" must be an array.`)
    }
    const declared = raw.counts[key]
    if (!isNonNegativeInt(declared)) {
      throw new AppError(`Backup counts.${key} is missing or invalid.`)
    }
    if (declared !== (raw[key] as unknown[]).length) {
      throw new AppError(
        `Count mismatch for "${key}": header says ${declared}, found ${(raw[key] as unknown[]).length}.`
      )
    }
  }

  const rawSettings = raw.auction_settings
  if (rawSettings !== null && rawSettings !== undefined && !isRecord(rawSettings)) {
    throw new AppError('Backup field "auction_settings" must be an object or null.')
  }
  const actualSettingsCount = rawSettings ? 1 : 0
  if (raw.counts.auction_settings !== undefined) {
    if (
      !isNonNegativeInt(raw.counts.auction_settings) ||
      raw.counts.auction_settings !== actualSettingsCount
    ) {
      throw new AppError(
        `Count mismatch for "auction_settings": header says ${String(raw.counts.auction_settings)}, found ${actualSettingsCount}.`
      )
    }
  }

  // Sanitize and verify row structure + cross-references (drops any unexpected/sensitive fields)
  const teamIds = new Set<string>()
  const teams: SeasonBackupTeamRow[] = (raw.teams as unknown[]).map((item, idx) => {
    if (!isRecord(item)) {
      throw new AppError(`Invalid team record at index ${idx}.`)
    }
    const id = typeof item.id === 'string' ? item.id.trim() : ''
    const sport = typeof item.sport === 'string' ? item.sport.trim() : ''
    const name = typeof item.name === 'string' ? item.name.trim() : ''
    if (!id || !sport || !name) {
      throw new AppError(`Team at index ${idx} is missing id, sport, or name.`)
    }
    if (teamIds.has(id)) {
      throw new AppError(`Duplicate team id "${id}" in backup.`)
    }
    teamIds.add(id)
    return {
      id,
      season_id: toNullableString(item.season_id) || String(raw.season && isRecord(raw.season) ? raw.season.id || '' : ''),
      sport,
      name,
      short_code: toNullableString(item.short_code),
      color: typeof item.color === 'string' && item.color.trim() ? item.color.trim() : '#6366F1',
      logo_url: toNullableString(item.logo_url),
      owner_display_name: toNullableString(item.owner_display_name),
      owner_photo_url: toNullableString(item.owner_photo_url),
      starting_purse: toFiniteNumber(item.starting_purse, 0),
      current_purse: toFiniteNumber(item.current_purse, 0),
      created_at: toNullableString(item.created_at)
    }
  })

  const athleteIds = new Set<string>()
  const athletes: SeasonBackupAthleteRow[] = (raw.athletes as unknown[]).map((item, idx) => {
    if (!isRecord(item)) {
      throw new AppError(`Invalid athlete record at index ${idx}.`)
    }
    const id = typeof item.id === 'string' ? item.id.trim() : ''
    const name = typeof item.name === 'string' ? item.name.trim() : ''
    const code = Number(item.athlete_code)
    if (!id || !name || !Number.isInteger(code) || code <= 0) {
      throw new AppError(`Athlete at index ${idx} is missing a valid id, name, or athlete_code.`)
    }
    if (athleteIds.has(id)) {
      throw new AppError(`Duplicate athlete id "${id}" in backup.`)
    }
    athleteIds.add(id)
    return {
      id,
      athlete_code: code,
      name,
      academic_year:
        typeof item.academic_year === 'string' && item.academic_year.trim()
          ? item.academic_year.trim()
          : '1st',
      photo_url: toNullableString(item.photo_url),
      photo_thumb_url: toNullableString(item.photo_thumb_url),
      roll_no: toNullableString(item.roll_no),
      notes: toNullableString(item.notes),
      created_at: toNullableString(item.created_at)
    }
  })

  const playerIds = new Set<string>()
  const players: SeasonBackupPlayerRow[] = (raw.players as unknown[]).map((item, idx) => {
    if (!isRecord(item)) {
      throw new AppError(`Invalid player record at index ${idx}.`)
    }
    const id = typeof item.id === 'string' ? item.id.trim() : ''
    const athlete_id = typeof item.athlete_id === 'string' ? item.athlete_id.trim() : ''
    const sport = typeof item.sport === 'string' ? item.sport.trim() : ''
    const team_id = toNullableString(item.team_id)
    if (!id || !athlete_id || !sport) {
      throw new AppError(`Player at index ${idx} is missing id, athlete_id, or sport.`)
    }
    if (!athleteIds.has(athlete_id)) {
      throw new AppError(`Player at index ${idx} references an athlete not present in backup.`)
    }
    if (team_id && !teamIds.has(team_id)) {
      throw new AppError(`Player at index ${idx} references a team not present in backup.`)
    }
    if (playerIds.has(id)) {
      throw new AppError(`Duplicate player id "${id}" in backup.`)
    }
    playerIds.add(id)
    return {
      id,
      season_id: toNullableString(item.season_id) || '',
      athlete_id,
      sport,
      playing_role: typeof item.playing_role === 'string' ? item.playing_role : '',
      academic_year:
        typeof item.academic_year === 'string' && item.academic_year.trim()
          ? item.academic_year.trim()
          : '1st',
      base_points: toFiniteNumber(item.base_points, 0),
      status: typeof item.status === 'string' && item.status.trim() ? item.status.trim() : 'available',
      team_id,
      purchase_price: toNullableFiniteNumber(item.purchase_price),
      created_at: toNullableString(item.created_at)
    }
  })

  const purse_transactions: SeasonBackupPurseTransactionRow[] = (
    raw.purse_transactions as unknown[]
  ).map((item, idx) => {
    if (!isRecord(item)) {
      throw new AppError(`Invalid purse transaction at index ${idx}.`)
    }
    const team_id = typeof item.team_id === 'string' ? item.team_id.trim() : ''
    const type = typeof item.type === 'string' ? item.type.trim() : ''
    if (!team_id || !teamIds.has(team_id) || !type) {
      throw new AppError(`Purse transaction at index ${idx} has an invalid team_id or type.`)
    }
    return {
      id: typeof item.id === 'string' ? item.id : `tx-${idx}`,
      season_id: toNullableString(item.season_id) || '',
      team_id,
      type,
      amount: toFiniteNumber(item.amount, 0),
      balance_after: toFiniteNumber(item.balance_after, 0),
      reason: toNullableString(item.reason),
      created_at: toNullableString(item.created_at)
    }
  })

  const auction_queue: SeasonBackupQueueRow[] = (raw.auction_queue as unknown[]).map((item, idx) => {
    if (!isRecord(item)) {
      throw new AppError(`Invalid auction queue row at index ${idx}.`)
    }
    const sport = typeof item.sport === 'string' ? item.sport.trim() : ''
    const player_id = typeof item.player_id === 'string' ? item.player_id.trim() : ''
    if (!sport || !player_id || !playerIds.has(player_id)) {
      throw new AppError(`Auction queue row at index ${idx} references a missing player or sport.`)
    }
    return {
      season_id: toNullableString(item.season_id) || '',
      sport,
      player_id,
      sort_order: Math.trunc(toFiniteNumber(item.sort_order, idx))
    }
  })

  const auction_bids: SeasonBackupBidRow[] = (raw.auction_bids as unknown[]).map((item, idx) => {
    if (!isRecord(item)) {
      throw new AppError(`Invalid auction bid at index ${idx}.`)
    }
    const player_id = typeof item.player_id === 'string' ? item.player_id.trim() : ''
    const team_id = typeof item.team_id === 'string' ? item.team_id.trim() : ''
    if (!player_id || !playerIds.has(player_id) || !team_id || !teamIds.has(team_id)) {
      throw new AppError(`Auction bid at index ${idx} references a missing player or team.`)
    }
    return {
      id: typeof item.id === 'string' ? item.id : `bid-${idx}`,
      player_id,
      team_id,
      amount: toFiniteNumber(item.amount, 0),
      voided: Boolean(item.voided),
      created_at: toNullableString(item.created_at)
    }
  })

  const auction_sales: SeasonBackupSaleRow[] = (raw.auction_sales as unknown[]).map((item, idx) => {
    if (!isRecord(item)) {
      throw new AppError(`Invalid auction sale at index ${idx}.`)
    }
    const player_id = typeof item.player_id === 'string' ? item.player_id.trim() : ''
    const team_id = typeof item.team_id === 'string' ? item.team_id.trim() : ''
    if (!player_id || !playerIds.has(player_id) || !team_id || !teamIds.has(team_id)) {
      throw new AppError(`Auction sale at index ${idx} references a missing player or team.`)
    }
    return {
      id: typeof item.id === 'string' ? item.id : `sale-${idx}`,
      season_id: toNullableString(item.season_id),
      player_id,
      team_id,
      price: toFiniteNumber(item.price, 0),
      reversed_at: toNullableString(item.reversed_at),
      created_at: toNullableString(item.created_at)
    }
  })

  const auction_settings: SeasonBackupAuctionSettingsRow | null = rawSettings
    ? {
        season_id: toNullableString(rawSettings.season_id) || '',
        bid_increments: Array.isArray(rawSettings.bid_increments)
          ? rawSettings.bid_increments
              .map((v: unknown) => Number(v))
              .filter((v: number) => Number.isFinite(v) && v > 0)
          : [10, 25, 50, 100],
        max_squad_size: toNullableFiniteNumber(rawSettings.max_squad_size),
        secured_enabled: Boolean(rawSettings.secured_enabled),
        secured_duration_seconds: toFiniteNumber(rawSettings.secured_duration_seconds, 10),
        price_countup_seconds: toFiniteNumber(rawSettings.price_countup_seconds, 2),
        bid_update_ms: toFiniteNumber(rawSettings.bid_update_ms, 500),
        catchup_window_seconds: toFiniteNumber(rawSettings.catchup_window_seconds, 5)
      }
    : null

  const counts: SeasonBackupCounts = {
    auction_settings: auction_settings ? 1 : 0,
    teams: teams.length,
    athletes: athletes.length,
    players: players.length,
    purse_transactions: purse_transactions.length,
    auction_queue: auction_queue.length,
    auction_bids: auction_bids.length,
    auction_sales: auction_sales.length
  }

  const sanitized: SeasonBackupV1 = {
    schema_version: SEASON_BACKUP_SCHEMA_VERSION,
    exported_at: raw.exported_at,
    counts,
    season: {
      id: toNullableString(raw.season.id) || '',
      name: seasonName,
      is_active: false,
      start_date: toNullableString(raw.season.start_date),
      end_date: toNullableString(raw.season.end_date),
      description: toNullableString(raw.season.description),
      created_at: toNullableString(raw.season.created_at)
    },
    auction_settings,
    teams,
    athletes,
    players,
    purse_transactions,
    auction_queue,
    auction_bids,
    auction_sales
  }

  const targetSeasonName = `${seasonName} (restored)`
  const previewSummary = `Will create season '${targetSeasonName}': ${formatBackupCountsSummary(counts)}`

  return {
    backup: sanitized,
    targetSeasonName,
    previewSummary
  }
}

export async function restoreSeasonFromBackup(
  backup: SeasonBackupV1
): Promise<RestoreSeasonBackupResult> {
  if (!supabase) {
    throw new AppError('Restore requires a connected Supabase database.')
  }

  markLocalMutation(['players', 'athletes', 'teams', 'auction'])
  const { data, error } = await supabase.rpc('restore_season_backup', {
    p_backup: backup
  })

  if (error) {
    throw new AppError(error.message, { original: error })
  }

  if (!isRecord(data) || typeof data.season_id !== 'string') {
    throw new AppError('Unexpected response from restore_season_backup.')
  }

  markLocalMutation(['players', 'athletes', 'teams', 'auction'])
  invalidateSeasonCaches()

  const rawCounts = isRecord(data.counts) ? data.counts : {}
  return {
    season_id: data.season_id,
    season_name:
      typeof data.season_name === 'string'
        ? data.season_name
        : `${backup.season.name} (restored)`,
    counts: {
      auction_settings: toFiniteNumber(rawCounts.auction_settings, 0),
      teams: toFiniteNumber(rawCounts.teams, 0),
      athletes_matched: toFiniteNumber(rawCounts.athletes_matched, 0),
      athletes_created: toFiniteNumber(rawCounts.athletes_created, 0),
      players: toFiniteNumber(rawCounts.players, 0),
      purse_transactions: toFiniteNumber(rawCounts.purse_transactions, 0),
      auction_queue: toFiniteNumber(rawCounts.auction_queue, 0),
      auction_bids: toFiniteNumber(rawCounts.auction_bids, 0),
      auction_sales: toFiniteNumber(rawCounts.auction_sales, 0)
    }
  }
}
