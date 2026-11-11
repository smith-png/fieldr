import React, { useEffect, useState } from 'react'
import { AdminLayout, type AdminTab } from './AdminLayout'
import { AdminDashboard } from './AdminDashboard'
import { AdminSeasons } from './AdminSeasons'
import { AdminTeams } from './AdminTeams'
import { AdminAthletes } from './AdminAthletes'
import { AdminPlayers } from './AdminPlayers'
import { AdminPurses } from './AdminPurses'
import { AdminProjectorControl } from './AdminProjectorControl'
import { AdminSetup } from './AdminSetup'
import { Spinner } from '../../components/ui'
import {
  getPlayers,
  getProjectorState,
  getPurseTransactions,
  getSeasons,
  getSports,
  getTeams,
  setActiveSeason as apiSetActiveSeason
} from '../../lib/data'
import type { Player, ProjectorState, PurseTransaction, Season, Sport, Team } from '../../types'

export const AdminPage: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<AdminTab>('dashboard')
  const [isLoading, setIsLoading] = useState(true)

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

  const loadAllData = async () => {
    try {
      const allSeasons = await getSeasons()
      setSeasons(allSeasons)

      const active = allSeasons.find((s) => s.is_active) || allSeasons[0] || null
      setActiveSeason(active)

      const allSports = await getSports()
      setSports(allSports)

      if (active) {
        const [allTeams, allPlayers, allTx, pState] = await Promise.all([
          getTeams(active.id),
          getPlayers(active.id),
          getPurseTransactions(active.id),
          getProjectorState(active.id)
        ])
        setTeams(allTeams)
        setPlayers(allPlayers)
        setTransactions(allTx)
        setProjectorState(pState)
      }
    } catch {
      // fallback
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadAllData()

    // Listen for broadcast/storage changes in demo mode
    const handleStorageChange = () => {
      loadAllData()
    }
    window.addEventListener('storage', handleStorageChange)
    return () => {
      window.removeEventListener('storage', handleStorageChange)
    }
  }, [])

  const handleSwitchSeason = async (seasonId: string) => {
    try {
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
      onSelectTab={setCurrentTab}
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
          onGoToTab={setCurrentTab}
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
          onGoToTab={setCurrentTab}
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

      {currentTab === 'projector' && (
        <AdminProjectorControl
          activeSeason={activeSeason}
          projectorState={projectorState}
          teams={teams}
          players={players}
          onRefresh={loadAllData}
        />
      )}

      {currentTab === 'setup' && <AdminSetup onRefresh={loadAllData} />}
    </AdminLayout>
  )
}
