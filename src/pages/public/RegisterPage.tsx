import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  CheckCircle,
  Image as ImageIcon,
  Info,
  Lock,
  Plus,
  Trash,
  UploadSimple,
  WarningCircle
} from '@phosphor-icons/react'
import { HeaderBar } from '../../components/layout/HeaderBar'
import { NavigationMenu } from '../../components/layout/NavigationMenu'
import { SiteFooter } from '../../components/layout/SiteFooter'
const MarkdownContent = lazy(() =>
  import('../../components/common/MarkdownContent').then((m) => ({
    default: m.MarkdownContent
  }))
)
import {
  PUBLIC_BACK_LINK,
  PUBLIC_BTN_PRIMARY,
  PUBLIC_BTN_SECONDARY,
  PUBLIC_CARD,
  PUBLIC_COUNT_PILL,
  PUBLIC_ERROR_BANNER,
  PUBLIC_INPUT,
  PUBLIC_LABEL,
  PUBLIC_MAIN_NARROW,
  PUBLIC_PAGE_HEADER,
  PUBLIC_PAGE_SHELL,
  PUBLIC_PAGE_TITLE,
  PUBLIC_SECTION_TITLE,
  PUBLIC_WELL
} from '../../components/public/publicStyles'
import { SkeletonBlock, SkeletonText } from '../../components/ui'
import { ACADEMIC_YEARS, getAcademicYearLabel } from '../../lib/academicYears'
import {
  DEFAULT_CONFIRMATION_MESSAGE,
  getActiveSeason,
  submitPublicRegistration
} from '../../lib/data'
import { getErrorMessage } from '../../lib/errors'
import {
  processRegistrationPhoto,
  type ProcessedRegistrationPhoto
} from '../../lib/imageCompression'
import { publicCache } from '../../lib/publicCache'
import { prefetchRoute } from '../../lib/queryCache'
import {
  refreshRegistrationStatus,
  useRegistrationStatus
} from '../../lib/registrationStatusStore'
import type {
  AcademicYear,
  RegistrationSportEntry,
  Season
} from '../../types'

interface SportRowDraft {
  key: string
  sport: string
  playing_role: string
}

