import React, { Suspense, useEffect, useMemo, useState } from 'react'
import { FloppyDisk, Plus, Trash, WarningCircle } from '@phosphor-icons/react'
import {
  DEFAULT_REEL_CLOSED_MESSAGE,
  DEFAULT_REEL_CONFIRMATION,
  DEFAULT_REEL_CONSENT,
  DEFAULT_REEL_SETTINGS,
  getAdminReelSettings,
  getReelPhase,
  saveReelSettings
} from '../../lib/data'
import { useToast } from '../../lib/ToastContext'
import { getErrorMessage } from '../../lib/errors'
import { lazyWithRetry } from '../../lib/lazyWithRetry'
import { Button, SkeletonBlock } from '../ui'
import {
  ADMIN_CARD,
  ADMIN_CARD_HEADER,
  ADMIN_CARD_TITLE,
  ADMIN_ICON_BTN_DANGER,
  ADMIN_INPUT,
  ADMIN_LABEL,
  ADMIN_TEXTAREA,
  ADMIN_WELL
} from './adminStyles'
import type { ReelSettings } from '../../types'

const MarkdownContent = lazyWithRetry(() =>
  import('../common/MarkdownContent').then((m) => ({ default: m.MarkdownContent }))
)

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
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function parseLines(text: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || seen.has(line.toLowerCase())) continue
    seen.add(line.toLowerCase())
    out.push(line)
  }
  return out
}

function parseHosts(text: string): string[] {
  const hosts = text
    .split('\n')
    .map((line) =>
      line
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/\/.*$/, '')
        .replace(/^www\./, '')
    )
    .filter((h) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(h))
  return Array.from(new Set(hosts))
}

const Toggle: React.FC<{
  checked: boolean
  onChange: (next: boolean) => void
  label: string
}> = ({ checked, onChange, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors cursor-pointer ${
      checked ? 'bg-accent-bright border-accent-bright' : 'bg-surface-2 border-border'
    }`}
  >
    <span
      className={`inline-block h-5 w-5 rounded-full bg-bg shadow transition-transform ${
        checked ? 'translate-x-6' : 'translate-x-1'
      }`}
    />
  </button>
)

const MarkdownField: React.FC<{
  id: string
  label: string
  value: string
  onChange: (next: string) => void
  rows?: number
  hint?: string
}> = ({ id, label, value, onChange, rows = 4, hint }) => {
  const [preview, setPreview] = useState(false)
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className={ADMIN_LABEL}>
          {label}
        </label>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted">Markdown</span>
          <button
            type="button"
            onClick={() => setPreview((v) => !v)}
            className="text-xs font-medium text-accent-bright hover:underline cursor-pointer"
          >
            {preview ? 'Edit' : 'Preview'}
          </button>
        </div>
      </div>
      {preview ? (
        <div className={`${ADMIN_WELL} p-4 min-h-[96px]`}>
          {value.trim() ? (
            <Suspense fallback={<SkeletonBlock className="h-16 w-full rounded-xl" />}>
              <MarkdownContent content={value} />
            </Suspense>
          ) : (
            <p className="text-xs text-muted italic">Nothing entered.</p>
          )}
        </div>
      ) : (
        <textarea
          id={id}
          rows={rows}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${ADMIN_TEXTAREA} resize-y leading-relaxed`}
        />
      )}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  )
}

const SectionHeading: React.FC<{ title: string; note?: string }> = ({ title, note }) => (
  <div className="pt-6 border-t border-border space-y-1">
    <h3 className="font-syne font-bold text-base text-text tracking-tight">{title}</h3>
    {note && <p className="text-xs text-muted">{note}</p>}
  </div>
)

