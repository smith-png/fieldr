import type {
  AcademicYear,
  AdminRegistrationSettings,
  Athlete,
  AthleteRegistration,
  Player,
  PublicRegistrationConfig,
  PublicRegistrationSport,
  RegistrationSportEntry,
  Season,
  Sport
} from '../../types'
import { AppError } from '../errors'
import { isRecord } from '../utils'
import { blobToDataUrl, createThumbnailBlob } from '../imageCompression'
import {
  DEFAULT_SPORTS,
  STORAGE_KEYS,
  getLocal,
  getNextAthleteCode,
  isDemoMode,
  markLocalMutation,
  notifyChange,
  setLocal,
  supabase
} from './client'

export const REGISTRATION_PENDING_BUCKET = 'registration-pending'

export const DEFAULT_CONFIRMATION_MESSAGE = 'Submitted. An admin will review your entry.'
export const DEFAULT_INSTRUCTIONS_MD =
  'Complete your details below, select every sport you are entering, and upload a recent portrait photo. Have the registration code from the organizers ready.'

const DEMO_REG_SETTINGS_KEY = 'fieldr_registration_settings'
const DEMO_REGISTRATIONS_KEY = 'fieldr_registrations'

const CLOSED_FALLBACK_CONFIG: PublicRegistrationConfig = {
  is_open: false,
  reason: 'closed',
  season_id: null,
  season_name: null,
  opens_at: null,
  closes_at: null,
  accepted_sports: [],
  instructions_md: DEFAULT_INSTRUCTIONS_MD,
  confirmation_message: DEFAULT_CONFIRMATION_MESSAGE
}

// In-memory cache for public registration open/closed state (no polling, no realtime)
const PUBLIC_CONFIG_TTL_MS = 60_000
let cachedPublicConfig: PublicRegistrationConfig | null = null
let cachedPublicConfigAt = 0
let pendingPublicConfigPromise: Promise<PublicRegistrationConfig> | null = null

export function getCachedPublicRegistrationConfig(): PublicRegistrationConfig | null {
  if (!cachedPublicConfig) return null
  if (Date.now() - cachedPublicConfigAt >= PUBLIC_CONFIG_TTL_MS) return null
  return cachedPublicConfig
}

export function invalidatePublicRegistrationConfigCache(): void {
  cachedPublicConfig = null
  cachedPublicConfigAt = 0
  pendingPublicConfigPromise = null
}

function normalizeRoll(roll: string): string {
  return roll.trim().toLowerCase().replace(/\s+/g, '')
}

function parsePublicConfig(raw: unknown): PublicRegistrationConfig {
  if (!isRecord(raw)) return { ...CLOSED_FALLBACK_CONFIG }

  const rawSports = Array.isArray(raw.accepted_sports) ? raw.accepted_sports : []
  const accepted_sports: PublicRegistrationSport[] = rawSports
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .map((item) => ({
      id: String(item.id || '').trim(),
      name: String(item.name || '').trim(),
      roles: Array.isArray(item.roles)
        ? item.roles.map((r) => String(r).trim()).filter(Boolean)
        : []
    }))
    .filter((s) => s.id.length > 0 && s.name.length > 0)

  const rawReason = String(raw.reason || 'closed')
  const reason: PublicRegistrationConfig['reason'] =
    rawReason === 'open' ||
    rawReason === 'before_open' ||
    rawReason === 'after_close' ||
    rawReason === 'no_season'
      ? rawReason
      : 'closed'

  return {
    is_open: Boolean(raw.is_open),
    reason,
    season_id: typeof raw.season_id === 'string' ? raw.season_id : null,
    season_name: typeof raw.season_name === 'string' ? raw.season_name : null,
    opens_at: typeof raw.opens_at === 'string' ? raw.opens_at : null,
    closes_at: typeof raw.closes_at === 'string' ? raw.closes_at : null,
    accepted_sports,
    instructions_md:
      typeof raw.instructions_md === 'string' && raw.instructions_md.trim()
        ? raw.instructions_md
        : DEFAULT_INSTRUCTIONS_MD,
    confirmation_message:
      typeof raw.confirmation_message === 'string' && raw.confirmation_message.trim()
        ? raw.confirmation_message
        : DEFAULT_CONFIRMATION_MESSAGE
  }
}

function parseSportEntries(raw: unknown): RegistrationSportEntry[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .map((item) => ({
      sport: String(item.sport || '').trim(),
      playing_role: String(item.playing_role || '').trim()
    }))
    .filter((item) => item.sport.length > 0 && item.playing_role.length > 0)
}

