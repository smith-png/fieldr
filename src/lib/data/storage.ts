import { AppError } from '../errors'
import {
  blobToDataUrl,
  createThumbnailBlob,
  resizeAndCompressImage,
  validateImageFile
} from '../imageCompression'
import { isDemoMode, supabase } from './client'
import type { StorageService } from './types'

function generateUniqueStorageFileName(folder: string): string {
  const uniqueId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`
  return `${folder}/${uniqueId}.jpg`
}

export function extractFieldrAssetPath(url?: string | null): string | null {
  if (!url || typeof url !== 'string' || !url.includes('/fieldr-assets/')) return null
  const parts = url.split('/fieldr-assets/')
  const raw = parts[1]?.split('?')[0]
  return raw ? decodeURIComponent(raw) : null
}

const demoStorageService: StorageService = {
  async uploadPlayerPhotos(
    _seasonId: string,
    _playerCode: string,
    file: File
  ): Promise<{ photoUrl: string; thumbUrl: string }> {
    validateImageFile(file)
    const thumbBlob = await createThumbnailBlob(file, 400, 0.82)
    const originalDataUrl = await blobToDataUrl(file)
    const thumbDataUrl = await blobToDataUrl(thumbBlob)
    return {
      photoUrl: originalDataUrl,
      thumbUrl: thumbDataUrl
    }
  },

  async deletePlayerPhotoAssets(_photoUrl?: string, _thumbUrl?: string): Promise<void> {
    // In demo mode, base64 strings are stored directly on the player record
  },

  async uploadAsset(_file: File, _folder = 'assets', _maxLongSide = 400): Promise<string> {
    throw new AppError('Uploads are disabled in demo mode.')
  },

  async deleteStorageAsset(_assetUrl?: string | null): Promise<void> {
    // No-op in demo mode
  }
}

const supabaseStorageService: StorageService = {
  async uploadPlayerPhotos(
    _seasonId: string,
    _playerCode: string,
    file: File
  ): Promise<{ photoUrl: string; thumbUrl: string }> {
    validateImageFile(file)
    const thumbBlob = await createThumbnailBlob(file, 400, 0.82)

    if (!supabase) throw new AppError('Supabase not configured')

    const timestamp = Date.now()
    const rand = Math.random().toString(36).substring(2, 8)
    const ext = file.name.split('.').pop() || 'jpg'

    const origPath = `players/originals/${timestamp}-${rand}.${ext}`
    const thumbPath = `players/thumbnails/${timestamp}-${rand}.jpg`

    const { error: origErr } = await supabase.storage
      .from('fieldr-assets')
      .upload(origPath, file, { contentType: file.type, upsert: true })

    if (origErr) {
      throw new AppError(`Original upload failed: ${origErr.message}`, {
        original: origErr
      })
    }
    const { data: origData } = supabase.storage
      .from('fieldr-assets')
      .getPublicUrl(origPath)

    let thumbUrl = origData.publicUrl
    try {
      const { error: thumbErr } = await supabase.storage
        .from('fieldr-assets')
        .upload(thumbPath, thumbBlob, { contentType: 'image/jpeg', upsert: true })

      if (!thumbErr) {
        const { data: thumbData } = supabase.storage
          .from('fieldr-assets')
          .getPublicUrl(thumbPath)
        thumbUrl = thumbData.publicUrl
      }
    } catch {
      // Fallback to original public URL
    }

    return {
      photoUrl: origData.publicUrl,
      thumbUrl
    }
  },

  async deletePlayerPhotoAssets(photoUrl?: string, thumbUrl?: string): Promise<void> {
    if (!supabase) return

    const filesToDelete: string[] = []
    const p1 = extractFieldrAssetPath(photoUrl)
    const p2 = extractFieldrAssetPath(thumbUrl)
    if (p1) filesToDelete.push(p1)
    if (p2 && p2 !== p1) filesToDelete.push(p2)

    if (filesToDelete.length > 0) {
      try {
        await supabase.storage.from('fieldr-assets').remove(filesToDelete)
      } catch {
        // Silently ignore asset cleanup errors
      }
    }
  },

  async uploadAsset(file: File, folder = 'assets', maxLongSide = 400): Promise<string> {
    if (!supabase) throw new AppError('Supabase not configured')

    validateImageFile(file)
    const compressedBlob = await resizeAndCompressImage(file, maxLongSide, 0.85)
    const filename = generateUniqueStorageFileName(folder)

    const { error: uploadError } = await supabase.storage
      .from('fieldr-assets')
      .upload(filename, compressedBlob, {
        contentType: 'image/jpeg',
        upsert: false
      })

    if (uploadError) {
      throw new AppError(uploadError.message, { original: uploadError })
    }

    const { data } = supabase.storage.from('fieldr-assets').getPublicUrl(filename)
    return data.publicUrl
  },

  async deleteStorageAsset(assetUrl?: string | null): Promise<void> {
    if (!supabase || !assetUrl) return
    const path = extractFieldrAssetPath(assetUrl)
    if (!path) return

    try {
      await supabase.storage.from('fieldr-assets').remove([path])
    } catch (err) {
      console.error('Failed to delete asset from storage:', err)
    }
  }
}

export const storageService: StorageService = isDemoMode
  ? demoStorageService
  : supabaseStorageService

// Backward-compatible uploadPlayerPhotos signature: accepts file or (seasonId, playerCode, file)
export async function uploadPlayerPhotos(
  fileOrSeasonId: File | string,
  playerCode?: string,
  file?: File
): Promise<{ photo_url: string; photo_thumb_url: string; photoUrl: string; thumbUrl: string }> {
  let targetFile: File
  let sId = ''
  let pCode = ''

  if (fileOrSeasonId instanceof File) {
    targetFile = fileOrSeasonId
  } else {
    sId = fileOrSeasonId
    pCode = playerCode || ''
    targetFile = file as File
  }

  const result = await storageService.uploadPlayerPhotos(sId, pCode, targetFile)
  return {
    photoUrl: result.photoUrl,
    thumbUrl: result.thumbUrl,
    photo_url: result.photoUrl,
    photo_thumb_url: result.thumbUrl
  }
}

export const deletePlayerPhotoAssets = (p?: string, t?: string) =>
  storageService.deletePlayerPhotoAssets(p, t)
export const uploadAsset = (file: File, folder = 'assets', maxLongSide = 400) =>
  storageService.uploadAsset(file, folder, maxLongSide)
export const deleteStorageAsset = (assetUrl?: string | null) =>
  storageService.deleteStorageAsset(assetUrl)
