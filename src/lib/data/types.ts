import type {
  Athlete,
  AthleteCareerEntry,
  AuthUser,
  CarouselItem,
  Player,
  PlayerStatus,
  ProjectorState,
  PublicPlayer,
  PublicTeam,
  PurseTransaction,
  PurseTransactionType,
  Season,
  SeasonDeletionCounts,
  SiteSettings,
  Sport,
  Team,
  UserRole
} from '../../types'

export interface AuthService {
  getCurrentUser(): Promise<AuthUser | null>
  signIn(email: string, password: string): Promise<AuthUser>
  demoSignIn(role: UserRole): Promise<AuthUser>
  signOut(): Promise<void>
}

export interface SeasonsService {
  getSeasons(): Promise<Season[]>
  getSeason(id: string): Promise<Season | null>
  getActiveSeason(): Promise<Season | null>
  createSeason(
    name: string,
    startDate?: string,
    endDate?: string,
    description?: string,
    isArchived?: boolean
  ): Promise<Season>
  setActiveSeason(id: string): Promise<void>
  getSeasonDeletionPreview(seasonId: string): Promise<SeasonDeletionCounts>
  deleteSeason(seasonId: string): Promise<void>
}

export interface TeamsService {
  getSports(): Promise<Sport[]>
  getRolesForSport(sportNameOrId: string): Promise<string[]>
  addSportRole(sportIdOrName: string, roleName: string): Promise<Sport>
  renameSportRole(
    sportIdOrName: string,
    oldRole: string,
    newRole: string
  ): Promise<{ sport: Sport; updatedPlayersCount: number }>
  reorderSportRoles(sportIdOrName: string, orderedRoles: string[]): Promise<Sport>
  deleteSportRole(sportIdOrName: string, roleName: string): Promise<Sport>
  getSportRoleUsageCounts(sportIdOrName: string): Promise<Record<string, number>>
  getTeams(seasonId: string): Promise<Team[]>
  getPublicTeams(seasonId: string): Promise<PublicTeam[]>
  getActiveTeams(): Promise<Team[]>
  createTeam(teamData: Omit<Team, 'id' | 'current_purse' | 'created_at'>): Promise<Team>
  bulkCreateTeams(teamsData: Array<Omit<Team, 'id' | 'current_purse' | 'created_at'>>): Promise<Team[]>
  updateTeam(id: string, updates: Partial<Team>): Promise<Team>
  deleteTeam(id: string): Promise<void>
  subscribeToTeams(seasonId: string, callback: (teams: Team[]) => void): () => void
}

export interface AthletesPagedParams {
  page: number
  pageSize: number
  search?: string
}

export interface AthletesPagedResult {
  athletes: Athlete[]
  totalCount: number
  totalPages: number
}

export interface AthletesService {
  getAllAthletes(): Promise<Athlete[]>
  getAthletesPaged(params: AthletesPagedParams): Promise<AthletesPagedResult>
  searchAthletes(query: string): Promise<Athlete[]>
  getAthleteByCode(code: number | string): Promise<Athlete | null>
  getAthleteById(id: string): Promise<Athlete | null>
  getAthleteCareer(athleteId: string): Promise<AthleteCareerEntry[]>
  getAthleteEntries(athleteId: string): Promise<AthleteCareerEntry[]>
  createAthlete(data: Omit<Athlete, 'id' | 'athlete_code' | 'created_at'>): Promise<Athlete>
  updateAthlete(id: string, updates: Partial<Athlete>): Promise<Athlete>
  deleteAthlete(id: string): Promise<void>
}

export interface PlayersPagedParams {
  seasonId: string
  page: number
  pageSize: number
  search?: string
  sport?: string
  role?: string
  status?: string
}

export interface PlayersPagedResult {
  players: Player[]
  totalCount: number
  totalPages: number
}