export const ReelsSetupCard: React.FC = () => {
  const { showToast } = useToast()

  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState<ReelSettings>(DEFAULT_REEL_SETTINGS)
  const [draft, setDraft] = useState<ReelSettings>(DEFAULT_REEL_SETTINGS)
  const [opensLocal, setOpensLocal] = useState('')
  const [closesLocal, setClosesLocal] = useState('')
  const [categoriesText, setCategoriesText] = useState('General')
  const [hostsText, setHostsText] = useState('')

  const applyLoaded = (s: ReelSettings) => {
    setSaved(s)
    setDraft(s)
    setOpensLocal(isoToLocalInputValue(s.opens_at))
    setClosesLocal(isoToLocalInputValue(s.closes_at))
    setCategoriesText(s.categories.join('\n'))
    setHostsText(s.allowed_hosts.join('\n'))
  }

  useEffect(() => {
    let mounted = true
    void (async () => {
      try {
        const loaded = await getAdminReelSettings()
        if (mounted) applyLoaded(loaded)
      } catch (err: unknown) {
        if (mounted) {
          setLoadError(
            getErrorMessage(
              err,
              'Could not load reel settings. Run the reel SQL in the Supabase SQL Editor first.'
            )
          )
        }
      } finally {
        if (mounted) setIsLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  const set = (patch: Partial<ReelSettings>) => setDraft((prev) => ({ ...prev, ...patch }))

  const opensIso = localInputValueToIso(opensLocal)
  const closesIso = localInputValueToIso(closesLocal)
  const windowError =
    opensIso && closesIso && Date.parse(closesIso) <= Date.parse(opensIso)
      ? 'Closing time must be after opening time.'
      : null

  const effective: ReelSettings = useMemo(
    () => ({
      ...draft,
      opens_at: opensIso,
      closes_at: closesIso,
      categories: parseLines(categoriesText).length > 0 ? parseLines(categoriesText) : ['General'],
      allowed_hosts:
        parseHosts(hostsText).length > 0 ? parseHosts(hostsText) : DEFAULT_REEL_SETTINGS.allowed_hosts
    }),
    [draft, opensIso, closesIso, categoriesText, hostsText]
  )

  const isDirty = useMemo(() => {
    const strip = (s: ReelSettings) => JSON.stringify({ ...s, updated_at: null })
    return strip(effective) !== strip(saved)
  }, [effective, saved])

  const weightTotal = draft.criteria.reduce((sum, c) => sum + (Number(c.weight) || 0), 0)

  const phase = getReelPhase(effective)
  const statusLabel =
    phase === 'hidden'
      ? 'Page hidden'
      : phase === 'open'
      ? 'Accepting entries'
      : phase === 'upcoming'
      ? 'Opens later'
      : phase === 'ended'
      ? 'Window ended'
      : 'Page live, submissions closed'

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSaving || windowError) return
    try {
      setIsSaving(true)
      const result = await saveReelSettings(effective)
      applyLoaded(result)
      showToast('Reel settings saved', 'success')
    } catch (err: unknown) {
      showToast(getErrorMessage(err, 'Failed to save reel settings'), 'error')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <section className={ADMIN_CARD}>
        <div className={ADMIN_CARD_HEADER}>
          <h2 className={ADMIN_CARD_TITLE}>Reel competition</h2>
        </div>
        <div className="space-y-3">
          <SkeletonBlock className="h-14 bg-bg border border-border rounded-2xl" />
          <SkeletonBlock className="h-24 bg-bg border border-border rounded-2xl" />
          <SkeletonBlock className="h-24 bg-bg border border-border rounded-2xl" />
        </div>
      </section>
    )
  }

  if (loadError) {
    return (
      <section className={ADMIN_CARD}>
        <div className={ADMIN_CARD_HEADER}>
          <h2 className={ADMIN_CARD_TITLE}>Reel competition</h2>
        </div>
        <div className="p-3.5 rounded-2xl bg-error/10 border border-error/40 flex items-start gap-2.5 text-xs text-text">
          <WarningCircle size={16} weight="regular" className="text-error shrink-0 mt-0.5" />
          <span>{loadError}</span>
        </div>
      </section>
    )
  }

  return (
    <section className={ADMIN_CARD}>
      <div className={ADMIN_CARD_HEADER}>
        <div className="space-y-1">
          <h2 className={ADMIN_CARD_TITLE}>Reel competition</h2>
          <p className="text-xs text-muted">
            Edit the public page at <span className="font-mono">/reels</span> and the entry form at{' '}
            <span className="font-mono">/reels/submit</span>.
          </p>
        </div>
        <span
          className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-mono border shrink-0 self-start sm:self-center ${
            phase === 'open'
              ? 'bg-surface border-accent-bright text-accent-bright font-medium'
              : 'bg-surface-2 border-border text-muted'
          }`}
        >
          {statusLabel}
        </span>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Switches */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className={`${ADMIN_WELL} p-4 flex items-center justify-between gap-4`}>
            <div className="space-y-0.5 min-w-0">
              <span className="block text-sm font-medium text-text">Show the reels page</span>
              <span className="block text-xs text-muted">
                Turns on /reels and adds a Reels link to the footer.
              </span>
            </div>
            <Toggle
              checked={draft.is_visible}
              onChange={(v) => set({ is_visible: v })}
              label="Show the reels page"
            />
          </div>
          <div className={`${ADMIN_WELL} p-4 flex items-center justify-between gap-4`}>
            <div className="space-y-0.5 min-w-0">
              <span className="block text-sm font-medium text-text">Accept submissions</span>
              <span className="block text-xs text-muted">
                Works only while the page is shown and inside the window below.
              </span>
            </div>
            <Toggle
              checked={draft.is_open}
              onChange={(v) => set({ is_open: v })}
              label="Accept submissions"
            />
          </div>
        </div>

        {/* Window */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(
            [
              { id: 'reel-opens', label: 'Opens at', value: opensLocal, set: setOpensLocal },
              { id: 'reel-closes', label: 'Closes at (deadline)', value: closesLocal, set: setClosesLocal }
            ] as const
          ).map((f) => (
            <div key={f.id} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor={f.id} className={ADMIN_LABEL}>
                  {f.label}
                </label>
                {f.value && (
                  <button
                    type="button"
                    onClick={() => f.set('')}
                    className="text-xs text-muted hover:text-text cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
              <input
                id={f.id}
                type="datetime-local"
                value={f.value}
                onChange={(e) => f.set(e.target.value)}
                className={`${ADMIN_INPUT} font-mono`}
              />
              <p className="text-xs text-muted">Optional. Leave blank for no limit.</p>
            </div>
          ))}
        </div>
        {windowError && (
          <p role="alert" className="text-xs text-error">
            {windowError}
          </p>
        )}

        {/* Page content */}
        <SectionHeading title="Page content" note="Sections with no content are hidden on the public page." />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="reel-title-in" className={ADMIN_LABEL}>
              Title
            </label>
            <input
              id="reel-title-in"
              type="text"
              maxLength={80}
              value={draft.title}
              onChange={(e) => set({ title: e.target.value })}
              className={ADMIN_INPUT}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="reel-tagline" className={ADMIN_LABEL}>
              Tagline
            </label>
            <input
              id="reel-tagline"
              type="text"
              maxLength={160}
              value={draft.tagline}
              onChange={(e) => set({ tagline: e.target.value })}
              className={ADMIN_INPUT}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="reel-theme" className={ADMIN_LABEL}>
            Theme
          </label>
          <input
            id="reel-theme"
            type="text"
            maxLength={120}
            value={draft.theme}
            onChange={(e) => set({ theme: e.target.value })}
            placeholder="The one line brief entrants make their reel about"
            className={ADMIN_INPUT}
          />
        </div>

        <MarkdownField
          id="reel-description"
          label="Description"
          value={draft.description_md}
          onChange={(v) => set({ description_md: v })}
        />
        <MarkdownField
          id="reel-rules"
          label="Rules"
          value={draft.rules_md}
          onChange={(v) => set({ rules_md: v })}
          rows={6}
          hint="Use a bulleted list: one rule per line starting with a dash."
        />
        <MarkdownField
          id="reel-eligibility"
          label="Who can enter"
          value={draft.eligibility_md}
          onChange={(v) => set({ eligibility_md: v })}
        />

        {/* Prizes */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className={ADMIN_LABEL}>Prizes</span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              leftIcon={Plus}
              onClick={() => set({ prizes: [...draft.prizes, { place: '', reward: '' }] })}
              className="rounded-full"
            >
              Add prize
            </Button>
          </div>
          {draft.prizes.map((p, idx) => (
            <div key={idx} className={`${ADMIN_WELL} p-3 grid grid-cols-1 sm:grid-cols-[180px_1fr_auto] gap-2.5 items-center`}>
              <input
                type="text"
                aria-label={`Prize ${idx + 1} place`}
                maxLength={40}
                value={p.place}
                placeholder="1st place"
                onChange={(e) =>
                  set({ prizes: draft.prizes.map((x, i) => (i === idx ? { ...x, place: e.target.value } : x)) })
                }
                className={ADMIN_INPUT}
              />
              <input
                type="text"
                aria-label={`Prize ${idx + 1} reward`}
                maxLength={120}
                value={p.reward}
                placeholder="Reward"
                onChange={(e) =>
                  set({ prizes: draft.prizes.map((x, i) => (i === idx ? { ...x, reward: e.target.value } : x)) })
                }
                className={ADMIN_INPUT}
              />
              <button
                type="button"
                aria-label={`Remove prize ${idx + 1}`}
                onClick={() => set({ prizes: draft.prizes.filter((_, i) => i !== idx) })}
                className={`${ADMIN_ICON_BTN_DANGER} justify-self-end`}
              >
                <Trash size={15} weight="regular" />
              </button>
            </div>
          ))}
        </div>

        {/* Criteria */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className={ADMIN_LABEL}>Judging criteria</span>
            <div className="flex items-center gap-3">
              {draft.criteria.length > 0 && (
                <span
                  className={`text-xs font-mono tabular-nums ${
                    weightTotal === 100 ? 'text-muted' : 'text-error'
                  }`}
                >
                  Total {weightTotal}%
                </span>
              )}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                leftIcon={Plus}
                onClick={() =>
                  set({ criteria: [...draft.criteria, { name: '', weight: 0, description: '' }] })
                }
                className="rounded-full"
              >
                Add criterion
              </Button>
            </div>
          </div>
          {draft.criteria.map((c, idx) => (
            <div key={idx} className={`${ADMIN_WELL} p-3 space-y-2.5`}>
              <div className="grid grid-cols-[1fr_90px_auto] gap-2.5 items-center">
                <input
                  type="text"
                  aria-label={`Criterion ${idx + 1} name`}
                  maxLength={60}
                  value={c.name}
                  placeholder="Creativity"
                  onChange={(e) =>
                    set({ criteria: draft.criteria.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)) })
                  }
                  className={ADMIN_INPUT}
                />
                <div className="relative">
                  <input
                    type="number"
                    aria-label={`Criterion ${idx + 1} weight percent`}
                    min={0}
                    max={100}
                    step={1}
                    value={c.weight}
                    onChange={(e) =>
                      set({
                        criteria: draft.criteria.map((x, i) =>
                          i === idx ? { ...x, weight: Math.min(100, Math.max(0, Number(e.target.value) || 0)) } : x
                        )
                      })
                    }
                    className={`${ADMIN_INPUT} font-mono tabular-nums pr-7`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">%</span>
                </div>
                <button
                  type="button"
                  aria-label={`Remove criterion ${idx + 1}`}
                  onClick={() => set({ criteria: draft.criteria.filter((_, i) => i !== idx) })}
                  className={ADMIN_ICON_BTN_DANGER}
                >
                  <Trash size={15} weight="regular" />
                </button>
              </div>
              <input
                type="text"
                aria-label={`Criterion ${idx + 1} description`}
                maxLength={200}
                value={c.description}
                placeholder="What judges look for"
                onChange={(e) =>
                  set({ criteria: draft.criteria.map((x, i) => (i === idx ? { ...x, description: e.target.value } : x)) })
                }
                className={ADMIN_INPUT}
              />
            </div>
          ))}
        </div>

        {/* Key dates */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className={ADMIN_LABEL}>Key dates</span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              leftIcon={Plus}
              onClick={() => set({ key_dates: [...draft.key_dates, { label: '', when: '' }] })}
              className="rounded-full"
            >
              Add date
            </Button>
          </div>
          {draft.key_dates.map((d, idx) => (
            <div key={idx} className={`${ADMIN_WELL} p-3 grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2.5 items-center`}>
              <input
                type="text"
                aria-label={`Date ${idx + 1} label`}
                maxLength={60}
                value={d.label}
                placeholder="Judging"
                onChange={(e) =>
                  set({ key_dates: draft.key_dates.map((x, i) => (i === idx ? { ...x, label: e.target.value } : x)) })
                }
                className={ADMIN_INPUT}
              />
              <input
                type="text"
                aria-label={`Date ${idx + 1} when`}
                maxLength={80}
                value={d.when}
                placeholder="12 Dec, 5 PM"
                onChange={(e) =>
                  set({ key_dates: draft.key_dates.map((x, i) => (i === idx ? { ...x, when: e.target.value } : x)) })
                }
                className={ADMIN_INPUT}
              />
              <button
                type="button"
                aria-label={`Remove date ${idx + 1}`}
                onClick={() => set({ key_dates: draft.key_dates.filter((_, i) => i !== idx) })}
                className={`${ADMIN_ICON_BTN_DANGER} justify-self-end`}
              >
                <Trash size={15} weight="regular" />
              </button>
            </div>
          ))}
        </div>

        {/* FAQ */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className={ADMIN_LABEL}>Questions and answers</span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              leftIcon={Plus}
              onClick={() => set({ faqs: [...draft.faqs, { q: '', a: '' }] })}
              className="rounded-full"
            >
              Add question
            </Button>
          </div>
          {draft.faqs.map((f, idx) => (
            <div key={idx} className={`${ADMIN_WELL} p-3 space-y-2.5`}>
              <div className="grid grid-cols-[1fr_auto] gap-2.5 items-center">
                <input
                  type="text"
                  aria-label={`Question ${idx + 1}`}
                  maxLength={160}
                  value={f.q}
                  placeholder="Question"
                  onChange={(e) =>
                    set({ faqs: draft.faqs.map((x, i) => (i === idx ? { ...x, q: e.target.value } : x)) })
                  }
                  className={ADMIN_INPUT}
                />
                <button
                  type="button"
                  aria-label={`Remove question ${idx + 1}`}
                  onClick={() => set({ faqs: draft.faqs.filter((_, i) => i !== idx) })}
                  className={ADMIN_ICON_BTN_DANGER}
                >
                  <Trash size={15} weight="regular" />
                </button>
              </div>
              <textarea
                aria-label={`Answer ${idx + 1}`}
                rows={2}
                maxLength={600}
                value={f.a}
                placeholder="Answer"
                onChange={(e) =>
                  set({ faqs: draft.faqs.map((x, i) => (i === idx ? { ...x, a: e.target.value } : x)) })
                }
                className={`${ADMIN_TEXTAREA} resize-y`}
              />
            </div>
          ))}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="reel-contact" className={ADMIN_LABEL}>
            Contact line
          </label>
          <input
            id="reel-contact"
            type="text"
            maxLength={200}
            value={draft.contact_text}
            onChange={(e) => set({ contact_text: e.target.value })}
            placeholder="Questions? Message the media team on the college server."
            className={ADMIN_INPUT}
          />
        </div>

        {/* Form settings */}
        <SectionHeading title="Entry form" note="Controls what entrants see and what the server accepts." />

        <MarkdownField
          id="reel-instructions"
          label="Form instructions"
          value={draft.instructions_md}
          onChange={(v) => set({ instructions_md: v })}
          hint="Shown above the form. A short default is used when empty."
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="reel-categories" className={ADMIN_LABEL}>
              Categories
            </label>
            <textarea
              id="reel-categories"
              rows={4}
              value={categoriesText}
              onChange={(e) => setCategoriesText(e.target.value)}
              className={`${ADMIN_TEXTAREA} resize-y font-mono`}
            />
            <p className="text-xs text-muted">One per line. Entrants pick one.</p>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="reel-hosts" className={ADMIN_LABEL}>
              Accepted link sites
            </label>
            <textarea
              id="reel-hosts"
              rows={4}
              value={hostsText}
              onChange={(e) => setHostsText(e.target.value)}
              className={`${ADMIN_TEXTAREA} resize-y font-mono`}
            />
            <p className="text-xs text-muted">One domain per line, for example instagram.com.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="reel-max-roll" className={ADMIN_LABEL}>
              Reels allowed per roll number
            </label>
            <input
              id="reel-max-roll"
              type="number"
              min={1}
              max={20}
              step={1}
              value={draft.max_per_roll}
              onChange={(e) =>
                set({ max_per_roll: Math.min(20, Math.max(1, Math.round(Number(e.target.value)) || 1)) })
              }
              className={`${ADMIN_INPUT} font-mono tabular-nums`}
            />
            <p className="text-xs text-muted">Rejected entries do not count toward the limit.</p>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="reel-max-team" className={ADMIN_LABEL}>
              Largest team size
            </label>
            <input
              id="reel-max-team"
              type="number"
              min={2}
              max={12}
              step={1}
              value={draft.max_team_size}
              onChange={(e) =>
                set({ max_team_size: Math.min(12, Math.max(2, Math.round(Number(e.target.value)) || 2)) })
              }
              className={`${ADMIN_INPUT} font-mono tabular-nums`}
            />
            <p className="text-xs text-muted">Includes the person filling in the form.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="reel-consent" className={ADMIN_LABEL}>
              First confirmation text
            </label>
            <input
              id="reel-consent"
              type="text"
              maxLength={200}
              value={draft.consent_text}
              onChange={(e) => set({ consent_text: e.target.value })}
              placeholder={DEFAULT_REEL_CONSENT}
              className={ADMIN_INPUT}
            />
            <p className="text-xs text-muted">
              The rules and sharing confirmations are fixed. All three must be ticked.
            </p>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="reel-confirmation" className={ADMIN_LABEL}>
              Confirmation message
            </label>
            <input
              id="reel-confirmation"
              type="text"
              maxLength={240}
              value={draft.confirmation_message}
              onChange={(e) => set({ confirmation_message: e.target.value })}
              placeholder={DEFAULT_REEL_CONFIRMATION}
              className={ADMIN_INPUT}
            />
            <p className="text-xs text-muted">Shown after a successful submission.</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="reel-closed" className={ADMIN_LABEL}>
            Closed message
          </label>
          <input
            id="reel-closed"
            type="text"
            maxLength={240}
            value={draft.closed_message}
            onChange={(e) => set({ closed_message: e.target.value })}
            placeholder={DEFAULT_REEL_CLOSED_MESSAGE}
            className={ADMIN_INPUT}
          />
        </div>

        <div className={`${ADMIN_WELL} p-4 flex items-center justify-between gap-4`}>
          <div className="space-y-0.5 min-w-0">
            <span className="block text-sm font-medium text-text">Show featured entries</span>
            <span className="block text-xs text-muted">
              Lists approved reels on /reels with a link to watch. Shows the name or team name.
            </span>
          </div>
          <Toggle
            checked={draft.show_gallery}
            onChange={(v) => set({ show_gallery: v })}
            label="Show featured entries"
          />
        </div>

        <div className="pt-5 border-t border-border flex flex-wrap items-center justify-end gap-3">
          <Button
            type="submit"
            variant="primary"
            size="md"
            leftIcon={FloppyDisk}
            disabled={!isDirty || isSaving || Boolean(windowError)}
            isLoading={isSaving}
            className="rounded-full px-5"
          >
            Save reel settings
          </Button>
        </div>
      </form>
    </section>
  )
}
