export interface SportDefinition {
  slug: string
  label: string
  roles: readonly string[]
  order: number
}

export const SPORTS: readonly SportDefinition[] = [
  {
    slug: 'cricket',
    label: 'Cricket',
    roles: ['Batter', 'Bowler', 'All-rounder', 'Wicketkeeper'],
    order: 1
  },
  {
    slug: 'futsal',
    label: 'Futsal',
    roles: ['Goalkeeper', 'Defender', 'Winger', 'Pivot'],
    order: 2
  },
  {
    slug: 'volleyball',
    label: 'Volleyball',
    roles: ['Setter', 'Outside hitter', 'Middle blocker', 'Opposite', 'Libero'],
    order: 3
  }
] as const

export type SportSlug = 'cricket' | 'futsal' | 'volleyball'

export function getSportBySlug(slug: string): SportDefinition | undefined {
  if (!slug) return undefined
  const normalized = slug.toLowerCase().trim()
  return SPORTS.find((s) => s.slug === normalized)
}

export function getSportByNameOrSlug(nameOrSlug: string): SportDefinition | undefined {
  if (!nameOrSlug) return undefined
  const normalized = nameOrSlug.toLowerCase().trim()
  return SPORTS.find((s) => s.slug === normalized || s.label.toLowerCase() === normalized)
}

export function getRolesForSportSlug(slugOrName: string): readonly string[] {
  const sport = getSportByNameOrSlug(slugOrName)
  return sport ? sport.roles : []
}

export function isValidSport(nameOrSlug: string): boolean {
  return !!getSportByNameOrSlug(nameOrSlug)
}
