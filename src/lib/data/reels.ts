import type {
  AcademicYear,
  PublicReelGalleryItem,
  ReelCriterion,
  ReelFaq,
  ReelKeyDate,
  ReelParticipation,
  ReelPhase,
  ReelPrize,
  ReelSettings,
  ReelSubmission,
  ReelSubmissionStatus,
  ReelTeamMember
} from '../../types'
import { AppError } from '../errors'
import { isRecord } from '../utils'
import { supabase } from './client'

export const DEFAULT_REEL_CONFIRMATION =
  'Submitted. Your reel link has been received.'
export const DEFAULT_REEL_CLOSED_MESSAGE = 'Reel submissions are not open right now.'
export const DEFAULT_REEL_CONSENT = 'I confirm this reel is my own original work.'
export const DEFAULT_REEL_HOSTS: readonly string[] = [
  'instagram.com',
  'youtube.com',
  'youtu.be',
  'drive.google.com'
]

export const DEFAULT_REEL_SETTINGS: ReelSettings = {
  is_visible: false,
  is_open: false,
  opens_at: null,
  closes_at: null,
  title: 'Reel Competition',
  tagline: '',
  theme: '',
  description_md: '',
  rules_md: '',
  eligibility_md: '',
  instructions_md: '',
  prizes: [],
  criteria: [],
  key_dates: [],
  faqs: [],
  contact_text: '',
  confirmation_message: DEFAULT_REEL_CONFIRMATION,
  closed_message: DEFAULT_REEL_CLOSED_MESSAGE,
  consent_text: DEFAULT_REEL_CONSENT,
  categories: ['General'],
  allowed_hosts: [...DEFAULT_REEL_HOSTS],
  max_per_roll: 1,
  max_team_size: 4,
  show_gallery: false,
  updated_at: null
}

const SETTINGS_COLUMNS =
  'is_visible, is_open, opens_at, closes_at, title, tagline, theme, description_md, rules_md, eligibility_md, instructions_md, prizes, criteria, key_dates, faqs, contact_text, confirmation_message, closed_message, consent_text, categories, allowed_hosts, max_per_roll, max_team_size, show_gallery, updated_at'

const SETTINGS_TTL_MS = 60_000
let cachedSettings: ReelSettings | null = null
let cachedSettingsAt = 0
let pendingSettings: Promise<ReelSettings> | null = null

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function strList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback
  const list = value.map((v) => String(v).trim()).filter(Boolean)
  return list.length > 0 ? list : fallback
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((v): v is Record<string, unknown> => isRecord(v)) : []
}

