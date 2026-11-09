export type UserRole = 'admin' | 'projector'

export interface AuthUser {
  id: string
  email: string
  role: UserRole
}

export interface Season {
  id: string
  name: string
  is_active: boolean
  created_at: string
}

export interface Sport {
  id: string
  name: string
  roles: string[]
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

export type PlayerStatus = 'available' | 'sold'

export interface Player {
  id: string
  season_id: string
  name: string
  sport: string
  playing_role: string
  year_batch: string
  roll_no?: string
  photo_url?: string
  base_points: number
  status: PlayerStatus
  team_id?: string | null
  purchase_price?: number | null
  notes?: string
  created_at?: string
}

export type PurseTransactionType = 'initial' | 'add' | 'deduct' | 'set'

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

export type ProjectorMode = 'idle' | 'teams' | 'player' | 'roster'

export interface ProjectorState {
  season_id: string
  mode: ProjectorMode
  player_id?: string | null
  team_id?: string | null
  updated_at: string
}
