export function formatReelDateTime(iso?: string | null): string | null {
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

/** "3 days 4 hours", "2 hours 10 min", "12 min". Returns null when the time has passed. */
export function formatReelCountdown(targetIso: string | null | undefined, now: number): string | null {
  if (!targetIso) return null
  const target = Date.parse(targetIso)
  if (Number.isNaN(target) || target <= now) return null
  const totalMin = Math.max(1, Math.floor((target - now) / 60000))
  const days = Math.floor(totalMin / 1440)
  const hours = Math.floor((totalMin % 1440) / 60)
  const mins = totalMin % 60
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`
  if (days > 0) return hours > 0 ? `${plural(days, 'day')} ${plural(hours, 'hour')}` : plural(days, 'day')
  if (hours > 0) return mins > 0 ? `${plural(hours, 'hour')} ${mins} min` : plural(hours, 'hour')
  return `${mins} min`
}
