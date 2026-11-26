import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  Copy,
  Eye,
  EyeSlash,
  FloppyDisk,
  Sparkle,
  WarningCircle
} from '@phosphor-icons/react'
import {
  DEFAULT_CONFIRMATION_MESSAGE,
  DEFAULT_INSTRUCTIONS_MD,
  getAdminRegistrationSettings,
  getSeasons,
  saveAdminRegistrationSettings
} from '../../lib/data'
import { useToast } from '../../lib/ToastContext'
import { getErrorMessage } from '../../lib/errors'
import { useAdminRealtimeTopics } from '../../hooks/useAdminRealtime'
import { lazyWithRetry } from '../../lib/lazyWithRetry'
import { Button, SkeletonBlock } from '../ui'
const MarkdownContent = lazyWithRetry(() =>
  import('../common/MarkdownContent').then((m) => ({ default: m.MarkdownContent }))
)
import {
  ADMIN_CARD,
  ADMIN_CARD_HEADER,
  ADMIN_CARD_TITLE,
  ADMIN_INPUT,
  ADMIN_LABEL,
  ADMIN_TEXTAREA,
  ADMIN_WELL
} from './adminStyles'
import type { AdminRegistrationSettings, Season, Sport } from '../../types'

interface RegistrationSetupCardProps {
  activeSeason: Season | null
  sports: Sport[]
}

