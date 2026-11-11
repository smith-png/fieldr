import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AdminLayout } from './AdminLayout'
import { AdminDashboard } from './AdminDashboard'
import { AdminSeasons } from './AdminSeasons'
import { AdminTeams } from './AdminTeams'
import { AdminAuction } from './AdminAuction'
import { AdminAthletes } from './AdminAthletes'
import { AdminPlayers } from './AdminPlayers'
import { AdminPurses } from './AdminPurses'
import { AdminLogs } from './AdminLogs'
import { AdminProjectorControl } from './AdminProjectorControl'
import { AdminSetup } from './AdminSetup'
import { Spinner } from '../../components/ui'
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
import type { AdminTab, Player, ProjectorState, PurseTransaction, Season, Sport, Team } from '../../types'

export const AdminPage: React.FC = () => {
  const location = useLocation()
  const navigate = useNavigate()

  const [currentTab, setCurrentTab] = useState<AdminTab>(() =>
    location.pathname === '/admin/logs' ? 'logs' : 'dashboard'
  )
  const [isLoading, setIsLoading] = useState(true)
  const hasLoadedOnceRef = useRef(false)
  const latestLoadReqIdRef = useRef(0)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (location.pathname === '/admin/logs') {
      setCurrentTab('logs')
    }
  }, [location.pathname])

  const handleSelectTab = (tab: AdminTab) => {
    setCurrentTab(tab)
    if (tab === 'logs' && location.pathname !== '/admin/logs') {
      navigate('/admin/logs')
    } else if (tab !== 'logs' && location.pathname === '/admin/logs') {
      navigate('/admin')
    }
  }

  const [seasons, setSeasons] = useState<Season[]>([])
  const [activeSeason, setActiveSeason] = useState<Season | null>(null)
  const [sports, setSports] = useState<Sport[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [transactions, setTransactions] = useState<PurseTransaction[]>([])
  const [projectorState, setProjectorState] = useState<ProjectorState>({
    season_id: '',
    mode: 'idle',
    player_id: null,
    team_id: null,
    updated_at: new Date().toISOString()
  })

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
          prev.is_archived === active.is_archived &&
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
      } else {
        setSeasons(allSeasons)
        setActiveSeason(null)
        setSports(allSports)
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
    loadAllData()

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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-bg text-muted flex flex-col items-center justify-center gap-3 font-mono text-xs tracking-widest">
        <Spinner size="lg" />
        <span>Loading Fieldr Admin...</span>
      </div>
    )
  }

  return (
    <AdminLayout
      currentTab={currentTab}
      onSelectTab={handleSelectTab}
      activeSeason={activeSeason}
      seasons={seasons}
      onSwitchSeason={handleSwitchSeason}
    >
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

      {currentTab === 'teams' && (
        <AdminTeams
          activeSeason={activeSeason}
          teams={teams}
          sports={sports}
          onRefresh={loadAllData}
        />
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

      {currentTab === 'athletes' && (
        <AdminAthletes
          activeSeason={activeSeason}
          sports={sports}
          onRefresh={loadAllData}
        />
      )}

      {currentTab === 'players' && (
        <AdminPlayers
          activeSeason={activeSeason}
          players={players}
          teams={teams}
          sports={sports}
          onRefresh={loadAllData}
          onGoToTab={handleSelectTab}
        />
      )}

      {currentTab === 'purses' && (
        <AdminPurses
          activeSeason={activeSeason}
          teams={teams}
          transactions={transactions}
          onRefresh={loadAllData}
        />
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
    </AdminLayout>
  )
}
