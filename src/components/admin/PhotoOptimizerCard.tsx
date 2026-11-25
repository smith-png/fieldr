import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ImageSquare, WarningCircle } from '@phosphor-icons/react'
import { supabase } from '../../lib/data/client'
import { extractFieldrAssetPath, updateAthlete, uploadPlayerPhotos } from '../../lib/data'
import { useToast } from '../../lib/ToastContext'
import { getErrorMessage } from '../../lib/errors'
import { Button, SkeletonBlock } from '../ui'
import { ADMIN_CARD, ADMIN_CARD_HEADER, ADMIN_CARD_TITLE, ADMIN_WELL } from './adminStyles'

interface PhotoRow {
  id: string
  name: string
  photo_url: string
}

const OPTIMIZED_MARKER = '/v2-'
const PAGE = 1000
const WORKERS = 3
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

function isOptimized(thumbUrl: string | null | undefined): boolean {
  return typeof thumbUrl === 'string' && thumbUrl.includes(OPTIMIZED_MARKER)
}

export const PhotoOptimizerCard: React.FC = () => {
  const { showToast } = useToast()
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [pending, setPending] = useState<PhotoRow[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [done, setDone] = useState(0)
  const [failed, setFailed] = useState<{ name: string; reason: string }[]>([])
  const stopRef = useRef(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      stopRef.current = true
    }
  }, [])

  const scan = useCallback(async () => {
    if (!supabase) {
      setLoadError('Supabase not configured')
      setIsLoading(false)
      return
    }
    try {
      setIsLoading(true)
      setLoadError(null)
      const all: { id: string; name: string; photo_url: string | null; photo_thumb_url: string | null }[] = []
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('athletes')
          .select('id, name, photo_url, photo_thumb_url')
          .not('photo_url', 'is', null)
          .order('id', { ascending: true })
          .range(from, from + PAGE - 1)
        if (error) throw error
        const batch = data ?? []
        all.push(...batch)
        if (batch.length < PAGE) break
      }
      const withAssets = all.filter(
        (a) => a.photo_url && extractFieldrAssetPath(a.photo_url) !== null
      )
      if (!mountedRef.current) return
      setTotal(withAssets.length)
      setPending(
        withAssets
          .filter((a) => !isOptimized(a.photo_thumb_url))
          .map((a) => ({ id: a.id, name: a.name, photo_url: a.photo_url as string }))
      )
      setDone(0)
      setFailed([])
    } catch (err: unknown) {
      if (mountedRef.current) setLoadError(getErrorMessage(err, 'Could not scan player photos.'))
    } finally {
      if (mountedRef.current) setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void scan()
  }, [scan])

  const optimizeOne = async (row: PhotoRow): Promise<void> => {
    if (!supabase) throw new Error('Supabase not configured')
    const path = extractFieldrAssetPath(row.photo_url)
    if (!path) throw new Error('Photo is not stored in Fieldr assets')
    const { data: blob, error } = await supabase.storage.from('fieldr-assets').download(path)
    if (error || !blob) throw new Error(error?.message || 'Could not download the photo')
    const type = ALLOWED_TYPES.includes(blob.type) ? blob.type : 'image/jpeg'
    const file = new File([blob], 'photo.jpg', { type })
    const result = await uploadPlayerPhotos(file)
    await updateAthlete(row.id, {
      photo_url: result.photo_url,
      photo_thumb_url: result.photo_thumb_url
    })
  }

  const run = async () => {
    if (isRunning || pending.length === 0) return
    stopRef.current = false
    setIsRunning(true)
    setDone(0)
    setFailed([])
    const queue = [...pending]
    let cursor = 0
    let completed = 0
    const failures: { name: string; reason: string }[] = []

    const worker = async () => {
      while (!stopRef.current) {
        const index = cursor++
        if (index >= queue.length) return
        const row = queue[index]
        try {
          await optimizeOne(row)
          completed += 1
          if (mountedRef.current) setDone(completed)
        } catch (err: unknown) {
          failures.push({ name: row.name, reason: getErrorMessage(err, 'Failed') })
          if (mountedRef.current) setFailed([...failures])
        }
      }
    }

    await Promise.all(Array.from({ length: WORKERS }, () => worker()))
    if (!mountedRef.current) return
    setIsRunning(false)
    showToast(
      failures.length === 0
        ? `Optimized ${completed} photos`
        : `Optimized ${completed} photos, ${failures.length} failed`,
      failures.length === 0 ? 'success' : 'error'
    )
    await scan()
  }

  const percent = pending.length > 0 ? Math.round(((done + failed.length) / pending.length) * 100) : 0

  return (
    <section className={ADMIN_CARD}>
      <div className={ADMIN_CARD_HEADER}>
        <div className="space-y-1">
          <h2 className={ADMIN_CARD_TITLE}>Player photos</h2>
          <p className="text-xs text-muted">
            Rebuilds older photos as small thumbnails and a 1600px full size, with long cache
            headers, so roster cards load faster. Run it once. It is safe to stop and resume.
          </p>
        </div>
      </div>

      {isLoading ? (
        <SkeletonBlock className="h-20 bg-bg border border-border rounded-2xl" />
      ) : loadError ? (
        <div className="p-3.5 rounded-2xl bg-error/10 border border-error/40 flex items-start gap-2.5 text-xs text-text">
          <WarningCircle size={16} weight="regular" className="text-error shrink-0 mt-0.5" />
          <span>{loadError}</span>
        </div>
      ) : (
        <div className="space-y-4">
          <div className={`${ADMIN_WELL} p-4 flex flex-wrap items-center justify-between gap-3`}>
            <div className="flex items-center gap-3 min-w-0">
              <ImageSquare size={22} weight="regular" className="text-muted shrink-0" />
              <p className="text-sm text-text">
                {pending.length === 0
                  ? `All ${total} photos are optimized.`
                  : `${pending.length} of ${total} photos need optimizing.`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isRunning && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    stopRef.current = true
                  }}
                  className="rounded-full"
                >
                  Stop
                </Button>
              )}
              <Button
                type="button"
                variant="primary"
                size="sm"
                isLoading={isRunning}
                disabled={isRunning || pending.length === 0}
                onClick={() => void run()}
                className="rounded-full"
              >
                Optimize photos
              </Button>
            </div>
          </div>

          {(isRunning || done > 0 || failed.length > 0) && (
            <div className="space-y-2">
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                className="h-2 rounded-full bg-surface-2 border border-border overflow-hidden"
              >
                <div
                  className="h-full bg-accent-bright transition-[width] duration-200 motion-reduce:transition-none"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <p className="text-xs font-mono tabular-nums text-muted">
                {done} done{failed.length > 0 ? `, ${failed.length} failed` : ''} of {pending.length}
              </p>
            </div>
          )}

          {failed.length > 0 && (
            <ul className="space-y-1.5">
              {failed.slice(0, 5).map((f, idx) => (
                <li key={`${f.name}-${idx}`} className="text-xs text-error break-words">
                  {f.name}: {f.reason}
                </li>
              ))}
              {failed.length > 5 && (
                <li className="text-xs text-muted">and {failed.length - 5} more</li>
              )}
            </ul>
          )}

          <p className="text-xs text-muted">
            Old files stay in storage untouched, so nothing that still points to them breaks.
          </p>
        </div>
      )}
    </section>
  )
}