function isoToLocalInputValue(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`
}

function localInputValueToIso(localVal: string): string | null {
  const trimmed = localVal.trim()
  if (!trimmed) return null
  const d = new Date(trimmed)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

function generateRegistrationCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = new Uint8Array(8)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256)
    }
  }
  let code = ''
  for (let i = 0; i < bytes.length; i++) {
    code += alphabet[bytes[i] % alphabet.length]
  }
  return `${code.slice(0, 4)}-${code.slice(4)}`
}

function areStringArraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const sortedA = [...a].map((s) => s.toLowerCase()).sort()
  const sortedB = [...b].map((s) => s.toLowerCase()).sort()
  for (let i = 0; i < sortedA.length; i++) {
    if (sortedA[i] !== sortedB[i]) return false
  }
  return true
}

export const RegistrationSetupCard: React.FC<RegistrationSetupCardProps> = ({
  activeSeason,
  sports
}) => {
  const { showToast } = useToast()

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [savedSettings, setSavedSettings] = useState<AdminRegistrationSettings | null>(null)
  const [targetSeason, setTargetSeason] = useState<Season | null>(null)

  // Form state
  const [isOpen, setIsOpen] = useState(false)
  const [opensAtLocal, setOpensAtLocal] = useState('')
  const [closesAtLocal, setClosesAtLocal] = useState('')
  const [registrationCode, setRegistrationCode] = useState('')
  const [showCode, setShowCode] = useState(false)
  const [acceptedSports, setAcceptedSports] = useState<string[]>([])
  const [defaultBasePointsInput, setDefaultBasePointsInput] = useState('100')
  const [instructionsMd, setInstructionsMd] = useState(DEFAULT_INSTRUCTIONS_MD)
  const [isPreviewingInstructions, setIsPreviewingInstructions] = useState(false)
  const [confirmationMessage, setConfirmationMessage] = useState(DEFAULT_CONFIRMATION_MESSAGE)

  const applySettings = useCallback(
    (loaded: AdminRegistrationSettings, availableSports: Sport[]) => {
      setIsOpen(Boolean(loaded.is_open))
      setOpensAtLocal(isoToLocalInputValue(loaded.opens_at))
      setClosesAtLocal(isoToLocalInputValue(loaded.closes_at))
      setRegistrationCode(loaded.registration_code || '')
      setAcceptedSports(
        loaded.accepted_sports.length > 0
          ? loaded.accepted_sports
          : availableSports.map((s) => s.id)
      )
      setDefaultBasePointsInput(String(loaded.default_base_points ?? 100))
      setInstructionsMd(loaded.instructions_md || DEFAULT_INSTRUCTIONS_MD)
      setConfirmationMessage(loaded.confirmation_message || DEFAULT_CONFIRMATION_MESSAGE)
    },
    []
  )

  const isDirtyRef = useRef(false)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const loadRegistrationSettings = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = Boolean(options?.silent)
      try {
        if (!silent) setIsLoading(true)
        const [loaded, allSeasons] = await Promise.all([
          getAdminRegistrationSettings(),
          getSeasons()
        ])
        if (!isMountedRef.current) return
        setSavedSettings(loaded)
        applySettings(loaded, sports)

        const nonRehearsalActive =
          allSeasons.find(
            (s) =>
              s.is_active &&
              !(s as Season & { is_rehearsal?: boolean }).is_rehearsal
          ) || null
        setTargetSeason(nonRehearsalActive)
      } catch (err: unknown) {
        if (isMountedRef.current && !silent) {
          showToast(getErrorMessage(err, 'Failed to load registration settings'), 'error')
        }
      } finally {
        if (isMountedRef.current && !silent) setIsLoading(false)
      }
    },
    [applySettings, showToast, sports]
  )

  useEffect(() => {
    void loadRegistrationSettings()
  }, [loadRegistrationSettings])

  useAdminRealtimeTopics(['registrations', 'seasons'], () => {
    if (!isDirtyRef.current) {
      void loadRegistrationSettings({ silent: true })
    }
  })

  // Keep targetSeason synced if prop activeSeason updates
  useEffect(() => {
    if (!activeSeason) return
    const isRehearsal = Boolean((activeSeason as Season & { is_rehearsal?: boolean }).is_rehearsal)
    if (activeSeason.is_active && !isRehearsal) {
      setTargetSeason(activeSeason)
    } else if (activeSeason.is_active && isRehearsal) {
      setTargetSeason(null)
    }
  }, [activeSeason])

  const toggleAcceptedSport = (sportId: string) => {
    setAcceptedSports((prev) => {
      const exists = prev.some((id) => id.toLowerCase() === sportId.toLowerCase())
      if (exists) {
        return prev.filter((id) => id.toLowerCase() !== sportId.toLowerCase())
      }
      return [...prev, sportId]
    })
  }

  const parsedBasePoints = Number(defaultBasePointsInput)
  const basePointsError =
    defaultBasePointsInput.trim() === '' ||
    Number.isNaN(parsedBasePoints) ||
    !Number.isInteger(parsedBasePoints) ||
    parsedBasePoints < 0
      ? 'Enter a whole number of 0 or higher.'
      : null

  const opensIso = localInputValueToIso(opensAtLocal)
  const closesIso = localInputValueToIso(closesAtLocal)
  const windowError =
    opensIso && closesIso && Date.parse(closesIso) <= Date.parse(opensIso)
      ? 'Closing time must be after opening time.'
      : null

  const isDirty = useMemo(() => {
    if (!savedSettings) return true
    if (isOpen !== Boolean(savedSettings.is_open)) return true
    if ((opensIso || null) !== (savedSettings.opens_at || null)) return true
    if ((closesIso || null) !== (savedSettings.closes_at || null)) return true
    if (registrationCode.trim() !== (savedSettings.registration_code || '').trim()) return true
    if (!areStringArraysEqual(acceptedSports, savedSettings.accepted_sports)) return true
    if (parsedBasePoints !== Number(savedSettings.default_base_points ?? 100)) return true
    if (instructionsMd.trim() !== (savedSettings.instructions_md || '').trim()) return true
    if (
      (confirmationMessage.trim() || DEFAULT_CONFIRMATION_MESSAGE) !==
      (savedSettings.confirmation_message || DEFAULT_CONFIRMATION_MESSAGE).trim()
    ) {
      return true
    }
    return false
  }, [
    savedSettings,
    isOpen,
    opensIso,
    closesIso,
    registrationCode,
    acceptedSports,
    parsedBasePoints,
    instructionsMd,
    confirmationMessage
  ])

  isDirtyRef.current = isDirty

  const statusPill = useMemo(() => {
    if (!targetSeason) {
      return { label: 'No live season', tone: 'muted' as const }
    }
    if (!isOpen || !registrationCode.trim() || acceptedSports.length === 0) {
      return { label: 'Closed', tone: 'muted' as const }
    }
    const now = Date.now()
    if (opensIso && now < Date.parse(opensIso)) {
      return { label: 'Scheduled', tone: 'muted' as const }
    }
    if (closesIso && now > Date.parse(closesIso)) {
      return { label: 'Window ended', tone: 'muted' as const }
    }
    return { label: 'Open now', tone: 'active' as const }
  }, [targetSeason, isOpen, registrationCode, acceptedSports.length, opensIso, closesIso])

  const handleCopyCode = async () => {
    const trimmed = registrationCode.trim()
    if (!trimmed) return
    try {
      await navigator.clipboard.writeText(trimmed)
      showToast('Registration code copied', 'success')
    } catch {
      showToast('Could not copy to clipboard', 'error')
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSaving || basePointsError || windowError) return

    if (isOpen && !registrationCode.trim()) {
      showToast('Set a registration code before opening registration.', 'error')
      return
    }
    if (isOpen && acceptedSports.length === 0) {
      showToast('Select at least one sport before opening registration.', 'error')
      return
    }

    try {
      setIsSaving(true)
      const saved = await saveAdminRegistrationSettings({
        is_open: isOpen,
        opens_at: opensIso,
        closes_at: closesIso,
        registration_code: registrationCode.trim(),
        accepted_sports: acceptedSports,
        default_base_points: Math.max(0, Math.round(parsedBasePoints)),
        instructions_md: instructionsMd.trim(),
        confirmation_message: confirmationMessage.trim() || DEFAULT_CONFIRMATION_MESSAGE
      })
      setSavedSettings(saved)
      showToast('Registration settings saved', 'success')
    } catch (err: unknown) {
      showToast(getErrorMessage(err, 'Failed to save registration settings'), 'error')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <section className={ADMIN_CARD}>
        <div className={ADMIN_CARD_HEADER}>
          <h2 className={ADMIN_CARD_TITLE}>Registration</h2>
        </div>
        <div className="space-y-3">
          <SkeletonBlock className="h-14 bg-bg border border-border rounded-2xl" />
          <SkeletonBlock className="h-24 bg-bg border border-border rounded-2xl" />
          <SkeletonBlock className="h-24 bg-bg border border-border rounded-2xl" />
        </div>
      </section>
    )
  }

  return (
    <section className={ADMIN_CARD}>
      <div className={ADMIN_CARD_HEADER}>
        <div className="space-y-1">
          <h2 className={ADMIN_CARD_TITLE}>Registration</h2>
          <p className="text-xs text-muted">
            Configure public athlete self-registration at <span className="font-mono">/register</span>.
          </p>
        </div>

        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono border shrink-0 self-start sm:self-center ${
            statusPill.tone === 'active'
              ? 'bg-surface border-accent-bright text-accent-bright font-medium'
              : 'bg-surface-2 border-border text-muted'
          }`}
        >
          {statusPill.label}
        </span>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Target Season Readout + Open Toggle */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className={`${ADMIN_WELL} p-4 flex items-center justify-between gap-4`}>
            <div className="space-y-0.5 min-w-0">
              <span className="block text-sm font-medium text-text">Accept self-registrations</span>
              <span className="block text-xs text-muted">
                Shows the Register link in public navigation when inside the open window.
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isOpen}
              onClick={() => setIsOpen((v) => !v)}
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors cursor-pointer ${
                isOpen
                  ? 'bg-accent-bright border-accent-bright'
                  : 'bg-surface-2 border-border'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 rounded-full bg-bg shadow transition-transform ${
                  isOpen ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className={`${ADMIN_WELL} p-4 flex flex-col justify-center space-y-1`}>
            <span className="text-xs font-mono uppercase tracking-wider text-muted">
              Target Season (Active Non-Rehearsal)
            </span>
            {targetSeason ? (
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-medium text-text truncate">
                  {targetSeason.name}
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-surface border border-accent-bright text-accent-bright text-[11px] font-medium shrink-0">
                  Active
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-error">
                <WarningCircle size={15} weight="regular" className="shrink-0" />
                <span>
                  No active non-rehearsal season. Self-registration stays closed until a live season is active.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Window Dates */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="reg-setup-opens" className={ADMIN_LABEL}>
                Opens at
              </label>
              {opensAtLocal && (
                <button
                  type="button"
                  onClick={() => setOpensAtLocal('')}
                  className="text-xs text-muted hover:text-text cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>
            <input
              id="reg-setup-opens"
              type="datetime-local"
              value={opensAtLocal}
              onChange={(e) => setOpensAtLocal(e.target.value)}
              className={`${ADMIN_INPUT} font-mono`}
            />
            <p className="text-xs text-muted">Optional. Leave blank to open immediately when toggled on.</p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="reg-setup-closes" className={ADMIN_LABEL}>
                Closes at
              </label>
              {closesAtLocal && (
                <button
                  type="button"
                  onClick={() => setClosesAtLocal('')}
                  className="text-xs text-muted hover:text-text cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>
            <input
              id="reg-setup-closes"
              type="datetime-local"
              value={closesAtLocal}
              onChange={(e) => setClosesAtLocal(e.target.value)}
              className={`${ADMIN_INPUT} font-mono`}
            />
            <p className="text-xs text-muted">Optional. Submissions are rejected automatically after this time.</p>
          </div>
        </div>

        {windowError && (
          <p role="alert" className="text-xs text-error">
            {windowError}
          </p>
        )}

        {/* Registration Code & Default Base Points */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-4 items-start">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="reg-setup-code" className={ADMIN_LABEL}>
                Registration code (admin-only)
              </label>
              <button
                type="button"
                onClick={() => {
                  setRegistrationCode(generateRegistrationCode())
                  setShowCode(true)
                }}
                className="inline-flex items-center gap-1 text-xs font-medium text-accent-bright hover:underline cursor-pointer"
              >
                <Sparkle size={13} weight="regular" />
                <span>Generate code</span>
              </button>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  id="reg-setup-code"
                  type={showCode ? 'text' : 'password'}
                  value={registrationCode}
                  onChange={(e) => setRegistrationCode(e.target.value)}
                  maxLength={64}
                  autoComplete="off"
                  placeholder="Shared with athletes to allow submission"
                  className={`${ADMIN_INPUT} font-mono pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setShowCode((v) => !v)}
                  aria-label={showCode ? 'Hide registration code' : 'Show registration code'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center text-muted hover:text-text transition-colors cursor-pointer"
                >
                  {showCode ? <EyeSlash size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                leftIcon={Copy}
                disabled={!registrationCode.trim()}
                onClick={() => void handleCopyCode()}
                className="rounded-full shrink-0"
              >
                Copy
              </Button>
            </div>
            <p className="text-xs text-muted">
              Verified server-side only. Never sent to public browsers.
            </p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="reg-setup-base-points" className={ADMIN_LABEL}>
                Default base points
              </label>
              <span className="text-xs font-mono text-muted">PTS</span>
            </div>
            <input
              id="reg-setup-base-points"
              type="number"
              min={0}
              step={1}
              value={defaultBasePointsInput}
              onChange={(e) => setDefaultBasePointsInput(e.target.value)}
              className={`${ADMIN_INPUT} font-mono tabular-nums`}
            />
            {basePointsError ? (
              <p role="alert" className="text-xs text-error">
                {basePointsError}
              </p>
            ) : (
              <p className="text-xs text-muted">Applied when approving entries.</p>
            )}
          </div>
        </div>

        {/* Accepted Sports */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className={ADMIN_LABEL}>Sports accepting entries</span>
            <span className="text-xs font-mono text-muted tabular-nums">
              {acceptedSports.length} of {sports.length} selected
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {sports.map((sport) => {
              const checked = acceptedSports.some(
                (id) =>
                  id.toLowerCase() === sport.id.toLowerCase() ||
                  id.toLowerCase() === sport.name.toLowerCase()
              )
              return (
                <button
                  key={sport.id}
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  onClick={() => toggleAcceptedSport(sport.id)}
                  className={`min-h-[38px] px-4 py-1.5 rounded-full text-xs font-medium border inline-flex items-center gap-2 transition-colors cursor-pointer ${
                    checked
                      ? 'bg-surface border-accent-bright text-accent-bright'
                      : 'bg-bg border-border text-muted hover:text-text'
                  }`}
                >
                  {checked && <Check size={13} weight="bold" />}
                  <span>{sport.name}</span>
                  <span className="font-mono text-[11px] opacity-70">
                    ({sport.roles.length})
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Instructions Markdown */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="reg-setup-instructions" className={ADMIN_LABEL}>
              Instructions text
            </label>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted">Markdown</span>
              <button
                type="button"
                onClick={() => setIsPreviewingInstructions((v) => !v)}
                className="text-xs font-medium text-accent-bright hover:underline cursor-pointer"
              >
                {isPreviewingInstructions ? 'Edit' : 'Preview'}
              </button>
            </div>
          </div>

          {isPreviewingInstructions ? (
            <div className={`${ADMIN_WELL} p-4 min-h-[120px]`}>
              {instructionsMd.trim() ? (
                <Suspense fallback={<SkeletonBlock className="h-16 w-full rounded-xl" />}>
                  <MarkdownContent content={instructionsMd} />
                </Suspense>
              ) : (
                <p className="text-xs text-muted italic">No instructions entered.</p>
              )}
            </div>
          ) : (
            <textarea
              id="reg-setup-instructions"
              rows={4}
              value={instructionsMd}
              onChange={(e) => setInstructionsMd(e.target.value)}
              placeholder="Short guidance shown at the top of /register..."
              className={`${ADMIN_TEXTAREA} resize-y leading-relaxed`}
            />
          )}
        </div>

        {/* Confirmation Message */}
        <div className="space-y-1.5">
          <label htmlFor="reg-setup-confirmation" className={ADMIN_LABEL}>
            Confirmation message
          </label>
          <textarea
            id="reg-setup-confirmation"
            rows={2}
            value={confirmationMessage}
            onChange={(e) => setConfirmationMessage(e.target.value)}
            placeholder={DEFAULT_CONFIRMATION_MESSAGE}
            className={`${ADMIN_TEXTAREA} resize-y`}
          />
          <p className="text-xs text-muted">
            Shown on screen after an athlete submits successfully.
          </p>
        </div>

        <div className="pt-5 border-t border-border flex flex-wrap items-center justify-end gap-3">
          <Button
            type="submit"
            variant="primary"
            size="md"
            leftIcon={FloppyDisk}
            disabled={!isDirty || isSaving || Boolean(basePointsError) || Boolean(windowError)}
            isLoading={isSaving}
            className="rounded-full px-5"
          >
            Save registration settings
          </Button>
        </div>
      </form>
    </section>
  )
}
