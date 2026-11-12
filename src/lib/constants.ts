export const PLAYER_STATUS = {
  AVAILABLE: 'available',
  SOLD: 'sold',
  UNSOLD: 'unsold'
} as const

export type PlayerStatus = (typeof PLAYER_STATUS)[keyof typeof PLAYER_STATUS]

export const PLAYER_STATUS_VALUES: readonly PlayerStatus[] = [
  PLAYER_STATUS.AVAILABLE,
  PLAYER_STATUS.SOLD,
  PLAYER_STATUS.UNSOLD
]

export const PROJECTOR_MODES = {
  IDLE: 'idle',
  TEAMS: 'teams',
  PLAYER: 'player',
  ROSTER: 'roster',
  PLAYER_AUTO: 'player_auto',
  ROSTER_AUTO: 'roster_auto',
  AUCTION: 'auction',
  SOLD: 'sold',
  UNSOLD: 'unsold'
} as const

export type ProjectorMode = (typeof PROJECTOR_MODES)[keyof typeof PROJECTOR_MODES]

export const PROJECTOR_MODE_VALUES: readonly ProjectorMode[] = [
  PROJECTOR_MODES.IDLE,
  PROJECTOR_MODES.TEAMS,
  PROJECTOR_MODES.PLAYER,
  PROJECTOR_MODES.ROSTER,
  PROJECTOR_MODES.PLAYER_AUTO,
  PROJECTOR_MODES.ROSTER_AUTO,
  PROJECTOR_MODES.AUCTION,
  PROJECTOR_MODES.SOLD,
  PROJECTOR_MODES.UNSOLD
]

export const PROJECTOR_AUTO_FILTERS = {
  ALL: 'all',
  AVAILABLE: 'available',
  SOLD: 'sold',
  UNSOLD: 'unsold'
} as const

export type ProjectorAutoFilter =
  (typeof PROJECTOR_AUTO_FILTERS)[keyof typeof PROJECTOR_AUTO_FILTERS]

export const PROJECTOR_AUTO_FILTER_VALUES: readonly ProjectorAutoFilter[] = [
  PROJECTOR_AUTO_FILTERS.ALL,
  PROJECTOR_AUTO_FILTERS.AVAILABLE,
  PROJECTOR_AUTO_FILTERS.SOLD,
  PROJECTOR_AUTO_FILTERS.UNSOLD
]

export const PROJECTOR_AUTO_INTERVAL = {
  MIN: 3,
  MAX: 120,
  DEFAULT: 8,
  CHIPS: [5, 8, 10, 15] as const
} as const

export const PURSE_TX_TYPES = {
  INITIAL: 'initial',
  ADD: 'add',
  DEDUCT: 'deduct',
  SET: 'set',
  PURCHASE: 'purchase',
  REFUND: 'refund'
} as const

export type PurseTransactionType = (typeof PURSE_TX_TYPES)[keyof typeof PURSE_TX_TYPES]

export const PUBLIC_PLAYER_SELECT_COLUMNS =
  'id, player_code, athlete_code, name, photo_thumb_url, photo_url, academic_year, sport, playing_role, season_id, athlete_id' as const

export const PUBLIC_SQUAD_SELECT_COLUMNS =
  'player_id, season_id, sport, player_code, name, photo_thumb_url, photo_url, academic_year, playing_role, purchase_price, team_id, team_name, team_short_code, team_color, team_logo_url' as const

export const USER_ROLES = {
  ADMIN: 'admin',
  PROJECTOR: 'projector',
  OWNER: 'owner'
} as const

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES]

export const ADMIN_TABS = {
  DASHBOARD: 'dashboard',
  ATHLETES: 'athletes',
  PLAYERS: 'players',
  TEAMS: 'teams',
  AUCTION: 'auction',
  PURSES: 'purses',
  LOGS: 'logs',
  SEASONS: 'seasons',
  PROJECTOR: 'projector',
  SETUP: 'setup'
} as const

export type AdminTab = (typeof ADMIN_TABS)[keyof typeof ADMIN_TABS]

export const STORAGE_KEYS = {
  USER: 'fieldr_auth_user',
  SEASONS: 'fieldr_seasons',
  SPORTS: 'fieldr_sports',
  TEAMS: 'fieldr_teams',
  PLAYERS: 'fieldr_players',
  ATHLETES: 'fieldr_athletes',
  TRANSACTIONS: 'fieldr_transactions',
  PROJECTOR: 'fieldr_projector_state',
  CAROUSEL: 'fieldr_carousel_items',
  SETTINGS: 'fieldr_site_settings',
  DEMO_AUCTION_BIDS: 'fieldr_auction_bids',
  DEMO_AUCTION_SALES: 'fieldr_auction_sales',
  DEMO_AUCTION_SETTINGS: 'fieldr_auction_settings',
  THEME: 'fieldr-theme',
  PROJECTOR_THEME: 'fieldr-projector-theme',
  ADMIN_SIDEBAR_COLLAPSED: 'fieldr_admin_sidebar_collapsed'
} as const