function parseRegistrationRow(raw: Record<string, unknown>): AthleteRegistration {
  const statusVal = String(raw.status || 'pending')
  const status: AthleteRegistration['status'] =
    statusVal === 'approved' || statusVal === 'rejected' ? statusVal : 'pending'

  const yearVal = String(raw.academic_year || '1st')
  const academic_year: AcademicYear =
    yearVal === '2nd' || yearVal === '3rd' || yearVal === 'Final' ? yearVal : '1st'

  return {
    id: String(raw.id || ''),
    season_id: String(raw.season_id || ''),
    season_name: typeof raw.season_name === 'string' ? raw.season_name : null,
    full_name: String(raw.full_name || ''),
    roll_no: String(raw.roll_no || ''),
    academic_year,
    sport_entries: parseSportEntries(raw.sport_entries),
    consent_given: Boolean(raw.consent_given),
    pending_photo_path:
      typeof raw.pending_photo_path === 'string' ? raw.pending_photo_path : null,
    pending_thumb_path:
      typeof raw.pending_thumb_path === 'string' ? raw.pending_thumb_path : null,
    photo_uploaded: Boolean(raw.photo_uploaded),
    status,
    rejection_reason:
      typeof raw.rejection_reason === 'string' ? raw.rejection_reason : null,
    approved_athlete_id:
      typeof raw.approved_athlete_id === 'string' ? raw.approved_athlete_id : null,
    reviewed_at: typeof raw.reviewed_at === 'string' ? raw.reviewed_at : null,
    created_at: String(raw.created_at || new Date().toISOString()),
    existing_athlete_id:
      typeof raw.existing_athlete_id === 'string' ? raw.existing_athlete_id : null,
    existing_athlete_code:
      typeof raw.existing_athlete_code === 'number'
        ? raw.existing_athlete_code
        : raw.existing_athlete_code != null && Number.isFinite(Number(raw.existing_athlete_code))
        ? Number(raw.existing_athlete_code)
        : null,
    existing_athlete_name:
      typeof raw.existing_athlete_name === 'string' ? raw.existing_athlete_name : null,
    existing_athlete_photo_thumb_url:
      typeof raw.existing_athlete_photo_thumb_url === 'string'
        ? raw.existing_athlete_photo_thumb_url
        : null,
    existing_athlete_photo_url:
      typeof raw.existing_athlete_photo_url === 'string'
        ? raw.existing_athlete_photo_url
        : null
  }
}

function getDemoSettings(): AdminRegistrationSettings {
  return getLocal<AdminRegistrationSettings>(DEMO_REG_SETTINGS_KEY, {
    is_open: false,
    opens_at: null,
    closes_at: null,
    registration_code: '',
    accepted_sports: DEFAULT_SPORTS.map((s) => s.id),
    default_base_points: 100,
    instructions_md: DEFAULT_INSTRUCTIONS_MD,
    confirmation_message: DEFAULT_CONFIRMATION_MESSAGE,
    updated_at: null
  })
}

function computeDemoPublicConfig(): PublicRegistrationConfig {
  const settings = getDemoSettings()
  const seasons = getLocal<Array<Season & { is_rehearsal?: boolean }>>(STORAGE_KEYS.SEASONS, [])
  const targetSeason =
    seasons.find((s) => s.is_active && !s.is_rehearsal) || null
  const sports = getLocal<Sport[]>(STORAGE_KEYS.SPORTS, DEFAULT_SPORTS)
  const acceptedSet = new Set(settings.accepted_sports.map((s) => s.toLowerCase()))
  const accepted_sports = sports
    .filter((s) => acceptedSet.has(s.id.toLowerCase()) || acceptedSet.has(s.name.toLowerCase()))
    .map((s) => ({ id: s.id, name: s.name, roles: s.roles }))

  const now = Date.now()
  const opensMs = settings.opens_at ? Date.parse(settings.opens_at) : null
  const closesMs = settings.closes_at ? Date.parse(settings.closes_at) : null

  let reason: PublicRegistrationConfig['reason'] = 'open'
  if (!targetSeason) {
    reason = 'no_season'
  } else if (!settings.is_open || !settings.registration_code.trim() || accepted_sports.length === 0) {
    reason = 'closed'
  } else if (opensMs !== null && !Number.isNaN(opensMs) && now < opensMs) {
    reason = 'before_open'
  } else if (closesMs !== null && !Number.isNaN(closesMs) && now > closesMs) {
    reason = 'after_close'
  }

  return {
    is_open: reason === 'open',
    reason,
    season_id: targetSeason?.id || null,
    season_name: targetSeason?.name || null,
    opens_at: settings.opens_at,
    closes_at: settings.closes_at,
    accepted_sports,
    instructions_md: settings.instructions_md || DEFAULT_INSTRUCTIONS_MD,
    confirmation_message: settings.confirmation_message || DEFAULT_CONFIRMATION_MESSAGE
  }
}