function formatDateTimeReadable(iso?: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatKb(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

const ROLL_NUMBER_REGEX = /^\d{1,5}$/
const ROLL_NUMBER_ERROR = 'Enter your roll number using digits only (for example 23131)'

function sanitizeRollNo(value: string): string {
  return value.replace(/\D/g, '').slice(0, 5)
}

export const RegisterPage: React.FC = () => {
  const regStatus = useRegistrationStatus()
  const config = regStatus.config
  const isRegistrationOpen = regStatus.open
  const registrationReason = regStatus.reason
  const seasonName = config?.season_name ?? regStatus.season_name
  const opensAt = config?.opens_at ?? regStatus.opens_at
  const closesAt = config?.closes_at ?? regStatus.closes_at

  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [activeSeason, setActiveSeason] = useState<Season | null>(
    publicCache.activeSeason.value
  )
  const [isLoading, setIsLoading] = useState<boolean>(
    () => !regStatus.config && !(regStatus.hasValue && !regStatus.open)
  )

  // Anti-spam: track page load timestamp + hidden honeypot value
  const loadedAtRef = useRef<number>(Date.now())
  const [honeypot, setHoneypot] = useState<string>('')

  // Form fields (no phone or email)
  const [fullName, setFullName] = useState<string>('')
  const [rollNo, setRollNo] = useState<string>('')
  const [rollNoError, setRollNoError] = useState<string | null>(null)
  const [academicYear, setAcademicYear] = useState<AcademicYear>('1st')
  const [sportRows, setSportRows] = useState<SportRowDraft[]>([])
  const [consent, setConsent] = useState<boolean>(false)
  const [registrationCode, setRegistrationCode] = useState<string>('')

  // Photo processing & preview state
  const fileInputRef = useRef<HTMLInputElement>(null)
  const previewUrlRef = useRef<string | null>(null)
  const [processedPhoto, setProcessedPhoto] = useState<ProcessedRegistrationPhoto | null>(null)
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null)
  const [isProcessingPhoto, setIsProcessingPhoto] = useState<boolean>(false)
  const [photoError, setPhotoError] = useState<string | null>(null)

  // Submission state
  const [submitStep, setSubmitStep] = useState<
    'idle' | 'submitting' | 'uploading' | 'finalizing'
  >('idle')
  const [formError, setFormError] = useState<string | null>(null)
  const [submittedSummary, setSubmittedSummary] = useState<{
    fullName: string
    academicYear: AcademicYear
    sportEntries: RegistrationSportEntry[]
  } | null>(null)

  const rowCounterRef = useRef(0)

  useEffect(() => {
    let mounted = true

    async function loadInitial() {
      try {
        const [, season] = await Promise.all([
          refreshRegistrationStatus({ force: true }),
          publicCache.activeSeason.loaded
            ? Promise.resolve(publicCache.activeSeason.value)
            : getActiveSeason()
        ])
        if (!mounted) return
        publicCache.activeSeason = { loaded: true, value: season }
        setActiveSeason(season)
      } catch {
        // Keep last known registration status in the shared store
      } finally {
        if (mounted) setIsLoading(false)
      }
    }

    void loadInitial()
    return () => {
      mounted = false
    }
  }, [])

  // Seed initial sport row once accepted_sports loads
  useEffect(() => {
    if (!config || !isRegistrationOpen || config.accepted_sports.length === 0) return
    setSportRows((prev) => {
      if (prev.length > 0) return prev
      const firstSport = config.accepted_sports[0]
      rowCounterRef.current += 1
      return [
        {
          key: `row-${rowCounterRef.current}`,
          sport: firstSport.name,
          playing_role: firstSport.roles[0] || ''
        }
      ]
    })
  }, [config, isRegistrationOpen])

  // Revoke object URL on unmount
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current)
        previewUrlRef.current = null
      }
    }
  }, [])

  const acceptedSports = useMemo(
    () => config?.accepted_sports ?? [],
    [config?.accepted_sports]
  )

  const selectedSportNamesLower = useMemo(
    () => new Set(sportRows.map((r) => r.sport.toLowerCase())),
    [sportRows]
  )

  const getRolesForSportName = (sportName: string): string[] => {
    const found = acceptedSports.find(
      (s) => s.name.toLowerCase() === sportName.toLowerCase()
    )
    return found?.roles ?? []
  }

  const handleAddSportRow = () => {
    const nextSport = acceptedSports.find(
      (s) => !selectedSportNamesLower.has(s.name.toLowerCase())
    )
    if (!nextSport) return
    rowCounterRef.current += 1
    setSportRows((prev) => [
      ...prev,
      {
        key: `row-${rowCounterRef.current}`,
        sport: nextSport.name,
        playing_role: nextSport.roles[0] || ''
      }
    ])
  }

  const handleRemoveSportRow = (rowKey: string) => {
    setSportRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.key !== rowKey)))
  }

  const handleChangeSport = (rowKey: string, nextSportName: string) => {
    const roles = getRolesForSportName(nextSportName)
    setSportRows((prev) =>
      prev.map((row) =>
        row.key === rowKey
          ? { ...row, sport: nextSportName, playing_role: roles[0] || '' }
          : row
      )
    )
  }

  const handleChangeRole = (rowKey: string, nextRole: string) => {
    setSportRows((prev) =>
      prev.map((row) => (row.key === rowKey ? { ...row, playing_role: nextRole } : row))
    )
  }

  const clearSelectedPhoto = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
    setProcessedPhoto(null)
    setPhotoPreviewUrl(null)
    setPhotoError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setPhotoError(null)
    setFormError(null)
    setIsProcessingPhoto(true)

    try {
      const processed = await processRegistrationPhoto(file)
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current)
      }
      const nextUrl = URL.createObjectURL(processed.photoBlob)
      previewUrlRef.current = nextUrl
      setProcessedPhoto(processed)
      setPhotoPreviewUrl(nextUrl)
    } catch (err: unknown) {
      clearSelectedPhoto()
      setPhotoError(getErrorMessage(err, 'Could not process the selected photo.'))
    } finally {
      setIsProcessingPhoto(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitStep !== 'idle') return
    setFormError(null)

    const trimmedName = fullName.trim()
    const trimmedRoll = rollNo.trim()
    const trimmedCode = registrationCode.trim()

    if (trimmedName.length < 2 || trimmedName.length > 100) {
      setFormError('Please enter your full name (2 to 100 characters).')
      return
    }
    if (!ROLL_NUMBER_REGEX.test(trimmedRoll)) {
      setRollNoError(ROLL_NUMBER_ERROR)
      return
    }
    setRollNoError(null)

    const validEntries: RegistrationSportEntry[] = []
    const seenSports = new Set<string>()
    for (const row of sportRows) {
      const sp = row.sport.trim()
      const rl = row.playing_role.trim()
      if (!sp || !rl) {
        setFormError('Please choose both a sport and a playing role for each entry.')
        return
      }
      const key = sp.toLowerCase()
      if (seenSports.has(key)) {
        setFormError('Duplicate sport entries are not allowed.')
        return
      }
      seenSports.add(key)
      validEntries.push({ sport: sp, playing_role: rl })
    }

    if (validEntries.length === 0) {
      setFormError('Select at least one sport and playing role.')
      return
    }

    if (!processedPhoto) {
      setFormError('Please upload a portrait photo before submitting.')
      return
    }

    if (!consent) {
      setFormError('You must tick the consent checkbox to register.')
      return
    }

    if (!trimmedCode) {
      setFormError('Please enter the registration code provided by the organizers.')
      return
    }

    const elapsedMs = Date.now() - loadedAtRef.current
    if (elapsedMs < 4000) {
      setFormError('Please wait a moment and review your details before submitting.')
      return
    }

    try {
      await submitPublicRegistration({
        fullName: trimmedName,
        rollNo: trimmedRoll,
        academicYear,
        sportEntries: validEntries,
        consent,
        registrationCode: trimmedCode,
        photoBlob: processedPhoto.photoBlob,
        thumbBlob: processedPhoto.thumbBlob,
        honeypot,
        elapsedMs,
        onStepChange: (step) => setSubmitStep(step)
      })

      setSubmittedSummary({
        fullName: trimmedName,
        academicYear,
        sportEntries: validEntries
      })
      clearSelectedPhoto()
    } catch (err: unknown) {
      setFormError(getErrorMessage(err, 'Registration could not be submitted. Please try again.'))
    } finally {
      setSubmitStep('idle')
    }
  }

  const isBusy = submitStep !== 'idle'
  const submitLabel =
    submitStep === 'uploading'
      ? 'Uploading photo...'
      : submitStep === 'finalizing'
      ? 'Finalizing...'
      : submitStep === 'submitting'
      ? 'Submitting...'
      : 'Submit Registration'

  const opensFormatted = formatDateTimeReadable(opensAt)
  const closesFormatted = formatDateTimeReadable(closesAt)

  return (
    <div className={PUBLIC_PAGE_SHELL}>
      <HeaderBar onOpenMenu={() => setIsMenuOpen(true)} />
      <NavigationMenu
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
      />

      <main className={PUBLIC_MAIN_NARROW}>
        <div className="mb-6">
          <Link
            to="/"
            onMouseEnter={() => prefetchRoute('/')}
            onFocus={() => prefetchRoute('/')}
            onTouchStart={() => prefetchRoute('/')}
            className={PUBLIC_BACK_LINK}
          >
            <ArrowLeft size={14} weight="regular" />
            <span>Return Home</span>
          </Link>
        </div>

        <header className={PUBLIC_PAGE_HEADER}>
          <div className="space-y-1.5 min-w-0">
            <p className="text-xs font-mono uppercase tracking-widest text-muted">
              Athlete Self-Registration
            </p>
            <h1 className={PUBLIC_PAGE_TITLE}>Register</h1>
          </div>

          {seasonName && isRegistrationOpen && (
            <span className={PUBLIC_COUNT_PILL}>{seasonName}</span>
          )}
        </header>

        {isLoading ? (
          <div className={`${PUBLIC_CARD} space-y-5`}>
            <SkeletonText width="w-1/2" className="h-5" />
            <SkeletonBlock className="h-12 bg-bg border border-border rounded-2xl" />
            <SkeletonBlock className="h-12 bg-bg border border-border rounded-2xl" />
            <SkeletonBlock className="h-36 bg-bg border border-border rounded-2xl" />
          </div>
        ) : submittedSummary ? (
          <section className={`${PUBLIC_CARD} space-y-6`}>
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-2xl bg-surface-2 border border-accent-bright/40 flex items-center justify-center text-accent-bright shrink-0">
                <CheckCircle size={24} weight="regular" />
              </div>
              <div className="space-y-2 min-w-0">
                <h2 className={PUBLIC_SECTION_TITLE}>Registration Received</h2>
                <p className="text-sm text-text leading-relaxed">
                  {config?.confirmation_message || DEFAULT_CONFIRMATION_MESSAGE}
                </p>
              </div>
            </div>

            <div className={`${PUBLIC_WELL} p-4 sm:p-5 space-y-3`}>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-medium text-text">{submittedSummary.fullName}</span>
                <span className="text-xs font-mono text-muted">
                  {getAcademicYearLabel(submittedSummary.academicYear)}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {submittedSummary.sportEntries.map((entry) => (
                  <span
                    key={entry.sport}
                    className="inline-flex items-center px-3 py-1 rounded-full bg-surface-2 border border-border text-xs font-mono text-text"
                  >
                    {entry.sport} · {entry.playing_role}
                  </span>
                ))}
              </div>
            </div>

            <div className="pt-2 flex flex-wrap items-center gap-3">
              <Link
                to="/"
                className={`${PUBLIC_BTN_PRIMARY} min-h-[44px] px-6 text-sm`}
              >
                Return Home
              </Link>
            </div>
          </section>
        ) : !isRegistrationOpen || !config ? (
          <section className={`${PUBLIC_CARD} space-y-5`}>
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-2xl bg-surface-2 border border-border flex items-center justify-center text-muted shrink-0">
                <Lock size={22} weight="regular" />
              </div>
              <div className="space-y-1.5 min-w-0">
                <h2 className={PUBLIC_SECTION_TITLE}>Registration is closed</h2>
                <p className="text-sm text-muted leading-relaxed">
                  {registrationReason === 'before_open' && opensFormatted
                    ? `Athlete self-registration opens on ${opensFormatted}.`
                    : registrationReason === 'after_close' && closesFormatted
                    ? `The registration window closed on ${closesFormatted}.`
                    : 'Self-registration is not currently accepting entries. Check back with the tournament organizers.'}
                </p>
              </div>
            </div>

            <div className="pt-2">
              <Link
                to="/"
                className={`${PUBLIC_BTN_SECONDARY} min-h-[42px] px-5 text-sm`}
              >
                Back to Home
              </Link>
            </div>
          </section>
        ) : (
          <div className="space-y-6">
            {/* Instructions & Photo Guidance Block */}
            <section className={`${PUBLIC_CARD} space-y-4`}>
              {config.instructions_md.trim() && (
                <Suspense fallback={<SkeletonText width="w-full" className="h-4" />}>
                  <MarkdownContent content={config.instructions_md} />
                </Suspense>
              )}

              <div className={`${PUBLIC_WELL} p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
                <div className="flex items-start gap-2.5 min-w-0">
                  <Info size={18} weight="regular" className="text-accent-bright shrink-0 mt-0.5" />
                  <p className="text-xs text-muted leading-relaxed">
                    Upload a vertical (portrait) photo. Your photo is automatically centre-cropped
                    to 4:5 (1000 x 1250 px) and compressed under 400 KB in your browser.
                  </p>
                </div>
                <Link
                  to="/help"
                  onMouseEnter={() => prefetchRoute('/help')}
                  onFocus={() => prefetchRoute('/help')}
                  className="text-xs font-medium text-accent-bright hover:underline whitespace-nowrap shrink-0"
                >
                  Photo size guidance
                </Link>
              </div>

              {closesFormatted && (
                <p className="text-xs font-mono text-muted">
                  Closes {closesFormatted}
                </p>
              )}
            </section>

            {/* Registration Form */}
            <form onSubmit={handleSubmit} className={`${PUBLIC_CARD} space-y-6`} noValidate>
              {/* Hidden honeypot field (never filled by humans) */}
              <div
                aria-hidden="true"
                className="absolute -left-[9999px] top-auto w-px h-px overflow-hidden opacity-0 pointer-events-none"
              >
                <label htmlFor="reg-website-hp">Website</label>
                <input
                  id="reg-website-hp"
                  name="website"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                />
              </div>

              {/* Personal Details */}
              <div className="space-y-4">
                <h2 className={PUBLIC_SECTION_TITLE}>Athlete Details</h2>

                <div>
                  <label htmlFor="reg-full-name" className={PUBLIC_LABEL}>
                    Full Name *
                  </label>
                  <input
                    id="reg-full-name"
                    type="text"
                    required
                    maxLength={100}
                    autoComplete="name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter your full name"
                    disabled={isBusy}
                    className={PUBLIC_INPUT}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="reg-roll-no" className={PUBLIC_LABEL}>
                      Roll Number *
                    </label>
                    <input
                      id="reg-roll-no"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      required
                      maxLength={5}
                      autoComplete="off"
                      value={rollNo}
                      onChange={(e) => {
                        const raw = e.target.value
                        const cleaned = sanitizeRollNo(raw)
                        setRollNo(cleaned)
                        if (ROLL_NUMBER_REGEX.test(cleaned)) {
                          setRollNoError(null)
                        } else if (raw !== cleaned || rollNoError) {
                          setRollNoError(ROLL_NUMBER_ERROR)
                        }
                      }}
                      onPaste={(e) => {
                        e.preventDefault()
                        const pasted = e.clipboardData.getData('text')
                        const start = e.currentTarget.selectionStart ?? rollNo.length
                        const end = e.currentTarget.selectionEnd ?? rollNo.length
                        const raw = rollNo.slice(0, start) + pasted + rollNo.slice(end)
                        const cleaned = sanitizeRollNo(raw)
                        setRollNo(cleaned)
                        if (ROLL_NUMBER_REGEX.test(cleaned)) {
                          setRollNoError(null)
                        } else {
                          setRollNoError(ROLL_NUMBER_ERROR)
                        }
                      }}
                      onBlur={() => {
                        if (!ROLL_NUMBER_REGEX.test(rollNo)) {
                          setRollNoError(ROLL_NUMBER_ERROR)
                        }
                      }}
                      aria-invalid={Boolean(rollNoError)}
                      aria-describedby={
                        rollNoError ? 'reg-roll-no-error reg-roll-no-help' : 'reg-roll-no-help'
                      }
                      placeholder="e.g. 23131"
                      disabled={isBusy}
                      className={`${PUBLIC_INPUT} font-mono${
                        rollNoError ? ' border-error focus:border-error' : ''
                      }`}
                    />
                    {rollNoError && (
                      <p id="reg-roll-no-error" role="alert" className="mt-1.5 text-xs text-error">
                        {rollNoError}
                      </p>
                    )}
                    <p id="reg-roll-no-help" className="mt-1.5 text-xs text-muted">
                      Digits only, up to 5 digits. Used only for verification. Never shown publicly.
                    </p>
                  </div>

                  <div>
                    <label htmlFor="reg-academic-year" className={PUBLIC_LABEL}>
                      Academic Year *
                    </label>
                    <select
                      id="reg-academic-year"
                      required
                      value={academicYear}
                      onChange={(e) => setAcademicYear(e.target.value as AcademicYear)}
                      disabled={isBusy}
                      className={PUBLIC_INPUT}
                    >
                      {ACADEMIC_YEARS.map((yr) => (
                        <option key={yr.value} value={yr.value}>
                          {yr.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Sport Entries */}
              <div className="pt-5 border-t border-border space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className={PUBLIC_SECTION_TITLE}>Sports &amp; Playing Roles</h2>
                    <p className="text-xs text-muted mt-1">
                      Add every sport you are registering for this season.
                    </p>
                  </div>
                  {sportRows.length < acceptedSports.length && (
                    <button
                      type="button"
                      onClick={handleAddSportRow}
                      disabled={isBusy}
                      className={`${PUBLIC_BTN_SECONDARY} min-h-[36px] px-3.5 text-xs shrink-0`}
                    >
                      <Plus size={14} weight="bold" />
                      <span>Add sport</span>
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  {sportRows.map((row, idx) => {
                    const roles = getRolesForSportName(row.sport)
                    const availableSportsForRow = acceptedSports.filter(
                      (s) =>
                        s.name.toLowerCase() === row.sport.toLowerCase() ||
                        !selectedSportNamesLower.has(s.name.toLowerCase())
                    )

                    return (
                      <div
                        key={row.key}
                        className={`${PUBLIC_WELL} p-4 grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end`}
                      >
                        <div>
                          <label
                            htmlFor={`reg-sport-${idx}`}
                            className="block text-xs font-medium text-muted mb-1.5"
                          >
                            Sport *
                          </label>
                          <select
                            id={`reg-sport-${idx}`}
                            value={row.sport}
                            onChange={(e) => handleChangeSport(row.key, e.target.value)}
                            disabled={isBusy}
                            className={PUBLIC_INPUT}
                          >
                            {availableSportsForRow.map((s) => (
                              <option key={s.id} value={s.name}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label
                            htmlFor={`reg-role-${idx}`}
                            className="block text-xs font-medium text-muted mb-1.5"
                          >
                            Playing Role *
                          </label>
                          <select
                            id={`reg-role-${idx}`}
                            value={row.playing_role}
                            onChange={(e) => handleChangeRole(row.key, e.target.value)}
                            disabled={isBusy || roles.length === 0}
                            className={PUBLIC_INPUT}
                          >
                            {roles.length === 0 ? (
                              <option value="">No roles configured</option>
                            ) : (
                              roles.map((roleName) => (
                                <option key={roleName} value={roleName}>
                                  {roleName}
                                </option>
                              ))
                            )}
                          </select>
                        </div>

                        {sportRows.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveSportRow(row.key)}
                            disabled={isBusy}
                            aria-label={`Remove ${row.sport}`}
                            title="Remove sport entry"
                            className="h-[44px] w-[44px] rounded-2xl border border-border bg-surface text-muted hover:text-error hover:border-error/40 hover:bg-error/10 flex items-center justify-center transition-colors cursor-pointer shrink-0 justify-self-end sm:justify-self-auto"
                          >
                            <Trash size={16} weight="regular" />
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Portrait Photo Upload */}
              <div className="pt-5 border-t border-border space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className={PUBLIC_SECTION_TITLE}>Player Photo *</h2>
                    <p className="text-xs text-muted mt-1">
                      Portrait orientation only · JPG, PNG, or WebP · Cropped to 4:5 (1000 x 1250 px)
                    </p>
                  </div>
                  <Link
                    to="/help"
                    onMouseEnter={() => prefetchRoute('/help')}
                    onFocus={() => prefetchRoute('/help')}
                    className="text-xs font-medium text-accent-bright hover:underline"
                  >
                    Photo size guidance
                  </Link>
                </div>

                <div className="flex flex-col sm:flex-row items-start gap-5">
                  <div className="w-36 aspect-[4/5] rounded-2xl bg-bg border border-border overflow-hidden flex items-center justify-center shrink-0">
                    {photoPreviewUrl ? (
                      <img
                        src={photoPreviewUrl}
                        alt="Cropped portrait preview"
                        width={144}
                        height={180}
                        decoding="async"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-1.5 text-muted px-3 text-center">
                        <ImageIcon size={28} weight="regular" />
                        <span className="text-[11px] font-mono">4:5 preview</span>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 w-full space-y-3 min-w-0">
                    <input
                      ref={fileInputRef}
                      id="reg-photo-input"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handlePhotoSelect}
                      disabled={isBusy || isProcessingPhoto}
                      className="hidden"
                    />

                    <div className="flex flex-wrap items-center gap-2.5">
                      <label
                        htmlFor="reg-photo-input"
                        className={`${PUBLIC_BTN_SECONDARY} min-h-[42px] px-4 text-xs ${
                          isBusy || isProcessingPhoto ? 'opacity-50 pointer-events-none' : ''
                        }`}
                      >
                        <UploadSimple size={15} weight="regular" />
                        <span>
                          {isProcessingPhoto
                            ? 'Processing photo...'
                            : processedPhoto
                            ? 'Choose different photo'
                            : 'Select portrait photo'}
                        </span>
                      </label>

                      {processedPhoto && !isBusy && (
                        <button
                          type="button"
                          onClick={clearSelectedPhoto}
                          className="text-xs text-muted hover:text-text transition-colors cursor-pointer px-2 py-1"
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    {processedPhoto && (
                      <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-muted tabular-nums">
                        <span className="text-accent-bright">Ready</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {processedPhoto.width} x {processedPhoto.height} px
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{formatKb(processedPhoto.sizeBytes)}</span>
                      </div>
                    )}

                    {photoError && (
                      <div role="alert" className={PUBLIC_ERROR_BANNER}>
                        <WarningCircle size={16} weight="regular" className="text-error shrink-0" />
                        <span>{photoError}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Registration Code & Consent */}
              <div className="pt-5 border-t border-border space-y-4">
                <div className="max-w-sm">
                  <label htmlFor="reg-code" className={PUBLIC_LABEL}>
                    Registration Code *
                  </label>
                  <input
                    id="reg-code"
                    type="text"
                    required
                    maxLength={64}
                    autoComplete="off"
                    value={registrationCode}
                    onChange={(e) => setRegistrationCode(e.target.value)}
                    placeholder="Enter organizer code"
                    disabled={isBusy}
                    className={`${PUBLIC_INPUT} font-mono`}
                  />
                </div>

                <label className="flex items-start gap-3 cursor-pointer select-none pt-1">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    disabled={isBusy}
                    className="mt-1 h-4 w-4 rounded border-border bg-bg accent-accent-bright shrink-0 cursor-pointer"
                  />
                  <span className="text-sm text-text leading-relaxed">
                    My name, year, sport and photo will be shown on the public site
                  </span>
                </label>
              </div>

              {formError && (
                <div role="alert" className={PUBLIC_ERROR_BANNER}>
                  <WarningCircle size={16} weight="regular" className="text-error shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="pt-4 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p className="text-xs text-muted">
                  Entries are reviewed by tournament admins before appearing on rosters.
                </p>
                <button
                  type="submit"
                  disabled={isBusy || isProcessingPhoto}
                  className={`${PUBLIC_BTN_PRIMARY} min-h-[46px] px-7 text-sm shrink-0`}
                >
                  {submitLabel}
                </button>
              </div>
            </form>
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  )
}
