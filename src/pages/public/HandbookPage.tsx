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
import { Button } from '../../components/ui'
import { supabase } from '../../lib/data'

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
    <div className="min-h-screen bg-bg text-text flex flex-col justify-between p-6 md:p-12 relative overflow-hidden">
      <div className="flex items-center justify-between max-w-5xl mx-auto w-full">
        <BrandMark />
        <Link
          to="/"
          className="flex items-center gap-2 text-xs md:text-sm font-medium text-muted hover:text-text transition-colors"
        >
          <ArrowLeft size={16} />
          <span>Back to Home</span>
        </Link>
      </div>

      <div className={`w-full mx-auto my-auto py-10 ${isUnlocked ? 'max-w-2xl' : 'max-w-md'}`}>
        <div className="p-8 md:p-10 rounded-3xl bg-surface border border-border shadow-2xl relative">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <span className="text-xs font-mono uppercase tracking-widest text-accent-bright block mb-2">
                DOCUMENTATION
              </span>
              <h1 className="font-syne font-bold text-3xl text-text tracking-tight">
                Handbook
              </h1>
            </div>

            {isUnlocked && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                leftIcon={Lock}
                onClick={handleLock}
              >
                Lock
              </Button>
            )}
          </div>

          {isCheckingSession ? (
            <div className="py-8 text-center text-xs font-mono text-muted">
              Verifying session...
            </div>
          ) : !isUnlocked ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              {errorMsg && (
                <div className="p-3 rounded-xl bg-error/10 border border-error/40 flex items-center gap-2.5 text-xs text-text">
                  <WarningCircle size={18} weight="fill" className="text-error shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div>
                <label
                  htmlFor="handbook-access-code"
                  className="block text-xs font-mono uppercase tracking-wider text-muted mb-2"
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
                  className="w-full px-4 py-3 bg-bg border border-border rounded-xl text-sm font-mono text-text placeholder-muted/60 focus:outline-none focus:border-accent-bright focus:ring-1 focus:ring-accent-bright transition-all disabled:opacity-50"
                />
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                leftIcon={LockKeyOpen}
                isLoading={isLoading}
                disabled={isLoading}
                className="w-full justify-center"
              >
                Unlock
              </Button>
            </form>
          ) : (
            <div className="divide-y divide-border border-t border-border">
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
                    className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
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

                    <div className="flex items-center gap-2.5 shrink-0">
                      <a
                        href={publicUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-surface-2 border border-border text-xs font-medium text-text hover:bg-border/40 transition-colors"
                      >
                        <ArrowSquareOut size={14} weight="bold" />
                        <span>Open</span>
                      </a>
                      <a
                        href={downloadUrl}
                        download={downloadFilename}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-btn-bg text-btn-fg text-xs font-medium hover:opacity-90 transition-opacity"
                      >
                        <DownloadSimple size={14} weight="bold" />
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
