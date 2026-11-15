import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AdminLayout } from './AdminLayout'
import {
  AdminCardsSkeleton,
  AdminDashboardSkeleton,
  AdminTableSkeleton
} from '../../components/ui'
import {
  REALTIME_DEBOUNCE_MS,
  getPlayers,
  getProjectorState,
  getPurseTransactions,
  getSeasons,
  getSports,
  getTeams,
  isRealtimeSuppressed,
  markLocalMutation,
  setActiveSeason as apiSetActiveSeason,
  subscribeToPlayers,
  subscribeToProjector,
  subscribeToTeams
} from '../../lib/data'
import {
  getCachedQuery,
  isQueryFresh,
  scheduleLikelyAdminPrefetch,
  setCachedQuery,
  shouldRevalidateQuery
} from '../../lib/queryCache'
import type { AdminTab, Player, ProjectorState, PurseTransaction, Season, Sport, Team } from '../../types'

const AdminDashboard = lazy(() =>
  import('./AdminDashboard').then((m) => ({ default: m.AdminDashboard }))
)
const AdminSeasons = lazy(() =>
  import('./AdminSeasons').then((m) => ({ default: m.AdminSeasons }))
)
const AdminTeams = lazy(() =>
  import('./AdminTeams').then((m) => ({ default: m.AdminTeams }))
)
const AdminAuction = lazy(() =>
  import('./AdminAuction').then((m) => ({ default: m.AdminAuction }))
)
const AdminAthletes = lazy(() =>
  import('./AdminAthletes').then((m) => ({ default: m.AdminAthletes }))
)
const AdminPlayers = lazy(() =>
  import('./AdminPlayers').then((m) => ({ default: m.AdminPlayers }))
)
const AdminPurses = lazy(() =>
  import('./AdminPurses').then((m) => ({ default: m.AdminPurses }))
)
const AdminLogs = lazy(() =>
  import('./AdminLogs').then((m) => ({ default: m.AdminLogs }))
)
const AdminProjectorControl = lazy(() =>
  import('./AdminProjectorControl').then((m) => ({ default: m.AdminProjectorControl }))
)
const AdminSetup = lazy(() =>
  import('./AdminSetup').then((m) => ({ default: m.AdminSetup }))
)

const ADMIN_BUNDLE_CACHE_KEY = 'admin:bundle'

interface AdminCachedBundle {
  seasons: Season[]
  activeSeason: Season | null
  sports: Sport[]
  teams: Team[]
  players: Player[]
  transactions: PurseTransaction[]
  projectorState: ProjectorState
}

const renderTabSkeleton = (tab: AdminTab) => {
  if (tab === 'dashboard') return <AdminDashboardSkeleton />
  if (tab === 'athletes' || tab === 'players' || tab === 'logs') {
    return <AdminTableSkeleton rows={6} columns={6} />
  }
  return <AdminCardsSkeleton count={6} />
}

