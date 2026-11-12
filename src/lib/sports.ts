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

