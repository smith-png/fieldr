import type {
  Athlete,
  AthleteCareerEntry,
  CreditPerson,
  PageContentSetting,
  PublicPlayer,
  PublicTeam,
  Season,
  Sport
} from '../types'
import type { SportSlug } from './sports'

export function hasDataChanged<T>(prev: T, next: T): boolean {
  try {
    return JSON.stringify(prev) !== JSON.stringify(next)
  } catch {
    return prev !== next
  }
}

export interface RosterPagedCacheEntry {
  players: PublicPlayer[]
  totalCount: number
  hasMore: boolean
}

export interface RosterSportInfoCacheEntry {
  valid: boolean
  name: string
  roles: string[]
}

export interface SeasonCardCacheItem {
  season: Season
  teamCount: number
  playerCount: number
}

export interface SeasonDetailCacheEntry {
  season: Season | null
  sports: Sport[]
  teams: PublicTeam[]
  players: PublicPlayer[]
}

export interface SeasonTeamDetailCacheEntry {
  season: Season | null
  team: PublicTeam | null
  teamPlayers: PublicPlayer[]
  allPlayers: PublicPlayer[]
  sportRoles: string[]
}

export interface PlayerProfileCacheEntry {
  athlete: Athlete | null
  career: AthleteCareerEntry[]
}

export const publicCache = {
  activeSeason: {
    loaded: false,
    value: null as Season | null
  },
  sports: {
    loaded: false,
    value: [] as Sport[]
  },
  carouselItems: {
    loaded: false,
    value: [] as string[]
  },
  teamsBySeason: new Map<string, PublicTeam[]>(),
  playersBySeason: new Map<string, PublicPlayer[]>(),
  playerCountsBySeason: new Map<string, Record<SportSlug, number>>(),
  rosterSportInfo: new Map<string, RosterSportInfoCacheEntry>(),
  rosterPagedQueries: new Map<string, RosterPagedCacheEntry>(),
  siteSettings: {
    loaded: false,
    value: {} as Record<string, unknown>
  },
  pageContent: new Map<string, PageContentSetting | null>(),
  creditsPeople: {
    loaded: false,
    value: [] as CreditPerson[]
  },
  seasonCards: {
    loaded: false,
    value: [] as SeasonCardCacheItem[]
  },
  seasonDetails: new Map<string, SeasonDetailCacheEntry>(),
  seasonTeamDetails: new Map<string, SeasonTeamDetailCacheEntry>(),
  playerProfiles: new Map<string, PlayerProfileCacheEntry>()
}
