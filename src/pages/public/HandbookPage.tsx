import React, { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowSquareOut,
  DownloadSimple,
  Lock,
  LockKeyOpen,
  WarningCircle
} from '@phosphor-icons/react'
import { BrandMark } from '../../components/layout/BrandMark'
import {
  PUBLIC_BACK_LINK,
  PUBLIC_BTN_PRIMARY,
  PUBLIC_BTN_SECONDARY,
  PUBLIC_CARD,
  PUBLIC_ERROR_BANNER,
  PUBLIC_INPUT,
  PUBLIC_LABEL,
  PUBLIC_PAGE_SHELL,
  PUBLIC_PAGE_TITLE
} from '../../components/public/publicStyles'
import { Button, SkeletonBlock } from '../../components/ui'
import { supabase } from '../../lib/data/client'
import { prefetchRoute } from '../../lib/queryCache'

const HANDBOOK_SESSION_KEY = 'fieldr_handbook_access_code'
const HANDBOOK_BUCKET = 'handbooks'

interface HandbookItem {
  id: string
  title: string
  file_path: string
  created_at: string
}

function formatHandbookDate(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

function getSafeDownloadFilename(title: string): string {
  const cleaned = title
    .trim()
    .replace(/[^a-zA-Z0-9-_ ]+/g, '')
    .replace(/\s+/g, '-')
  return `${cleaned || 'handbook'}.pdf`
}

function getHandbookPublicUrl(filePath: string): string {
  if (!supabase || !filePath) return '#'
  const { data } = supabase.storage.from(HANDBOOK_BUCKET).getPublicUrl(filePath)
  return data.publicUrl
}

export const HandbookPage: React.FC = () => {
  const [codeInput, setCodeInput] = useState<string>('')
  const [handbooks, setHandbooks] = useState<HandbookItem[] | null>(null)
  const [errorMsg, setErrorMsg] = useState<string>('')
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [isCheckingSession, setIsCheckingSession] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    try {
      return Boolean(sessionStorage.getItem(HANDBOOK_SESSION_KEY))
    } catch {
      return false
    }
  })

  const unlockWithCode = useCallback(
    async (rawCode: string, fromSession = false) => {
      const trimmed = rawCode.trim()
      if (!trimmed || !supabase) {
        if (fromSession) {
          try {
            sessionStorage.removeItem(HANDBOOK_SESSION_KEY)
          } catch {
            // Ignore storage access errors
          }
          setIsCheckingSession(false)
        } else {
          setErrorMsg('Invalid code.')
        }
        setHandbooks(null)
        return
      }

      try {
        if (!fromSession) {
          setIsLoading(true)
        }
        setErrorMsg('')

        const { data, error } = await supabase.rpc('handbook_list', {
          p_code: trimmed
        })

        if (error || !Array.isArray(data) || data.length === 0) {
          try {
            sessionStorage.removeItem(HANDBOOK_SESSION_KEY)
          } catch {
            // Ignore storage access errors
          }
          setHandbooks(null)
          if (!fromSession) {
            setErrorMsg('Invalid code.')
          }
          return
        }

        const rows = (data as HandbookItem[]).slice().sort((a, b) =>
          (b.created_at || '').localeCompare(a.created_at || '')
        )

        try {
          sessionStorage.setItem(HANDBOOK_SESSION_KEY, trimmed)
        } catch {
          // Ignore storage access errors
        }
        setHandbooks(rows)
        setErrorMsg('')
      } catch {
        try {
          sessionStorage.removeItem(HANDBOOK_SESSION_KEY)
        } catch {
          // Ignore storage access errors
        }
        setHandbooks(null)
        if (!fromSession) {
          setErrorMsg('Invalid code.')
        }
      } finally {
        setIsLoading(false)
        setIsCheckingSession(false)
      }
    },
    []
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    let savedCode: string | null = null
    try {
      savedCode = sessionStorage.getItem(HANDBOOK_SESSION_KEY)
    } catch {
      savedCode = null
    }
    if (savedCode) {
      void unlockWithCode(savedCode, true)
    } else {
      setIsCheckingSession(false)
    }
  }, [unlockWithCode])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await unlockWithCode(codeInput, false)
  }

  const handleLock = () => {
    try {
      sessionStorage.removeItem(HANDBOOK_SESSION_KEY)
    } catch {
      // Ignore storage access errors
    }
    setHandbooks(null)
    setCodeInput('')
    setErrorMsg('')
  }

  const isUnlocked = handbooks !== null && handbooks.length > 0

  return (
    <div className={`${PUBLIC_PAGE_SHELL} p-6 md:p-12`}>
      <div className="flex items-center justify-between max-w-5xl mx-auto w-full gap-4">
        <BrandMark />
        <Link
          to="/"
          onMouseEnter={() => prefetchRoute('/')}
          onFocus={() => prefetchRoute('/')}
          onTouchStart={() => prefetchRoute('/')}
          className={PUBLIC_BACK_LINK}
        >
          <ArrowLeft size={14} weight="regular" />
          <span>Back to Home</span>
        </Link>
      </div>

      <div className={`w-full mx-auto my-auto py-10 ${isUnlocked ? 'max-w-2xl' : 'max-w-md'}`}>
        <div className={`${PUBLIC_CARD} relative`}>
          <div className="flex items-center justify-between gap-4 pb-5 mb-6 border-b border-border">
            <h1 className={PUBLIC_PAGE_TITLE}>Handbook</h1>

            {isUnlocked && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                leftIcon={Lock}
                onClick={handleLock}
                className="rounded-full"
              >
                Lock
              </Button>
            )}
          </div>

          {isCheckingSession ? (
            <div className="space-y-3">
              <SkeletonBlock className="h-12 w-full rounded-2xl" />
              <SkeletonBlock className="h-12 w-full rounded-2xl" />
            </div>
          ) : !isUnlocked ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              {errorMsg && (
                <div className={PUBLIC_ERROR_BANNER}>
                  <WarningCircle size={18} weight="regular" className="text-error shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div>
                <label
                  htmlFor="handbook-access-code"
                  className={PUBLIC_LABEL}
                >
                  Access Code
                </label>
                <input
                  id="handbook-access-code"
                  type="text"
                  value={codeInput}
                  onChange={(e) => {
                    setCodeInput(e.target.value)
                    if (errorMsg) setErrorMsg('')
                  }}
                  placeholder="Enter access code"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  disabled={isLoading}
                  className={`${PUBLIC_INPUT} font-mono`}
                />
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                leftIcon={LockKeyOpen}
                isLoading={isLoading}
                disabled={isLoading}
                className="w-full justify-center rounded-full"
              >
                Unlock
              </Button>
            </form>
          ) : (
            <div className="space-y-3">
              {handbooks.map((item) => {
                const publicUrl = getHandbookPublicUrl(item.file_path)
                const downloadFilename = getSafeDownloadFilename(item.title)
                const downloadUrl =
                  publicUrl === '#'
                    ? '#'
                    : `${publicUrl}${publicUrl.includes('?') ? '&' : '?'}download=${encodeURIComponent(downloadFilename)}`

                return (
                  <div
                    key={item.id}
                    className="rounded-2xl bg-bg border border-border px-4 py-3.5 sm:px-5 sm:py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-syne font-bold text-base text-text break-words">
                        {item.title}
                      </div>
                      {item.created_at && (
                        <div className="text-xs font-mono text-muted mt-0.5 tabular-nums">
                          {formatHandbookDate(item.created_at)}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <a
                        href={publicUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`${PUBLIC_BTN_SECONDARY} px-4 py-2 text-xs`}
                      >
                        <ArrowSquareOut size={14} weight="regular" />
                        <span>Open</span>
                      </a>
                      <a
                        href={downloadUrl}
                        download={downloadFilename}
                        className={`${PUBLIC_BTN_PRIMARY} px-4 py-2 text-xs`}
                      >
                        <DownloadSimple size={14} weight="regular" />
                        <span>Download</span>
                      </a>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="text-center text-xs text-muted max-w-5xl mx-auto w-full">
        Fieldr Live Sports Auction Platform
      </div>
    </div>
  )
}
