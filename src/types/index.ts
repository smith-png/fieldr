import type {
  AdminTab,
  PlayerStatus,
  ProjectorAutoFilter,
  ProjectorMode,
  PurseTransactionType,
  UserRole
} from '../lib/constants'

export type {
  AdminTab,
  PlayerStatus,
  ProjectorAutoFilter,
  ProjectorMode,
  PurseTransactionType,
  UserRole
}

export interface AuthUser {
  id: string
  email: string
  role: UserRole
}

export interface Season {
  id: string
  name: string
  is_active: boolean
  is_archived?: boolean
  start_date?: string
  end_date?: string
  description?: string
  created_at: string
}

export interface Athlete {
  id: string
  athlete_code: number
  name: string
  academic_year?: AcademicYear
  photo_url?: string
  photo_thumb_url?: string
  roll_no?: string
  notes?: string
  created_at?: string
  entries_count?: number
}

export interface Sport {
  id: string
  name: string
  roles: string[]
  image_path?: string
}

export interface Team {
  id: string
  season_id: string
  sport: string
  name: string
  short_code: string
  color: string
  logo_url?: string
  owner_display_name?: string
  owner_user_id?: string
  starting_purse: number
  current_purse: number
  created_at?: string
}

export interface PublicTeam {
  id: string
  season_id: string
  sport: string
  name: string
  short_code: string
  color: string
  logo_url?: string
  owner_display_name?: string
  created_at?: string
}

export type AcademicYear = '1st' | '2nd' | '3rd' | 'Final'

export interface Player {
  id: string
  season_id: string
  athlete_id?: string
  athlete_code?: number
  player_code: string
  name: string
  sport: string
  playing_role: string
  academic_year: AcademicYear
  year_batch?: string
  roll_no?: string
  photo_url?: string
  photo_thumb_url?: string
  base_points: number
  status: PlayerStatus
  team_id?: string | null
  purchase_price?: number | null
  notes?: string
  created_at?: string
}

export interface PublicPlayer {
  id: string
  player_code: string
  athlete_code?: number
  athlete_id?: string
  name: string
  photo_thumb_url?: string
  photo_url?: string
  academic_year: AcademicYear
  sport: string
  playing_role: string
  season_id: string
  status?: PlayerStatus
  team_id?: string | null
  base_points?: number
  purchase_price?: number | null
}

export interface AthleteCareerEntry {
  player_id: string
  season_id: string
  season_name: string
  is_season_active: boolean
  sport: string
  playing_role: string
  academic_year: AcademicYear
  status: PlayerStatus
  team_id?: string | null
  team_name?: string | null
  team_short_code?: string | null
  team_color?: string | null
  base_points: number
  purchase_price?: number | null
}

export interface SeasonDeletionCounts {
  teams: number
  players: number
  purse_transactions: number
  carousel_items: number
}

export interface PurseTransaction {
  id: string
  season_id: string
  team_id: string
  type: PurseTransactionType
  amount: number
  balance_after: number
  reason?: string
  created_at: string
  created_by?: string
}

export interface ActivityLogEntry {
  occurred_at: string
  action: string
  player_name?: string | null
  team_name?: string | null
  amount?: number | null
  balance_after?: number | null
  note?: string | null
  actor?: string | null
}

export interface ProjectorState {
  season_id: string
  mode: ProjectorMode
  player_id?: string | null
  team_id?: string | null
  current_bid?: number | null
  sale_event_id?: string | null
  sale_player_id?: string | null
  sale_team_id?: string | null
  sale_price?: number | null
  sale_at?: string | null
  auto_sport?: string | null
  auto_filter?: ProjectorAutoFilter | null
  auto_interval_seconds?: number | null
  auto_started_at?: string | null
  updated_at: string
}

export interface AuctionBid {
  id: string
  season_id?: string
  player_id: string
  team_id: string
  amount: number
  voided: boolean
  created_at: string
}

export interface AuctionSale {
  id: string
  season_id?: string
  player_id: string
  team_id: string
  price: number
  reversed_at?: string | null
  created_at: string
}

export interface AuctionSettings {
  season_id: string
  bid_increments: number[]
  max_squad_size: number | null
  secured_enabled: boolean
  secured_duration_seconds: number
  price_countup_seconds: number
  bid_update_ms: number
  catchup_window_seconds: number
}

export interface CarouselItem {
  id: string
  text: string
  sort_order: number
  active: boolean
  season_id?: string | null
  created_at?: string
}

export interface PageContentSetting {
  title: string
  body: string
}

export interface SiteSettings {
  help_page?: PageContentSetting
  about_page?: PageContentSetting
  auction_timing?: {
    window_duration_seconds?: number
  }
  [key: string]: unknown
}

export type CreditKind = 'core' | 'contributor'

export interface CreditPerson {
  id: string
  kind: CreditKind
  name: string
  role?: string | null
  description?: string | null
  photo_url?: string | null
  sort_order: number
  created_at: string
}