function intInRange(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

export function parseReelSettings(raw: unknown): ReelSettings {
  if (!isRecord(raw)) return { ...DEFAULT_REEL_SETTINGS }
  const prizes: ReelPrize[] = records(raw.prizes)
    .map((r) => ({ place: str(r.place).trim(), reward: str(r.reward).trim() }))
    .filter((r) => r.place || r.reward)
  const criteria: ReelCriterion[] = records(raw.criteria)
    .map((r) => ({
      name: str(r.name).trim(),
      weight: intInRange(r.weight, 0, 100, 0),
      description: str(r.description).trim()
    }))
    .filter((r) => r.name)
  const key_dates: ReelKeyDate[] = records(raw.key_dates)
    .map((r) => ({ label: str(r.label).trim(), when: str(r.when).trim() }))
    .filter((r) => r.label)
  const faqs: ReelFaq[] = records(raw.faqs)
    .map((r) => ({ q: str(r.q).trim(), a: str(r.a).trim() }))
    .filter((r) => r.q)

  return {
    is_visible: Boolean(raw.is_visible),
    is_open: Boolean(raw.is_open),
    opens_at: typeof raw.opens_at === 'string' ? raw.opens_at : null,
    closes_at: typeof raw.closes_at === 'string' ? raw.closes_at : null,
    title: str(raw.title).trim() || DEFAULT_REEL_SETTINGS.title,
    tagline: str(raw.tagline),
    theme: str(raw.theme),
    description_md: str(raw.description_md),
    rules_md: str(raw.rules_md),
    eligibility_md: str(raw.eligibility_md),
    instructions_md: str(raw.instructions_md),
    prizes,
    criteria,
    key_dates,
    faqs,
    contact_text: str(raw.contact_text),
    confirmation_message: str(raw.confirmation_message).trim() || DEFAULT_REEL_CONFIRMATION,
    closed_message: str(raw.closed_message).trim() || DEFAULT_REEL_CLOSED_MESSAGE,
    consent_text: str(raw.consent_text).trim() || DEFAULT_REEL_CONSENT,
    categories: strList(raw.categories, ['General']),
    allowed_hosts: strList(raw.allowed_hosts, [...DEFAULT_REEL_HOSTS]),
    max_per_roll: intInRange(raw.max_per_roll, 1, 20, 1),
    max_team_size: intInRange(raw.max_team_size, 2, 12, 4),
    show_gallery: Boolean(raw.show_gallery),
    updated_at: typeof raw.updated_at === 'string' ? raw.updated_at : null
  }
}

export function getReelPhase(settings: ReelSettings, now = Date.now()): ReelPhase {
  if (!settings.is_visible) return 'hidden'
  if (!settings.is_open) return 'closed'
  if (settings.opens_at && now < Date.parse(settings.opens_at)) return 'upcoming'
  if (settings.closes_at && now > Date.parse(settings.closes_at)) return 'ended'
  return 'open'
}

export function getCachedReelSettings(): ReelSettings | null {
  if (!cachedSettings) return null
  if (Date.now() - cachedSettingsAt >= SETTINGS_TTL_MS) return null
  return cachedSettings
}

export function invalidateReelSettingsCache(): void {
  cachedSettings = null
  cachedSettingsAt = 0
  pendingSettings = null
}

/** Public read. Fails closed (hidden defaults) if the table is missing or unreachable. */
export async function getReelSettings(force = false): Promise<ReelSettings> {
  if (!force && cachedSettings && Date.now() - cachedSettingsAt < SETTINGS_TTL_MS) {
    return cachedSettings
  }
  if (!force && pendingSettings) return pendingSettings

  const runner = (async (): Promise<ReelSettings> => {
    if (!supabase) return { ...DEFAULT_REEL_SETTINGS }
    try {
      const { data, error } = await supabase
        .from('reel_settings')
        .select(SETTINGS_COLUMNS)
        .eq('id', 1)
        .maybeSingle()
      if (error) return { ...DEFAULT_REEL_SETTINGS }
      const parsed = data ? parseReelSettings(data) : { ...DEFAULT_REEL_SETTINGS }
      cachedSettings = parsed
      cachedSettingsAt = Date.now()
      return parsed
    } catch {
      return { ...DEFAULT_REEL_SETTINGS }
    }
  })()

  pendingSettings = runner
  try {
    return await runner
  } finally {
    if (pendingSettings === runner) pendingSettings = null
  }
}

/** Admin read. Throws so Setup can show what went wrong (for example the SQL was not run). */
export async function getAdminReelSettings(): Promise<ReelSettings> {
  if (!supabase) throw new AppError('Supabase not configured')
  const { data, error } = await supabase
    .from('reel_settings')
    .select(SETTINGS_COLUMNS)
    .eq('id', 1)
    .maybeSingle()
  if (error) throw new AppError(error.message, { original: error })
  return data ? parseReelSettings(data) : { ...DEFAULT_REEL_SETTINGS }
}

export async function saveReelSettings(settings: ReelSettings): Promise<ReelSettings> {
  if (!supabase) throw new AppError('Supabase not configured')
  const payload = {
    id: 1,
    is_visible: settings.is_visible,
    is_open: settings.is_open,
    opens_at: settings.opens_at || null,
    closes_at: settings.closes_at || null,
    title: settings.title.trim() || DEFAULT_REEL_SETTINGS.title,
    tagline: settings.tagline.trim(),
    theme: settings.theme.trim(),
    description_md: settings.description_md.trim(),
    rules_md: settings.rules_md.trim(),
    eligibility_md: settings.eligibility_md.trim(),
    instructions_md: settings.instructions_md.trim(),
    prizes: settings.prizes.filter((p) => p.place.trim() || p.reward.trim()),
    criteria: settings.criteria.filter((c) => c.name.trim()),
    key_dates: settings.key_dates.filter((d) => d.label.trim()),
    faqs: settings.faqs.filter((f) => f.q.trim()),
    contact_text: settings.contact_text.trim(),
    confirmation_message: settings.confirmation_message.trim() || DEFAULT_REEL_CONFIRMATION,
    closed_message: settings.closed_message.trim() || DEFAULT_REEL_CLOSED_MESSAGE,
    consent_text: settings.consent_text.trim() || DEFAULT_REEL_CONSENT,
    categories: strList(settings.categories, ['General']),
    allowed_hosts: strList(settings.allowed_hosts, [...DEFAULT_REEL_HOSTS]),
    max_per_roll: intInRange(settings.max_per_roll, 1, 20, 1),
    max_team_size: intInRange(settings.max_team_size, 2, 12, 4),
    show_gallery: settings.show_gallery,
    updated_at: new Date().toISOString()
  }
  const { data, error } = await supabase
    .from('reel_settings')
    .upsert(payload, { onConflict: 'id' })
    .select(SETTINGS_COLUMNS)
    .single()
  if (error) throw new AppError(error.message, { original: error })
  invalidateReelSettingsCache()
  return parseReelSettings(data)
}

export interface SubmitReelEntryParams {
  fullName: string
  rollNo: string
  academicYear: AcademicYear
  whatsapp: string
  participation: ReelParticipation
  teamName: string
  teamMembers: ReelTeamMember[]
  reelTitle: string
  reelUrl: string
  category: string
  description: string
  musicCredit: string
  consentOriginal: boolean
  consentRules: boolean
  consentShare: boolean
  honeypot: string
  elapsedMs: number
}

export async function submitReelEntry(params: SubmitReelEntryParams): Promise<void> {
  if (params.honeypot.trim().length > 0) {
    throw new AppError('Submission could not be completed.')
  }
  if (params.elapsedMs < 4000) {
    throw new AppError('Please review your details before submitting.')
  }
  if (!supabase) throw new AppError('Supabase not configured')

  const { data, error } = await supabase.rpc('submit_reel_entry', {
    p_full_name: params.fullName.trim(),
    p_roll_no: params.rollNo.trim(),
    p_academic_year: params.academicYear,
    p_whatsapp: params.whatsapp.trim(),
    p_participation: params.participation,
    p_team_name: params.teamName.trim(),
    p_team_members: params.teamMembers,
    p_reel_title: params.reelTitle.trim(),
    p_reel_url: params.reelUrl.trim(),
    p_category: params.category,
    p_description: params.description.trim(),
    p_music_credit: params.musicCredit.trim(),
    p_consent_original: params.consentOriginal,
    p_consent_rules: params.consentRules,
    p_consent_share: params.consentShare,
    p_honeypot: params.honeypot,
    p_elapsed_ms: Math.max(0, Math.round(params.elapsedMs))
  })
  if (error) {
    throw new AppError(error.message || 'Submission failed.', { original: error })
  }
  if (!isRecord(data) || data.ok !== true) {
    const message =
      isRecord(data) && typeof data.error === 'string'
        ? data.error
        : 'Submission could not be completed.'
    throw new AppError(message)
  }
}

export async function getPublicReelGallery(): Promise<PublicReelGalleryItem[]> {
  if (!supabase) return []
  try {
    const { data, error } = await supabase.rpc('get_public_reel_gallery')
    if (error || !Array.isArray(data)) return []
    return data
      .filter((row): row is Record<string, unknown> => isRecord(row))
      .map((row) => ({
        id: str(row.id),
        reel_title: str(row.reel_title),
        full_name: str(row.full_name),
        participation: row.participation === 'team' ? ('team' as const) : ('solo' as const),
        team_name: str(row.team_name),
        category: str(row.category),
        reel_url: str(row.reel_url)
      }))
      .filter((row) => row.id && row.reel_url)
  } catch {
    return []
  }
}

function parseSubmission(raw: Record<string, unknown>): ReelSubmission {
  const statusVal = str(raw.status)
  const status: ReelSubmissionStatus =
    statusVal === 'approved' || statusVal === 'rejected' ? statusVal : 'pending'
  const yearVal = str(raw.academic_year)
  const academic_year: AcademicYear =
    yearVal === '2nd' || yearVal === '3rd' || yearVal === 'Final' ? yearVal : '1st'
  const team_members: ReelTeamMember[] = records(raw.team_members).map((m) => ({
    name: str(m.name),
    roll_no: str(m.roll_no)
  }))
  return {
    id: str(raw.id),
    full_name: str(raw.full_name),
    roll_no: str(raw.roll_no),
    academic_year,
    whatsapp: str(raw.whatsapp),
    participation: raw.participation === 'team' ? 'team' : 'solo',
    team_name: str(raw.team_name),
    team_members,
    reel_title: str(raw.reel_title),
    reel_url: str(raw.reel_url),
    category: str(raw.category),
    description: str(raw.description),
    music_credit: str(raw.music_credit),
    consent_original: Boolean(raw.consent_original),
    consent_rules: Boolean(raw.consent_rules),
    consent_share: Boolean(raw.consent_share),
    status,
    admin_note: str(raw.admin_note),
    created_at: str(raw.created_at, new Date().toISOString()),
    reviewed_at: typeof raw.reviewed_at === 'string' ? raw.reviewed_at : null
  }
}

export async function listReelSubmissions(): Promise<ReelSubmission[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('reel_submissions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1000)
  if (error) throw new AppError(error.message, { original: error })
  if (!Array.isArray(data)) return []
  return data
    .filter((row): row is Record<string, unknown> => isRecord(row))
    .map(parseSubmission)
}

export async function updateReelSubmission(
  id: string,
  changes: { status?: ReelSubmissionStatus; admin_note?: string }
): Promise<ReelSubmission> {
  if (!supabase) throw new AppError('Supabase not configured')
  const patch: Record<string, unknown> = {}
  if (changes.status) {
    patch.status = changes.status
    patch.reviewed_at = changes.status === 'pending' ? null : new Date().toISOString()
  }
  if (typeof changes.admin_note === 'string') {
    patch.admin_note = changes.admin_note.trim().slice(0, 500)
  }
  const { data, error } = await supabase
    .from('reel_submissions')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw new AppError(error.message, { original: error })
  return parseSubmission(data as Record<string, unknown>)
}

export async function deleteReelSubmissions(ids: string[]): Promise<void> {
  if (!supabase) throw new AppError('Supabase not configured')
  const unique = Array.from(new Set(ids.filter(Boolean)))
  if (unique.length === 0) return
  const { error } = await supabase.from('reel_submissions').delete().in('id', unique)
  if (error) throw new AppError(error.message, { original: error })
}

function csvCell(value: string): string {
  // Neutralise spreadsheet formulas, then quote
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return `"${safe.replace(/"/g, '""')}"`
}

export function reelSubmissionsToCsv(rows: ReelSubmission[]): string {
  const header = [
    'Submitted',
    'Status',
    'Name',
    'Roll no',
    'Year',
    'WhatsApp',
    'Type',
    'Team name',
    'Team members',
    'Reel title',
    'Reel link',
    'Category',
    'Description',
    'Music credit',
    'Admin note'
  ]
  const lines = [header.map(csvCell).join(',')]
  for (const r of rows) {
    lines.push(
      [
        r.created_at,
        r.status,
        r.full_name,
        r.roll_no,
        r.academic_year,
        r.whatsapp,
        r.participation,
        r.team_name,
        r.team_members.map((m) => `${m.name} (${m.roll_no})`).join('; '),
        r.reel_title,
        r.reel_url,
        r.category,
        r.description,
        r.music_credit,
        r.admin_note
      ]
        .map(csvCell)
        .join(',')
    )
  }
  return lines.join('\r\n')
}
