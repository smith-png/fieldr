import type {
  AcademicYear,
  AdminRegistrationSettings,
  AthleteRegistration,
  PublicRegistrationConfig,
  PublicRegistrationSport,
  RegistrationSportEntry
} from '../../types'
import { AppError } from '../errors'
import { isRecord } from '../utils'
import { createThumbnailBlob } from '../imageCompression'
import { markLocalMutation, supabase } from './client'
import { invalidateRegistrationStatus } from '../registrationStatusStore'

export const REGISTRATION_PENDING_BUCKET = 'registration-pending'

export const DEFAULT_CONFIRMATION_MESSAGE = 'Submitted. An admin will review your entry.'
export const DEFAULT_INSTRUCTIONS_MD =
  'Complete your details below, select every sport you are entering, and upload a recent portrait photo. Have the registration code from the organizers ready.'

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
  invalidateRegistrationStatus()
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

export async function fetchPublicRegistrationConfigStrict(): Promise<PublicRegistrationConfig> {
  if (!supabase) {
    throw new AppError('Supabase not configured')
  }

  const { data, error } = await supabase.rpc('get_public_registration_config')
  if (error) {
    const code = typeof error.code === 'string' ? error.code : ''
    // Explicit RPC-not-found means registration is unavailable on this backend
    if (code === 'PGRST202' || code === '42883') {
      const closed = { ...CLOSED_FALLBACK_CONFIG }
      cachedPublicConfig = closed
      cachedPublicConfigAt = Date.now()
      return closed
    }
    throw new AppError(error.message || 'Failed to load registration configuration.', {
      original: error
    })
  }

  const parsed = parsePublicConfig(data)
  cachedPublicConfig = parsed
  cachedPublicConfigAt = Date.now()
  return parsed
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
    try {
      return await fetchPublicRegistrationConfigStrict()
    } catch {
      // Fail closed cleanly on transient error without caching the failure
      return { ...CLOSED_FALLBACK_CONFIG }
    }
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

  if (!supabase) {
    throw new AppError('Supabase not configured')
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
  if (!supabase) {
    throw new AppError('Supabase not configured')
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

  if (!supabase) {
    throw new AppError('Supabase not configured')
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
  if (!supabase) {
    return 0
  }

  const { data, error } = await supabase.rpc('get_pending_registrations_count')
  if (error) {
    return 0
  }
  return typeof data === 'number' ? data : Number(data) || 0
}

export async function listAdminRegistrations(): Promise<AthleteRegistration[]> {
  if (!supabase) {
    return []
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

  if (!supabase) {
    return {}
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

  if (!supabase) {
    throw new AppError('Supabase not configured')
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
  if (!supabase) {
    throw new AppError('Supabase not configured')
  }

  const { error } = await supabase.rpc('reject_athlete_registration', {
    p_registration_id: registrationId,
    p_reason: reason?.trim() || null
  })

  if (error) {
    throw new AppError(error.message, { original: error })
  }
}

function isStorageNotFoundError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const record = err as Record<string, unknown>
  const status = record.status ?? record.statusCode
  if (status === 404 || status === '404') return true
  const message = typeof record.message === 'string' ? record.message : ''
  return /not[\s_-]*found|no such|404/i.test(message)
}

async function removePendingRegistrationPaths(paths: string[]): Promise<number> {
  if (!supabase) return 0
  const uniquePaths = Array.from(
    new Set(paths.map((p) => String(p || '').trim()).filter(Boolean))
  )
  if (uniquePaths.length === 0) return 0

  let filesRemoved = 0
  const BATCH_SIZE = 100
  for (let i = 0; i < uniquePaths.length; i += BATCH_SIZE) {
    const batch = uniquePaths.slice(i, i + BATCH_SIZE)
    try {
      const { data: removedData, error: rmErr } = await supabase.storage
        .from(REGISTRATION_PENDING_BUCKET)
        .remove(batch)
      if (!rmErr) {
        filesRemoved += Array.isArray(removedData) ? removedData.length : batch.length
      } else if (!isStorageNotFoundError(rmErr)) {
        for (const path of batch) {
          try {
            const { data: singleData, error: singleErr } = await supabase.storage
              .from(REGISTRATION_PENDING_BUCKET)
              .remove([path])
            if (!singleErr) {
              filesRemoved += Array.isArray(singleData) ? singleData.length : 1
            }
          } catch {
            // Ignore missing or already-removed storage objects
          }
        }
      }
    } catch {
      // Ignore storage cleanup errors after database rows are removed
    }
  }
  return filesRemoved
}

function parseClearRpcResult(data: unknown): {
  deletedCount: number
  storagePaths: string[]
} {
  const row = Array.isArray(data) ? data[0] : data
  const deletedCount = isRecord(row) ? Number(row.deleted_count || 0) : 0
  const storagePaths =
    isRecord(row) && Array.isArray(row.storage_paths)
      ? row.storage_paths.map((p) => String(p).trim()).filter(Boolean)
      : []
  return { deletedCount, storagePaths }
}

export type ClearRegistrationHistoryScope = 'approved' | 'all'

export async function clearRegistrationHistory(
  scope: ClearRegistrationHistoryScope
): Promise<{
  deletedCount: number
  filesRemoved: number
}> {
  if (!supabase) {
    throw new AppError('Supabase not configured')
  }

  let { data, error } = await supabase.rpc('clear_registration_history', {
    p_scope: scope
  })

  if (error && error.code === 'PGRST202') {
    const retry = await supabase.rpc('clear_registration_history', {
      scope
    })
    data = retry.data
    error = retry.error
  }

  if (error) {
    throw new AppError(error.message, { original: error })
  }

  const { deletedCount, storagePaths } = parseClearRpcResult(data)
  const filesRemoved = await removePendingRegistrationPaths(storagePaths)

  return { deletedCount, filesRemoved }
}

export async function deleteReviewedRegistrationEntry(
  registration: AthleteRegistration
): Promise<{ filesRemoved: number }> {
  if (registration.status === 'pending') {
    throw new AppError('Pending registrations cannot be deleted from history.')
  }
  if (!supabase) {
    throw new AppError('Supabase not configured')
  }

  const { error } = await supabase
    .from('athlete_registrations')
    .delete()
    .eq('id', registration.id)
    .in('status', ['approved', 'rejected'])

  if (error) {
    throw new AppError(error.message, { original: error })
  }

  const paths = [registration.pending_photo_path, registration.pending_thumb_path].filter(
    (p): p is string => Boolean(p)
  )
  const filesRemoved = await removePendingRegistrationPaths(paths)

  return { filesRemoved }
}

export async function purgeRejectedAndIncompleteRegistrations(): Promise<{
  deletedCount: number
  filesRemoved: number
}> {
  if (!supabase) {
    throw new AppError('Supabase not configured')
  }

  const { data, error } = await supabase.rpc('purge_registrations')
  if (error) {
    throw new AppError(error.message, { original: error })
  }

  const { deletedCount, storagePaths } = parseClearRpcResult(data)
  const filesRemoved = await removePendingRegistrationPaths(storagePaths)

  return { deletedCount, filesRemoved }
}