export interface PublicPlayersPagedParams {
  seasonId: string
  sport?: string
  role?: string
  academicYear?: string
  search?: string
  cursor?: string
  pageSize?: number
}

export interface PublicPlayersPagedResult {
  players: PublicPlayer[]
  nextCursor?: string
  hasMore: boolean
}

export interface BulkRegisterEntryInput {
  athlete_id: string
  athlete_name: string
  athlete_code?: number
  academic_year: Player['academic_year']
  playing_role: string
}

export interface BulkRegisterParams {
  seasonId: string
  sport: string
  basePoints: number
  entries: BulkRegisterEntryInput[]
}

export interface BulkRegisterSkippedItem {
  athlete_id: string
  athlete_name: string
  athlete_code?: number
  reason: string
}

export interface BulkRegisterResult {
  registered: Player[]
  skipped: BulkRegisterSkippedItem[]
}

export interface PlayersService {
  getPlayers(seasonId: string): Promise<Player[]>
  getPlayersPaged(params: PlayersPagedParams): Promise<PlayersPagedResult>
  getPublicPlayersPaged(params: PublicPlayersPagedParams): Promise<PublicPlayersPagedResult>
  createPlayer(
    playerData: Omit<Player, 'id' | 'player_code' | 'created_at'>,
    options?: { photoFile?: File }
  ): Promise<Player>
  bulkCreatePlayers(
    playersData: Array<Omit<Player, 'id' | 'player_code' | 'created_at'>>
  ): Promise<Player[]>
  bulkRegisterPlayers(params: BulkRegisterParams): Promise<BulkRegisterResult>
  updatePlayer(id: string, updates: Partial<Player>): Promise<Player>
  deletePlayer(id: string): Promise<void>
  exportPlayersForSport(seasonId: string, sport?: string): Promise<Player[]>
  assignPlayerToTeam(
    playerId: string,
    teamId: string,
    price: number
  ): Promise<{ player: Player; team: Team }>
  unassignPlayerFromTeam(
    playerId: string
  ): Promise<{ player: Player; team: Team | null }>
  subscribeToPlayers(seasonId: string, callback: (players: Player[]) => void): () => void
}

export interface PursesService {
  getPurseTransactions(seasonId: string, teamId?: string): Promise<PurseTransaction[]>
  executePurseTransaction(
    seasonId: string,
    teamId: string,
    type: PurseTransactionType,
    amount: number,
    reason?: string
  ): Promise<PurseTransaction>
  resetAllPurses(seasonId: string, startingPurse: number, reason?: string): Promise<void>
}

export interface ProjectorService {
  getProjectorState(seasonId: string): Promise<ProjectorState>
  setProjectorState(state: ProjectorState): Promise<ProjectorState>
  subscribeToProjector(seasonId: string, callback: (state: ProjectorState) => void): () => void
}

export interface SiteService {
  getCarouselItems(activeOnly?: boolean): Promise<CarouselItem[]>
  createCarouselItem(text: string, sortOrder: number, seasonId?: string): Promise<CarouselItem>
  updateCarouselItem(id: string, updates: Partial<CarouselItem>): Promise<CarouselItem>
  deleteCarouselItem(id: string): Promise<void>
  swapCarouselItems(id1: string, id2: string): Promise<void>
  reorderCarouselItems(orderedItems: { id: string; sort_order: number }[]): Promise<void>
  subscribeToCarouselItems(callback: (items: CarouselItem[]) => void): () => void
  getSiteSettings(): Promise<SiteSettings>
  updateSiteSetting(key: string, value: unknown): Promise<void>
  invalidateCarouselCache(): void
}

export interface StorageService {
  uploadPlayerPhotos(
    seasonId: string,
    playerCode: string,
    file: File
  ): Promise<{ photoUrl: string; thumbUrl: string }>
  deletePlayerPhotoAssets(photoUrl?: string, thumbUrl?: string): Promise<void>
  uploadAsset(file: File, folder?: string): Promise<string>
}