export async function getPublicRegistrationConfig(
  force = false
): Promise<PublicRegistrationConfig> {
  if (
    !force &&
    cachedPublicConfig &&
    Date.now() - cachedPublicConfigAt < PUBLIC_CONFIG_TTL_MS
  ) {
    return cachedPublicConfig
  }
  if (!force && pendingPublicConfigPromise) {
    return pendingPublicConfigPromise
  }

  const runner = (async (): Promise<PublicRegistrationConfig> => {
    if (isDemoMode || !supabase) {
      const cfg = computeDemoPublicConfig()
      cachedPublicConfig = cfg
      cachedPublicConfigAt = Date.now()
      return cfg
    }

    const { data, error } = await supabase.rpc('get_public_registration_config')
    if (error) {
      // Fail closed cleanly on SQL not installed or transient error without caching the failure
      return { ...CLOSED_FALLBACK_CONFIG }
    }

    const parsed = parsePublicConfig(data)
    cachedPublicConfig = parsed
    cachedPublicConfigAt = Date.now()
    return parsed
  })()

  pendingPublicConfigPromise = runner
  try {
    return await runner
  } finally {
    if (pendingPublicConfigPromise === runner) {
      pendingPublicConfigPromise = null
    }
  }
}

export interface SubmitPublicRegistrationParams {
  fullName: string
  rollNo: string
  academicYear: AcademicYear
  sportEntries: RegistrationSportEntry[]
  consent: boolean
  registrationCode: string
  photoBlob: Blob
  thumbBlob: Blob
  honeypot: string
  elapsedMs: number
  onStepChange?: (step: 'submitting' | 'uploading' | 'finalizing') => void
}

