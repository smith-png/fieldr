import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowCounterClockwise, ArrowSquareOut, Check, WarningCircle } from '@phosphor-icons/react'
import { getSiteSettings, updateSiteSetting } from '../../lib/data/site'
import { useToast } from '../../lib/ToastContext'
import { getErrorMessage } from '../../lib/errors'
import { Button } from '../ui'
import { ADMIN_CARD, ADMIN_CARD_HEADER, ADMIN_CARD_TITLE } from './adminStyles'
import {
  DEFAULT_HOLO_GLITTER,
  HOLO_GLITTER_RANGES,
  HOLO_GLITTER_SETTING_KEY,
  type HoloGlitterSettings,
  clampHoloGlitter
} from '../../features/holo/glitterSettings'

const SAVE_DEBOUNCE_MS = 500
const THUMB_SIZE_PX = 28

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

function settingsEqual(a: HoloGlitterSettings, b: HoloGlitterSettings): boolean {
  return (
    a.density === b.density &&
    a.size === b.size &&
    a.brightness === b.brightness &&
    a.minMul === b.minMul &&
    a.maxMul === b.maxMul &&
    a.cluster === b.cluster
  )
}

function roundUpToStep(value: number, step: number): number {
  return Math.round(Math.ceil(value / step - 1e-9) * step * 100) / 100
}

function roundDownToStep(value: number, step: number): number {
  return Math.round(Math.floor(value / step + 1e-9) * step * 100) / 100
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value
}

interface SliderControlRowProps {
  id: string
  label: string
  helper: string
  value: number
  defaultValue: number
  min: number
  max: number
  step: number
  displayValue: string
  onChange: (value: number) => void
  onRelease: () => void
  onKeyUp: (event: React.KeyboardEvent<HTMLInputElement>) => void
  onResetSingle: () => void
}

