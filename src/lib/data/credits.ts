import type { CreditKind, CreditPerson } from '../../types'
import { AppError } from '../errors'
import { resizeAndCompressImage } from '../imageCompression'
import { isDemoMode, supabase } from './client'

const CREDITS_BUCKET = 'credits'
const CREDITS_SELECT_COLUMNS =
  'id, kind, name, role, description, photo_url, sort_order, created_at'

function ensureWritable(): void {
  if (isDemoMode || !supabase) {
    throw new AppError('Credits cannot be modified in demo mode.')
  }
}

function generateUniqueId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function extractCreditsBucketPath(photoUrl?: string | null): string | null {
  if (!photoUrl || typeof photoUrl !== 'string') return null
  const publicPrefix = `/storage/v1/object/public/${CREDITS_BUCKET}/`
  const idx = photoUrl.indexOf(publicPrefix)
  if (idx !== -1) {
    const raw = photoUrl.slice(idx + publicPrefix.length).split('?')[0]
    return raw ? decodeURIComponent(raw) : null
  }
  const fallbackPrefix = `/${CREDITS_BUCKET}/`
  const fIdx = photoUrl.indexOf(fallbackPrefix)
  if (fIdx !== -1) {
    const raw = photoUrl.slice(fIdx + fallbackPrefix.length).split('?')[0]
    return raw ? decodeURIComponent(raw) : null
  }
  return null
}

export async function uploadCreditPhoto(file: File, kind: CreditKind): Promise<string> {
  ensureWritable()
  if (!supabase) throw new AppError('Supabase not configured')

  const maxLongSide = kind === 'core' ? 900 : 400
  const compressedBlob = await resizeAndCompressImage(file, maxLongSide, 0.85)
  const filePath = `credits/${generateUniqueId()}.jpg`

  const { error: uploadError } = await supabase.storage
    .from(CREDITS_BUCKET)
    .upload(filePath, compressedBlob, {
      contentType: 'image/jpeg',
      upsert: false
    })

  if (uploadError) {
    throw new AppError(uploadError.message, { original: uploadError })
  }

  const { data } = supabase.storage.from(CREDITS_BUCKET).getPublicUrl(filePath)
  return data.publicUrl
}

export async function deleteCreditPhotoFromBucket(photoUrl?: string | null): Promise<void> {
  if (isDemoMode || !supabase || !photoUrl) return
  const path = extractCreditsBucketPath(photoUrl)
  if (!path) return

  try {
    await supabase.storage.from(CREDITS_BUCKET).remove([path])
  } catch (err) {
    console.error('Failed to delete old credit photo from bucket:', err)
  }
}

export async function getCreditsPeople(): Promise<CreditPerson[]> {
  if (isDemoMode || !supabase) {
    return []
  }

  const { data, error } = await supabase
    .from('credits_people')
    .select(CREDITS_SELECT_COLUMNS)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    throw new AppError(error.message, { code: error.code, original: error })
  }

  return Array.isArray(data) ? (data as CreditPerson[]) : []
}

export interface CreateCreditPersonInput {
  kind: CreditKind
  name: string
  role?: string | null
  description?: string | null
  photo_url?: string | null
  sort_order: number
}

export async function createCreditPerson(
  input: CreateCreditPersonInput
): Promise<CreditPerson> {
  ensureWritable()
  if (!supabase) throw new AppError('Supabase not configured')

  const trimmedName = input.name.trim()
  if (!trimmedName || trimmedName.length > 80) {
    throw new AppError('Name is required and must be at most 80 characters.')
  }

  const trimmedRole = input.role ? input.role.trim() : null
  if (trimmedRole && trimmedRole.length > 80) {
    throw new AppError('Role must be at most 80 characters.')
  }

  const trimmedDescription =
    input.kind === 'core' && input.description ? input.description.trim() : null
  if (trimmedDescription && trimmedDescription.length > 400) {
    throw new AppError('Description must be at most 400 characters.')
  }

  const payload = {
    kind: input.kind,
    name: trimmedName,
    role: trimmedRole || null,
    description: input.kind === 'core' ? trimmedDescription || null : null,
    photo_url: input.photo_url || null,
    sort_order: input.sort_order
  }

  const { data, error } = await supabase
    .from('credits_people')
    .insert([payload])
    .select(CREDITS_SELECT_COLUMNS)
    .single()

  if (error) {
    throw new AppError(error.message, { code: error.code, original: error })
  }

  return data as CreditPerson
}

export interface UpdateCreditPersonInput {
  kind?: CreditKind
  name?: string
  role?: string | null
  description?: string | null
  photo_url?: string | null
  sort_order?: number
}

export async function updateCreditPerson(
  id: string,
  updates: UpdateCreditPersonInput
): Promise<CreditPerson> {
  ensureWritable()
  if (!supabase) throw new AppError('Supabase not configured')

  const payload: Record<string, unknown> = {}

  if (updates.kind !== undefined) {
    payload.kind = updates.kind
  }

  if (updates.name !== undefined) {
    const trimmedName = updates.name.trim()
    if (!trimmedName || trimmedName.length > 80) {
      throw new AppError('Name is required and must be at most 80 characters.')
    }
    payload.name = trimmedName
  }

  if (updates.role !== undefined) {
    const trimmedRole = updates.role ? updates.role.trim() : null
    if (trimmedRole && trimmedRole.length > 80) {
      throw new AppError('Role must be at most 80 characters.')
    }
    payload.role = trimmedRole || null
  }

  if (updates.description !== undefined || updates.kind === 'contributor') {
    if (updates.kind === 'contributor') {
      payload.description = null
    } else if (updates.description !== undefined) {
      const trimmedDesc = updates.description ? updates.description.trim() : null
      if (trimmedDesc && trimmedDesc.length > 400) {
        throw new AppError('Description must be at most 400 characters.')
      }
      payload.description = trimmedDesc || null
    }
  }

  if (updates.photo_url !== undefined) {
    payload.photo_url = updates.photo_url || null
  }

  if (updates.sort_order !== undefined) {
    payload.sort_order = updates.sort_order
  }

  const { data, error } = await supabase
    .from('credits_people')
    .update(payload)
    .eq('id', id)
    .select(CREDITS_SELECT_COLUMNS)
    .single()

  if (error) {
    throw new AppError(error.message, { code: error.code, original: error })
  }

  return data as CreditPerson
}

export async function deleteCreditPerson(
  id: string,
  photoUrl?: string | null
): Promise<void> {
  ensureWritable()
  if (!supabase) throw new AppError('Supabase not configured')

  const { error } = await supabase.from('credits_people').delete().eq('id', id)
  if (error) {
    throw new AppError(error.message, { code: error.code, original: error })
  }

  if (photoUrl) {
    await deleteCreditPhotoFromBucket(photoUrl)
  }
}

export async function reorderCreditsPeople(
  orderedItems: { id: string; sort_order: number }[]
): Promise<void> {
  ensureWritable()
  if (!supabase) throw new AppError('Supabase not configured')

  for (const item of orderedItems) {
    const { error } = await supabase
      .from('credits_people')
      .update({ sort_order: item.sort_order })
      .eq('id', item.id)

    if (error) {
      throw new AppError(error.message, { code: error.code, original: error })
    }
  }
}