export async function submitPublicRegistration(
  params: SubmitPublicRegistrationParams
): Promise<{ registrationId: string }> {
  const {
    fullName,
    rollNo,
    academicYear,
    sportEntries,
    consent,
    registrationCode,
    photoBlob,
    thumbBlob,
    honeypot,
    elapsedMs,
    onStepChange
  } = params

  if (honeypot.trim().length > 0) {
    throw new AppError('Registration could not be submitted.')
  }
  if (elapsedMs < 4000) {
    throw new AppError('Please review your details before submitting.')
  }
  if (!consent) {
    throw new AppError('You must confirm consent before submitting.')
  }

  onStepChange?.('submitting')

  if (isDemoMode || !supabase) {
    const settings = getDemoSettings()
    const pubCfg = computeDemoPublicConfig()
    if (!pubCfg.is_open || !pubCfg.season_id) {
      throw new AppError('Registration is closed.')
    }
    if (registrationCode.trim() !== settings.registration_code.trim()) {
      throw new AppError('Invalid registration code.')
    }
    const existing = getLocal<AthleteRegistration[]>(DEMO_REGISTRATIONS_KEY, [])
    const norm = normalizeRoll(rollNo)
    const dup = existing.find(
      (r) =>
        r.season_id === pubCfg.season_id &&
        normalizeRoll(r.roll_no) === norm &&
        r.status !== 'rejected' &&
        (r.photo_uploaded || Date.now() - Date.parse(r.created_at) < 3600_000)
    )
    if (dup) {
      throw new AppError('A registration for this roll number already exists this season.')
    }
    onStepChange?.('uploading')
    const photoDataUrl = await blobToDataUrl(photoBlob)
    const thumbDataUrl = await blobToDataUrl(thumbBlob)
    onStepChange?.('finalizing')
    const id = `reg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const nextRow: AthleteRegistration = {
      id,
      season_id: pubCfg.season_id,
      season_name: pubCfg.season_name,
      full_name: fullName.trim(),
      roll_no: rollNo.trim(),
      academic_year: academicYear,
      sport_entries: sportEntries,
      consent_given: true,
      pending_photo_path: photoDataUrl,
      pending_thumb_path: thumbDataUrl,
      photo_uploaded: true,
      status: 'pending',
      rejection_reason: null,
      approved_athlete_id: null,
      reviewed_at: null,
      created_at: new Date().toISOString(),
      existing_athlete_id: null,
      existing_athlete_code: null,
      existing_athlete_name: null,
      existing_athlete_photo_thumb_url: null,
      existing_athlete_photo_url: null
    }
    setLocal(DEMO_REGISTRATIONS_KEY, [nextRow, ...existing])
    return { registrationId: id }
  }

  // Step 1: Server-validated insert via SECURITY DEFINER RPC (checks window, code, rate limit, duplicates)
  const { data: rpcData, error: rpcError } = await supabase.rpc('submit_athlete_registration', {
    p_full_name: fullName.trim(),
    p_roll_no: rollNo.trim(),
    p_academic_year: academicYear,
    p_sport_entries: sportEntries,
    p_consent: consent,
    p_registration_code: registrationCode.trim(),
    p_honeypot: honeypot,
    p_elapsed_ms: Math.max(0, Math.round(elapsedMs))
  })

  if (rpcError) {
    throw new AppError(rpcError.message || 'Registration submission failed.', {
      original: rpcError
    })
  }

  if (!isRecord(rpcData) || rpcData.ok !== true || typeof rpcData.registration_id !== 'string') {
    const serverMessage =
      isRecord(rpcData) && typeof rpcData.error === 'string'
        ? rpcData.error
        : 'Registration could not be submitted.'
    throw new AppError(serverMessage)
  }

  const registrationId = rpcData.registration_id
  const photoPath = `${registrationId}/photo.jpg`
  const thumbPath = `${registrationId}/thumb.jpg`

  // Step 2: Upload compressed 4:5 JPEG + 400px thumbnail in parallel to private registration-pending bucket
  onStepChange?.('uploading')

  const [photoRes, thumbRes] = await Promise.all([
    supabase.storage.from(REGISTRATION_PENDING_BUCKET).upload(photoPath, photoBlob, {
      contentType: 'image/jpeg',
      upsert: false
    }),
    supabase.storage.from(REGISTRATION_PENDING_BUCKET).upload(thumbPath, thumbBlob, {
      contentType: 'image/jpeg',
      upsert: false
    })
  ])

  const uploadedPaths: string[] = []
  if (!photoRes.error) uploadedPaths.push(photoPath)
  if (!thumbRes.error) uploadedPaths.push(thumbPath)

  const cleanupUploaded = async () => {
    if (uploadedPaths.length === 0 || !supabase) return
    try {
      await supabase.storage.from(REGISTRATION_PENDING_BUCKET).remove(uploadedPaths)
    } catch {
      // Best-effort cleanup; ignore storage removal errors
    }
  }

  if (photoRes.error) {
    await cleanupUploaded()
    throw new AppError(`Photo upload failed: ${photoRes.error.message}`, {
      original: photoRes.error
    })
  }

  if (thumbRes.error) {
    await cleanupUploaded()
    throw new AppError(`Thumbnail upload failed: ${thumbRes.error.message}`, {
      original: thumbRes.error
    })
  }

  // Step 3: Attach uploaded photo paths to the pending registration
  onStepChange?.('finalizing')

  const { error: attachErr } = await supabase.rpc('attach_registration_photo', {
    p_registration_id: registrationId,
    p_photo_path: photoPath,
    p_thumb_path: thumbPath
  })

  if (attachErr) {
    await cleanupUploaded()
    throw new AppError(attachErr.message || 'Failed to finalize registration photo.', {
      original: attachErr
    })
  }

  return { registrationId }
}

export async function getAdminRegistrationSettings(): Promise<AdminRegistrationSettings> {
  if (isDemoMode || !supabase) {
    return getDemoSettings()
  }

  const { data, error } = await supabase
    .from('registration_settings')
    .select(
      'is_open, opens_at, closes_at, registration_code, accepted_sports, default_base_points, instructions_md, confirmation_message, updated_at'
    )
    .eq('id', 1)
    .maybeSingle()

  if (error) {
    throw new AppError(error.message, { original: error })
  }

  if (!data) {
    return {
      is_open: false,
      opens_at: null,
      closes_at: null,
      registration_code: '',
      accepted_sports: [],
      default_base_points: 100,
      instructions_md: DEFAULT_INSTRUCTIONS_MD,
      confirmation_message: DEFAULT_CONFIRMATION_MESSAGE,
      updated_at: null
    }
  }

  return {
    is_open: Boolean(data.is_open),
    opens_at: typeof data.opens_at === 'string' ? data.opens_at : null,
    closes_at: typeof data.closes_at === 'string' ? data.closes_at : null,
    registration_code: typeof data.registration_code === 'string' ? data.registration_code : '',
    accepted_sports: Array.isArray(data.accepted_sports)
      ? data.accepted_sports.map((s: unknown) => String(s).trim()).filter(Boolean)
      : [],
    default_base_points:
      typeof data.default_base_points === 'number' && Number.isFinite(data.default_base_points)
        ? data.default_base_points
        : 100,
    instructions_md:
      typeof data.instructions_md === 'string' ? data.instructions_md : DEFAULT_INSTRUCTIONS_MD,
    confirmation_message:
      typeof data.confirmation_message === 'string' && data.confirmation_message.trim()
        ? data.confirmation_message
        : DEFAULT_CONFIRMATION_MESSAGE,
    updated_at: typeof data.updated_at === 'string' ? data.updated_at : null
  }
}

export async function saveAdminRegistrationSettings(
  settings: AdminRegistrationSettings
): Promise<AdminRegistrationSettings> {
  const payload = {
    id: 1,
    is_open: Boolean(settings.is_open),
    opens_at: settings.opens_at || null,
    closes_at: settings.closes_at || null,
    registration_code: settings.registration_code.trim(),
    accepted_sports: settings.accepted_sports,
    default_base_points: Math.max(0, Math.round(Number(settings.default_base_points) || 0)),
    instructions_md: settings.instructions_md.trim(),
    confirmation_message: settings.confirmation_message.trim() || DEFAULT_CONFIRMATION_MESSAGE,
    updated_at: new Date().toISOString()
  }

  if (isDemoMode || !supabase) {
    setLocal(DEMO_REG_SETTINGS_KEY, payload)
    invalidatePublicRegistrationConfigCache()
    return payload
  }

  const { data, error } = await supabase
    .from('registration_settings')
    .upsert(payload, { onConflict: 'id' })
    .select(
      'is_open, opens_at, closes_at, registration_code, accepted_sports, default_base_points, instructions_md, confirmation_message, updated_at'
    )
    .single()

  if (error) {
    throw new AppError(error.message, { original: error })
  }

  invalidatePublicRegistrationConfigCache()

  return {
    is_open: Boolean(data.is_open),
    opens_at: typeof data.opens_at === 'string' ? data.opens_at : null,
    closes_at: typeof data.closes_at === 'string' ? data.closes_at : null,
    registration_code: typeof data.registration_code === 'string' ? data.registration_code : '',
    accepted_sports: Array.isArray(data.accepted_sports)
      ? data.accepted_sports.map((s: unknown) => String(s))
      : [],
    default_base_points:
      typeof data.default_base_points === 'number' ? data.default_base_points : 100,
    instructions_md: typeof data.instructions_md === 'string' ? data.instructions_md : '',
    confirmation_message:
      typeof data.confirmation_message === 'string'
        ? data.confirmation_message
        : DEFAULT_CONFIRMATION_MESSAGE,
    updated_at: typeof data.updated_at === 'string' ? data.updated_at : null
  }
}

export async function getPendingRegistrationsCount(): Promise<number> {
  if (isDemoMode || !supabase) {
    const rows = getLocal<AthleteRegistration[]>(DEMO_REGISTRATIONS_KEY, [])
    const cutoff = Date.now() - 3600_000
    return rows.filter(
      (r) => r.status === 'pending' && (r.photo_uploaded || Date.parse(r.created_at) > cutoff)
    ).length
  }

  const { data, error } = await supabase.rpc('get_pending_registrations_count')
  if (error) {
    return 0
  }
  return typeof data === 'number' ? data : Number(data) || 0
}

export async function listAdminRegistrations(): Promise<AthleteRegistration[]> {
  if (isDemoMode || !supabase) {
    const rows = getLocal<AthleteRegistration[]>(DEMO_REGISTRATIONS_KEY, [])
    const athletes = getLocal<Athlete[]>(STORAGE_KEYS.ATHLETES, [])
    const byRoll = new Map<string, Athlete>()
    for (const a of athletes) {
      if (a.roll_no) byRoll.set(normalizeRoll(a.roll_no), a)
    }
    const cutoff = Date.now() - 3600_000
    return rows
      .filter(
        (r) =>
          r.status !== 'pending' || r.photo_uploaded || Date.parse(r.created_at) > cutoff
      )
      .map((r) => {
        const matched = byRoll.get(normalizeRoll(r.roll_no))
        return {
          ...r,
          existing_athlete_id: matched?.id ?? null,
          existing_athlete_code: matched?.athlete_code ?? null,
          existing_athlete_name: matched?.name ?? null,
          existing_athlete_photo_thumb_url: matched?.photo_thumb_url ?? null,
          existing_athlete_photo_url: matched?.photo_url ?? null
        }
      })
  }

  const { data, error } = await supabase.rpc('list_admin_registrations')
  if (error) {
    throw new AppError(error.message, { original: error })
  }

  if (!Array.isArray(data)) return []
  return data
    .filter((row): row is Record<string, unknown> => isRecord(row))
    .map(parseRegistrationRow)
}

export async function getPendingPhotoSignedUrls(
  paths: string[]
): Promise<Record<string, string>> {
  const uniquePaths = Array.from(new Set(paths.map((p) => p.trim()).filter(Boolean)))
  if (uniquePaths.length === 0) return {}

  if (isDemoMode || !supabase) {
    const map: Record<string, string> = {}
    for (const p of uniquePaths) {
      map[p] = p
    }
    return map
  }

  const { data, error } = await supabase.storage
    .from(REGISTRATION_PENDING_BUCKET)
    .createSignedUrls(uniquePaths, 1800)

  if (error || !Array.isArray(data)) {
    return {}
  }

  const map: Record<string, string> = {}
  for (const item of data) {
    if (item.path && item.signedUrl) {
      map[item.path] = item.signedUrl
    }
  }
  return map
}

export interface ApproveRegistrationParams {
  registration: AthleteRegistration
  overrides?: {
    fullName: string
    rollNo: string
    academicYear: AcademicYear
    sportEntries: RegistrationSportEntry[]
  }
  replacePhoto?: boolean
}

export interface ApproveRegistrationResult {
  athlete_id: string
  athlete_code: number
  created_athlete: boolean
  players_created: number
  players_skipped: number
}

export async function approveRegistration(
  params: ApproveRegistrationParams
): Promise<ApproveRegistrationResult> {
  const { registration, overrides, replacePhoto = false } = params
  const fullName = (overrides?.fullName ?? registration.full_name).trim()
  const rollNo = (overrides?.rollNo ?? registration.roll_no).trim()
  const academicYear = overrides?.academicYear ?? registration.academic_year
  const sportEntries = overrides?.sportEntries ?? registration.sport_entries

  if (!fullName) throw new AppError('Athlete name is required.')
  if (!rollNo) throw new AppError('Roll number is required.')
  if (!sportEntries || sportEntries.length === 0) {
    throw new AppError('At least one sport entry is required.')
  }

  if (isDemoMode || !supabase) {
    const settings = getDemoSettings()
    const athletes = getLocal<Athlete[]>(STORAGE_KEYS.ATHLETES, [])
    const players = getLocal<Player[]>(STORAGE_KEYS.PLAYERS, [])
    const norm = normalizeRoll(rollNo)
    const existingIdx = athletes.findIndex((a) => a.roll_no && normalizeRoll(a.roll_no) === norm)
    let targetAthlete: Athlete
    let createdAthlete = false

    if (existingIdx !== -1) {
      targetAthlete = {
        ...athletes[existingIdx],
        name: fullName,
        academic_year: academicYear,
        ...(replacePhoto && registration.pending_photo_path
          ? {
              photo_url: registration.pending_photo_path,
              photo_thumb_url:
                registration.pending_thumb_path || registration.pending_photo_path
            }
          : {})
      }
      athletes[existingIdx] = targetAthlete
    } else {
      createdAthlete = true
      targetAthlete = {
        id: `ath-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        athlete_code: getNextAthleteCode(athletes),
        name: fullName,
        academic_year: academicYear,
        roll_no: rollNo,
        photo_url: registration.pending_photo_path || undefined,
        photo_thumb_url:
          registration.pending_thumb_path || registration.pending_photo_path || undefined,
        created_at: new Date().toISOString()
      }
      athletes.push(targetAthlete)
    }

    let createdPlayers = 0
    let skippedPlayers = 0
    for (const entry of sportEntries) {
      const dup = players.some(
        (p) =>
          p.season_id === registration.season_id &&
          p.athlete_id === targetAthlete.id &&
          p.sport.toLowerCase() === entry.sport.toLowerCase()
      )
      if (dup) {
        skippedPlayers += 1
        continue
      }
      createdPlayers += 1
      players.push({
        id: `pl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        season_id: registration.season_id,
        athlete_id: targetAthlete.id,
        athlete_code: targetAthlete.athlete_code,
        player_code: String(targetAthlete.athlete_code).padStart(4, '0'),
        name: targetAthlete.name,
        photo_url: targetAthlete.photo_url,
        photo_thumb_url: targetAthlete.photo_thumb_url,
        academic_year: academicYear,
        sport: entry.sport,
        playing_role: entry.playing_role,
        base_points: settings.default_base_points || 100,
        status: 'available',
        team_id: null,
        purchase_price: null,
        created_at: new Date().toISOString()
      })
    }

    const regs = getLocal<AthleteRegistration[]>(DEMO_REGISTRATIONS_KEY, [])
    const nextRegs = regs.map((r) =>
      r.id === registration.id
        ? {
            ...r,
            full_name: fullName,
            roll_no: rollNo,
            academic_year: academicYear,
            sport_entries: sportEntries,
            status: 'approved' as const,
            approved_athlete_id: targetAthlete.id,
            reviewed_at: new Date().toISOString(),
            pending_photo_path: null,
            pending_thumb_path: null
          }
        : r
    )
    markLocalMutation(['athletes', 'players'])
    setLocal(STORAGE_KEYS.ATHLETES, athletes)
    setLocal(STORAGE_KEYS.PLAYERS, players)
    setLocal(DEMO_REGISTRATIONS_KEY, nextRegs)
    notifyChange('athletes_change')
    notifyChange('players_change')
    return {
      athlete_id: targetAthlete.id,
      athlete_code: targetAthlete.athlete_code,
      created_athlete: createdAthlete,
      players_created: createdPlayers,
      players_skipped: skippedPlayers
    }
  }

  // Decide whether we need to copy pending photo & thumbnail into fieldr-assets
  const isExisting = Boolean(registration.existing_athlete_id)
  const shouldCopyPhoto =
    Boolean(registration.pending_photo_path) && (!isExisting || replacePhoto)

  let uploadedOrigPath: string | null = null
  let uploadedThumbPath: string | null = null
  let publicPhotoUrl: string | null = null
  let publicThumbUrl: string | null = null

  if (shouldCopyPhoto && registration.pending_photo_path) {
    const { data: photoData, error: dlPhotoErr } = await supabase.storage
      .from(REGISTRATION_PENDING_BUCKET)
      .download(registration.pending_photo_path)

    if (dlPhotoErr || !photoData) {
      throw new AppError(
        `Could not download pending photo: ${dlPhotoErr?.message || 'File not found'}`
      )
    }

    let thumbBlob: Blob | null = null
    if (registration.pending_thumb_path) {
      const { data: thumbData } = await supabase.storage
        .from(REGISTRATION_PENDING_BUCKET)
        .download(registration.pending_thumb_path)
      if (thumbData) {
        thumbBlob = thumbData
      }
    }
    if (!thumbBlob) {
      const photoFile = new File([photoData], 'photo.jpg', { type: 'image/jpeg' })
      thumbBlob = await createThumbnailBlob(photoFile, 400, 0.82)
    }

    // Match exact fieldr-assets paths used by uploadPlayerPhotos in src/lib/data/storage.ts
    const timestamp = Date.now()
    const rand = Math.random().toString(36).substring(2, 8)
    uploadedOrigPath = `players/originals/${timestamp}-${rand}.jpg`
    uploadedThumbPath = `players/thumbnails/${timestamp}-${rand}.jpg`

    const { error: upOrigErr } = await supabase.storage
      .from('fieldr-assets')
      .upload(uploadedOrigPath, photoData, {
        contentType: 'image/jpeg',
        upsert: false
      })

    if (upOrigErr) {
      throw new AppError(`Failed to publish athlete photo: ${upOrigErr.message}`, {
        original: upOrigErr
      })
    }

    const { error: upThumbErr } = await supabase.storage
      .from('fieldr-assets')
      .upload(uploadedThumbPath, thumbBlob, {
        contentType: 'image/jpeg',
        upsert: false
      })

    if (upThumbErr) {
      await supabase.storage.from('fieldr-assets').remove([uploadedOrigPath]).catch(() => {})
      throw new AppError(`Failed to publish athlete thumbnail: ${upThumbErr.message}`, {
        original: upThumbErr
      })
    }

    publicPhotoUrl = supabase.storage.from('fieldr-assets').getPublicUrl(uploadedOrigPath)
      .data.publicUrl
    publicThumbUrl = supabase.storage.from('fieldr-assets').getPublicUrl(uploadedThumbPath)
      .data.publicUrl
  }

  // Execute ONE atomic database transaction
  markLocalMutation(['athletes', 'players'])
  const { data: rpcData, error: rpcError } = await supabase.rpc('approve_athlete_registration', {
    p_registration_id: registration.id,
    p_full_name: fullName,
    p_roll_no: rollNo,
    p_academic_year: academicYear,
    p_sport_entries: sportEntries,
    p_photo_url: publicPhotoUrl,
    p_photo_thumb_url: publicThumbUrl,
    p_replace_photo: shouldCopyPhoto
  })

  if (rpcError || !isRecord(rpcData)) {
    // Roll back any newly uploaded fieldr-assets files if transaction failed
    const rollbackPaths = [uploadedOrigPath, uploadedThumbPath].filter((p): p is string =>
      Boolean(p)
    )
    if (rollbackPaths.length > 0) {
      await supabase.storage.from('fieldr-assets').remove(rollbackPaths).catch(() => {})
    }
    throw new AppError(rpcError?.message || 'Approval transaction failed.', {
      original: rpcError
    })
  }

  // Clean up pending photo files from private bucket after transaction succeeds
  const pendingToRemove = [
    registration.pending_photo_path,
    registration.pending_thumb_path
  ].filter((p): p is string => Boolean(p))
  if (pendingToRemove.length > 0) {
    await supabase.storage
      .from(REGISTRATION_PENDING_BUCKET)
      .remove(pendingToRemove)
      .catch(() => {})
  }

  markLocalMutation(['athletes', 'players'])

  return {
    athlete_id: String(rpcData.athlete_id || ''),
    athlete_code: Number(rpcData.athlete_code || 0),
    created_athlete: Boolean(rpcData.created_athlete),
    players_created: Number(rpcData.players_created || 0),
    players_skipped: Number(rpcData.players_skipped || 0)
  }
}

export async function rejectRegistration(
  registrationId: string,
  reason?: string
): Promise<void> {
  if (isDemoMode || !supabase) {
    const regs = getLocal<AthleteRegistration[]>(DEMO_REGISTRATIONS_KEY, [])
    setLocal(
      DEMO_REGISTRATIONS_KEY,
      regs.map((r) =>
        r.id === registrationId
          ? {
              ...r,
              status: 'rejected' as const,
              rejection_reason: reason?.trim() || null,
              reviewed_at: new Date().toISOString()
            }
          : r
      )
    )
    return
  }

  const { error } = await supabase.rpc('reject_athlete_registration', {
    p_registration_id: registrationId,
    p_reason: reason?.trim() || null
  })

  if (error) {
    throw new AppError(error.message, { original: error })
  }
}

export async function purgeRejectedAndIncompleteRegistrations(): Promise<{
  deletedCount: number
  filesRemoved: number
}> {
  if (isDemoMode || !supabase) {
    const regs = getLocal<AthleteRegistration[]>(DEMO_REGISTRATIONS_KEY, [])
    const cutoff = Date.now() - 3600_000
    const keep = regs.filter(
      (r) =>
        r.status === 'approved' ||
        (r.status === 'pending' && (r.photo_uploaded || Date.parse(r.created_at) > cutoff))
    )
    setLocal(DEMO_REGISTRATIONS_KEY, keep)
    return { deletedCount: regs.length - keep.length, filesRemoved: 0 }
  }

  const { data, error } = await supabase.rpc('purge_registrations')
  if (error) {
    throw new AppError(error.message, { original: error })
  }

  const deletedCount = isRecord(data) ? Number(data.deleted_count || 0) : 0
  const storagePaths =
    isRecord(data) && Array.isArray(data.storage_paths)
      ? data.storage_paths.map((p) => String(p).trim()).filter(Boolean)
      : []

  let filesRemoved = 0
  if (storagePaths.length > 0) {
    const BATCH_SIZE = 100
    for (let i = 0; i < storagePaths.length; i += BATCH_SIZE) {
      const batch = storagePaths.slice(i, i + BATCH_SIZE)
      const { error: rmErr } = await supabase.storage
        .from(REGISTRATION_PENDING_BUCKET)
        .remove(batch)
      if (!rmErr) {
        filesRemoved += batch.length
      }
    }
  }

  return { deletedCount, filesRemoved }
}