export const AdminPage: React.FC = () => {
  const location = useLocation()
  const navigate = useNavigate()

  const cachedBundle = getCachedQuery<AdminCachedBundle>(ADMIN_BUNDLE_CACHE_KEY)

  const [currentTab, setCurrentTab] = useState<AdminTab>(() =>
    location.pathname === '/admin/logs' ? 'logs' : 'dashboard'
  )
  const [isLoading, setIsLoading] = useState(() => !cachedBundle)
  const hasLoadedOnceRef = useRef(Boolean(cachedBundle))
  const latestLoadReqIdRef = useRef(0)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // Prefetch likely next admin tabs 1 second after dashboard renders
  useEffect(() => {
    if (isLoading) return
    return scheduleLikelyAdminPrefetch()
  }, [isLoading])

  useEffect(() => {
    if (location.pathname === '/admin/logs') {
      setCurrentTab('logs')
    }
  }, [location.pathname])

  const [athletesRealtimeTick, setAthletesRealtimeTick] = useState(0)
  const [createAthleteTrigger, setCreateAthleteTrigger] = useState(0)

  const handleSelectTab = (tab: AdminTab) => {
    const nextTab: AdminTab =
      tab === 'players' ? 'athletes' : tab === 'purses' ? 'teams' : tab
    setCurrentTab(nextTab)
    if (nextTab === 'logs' && location.pathname !== '/admin/logs') {
      navigate('/admin/logs')
    } else if (nextTab !== 'logs' && location.pathname === '/admin/logs') {
      navigate('/admin')
    }
  }

  const [seasons, setSeasons] = useState<Season[]>(() => cachedBundle?.data.seasons || [])
  const [activeSeason, setActiveSeason] = useState<Season | null>(
    () => cachedBundle?.data.activeSeason || null
  )
  const [sports, setSports] = useState<Sport[]>(() => cachedBundle?.data.sports || [])
  const [teams, setTeams] = useState<Team[]>(() => cachedBundle?.data.teams || [])
  const [players, setPlayers] = useState<Player[]>(() => cachedBundle?.data.players || [])
  const [transactions, setTransactions] = useState<PurseTransaction[]>(
    () => cachedBundle?.data.transactions || []
  )
  const [projectorState, setProjectorState] = useState<ProjectorState>(
    () =>
      cachedBundle?.data.projectorState || {
        season_id: '',
        mode: 'idle',
        player_id: null,
        team_id: null,
        updated_at: new Date().toISOString()
      }
  )

  const loadAllData = useCallback(async () => {
    const reqId = ++latestLoadReqIdRef.current
    if (!hasLoadedOnceRef.current) {
      setIsLoading(true)
    }

    try {
      const [allSeasons, allSports] = await Promise.all([getSeasons(), getSports()])
      if (!isMountedRef.current || reqId !== latestLoadReqIdRef.current) return

      const active = allSeasons.find((s) => s.is_active) || allSeasons[0] || null

      if (active) {
        const [allTeams, allPlayers, allTx, pState] = await Promise.all([
          getTeams(active.id),
          getPlayers(active.id),
          getPurseTransactions(active.id),
          getProjectorState(active.id)
        ])
        if (!isMountedRef.current || reqId !== latestLoadReqIdRef.current) return

        setSeasons(allSeasons)
        setActiveSeason((prev) =>
          prev &&
          prev.id === active.id &&
          prev.name === active.name &&
          prev.is_active === active.is_active &&
          prev.start_date === active.start_date &&
          prev.end_date === active.end_date &&
          prev.description === active.description
            ? prev
            : active
        )
        setSports(allSports)
        setTeams(allTeams)
        setPlayers(allPlayers)
        setTransactions(allTx)
        setProjectorState(pState)
        setCachedQuery<AdminCachedBundle>(ADMIN_BUNDLE_CACHE_KEY, {
          seasons: allSeasons,
          activeSeason: active,
          sports: allSports,
          teams: allTeams,
          players: allPlayers,
          transactions: allTx,
          projectorState: pState
        })
      } else {
        setSeasons(allSeasons)
        setActiveSeason(null)
        setSports(allSports)
        setCachedQuery<AdminCachedBundle>(ADMIN_BUNDLE_CACHE_KEY, {
          seasons: allSeasons,
          activeSeason: null,
          sports: allSports,
          teams: [],
          players: [],
          transactions: [],
          projectorState: {
            season_id: '',
            mode: 'idle',
            player_id: null,
            team_id: null,
            updated_at: new Date().toISOString()
          }
        })
      }
    } catch {
      // fallback
    } finally {
      if (isMountedRef.current && reqId === latestLoadReqIdRef.current) {
        hasLoadedOnceRef.current = true
        setIsLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    if (isQueryFresh(ADMIN_BUNDLE_CACHE_KEY)) {
      if (shouldRevalidateQuery(ADMIN_BUNDLE_CACHE_KEY)) {
        void loadAllData()
      }
    } else {
      void loadAllData()
    }

    let storageTimer: ReturnType<typeof setTimeout> | null = null
    const handleStorageChange = () => {
      if (
        isRealtimeSuppressed('players') ||
        isRealtimeSuppressed('athletes') ||
        isRealtimeSuppressed('teams') ||
        isRealtimeSuppressed('auction')
      ) {
        return
      }
      if (storageTimer) clearTimeout(storageTimer)
      storageTimer = setTimeout(() => {
        storageTimer = null
        loadAllData()
      }, REALTIME_DEBOUNCE_MS)
    }

    window.addEventListener('storage', handleStorageChange)
    return () => {
      if (storageTimer) clearTimeout(storageTimer)
      window.removeEventListener('storage', handleStorageChange)
    }
  }, [loadAllData])

  useEffect(() => {
    if (!activeSeason?.id) return
    const seasonId = activeSeason.id

    const unsubProjector = subscribeToProjector(seasonId, (nextState) => {
      setProjectorState(nextState)
    })
    const unsubPlayers = subscribeToPlayers(seasonId, (nextPlayers) => {
      setPlayers(nextPlayers)
    })
    const unsubTeams = subscribeToTeams(seasonId, (nextTeams) => {
      setTeams(nextTeams)
    })

    return () => {
      unsubProjector()
      unsubPlayers()
      unsubTeams()
    }
  }, [activeSeason?.id])

  const handleSwitchSeason = async (seasonId: string) => {
    try {
      markLocalMutation(['players', 'teams', 'auction'])
      await apiSetActiveSeason(seasonId)
      await loadAllData()
    } catch {
      // ignore
    }
  }

  return (
    <AdminLayout
      currentTab={currentTab}
      onSelectTab={handleSelectTab}
      activeSeason={activeSeason}
      seasons={seasons}
      onSwitchSeason={handleSwitchSeason}
    >
      {isLoading ? (
        renderTabSkeleton(currentTab)
      ) : (
        <Suspense fallback={renderTabSkeleton(currentTab)}>
          {currentTab === 'dashboard' && (
            <AdminDashboard
              activeSeason={activeSeason}
              teams={teams}
              players={players}
              transactions={transactions}
              onGoToTab={handleSelectTab}
            />
          )}

          {currentTab === 'seasons' && (
            <AdminSeasons
              seasons={seasons}
              activeSeason={activeSeason}
              onRefresh={loadAllData}
            />
          )}

          {(currentTab === 'teams' || currentTab === 'purses') && (
            <div className="space-y-12">
              <AdminTeams
                activeSeason={activeSeason}
                teams={teams}
                sports={sports}
                onRefresh={loadAllData}
              />
              <AdminPurses
                activeSeason={activeSeason}
                teams={teams}
                transactions={transactions}
                onRefresh={loadAllData}
              />
            </div>
          )}

          {currentTab === 'auction' && (
            <AdminAuction
              activeSeason={activeSeason}
              sports={sports}
              players={players}
              teams={teams}
              projectorState={projectorState}
              onRefresh={loadAllData}
            />
          )}

          {(currentTab === 'athletes' || currentTab === 'players') && (
            <div className="space-y-12">
              <AdminAthletes
                activeSeason={activeSeason}
                sports={sports}
                onRefresh={loadAllData}
                onRealtimeUpdate={() => setAthletesRealtimeTick((c) => c + 1)}
                createRequestTrigger={createAthleteTrigger}
              />
              <AdminPlayers
                activeSeason={activeSeason}
                players={players}
                teams={teams}
                sports={sports}
                onRefresh={loadAllData}
                onGoToTab={handleSelectTab}
                externalRefreshTrigger={athletesRealtimeTick}
                onCreateNewAthlete={() => setCreateAthleteTrigger((c) => c + 1)}
              />
            </div>
          )}

          {currentTab === 'logs' && (
            <AdminLogs
              activeSeason={activeSeason}
              teams={teams}
            />
          )}

          {currentTab === 'projector' && (
            <AdminProjectorControl
              activeSeason={activeSeason}
              projectorState={projectorState}
              sports={sports}
              teams={teams}
              players={players}
              onRefresh={loadAllData}
            />
          )}

          {currentTab === 'setup' && (
            <AdminSetup
              activeSeason={activeSeason}
              teams={teams}
              onRefresh={loadAllData}
            />
          )}
        </Suspense>
      )}
    </AdminLayout>
  )
}
