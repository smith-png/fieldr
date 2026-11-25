const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024 // 5 MB

// Player photo sizing. Thumbnails are shown in small slots (cards and lists), so keep them light.
export const THUMB_MAX_WIDTH = 240
export const THUMB_QUALITY = 0.8
export const ORIGINAL_MAX_LONG_SIDE = 1600
export const ORIGINAL_QUALITY = 0.86
const ORIGINAL_RECOMPRESS_BYTES = 500 * 1024

export function validateImageFile(file: File): void {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('Unsupported image format. Please upload a JPG, PNG, or WebP image.')
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error('Image exceeds 5 MB limit. Please select an image under 5 MB.')
  }
}

export async function createThumbnailBlob(
  file: File,
  maxWidth = 400,
  quality = 0.82
): Promise<Blob> {
  validateImageFile(file)

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (event) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let width = img.width
        let height = img.height

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width)
          width = maxWidth
        }

        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')
        if (!ctx) {
          // fallback to original blob
          resolve(file)
          return
        }

        ctx.drawImage(img, 0, 0, width, height)
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob)
            } else {
              resolve(file)
            }
          },
          'image/jpeg',
          quality
        )
      }
      img.onerror = () => reject(new Error('Failed to decode image.'))
      img.src = event.target?.result as string
    }
    reader.onerror = () => reject(new Error('Failed to read image file.'))
    reader.readAsDataURL(file)
  })
}

export async function resizeAndCompressImage(
  file: File,
  maxLongSide: number,
  quality = 0.85
): Promise<Blob> {
  validateImageFile(file)

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (event) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let width = img.width
        let height = img.height
        const longSide = Math.max(width, height)

        if (longSide > maxLongSide && longSide > 0) {
          const scale = maxLongSide / longSide
          width = Math.max(1, Math.round(width * scale))
          height = Math.max(1, Math.round(height * scale))
        }

        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(file)
          return
        }

        ctx.drawImage(img, 0, 0, width, height)
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob)
            } else {
              resolve(file)
            }
          },
          'image/jpeg',
          quality
        )
      }
      img.onerror = () => reject(new Error('Failed to decode image.'))
      img.src = event.target?.result as string
    }
    reader.onerror = () => reject(new Error('Failed to read image file.'))
    reader.readAsDataURL(file)
  })
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Failed to convert blob to data URL.'))
    reader.readAsDataURL(blob)
  })
}

export interface ProcessedRegistrationPhoto {
  photoBlob: Blob
  thumbBlob: Blob
  width: number
  height: number
  sizeBytes: number
  thumbSizeBytes: number
}

const REG_TARGET_WIDTH = 1000
const REG_TARGET_HEIGHT = 1250
const REG_MAX_BYTES = 400 * 1024 // 400 KB
const REG_MAX_INPUT_BYTES = 20 * 1024 * 1024 // 20 MB browser decode guard
const REG_QUALITY_STEPS = [0.9, 0.84, 0.78, 0.72, 0.65, 0.58, 0.5, 0.42, 0.35]

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob)
        } else {
          reject(new Error('Failed to encode photo as JPEG.'))
        }
      },
      'image/jpeg',
      quality
    )
  })
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('This file is not a valid image. Please upload a JPG, PNG, or WebP photo.'))
    }
    img.src = objectUrl
  })
}

