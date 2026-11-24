const QUERY_FRESH_TTL_MS = 60_000
const QUERY_REVALIDATE_AFTER_MS = 30_000

interface CacheEntry<T = unknown> {
  data: T
  updatedAt: number
}

const memoryQueryCache = new Map<string, CacheEntry>()

export function getCachedQuery<T>(key: string): CacheEntry<T> | null {
  const entry = memoryQueryCache.get(key)
  if (!entry) return null
  return entry as CacheEntry<T>
}

export function setCachedQuery<T>(key: string, data: T): void {
  memoryQueryCache.set(key, {
    data,
    updatedAt: Date.now()
  })
}

export function isQueryFresh(key: string, ttlMs: number = QUERY_FRESH_TTL_MS): boolean {
  const entry = memoryQueryCache.get(key)
  if (!entry) return false
  return Date.now() - entry.updatedAt < ttlMs
}

export function shouldRevalidateQuery(
  key: string,
  revalidateAfterMs: number = QUERY_REVALIDATE_AFTER_MS
): boolean {
  const entry = memoryQueryCache.get(key)
  if (!entry) return true
  return Date.now() - entry.updatedAt >= revalidateAfterMs
}

const prefetchedModules = new Set<string>()

function runOncePrefetch(id: string, loader: () => Promise<unknown>): void {
  if (prefetchedModules.has(id)) return
  prefetchedModules.add(id)
  loader().catch(() => {
    prefetchedModules.delete(id)
  })
}

export function prefetchRoute(path: string): void {
  const cleanPath = path.split('?')[0].split('#')[0]
  if (cleanPath === '/' || cleanPath === '') {
    return
  }
  if (cleanPath === '/teams' || cleanPath === '/season') {
    runOncePrefetch('route:/teams', () => import('../pages/public/TeamsPage'))
    return
  }
  if (cleanPath === '/results') {
    runOncePrefetch('route:/results', () => import('../pages/public/ResultsPage'))
    return
  }
  if (cleanPath === '/reels') {
    runOncePrefetch('route:/reels', () => import('../pages/public/ReelsPage'))
    return
  }
  if (cleanPath === '/reels/submit') {
    runOncePrefetch('route:/reels/submit', () => import('../pages/public/ReelSubmitPage'))
    return
  }
  if (cleanPath === '/register') {
    runOncePrefetch('route:/register', () => import('../pages/public/RegisterPage'))
    return
  }
  if (cleanPath.startsWith('/season/') && cleanPath.includes('/teams/')) {
    runOncePrefetch('route:/season/team', () => import('../pages/public/SeasonTeamDetailPage'))
    return
  }
  if (cleanPath.startsWith('/players/')) {
    runOncePrefetch('route:/players/:code', () => import('../pages/public/PlayerProfilePage'))
    return
  }
  if (cleanPath === '/rosters') {
    runOncePrefetch('route:/rosters', () => import('../pages/public/RostersPage'))
    return
  }
  if (cleanPath.startsWith('/rosters/')) {
    runOncePrefetch('route:/rosters/:sport', () => import('../pages/public/RosterSportPage'))
    return
  }
  if (cleanPath === '/rules') {
    runOncePrefetch('route:/rules', () => import('../pages/public/RulesPage'))
    return
  }
  if (cleanPath === '/handbook') {
    runOncePrefetch('route:/handbook', () => import('../pages/public/HandbookPage'))
    return
  }
  if (cleanPath === '/help' || cleanPath === '/about') {
    runOncePrefetch('route:/content', () => import('../pages/public/ContentPage'))
    return
  }
  if (cleanPath === '/login') {
    runOncePrefetch('route:/login', () => import('../pages/public/LoginPage'))
    return
  }
  if (cleanPath === '/owner-login') {
    runOncePrefetch('route:/owner-login', () => import('../pages/public/OwnerLoginPage'))
    return
  }
  if (cleanPath.startsWith('/admin')) {
    runOncePrefetch('route:/admin', () => import('../pages/admin/AdminPage'))
    if (cleanPath === '/admin/logs') {
      prefetchAdminTab('logs')
    } else {
      prefetchAdminTab('dashboard')
    }
    return
  }
  if (cleanPath.startsWith('/projector')) {
    runOncePrefetch('route:/projector', () => import('../pages/public/ProjectorPage'))
  }
}

export function prefetchAdminTab(tab: string): void {
  switch (tab) {
    case 'dashboard':
      runOncePrefetch('admin:dashboard', () => import('../pages/admin/AdminDashboard'))
      break
    case 'athletes':
    case 'players':
      runOncePrefetch('admin:athletes', () => import('../pages/admin/AdminAthletes'))
      runOncePrefetch('admin:players', () => import('../pages/admin/AdminPlayers'))
      break
    case 'teams':
    case 'purses':
      runOncePrefetch('admin:teams', () => import('../pages/admin/AdminTeams'))
      runOncePrefetch('admin:purses', () => import('../pages/admin/AdminPurses'))
      break
    case 'auction':
      runOncePrefetch('admin:auction', () => import('../pages/admin/AdminAuction'))
      break
    case 'logs':
      runOncePrefetch('admin:logs', () => import('../pages/admin/AdminLogs'))
      break
    case 'accounts':
      runOncePrefetch('admin:accounts', () => import('../pages/admin/AdminAccounts'))
      break
    case 'seasons':
      runOncePrefetch('admin:seasons', () => import('../pages/admin/AdminSeasons'))
      break
    case 'projector':
      runOncePrefetch('admin:projector', () => import('../pages/admin/AdminProjectorControl'))
      break
    case 'setup':
      runOncePrefetch('admin:setup', () => import('../pages/admin/AdminSetup'))
      break
    default:
      break
  }
}

export function scheduleLikelyAdminPrefetch(): () => void {
  const timer = setTimeout(() => {
    prefetchAdminTab('athletes')
    prefetchAdminTab('teams')
    prefetchAdminTab('auction')
    prefetchAdminTab('logs')
    prefetchAdminTab('projector')
  }, 1000)

  return () => clearTimeout(timer)
}
