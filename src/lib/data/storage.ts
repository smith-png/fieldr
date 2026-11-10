import { AppError } from '../errors'
import {
  blobToDataUrl,
  createThumbnailBlob,
  validateImageFile
} from '../imageCompression'
import { isDemoMode, supabase } from './client'
import type { StorageService } from './types'

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

  async uploadAsset(file: File, _folder = 'assets'): Promise<string> {
    validateImageFile(file)
    const thumbBlob = await createThumbnailBlob(file, 400, 0.85)
    return blobToDataUrl(thumbBlob)
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
    const extractPath = (url?: string) => {
      if (!url || !url.includes('/fieldr-assets/')) return null
      const parts = url.split('/fieldr-assets/')
      return parts[1] ? decodeURIComponent(parts[1]) : null
    }

    const p1 = extractPath(photoUrl)
    const p2 = extractPath(thumbUrl)
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

  async uploadAsset(file: File, folder = 'assets'): Promise<string> {
    validateImageFile(file)
    const thumbBlob = await createThumbnailBlob(file, 400, 0.85)

    if (!supabase) return blobToDataUrl(thumbBlob)

    try {
      const filename = `${folder}/${Date.now()}-${Math.random().toString(36).substring(2, 8)}.jpg`
      const { error: uploadError } = await supabase.storage
        .from('fieldr-assets')
        .upload(filename, thumbBlob, {
          contentType: 'image/jpeg',
          upsert: true
        })

      if (uploadError) {
        return blobToDataUrl(thumbBlob)
      }

      const { data } = supabase.storage.from('fieldr-assets').getPublicUrl(filename)
      return data.publicUrl
    } catch {
      return blobToDataUrl(thumbBlob)
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
export const uploadAsset = (file: File, folder = 'assets') =>
  storageService.uploadAsset(file, folder)