export async function processRegistrationPhoto(file: File): Promise<ProcessedRegistrationPhoto> {
  if (!file || !file.type || !file.type.startsWith('image/')) {
    throw new Error('Only image files are accepted. Please select a JPG, PNG, or WebP photo.')
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('Unsupported image format. Please upload a JPG, PNG, or WebP photo.')
  }
  if (file.size > REG_MAX_INPUT_BYTES) {
    throw new Error('Selected file is too large to process. Please choose a smaller image.')
  }

  const img = await loadImageFromFile(file)
  const srcWidth = img.naturalWidth || img.width
  const srcHeight = img.naturalHeight || img.height

  if (srcWidth <= 0 || srcHeight <= 0) {
    throw new Error('Could not read image dimensions. Please try another photo.')
  }
  if (srcWidth > srcHeight) {
    throw new Error(
      'Landscape photos are not accepted. Please upload a vertical (portrait) photo where height is greater than or equal to width.'
    )
  }
  if (srcWidth < 200 || srcHeight < 250) {
    throw new Error('Photo resolution is too low. Please upload a clearer portrait photo.')
  }

  // Centre-crop to 4:5 aspect ratio
  const targetRatio = REG_TARGET_WIDTH / REG_TARGET_HEIGHT // 0.8
  const srcRatio = srcWidth / srcHeight

  let cropWidth = srcWidth
  let cropHeight = srcHeight
  let sx = 0
  let sy = 0

  if (srcRatio > targetRatio) {
    cropWidth = Math.round(srcHeight * targetRatio)
    sx = Math.round((srcWidth - cropWidth) / 2)
  } else if (srcRatio < targetRatio) {
    cropHeight = Math.round(srcWidth / targetRatio)
    sy = Math.round((srcHeight - cropHeight) / 2)
  }

  const canvas = document.createElement('canvas')
  canvas.width = REG_TARGET_WIDTH
  canvas.height = REG_TARGET_HEIGHT

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Your browser could not process this image.')
  }

  // Fill neutral dark backdrop for transparent PNGs before JPEG encoding
  ctx.fillStyle = '#0F141A'
  ctx.fillRect(0, 0, REG_TARGET_WIDTH, REG_TARGET_HEIGHT)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(
    img,
    sx,
    sy,
    cropWidth,
    cropHeight,
    0,
    0,
    REG_TARGET_WIDTH,
    REG_TARGET_HEIGHT
  )

  let fittedBlob: Blob | null = null
  for (const quality of REG_QUALITY_STEPS) {
    const candidate = await canvasToJpegBlob(canvas, quality)
    if (candidate.size <= REG_MAX_BYTES) {
      fittedBlob = candidate
      break
    }
  }

  if (!fittedBlob) {
    throw new Error('Could not compress photo under 400 KB. Please choose a simpler or clearer photo.')
  }

  // Reuse the exact same 400px thumbnail pipeline as manual admin uploads
  const croppedFile = new File([fittedBlob], 'registration-photo.jpg', {
    type: 'image/jpeg'
  })
  const thumbBlob = await createThumbnailBlob(croppedFile, THUMB_MAX_WIDTH, THUMB_QUALITY)

  return {
    photoBlob: fittedBlob,
    thumbBlob,
    width: REG_TARGET_WIDTH,
    height: REG_TARGET_HEIGHT,
    sizeBytes: fittedBlob.size,
    thumbSizeBytes: thumbBlob.size
  }
}


/**
 * Returns the blob to store as the full size photo. Small files are kept as is; larger ones are
 * scaled to ORIGINAL_MAX_LONG_SIDE and re-encoded as JPEG, only if that actually makes them smaller.
 */
export async function prepareOriginalPhoto(file: File): Promise<{ blob: Blob; contentType: string; ext: string }> {
  const keepOriginal = {
    blob: file as Blob,
    contentType: file.type || 'image/jpeg',
    ext: (file.name.split('.').pop() || 'jpg').toLowerCase()
  }
  if (file.size <= ORIGINAL_RECOMPRESS_BYTES) return keepOriginal
  try {
    const compressed = await resizeAndCompressImage(file, ORIGINAL_MAX_LONG_SIDE, ORIGINAL_QUALITY)
    if (compressed.size > 0 && compressed.size < file.size) {
      return { blob: compressed, contentType: 'image/jpeg', ext: 'jpg' }
    }
  } catch {
    // Fall back to the original file
  }
  return keepOriginal
}
