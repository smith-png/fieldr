import type { RulesDocument } from '../../types'
import { AppError } from '../errors'
import { isDemoMode, supabase } from './client'

const RULES_BUCKET = 'rules'
const RULES_SELECT_COLUMNS = 'id, title, file_path, created_at'

function ensureWritable(): void {
  if (isDemoMode || !supabase) {
    throw new AppError('Rules documents cannot be modified in demo mode.')
  }
}

export function formatRulesDate(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

export function getSafeRulesDownloadFilename(title: string): string {
  const cleaned = title
    .trim()
    .replace(/[^a-zA-Z0-9-_ ]+/g, '')
    .replace(/\s+/g, '-')
  return `${cleaned || 'auction-rules'}.pdf`
}

export function getRulesPublicUrl(filePath: string): string {
  if (!supabase || !filePath) return '#'
  const { data } = supabase.storage.from(RULES_BUCKET).getPublicUrl(filePath)
  return data.publicUrl
}

export async function getRulesDocuments(): Promise<RulesDocument[]> {
  if (isDemoMode || !supabase) {
    return []
  }

  const { data, error } = await supabase
    .from('rules_documents')
    .select(RULES_SELECT_COLUMNS)
    .order('created_at', { ascending: false })

  if (error) {
    throw new AppError(error.message, { code: error.code, original: error })
  }

  return Array.isArray(data) ? (data as RulesDocument[]) : []
}

export async function uploadRulesPdf(file: File, title: string): Promise<RulesDocument> {
  ensureWritable()
  if (!supabase) throw new AppError('Supabase not configured')

  const trimmedTitle = title.trim()
  if (!trimmedTitle) {
    throw new AppError('Title is required.')
  }

  const randomId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  const filePath = `${randomId}.pdf`

  const { error: uploadError } = await supabase.storage
    .from(RULES_BUCKET)
    .upload(filePath, file, {
      contentType: 'application/pdf',
      upsert: false
    })

  if (uploadError) {
    throw new AppError(uploadError.message, { original: uploadError })
  }

  const { data: inserted, error: insertError } = await supabase
    .from('rules_documents')
    .insert({
      title: trimmedTitle,
      file_path: filePath
    })
    .select(RULES_SELECT_COLUMNS)
    .single()

  if (insertError) {
    await supabase.storage.from(RULES_BUCKET).remove([filePath])
    throw new AppError(insertError.message, { original: insertError })
  }

  return inserted as RulesDocument
}

export async function deleteRulesDocument(document: RulesDocument): Promise<void> {
  ensureWritable()
  if (!supabase) throw new AppError('Supabase not configured')

  if (document.file_path) {
    try {
      await supabase.storage.from(RULES_BUCKET).remove([document.file_path])
    } catch (err) {
      console.error('Failed to remove rules file from storage bucket:', err)
    }
  }

  const { error: deleteError } = await supabase
    .from('rules_documents')
    .delete()
    .eq('id', document.id)

  if (deleteError) {
    throw new AppError(deleteError.message, { original: deleteError })
  }
}