const SliderControlRow: React.FC<SliderControlRowProps> = ({
  id,
  label,
  helper,
  value,
  defaultValue,
  min,
  max,
  step,
  displayValue,
  onChange,
  onRelease,
  onKeyUp,
  onResetSingle
}) => {
  const span = Math.max(1e-6, max - min)
  const frac = clamp01((value - min) / span)
  const defaultFrac = clamp01((defaultValue - min) / span)
  const isModified = Math.abs(value - defaultValue) > 1e-4
  const halfThumb = THUMB_SIZE_PX / 2

  return (
    <div className="py-3.5 first:pt-0 last:pb-0 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <label htmlFor={id} className="block text-sm font-medium text-text leading-snug">
            {label}
          </label>
          <p className="text-xs text-muted leading-snug mt-0.5">{helper}</p>
        </div>

        <button
          type="button"
          onClick={onResetSingle}
          title="Reset to default"
          aria-label="Reset to default"
          className={`shrink-0 inline-flex items-center justify-center min-w-[56px] h-8 px-3 rounded-full border text-xs font-mono tabular-nums font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright ${
            isModified
              ? 'border-accent-bright/50 bg-accent-bright/10 text-accent-bright hover:bg-accent-bright/15'
              : 'border-border bg-surface-2 text-text hover:border-text/30'
          }`}
        >
          {displayValue}
        </button>
      </div>

      <div className="relative h-11 flex items-center select-none touch-pan-y">
        {/* 6px track */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 h-[6px] rounded-full bg-surface-2 border border-border/70 overflow-hidden"
        >
          <div
            className="h-full bg-accent-bright rounded-full"
            style={{
              width: `calc(${halfThumb}px + (100% - ${THUMB_SIZE_PX}px) * ${frac})`
            }}
          />
        </div>

        {/* Default-value tick mark */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-[2px] h-3 rounded-full bg-text/35"
          style={{
            left: `calc(${halfThumb}px + (100% - ${THUMB_SIZE_PX}px) * ${defaultFrac})`
          }}
        />

        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          onPointerUp={onRelease}
          onTouchEnd={onRelease}
          onKeyUp={onKeyUp}
          onBlur={onRelease}
          className="relative z-10 w-full h-11 m-0 appearance-none bg-transparent cursor-pointer focus-visible:outline-none [&::-webkit-slider-runnable-track]:bg-transparent [&::-moz-range-track]:bg-transparent [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-7 [&::-webkit-slider-thumb]:h-7 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-surface [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-accent-bright [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:active:scale-105 [&::-moz-range-thumb]:w-7 [&::-moz-range-thumb]:h-7 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-surface [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-accent-bright [&::-moz-range-thumb]:shadow-sm [&::-moz-range-thumb]:box-border focus-visible:[&::-webkit-slider-thumb]:ring-2 focus-visible:[&::-webkit-slider-thumb]:ring-accent-bright/40 focus-visible:[&::-moz-range-thumb]:ring-2 focus-visible:[&::-moz-range-thumb]:ring-accent-bright/40"
        />
      </div>
    </div>
  )
}

interface ReleaseShineCurveProps {
  minMul: number
  maxMul: number
}

const ReleaseShineCurve: React.FC<ReleaseShineCurveProps> = ({ minMul, maxMul }) => {
  const { linePath, areaPath, startY, endY, ref1Y } = useMemo(() => {
    const x0 = 14
    const x1 = 226
    const yTop = 8
    const yBottom = 46
    const minVal = HOLO_GLITTER_RANGES.minMul.min
    const maxVal = HOLO_GLITTER_RANGES.maxMul.max
    const span = maxVal - minVal

    const mapY = (val: number) => {
      const t = clamp01((val - minVal) / span)
      return yBottom - t * (yBottom - yTop)
    }

    const steps = 20
    const pts: string[] = []
    for (let i = 0; i <= steps; i++) {
      const u = i / steps
      const smooth = u * u * (3 - 2 * u)
      const val = minMul + (maxMul - minMul) * smooth
      const x = x0 + (x1 - x0) * u
      const y = mapY(val)
      pts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`)
    }

    const line = pts.join(' ')
    const area = `${line} L ${x1.toFixed(1)} ${yBottom.toFixed(1)} L ${x0.toFixed(1)} ${yBottom.toFixed(1)} Z`

    return {
      linePath: line,
      areaPath: area,
      startY: mapY(minMul),
      endY: mapY(maxMul),
      ref1Y: mapY(1.0)
    }
  }, [minMul, maxMul])

  return (
    <div className="pt-3 border-t border-border/70">
      <div className="flex items-center justify-between text-[11px] text-muted mb-1">
        <span>Light charge</span>
        <span>Full hold</span>
      </div>
      <svg
        viewBox="0 0 240 56"
        className="w-full h-14 overflow-visible"
        aria-hidden="true"
        preserveAspectRatio="none"
      >
        {/* 1.0x reference hairline */}
        <line
          x1="14"
          y1={ref1Y}
          x2="226"
          y2={ref1Y}
          stroke="var(--border)"
          strokeWidth="1"
          strokeDasharray="3 3"
        />
        {/* Baseline */}
        <line x1="14" y1="46" x2="226" y2="46" stroke="var(--border)" strokeWidth="1" />
        {/* Soft accent fill under curve */}
        <path d={areaPath} fill="var(--accent-bright)" fillOpacity="0.12" />
        {/* Shine strength curve */}
        <path
          d={linePath}
          fill="none"
          stroke="var(--accent-bright)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Start & end markers */}
        <circle
          cx="14"
          cy={startY}
          r="3.5"
          fill="var(--surface)"
          stroke="var(--accent-bright)"
          strokeWidth="2"
        />
        <circle
          cx="226"
          cy={endY}
          r="3.5"
          fill="var(--accent-bright)"
          stroke="var(--surface)"
          strokeWidth="1.5"
        />
      </svg>
    </div>
  )
}

export const AdminHoloGlitterCard: React.FC = () => {
  const { showToast } = useToast()
  const [settings, setSettings] = useState<HoloGlitterSettings>(() => ({
    ...DEFAULT_HOLO_GLITTER
  }))
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')

  const mountedRef = useRef(true)
  const settingsRef = useRef<HoloGlitterSettings>(settings)
  const lastSavedRef = useRef<HoloGlitterSettings>({ ...DEFAULT_HOLO_GLITTER })
  const saveTimerRef = useRef<number | null>(null)
  const saveSeqRef = useRef(0)

  settingsRef.current = settings

  useEffect(() => {
    mountedRef.current = true
    void (async () => {
      try {
        const site = await getSiteSettings()
        if (!mountedRef.current) return
        const loaded = clampHoloGlitter(site?.[HOLO_GLITTER_SETTING_KEY])
        setSettings(loaded)
        settingsRef.current = loaded
        lastSavedRef.current = loaded
      } catch {
        // Keep defaults silently if settings could not be fetched on mount.
      }
    })()

    return () => {
      mountedRef.current = false
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
    }
  }, [])

  const persistSettings = useCallback(
    async (next: HoloGlitterSettings) => {
      const normalized = clampHoloGlitter(next)
      if (settingsEqual(normalized, lastSavedRef.current)) return

      const seq = ++saveSeqRef.current
      setSaveStatus('saving')
      try {
        await updateSiteSetting(HOLO_GLITTER_SETTING_KEY, normalized)
        if (!mountedRef.current || seq !== saveSeqRef.current) return
        lastSavedRef.current = normalized
        setSaveStatus('saved')
      } catch (err: unknown) {
        if (!mountedRef.current) return
        if (seq === saveSeqRef.current) {
          setSaveStatus('error')
        }
        showToast(getErrorMessage(err, "Couldn't save holo star settings."), 'error')
      }
    },
    [showToast]
  )

  const scheduleSave = useCallback(
    (next?: HoloGlitterSettings) => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
      }
      const target = next ?? settingsRef.current
      if (settingsEqual(target, lastSavedRef.current)) return
      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null
        void persistSettings(settingsRef.current)
      }, SAVE_DEBOUNCE_MS)
    },
    [persistSettings]
  )

  const applyUpdate = (patch: Partial<HoloGlitterSettings>): HoloGlitterSettings => {
    const next = clampHoloGlitter({
      ...settingsRef.current,
      ...patch
    })
    setSettings(next)
    settingsRef.current = next
    setSaveStatus('idle')
    return next
  }

  const commitSingleReset = (patch: Partial<HoloGlitterSettings>) => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    const next = applyUpdate(patch)
    void persistSettings(next)
  }

  const handleMinMulChange = (raw: number) => {
    const nextMin = Math.round(raw * 100) / 100
    const nextMax =
      settings.maxMul < nextMin
        ? Math.min(
            HOLO_GLITTER_RANGES.maxMul.max,
            Math.max(
              HOLO_GLITTER_RANGES.maxMul.min,
              roundUpToStep(nextMin, HOLO_GLITTER_RANGES.maxMul.step)
            )
          )
        : settings.maxMul
    applyUpdate({ minMul: nextMin, maxMul: nextMax })
  }

  const handleMaxMulChange = (raw: number) => {
    const nextMax = Math.round(raw * 100) / 100
    const nextMin =
      settings.minMul > nextMax
        ? Math.max(
            HOLO_GLITTER_RANGES.minMul.min,
            Math.min(
              HOLO_GLITTER_RANGES.minMul.max,
              roundDownToStep(nextMax, HOLO_GLITTER_RANGES.minMul.step)
            )
          )
        : settings.minMul
    applyUpdate({ minMul: nextMin, maxMul: nextMax })
  }

  const handleSliderRelease = () => {
    scheduleSave()
  }

  const handleSliderKeyUp = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (
      event.key === 'ArrowLeft' ||
      event.key === 'ArrowRight' ||
      event.key === 'ArrowUp' ||
      event.key === 'ArrowDown' ||
      event.key === 'Home' ||
      event.key === 'End' ||
      event.key === 'PageUp' ||
      event.key === 'PageDown'
    ) {
      scheduleSave()
    }
  }

  const handleResetAll = () => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    const defaults = { ...DEFAULT_HOLO_GLITTER }
    setSettings(defaults)
    settingsRef.current = defaults
    setSaveStatus('idle')
    void persistSettings(defaults)
  }

  const isSaving = saveStatus === 'saving'
  const isAtDefaults = settingsEqual(settings, DEFAULT_HOLO_GLITTER)
  const clusterPercent = Math.round(settings.cluster * 100)
  const defaultClusterPercent = Math.round(DEFAULT_HOLO_GLITTER.cluster * 100)

  return (
    <section className={ADMIN_CARD}>
      <div className={ADMIN_CARD_HEADER}>
        <div className="space-y-1 min-w-0">
          <h2 className={ADMIN_CARD_TITLE}>Holo stars</h2>
          <p className="text-xs text-muted">
            Configure the /holo starfield sky, ambient glow, and radial release shine.
          </p>
        </div>

        <div className="shrink-0 self-start sm:self-center min-h-[20px] flex items-center">
          {saveStatus === 'saving' && <span className="text-xs text-muted">Saving...</span>}
          {saveStatus === 'saved' && (
            <span className="text-xs text-accent-bright inline-flex items-center gap-1">
              <Check size={14} weight="regular" />
              <span>Saved</span>
            </span>
          )}
          {saveStatus === 'error' && (
            <span className="text-xs text-error inline-flex items-center gap-1">
              <WarningCircle size={14} weight="regular" />
              <span>Couldn&apos;t save</span>
            </span>
          )}
        </div>
      </div>

      {/* Two-column layout at >= 1024px (lg), single column below */}
      <div className="grid grid-cols-1 lg:grid-cols-2 lg:gap-x-10 divide-y lg:divide-y-0 divide-border">
        {/* Left column: SKY */}
        <div className="pb-6 lg:pb-0 space-y-3">
          <h3 className="font-dot text-[11px] uppercase tracking-[0.16em] text-muted">Sky</h3>
          <div className="divide-y divide-border/70">
            <SliderControlRow
              id="holo-stars-density"
              label="Star density"
              helper="How many stars fill the sky"
              value={settings.density}
              defaultValue={DEFAULT_HOLO_GLITTER.density}
              min={HOLO_GLITTER_RANGES.density.min}
              max={HOLO_GLITTER_RANGES.density.max}
              step={HOLO_GLITTER_RANGES.density.step}
              displayValue={`${settings.density.toFixed(1)}x`}
              onChange={(val) => applyUpdate({ density: Math.round(val * 10) / 10 })}
              onRelease={handleSliderRelease}
              onKeyUp={handleSliderKeyUp}
              onResetSingle={() => commitSingleReset({ density: DEFAULT_HOLO_GLITTER.density })}
            />

            <SliderControlRow
              id="holo-stars-size"
              label="Star size"
              helper="How big each star is"
              value={settings.size}
              defaultValue={DEFAULT_HOLO_GLITTER.size}
              min={HOLO_GLITTER_RANGES.size.min}
              max={HOLO_GLITTER_RANGES.size.max}
              step={HOLO_GLITTER_RANGES.size.step}
              displayValue={`${settings.size.toFixed(1)}x`}
              onChange={(val) => applyUpdate({ size: Math.round(val * 10) / 10 })}
              onRelease={handleSliderRelease}
              onKeyUp={handleSliderKeyUp}
              onResetSingle={() => commitSingleReset({ size: DEFAULT_HOLO_GLITTER.size })}
            />

            <SliderControlRow
              id="holo-stars-cluster"
              label="Star clustering"
              helper="How tightly stars gather into groups"
              value={clusterPercent}
              defaultValue={defaultClusterPercent}
              min={0}
              max={100}
              step={5}
              displayValue={`${clusterPercent}%`}
              onChange={(val) => applyUpdate({ cluster: Math.round(val) / 100 })}
              onRelease={handleSliderRelease}
              onKeyUp={handleSliderKeyUp}
              onResetSingle={() => commitSingleReset({ cluster: DEFAULT_HOLO_GLITTER.cluster })}
            />
          </div>
        </div>

        {/* Right column: BRIGHTNESS + RELEASE SHINE */}
        <div className="pt-6 lg:pt-0 lg:border-l lg:border-border lg:pl-10 space-y-6 divide-y divide-border">
          <div className="space-y-3">
            <h3 className="font-dot text-[11px] uppercase tracking-[0.16em] text-muted">
              Brightness
            </h3>
            <SliderControlRow
              id="holo-stars-brightness"
              label="Star brightness"
              helper="Overall twinkle and flare strength"
              value={settings.brightness}
              defaultValue={DEFAULT_HOLO_GLITTER.brightness}
              min={HOLO_GLITTER_RANGES.brightness.min}
              max={HOLO_GLITTER_RANGES.brightness.max}
              step={HOLO_GLITTER_RANGES.brightness.step}
              displayValue={`${settings.brightness.toFixed(1)}x`}
              onChange={(val) => applyUpdate({ brightness: Math.round(val * 10) / 10 })}
              onRelease={handleSliderRelease}
              onKeyUp={handleSliderKeyUp}
              onResetSingle={() =>
                commitSingleReset({ brightness: DEFAULT_HOLO_GLITTER.brightness })
              }
            />
          </div>

          <div className="pt-6 space-y-3">
            <h3 className="font-dot text-[11px] uppercase tracking-[0.16em] text-muted">
              Release shine
            </h3>
            <div className="divide-y divide-border/70">
              <SliderControlRow
                id="holo-stars-min-mul"
                label="Shine at light charge"
                helper="Flare strength after a quick tap"
                value={settings.minMul}
                defaultValue={DEFAULT_HOLO_GLITTER.minMul}
                min={HOLO_GLITTER_RANGES.minMul.min}
                max={HOLO_GLITTER_RANGES.minMul.max}
                step={HOLO_GLITTER_RANGES.minMul.step}
                displayValue={`${settings.minMul.toFixed(2)}x`}
                onChange={handleMinMulChange}
                onRelease={handleSliderRelease}
                onKeyUp={handleSliderKeyUp}
                onResetSingle={() => {
                  const defMin = DEFAULT_HOLO_GLITTER.minMul
                  const nextMax = Math.max(settingsRef.current.maxMul, defMin)
                  commitSingleReset({ minMul: defMin, maxMul: nextMax })
                }}
              />

              <SliderControlRow
                id="holo-stars-max-mul"
                label="Shine at full charge"
                helper="Flare strength after a full hold"
                value={settings.maxMul}
                defaultValue={DEFAULT_HOLO_GLITTER.maxMul}
                min={HOLO_GLITTER_RANGES.maxMul.min}
                max={HOLO_GLITTER_RANGES.maxMul.max}
                step={HOLO_GLITTER_RANGES.maxMul.step}
                displayValue={`${settings.maxMul.toFixed(1)}x`}
                onChange={handleMaxMulChange}
                onRelease={handleSliderRelease}
                onKeyUp={handleSliderKeyUp}
                onResetSingle={() => {
                  const defMax = DEFAULT_HOLO_GLITTER.maxMul
                  const nextMin = Math.min(settingsRef.current.minMul, defMax)
                  commitSingleReset({ minMul: nextMin, maxMul: defMax })
                }}
              />
            </div>

            <ReleaseShineCurve minMul={settings.minMul} maxMul={settings.maxMul} />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="pt-5 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button
            type="button"
            variant="ghost"
            size="md"
            leftIcon={ArrowCounterClockwise}
            disabled={isSaving || isAtDefaults}
            onClick={handleResetAll}
            className="rounded-full"
          >
            Reset all
          </Button>
          <p className="text-xs text-muted">Reload /holo after changing settings</p>
        </div>

        <a
          href="/holo"
          target="_blank"
          rel="noopener"
          className="inline-flex items-center justify-center gap-2 min-h-[40px] px-4 rounded-full border border-border bg-bg text-sm font-medium text-text hover:bg-surface-2 hover:border-text/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright self-start sm:self-auto shrink-0"
        >
          <span>Open /holo</span>
          <ArrowSquareOut size={16} weight="regular" aria-hidden="true" />
        </a>
      </div>
    </section>
  )
}
