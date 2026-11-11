export interface SportDefinition {
  slug: string
  label: string
  order: number
}

export const SPORTS: readonly SportDefinition[] = [
  {
    slug: 'cricket',
    label: 'Cricket',
    order: 1
  },
  {
    slug: 'futsal',
    label: 'Futsal',
    order: 2
  },
  {
    slug: 'volleyball',
    label: 'Volleyball',
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

export function isValidSport(nameOrSlug: string): boolean {
  return !!getSportByNameOrSlug(nameOrSlug)
}
