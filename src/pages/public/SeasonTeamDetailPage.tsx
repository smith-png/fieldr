import { logError } from '../../lib/logger'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowsClockwise,
  Check,
  CircleNotch,
  MagnifyingGlass,
  Megaphone,
  Minus,
  PencilSimple,
  Plus,
  ShareNetwork,
  ShieldCheck,
  SignOut,
  Star,
  Users,
  X
} from '@phosphor-icons/react'
import { HeaderBar } from '../../components/layout/HeaderBar'
import { NavigationMenu } from '../../components/layout/NavigationMenu'
import { SiteFooter } from '../../components/layout/SiteFooter'
import {
  PUBLIC_BACK_LINK,
  PUBLIC_BTN_PRIMARY,
  PUBLIC_BTN_SECONDARY,
  PUBLIC_CARD,
  PUBLIC_COUNT_PILL,
  PUBLIC_FOLIO,
  PUBLIC_KICKER,
  PUBLIC_MAIN_MEDIUM,
  PUBLIC_META_ROW,
  PUBLIC_PAGE_SHELL,
  PUBLIC_PAGE_TITLE,
  PUBLIC_PILL_BAR,
  PUBLIC_SECTION_HEADER,
  PUBLIC_SECTION_TITLE,
  PUBLIC_WELL
} from '../../components/public/publicStyles'
import {
  EmptyState,
  ErrorState,
  SkeletonBlock,
  SkeletonCard,
  SkeletonText
} from '../../components/ui'
import { RosterPlayerCard } from '../../components/roster/RosterPlayerCard'
import { formatAthleteCode, supabase } from '../../lib/data/client'
import { getActiveSeason, getSeason } from '../../lib/data/seasons'
import { getPublicPlayersBySeason } from '../../lib/data/players'
import { getPublicTeams, getRolesForSport, getSports } from '../../lib/data/teams'
import { getAuctionSettings } from '../../lib/data/auction'
import { getValidTeamColor } from '../../lib/utils'
import {
  hasDataChanged,
  publicCache,
  type SeasonTeamDetailCacheEntry
} from '../../lib/publicCache'
import {
  isQueryFresh,
  prefetchRoute,
  setCachedQuery,
  shouldRevalidateQuery
} from '../../lib/queryCache'
import { formatPoints, getInitials } from '../../lib/utils'
import { useAuth } from '../../lib/AuthContext'
import { useToast } from '../../lib/ToastContext'
import type { PublicPlayer, PublicTeam, Season } from '../../types'

function getTeamCacheKey(seasonId?: string, teamId?: string): string {
  return `${seasonId || ''}::${teamId || ''}`
}

interface OwnerShortlistRow {
  id: string
  player_id: string
  note: string | null
  created_at: string
  updated_at: string
}

interface OwnerPlayerMeta {
  base_points: number | null
  status: string | null
}

interface OwnerAnnouncementRow {
  id: string
  season_id: string
  message: string
  is_active: boolean
  created_at: string
}

const SHORTLIST_NOTE_MAX = 140
const ANNOUNCEMENT_REALTIME_DEBOUNCE_MS = 250

function formatShortTime(isoString?: string | null): string {
  if (!isoString) return ''
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit'
  })
}

function getCachedTeamDetail(
  seasonId?: string,
  teamId?: string
): SeasonTeamDetailCacheEntry | undefined {
  if (!seasonId || !teamId) return undefined
  const key = getTeamCacheKey(seasonId, teamId)
  const direct = publicCache.seasonTeamDetails.get(key)
  if (direct) return direct

  const cachedTeams = publicCache.teamsBySeason.get(seasonId)
  const cachedPlayers = publicCache.playersBySeason.get(seasonId)
  const foundTeam = cachedTeams?.find((t) => t.id === teamId)
  if (foundTeam && cachedPlayers) {
    const knownSeason =
      publicCache.activeSeason.value?.id === seasonId
        ? publicCache.activeSeason.value
        : null
    const cachedSportRoles =
      publicCache.rosterSportInfo.get(foundTeam.sport.toLowerCase())?.roles || []
    return {
      season: knownSeason,
      team: foundTeam,
      teamPlayers: cachedPlayers.filter((p) => p.team_id === teamId),
      allPlayers: cachedPlayers,
      sportRoles: cachedSportRoles
    }
  }
  return undefined
}

export const SeasonTeamDetailPage: React.FC = () => {
  const { id, teamId } = useParams<{ id: string; teamId: string }>()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const toast = useToast()
  const initialCached = getCachedTeamDetail(id, teamId)

  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [activeSeason, setActiveSeason] = useState<Season | null>(
    publicCache.activeSeason.value
  )
  const [season, setSeason] = useState<Season | null>(initialCached?.season ?? null)
  const [team, setTeam] = useState<PublicTeam | null>(initialCached?.team ?? null)
  const [teamPlayers, setTeamPlayers] = useState<PublicPlayer[]>(
    initialCached?.teamPlayers ?? []
  )
  const [allPlayers, setAllPlayers] = useState<PublicPlayer[]>(
    initialCached?.allPlayers ?? []
  )
  const [sportRoles, setSportRoles] = useState<string[]>(
    initialCached?.sportRoles ?? []
  )
  const [failedOwnerPhotoUrl, setFailedOwnerPhotoUrl] = useState<string | null>(null)
  const [isOwnerPhotoOpen, setIsOwnerPhotoOpen] = useState<boolean>(false)

  const [isLoading, setIsLoading] = useState<boolean>(!initialCached)
  const [hasError, setHasError] = useState<boolean>(false)

  // Owner Panel State
  const [ownerOverview, setOwnerOverview] = useState<any | null>(null)
  const [isLoadingOverview, setIsLoadingOverview] = useState<boolean>(() =>
    Boolean(user?.role === 'owner' && teamId && supabase)
  )
  const [overviewUpdatedAt, setOverviewUpdatedAt] = useState<Date | null>(null)
  const [ownerMaxSquadSize, setOwnerMaxSquadSize] = useState<number | null>(null)
  const [ownerMinAvailableBase, setOwnerMinAvailableBase] = useState<number | null>(null)
  const [ownerPublicBaseById, setOwnerPublicBaseById] = useState<Record<string, number> | null>(null)
  const [ownerPlayerMetaById, setOwnerPlayerMetaById] = useState<Record<string, OwnerPlayerMeta>>({})
  const [customTargetSquadSize, setCustomTargetSquadSize] = useState<number | null>(null)
  const [failedBoughtPhotoUrls, setFailedBoughtPhotoUrls] = useState<Record<string, true>>({})
  const [isSharingPublic, setIsSharingPublic] = useState<boolean>(false)
  const [isSharingOwner, setIsSharingOwner] = useState<boolean>(false)

  // Owner Shortlist State (private per owner)
  const [shortlistRows, setShortlistRows] = useState<OwnerShortlistRow[]>([])
  const [isLoadingShortlist, setIsLoadingShortlist] = useState<boolean>(false)
  const [isShortlistPickerOpen, setIsShortlistPickerOpen] = useState<boolean>(false)
  const [shortlistSearch, setShortlistSearch] = useState<string>('')
  const [shortlistScope, setShortlistScope] = useState<'team_sport' | 'all'>('team_sport')
  const [editingNoteRowId, setEditingNoteRowId] = useState<string | null>(null)
  const [editingNoteValue, setEditingNoteValue] = useState<string>('')
  const [shortlistBusyKey, setShortlistBusyKey] = useState<string | null>(null)

  // Owner Announcements State (Owner Panel only)
  const [latestAnnouncement, setLatestAnnouncement] = useState<OwnerAnnouncementRow | null>(null)
  const [dismissedAnnouncementId, setDismissedAnnouncementId] = useState<string | null>(null)
  const dismissedAnnouncementIdRef = useRef<string | null>(null)
  const hasLoadedAnnouncementRef = useRef<boolean>(false)
  const seenAnnouncementIdsRef = useRef<Set<string>>(new Set())
  const announcementReqIdRef = useRef<number>(0)

  const isOwnerPanelActive = Boolean(
    supabase && user?.role === 'owner' && ownerOverview && id
  )

  useEffect(() => {
    if (!id || typeof window === 'undefined') {
      setDismissedAnnouncementId(null)
      dismissedAnnouncementIdRef.current = null
      return
    }
    try {
      const saved = window.localStorage.getItem(`fieldr_owner_dismissed_announcement_${id}`)
      const clean = saved && saved.trim() ? saved.trim() : null
      setDismissedAnnouncementId(clean)
      dismissedAnnouncementIdRef.current = clean
    } catch {
      setDismissedAnnouncementId(null)
      dismissedAnnouncementIdRef.current = null
    }
  }, [id])

  useEffect(() => {
    if (!teamId || typeof window === 'undefined') {
      setCustomTargetSquadSize(null)
      return
    }
    try {
      const saved = window.localStorage.getItem(`fieldr_owner_target_squad_${teamId}`)
      if (saved) {
        const parsed = Number.parseInt(saved, 10)
        if (Number.isFinite(parsed) && parsed > 0) {
          setCustomTargetSquadSize(parsed)
          return
        }
      }
    } catch {
      // Ignore storage access errors
    }
    setCustomTargetSquadSize(null)
  }, [teamId])

  const updateTargetSquadSize = (nextSize: number) => {
    const clean = Math.max(1, Math.round(nextSize))
    setCustomTargetSquadSize(clean)
    if (teamId && typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(`fieldr_owner_target_squad_${teamId}`, String(clean))
      } catch {
        // Ignore storage access errors
      }
    }
  }

  const fetchOwnerShortlist = useCallback(async () => {
    if (!supabase || !user || user.role !== 'owner' || !id) {
      setShortlistRows([])
      return
    }
    setIsLoadingShortlist(true)
    try {
      const { data, error } = await supabase
        .from('owner_shortlist')
        .select('id, player_id, note, created_at, updated_at')
        .eq('season_id', id)
        .eq('owner_user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) {
        logError('Failed to load owner shortlist:', error.message)
        return
      }
      setShortlistRows((data as OwnerShortlistRow[]) || [])
    } catch (err) {
      logError('Failed to load owner shortlist:', err)
    } finally {
      setIsLoadingShortlist(false)
    }
  }, [id, user])

  const handleToggleShortlist = async (playerId: string) => {
    if (!supabase || !user || user.role !== 'owner' || !id || shortlistBusyKey) return

    const existing = shortlistRows.find((r) => r.player_id === playerId)
    setShortlistBusyKey(playerId)
    try {
      if (existing) {
        const { error } = await supabase
          .from('owner_shortlist')
          .delete()
          .eq('id', existing.id)
          .eq('owner_user_id', user.id)

        if (error) {
          toast.error(error.message || 'Could not remove player from shortlist.')
          return
        }

        setShortlistRows((prev) => prev.filter((r) => r.id !== existing.id))
        if (editingNoteRowId === existing.id) {
          setEditingNoteRowId(null)
          setEditingNoteValue('')
        }
      } else {
        const nowIso = new Date().toISOString()
        const { data, error } = await supabase
          .from('owner_shortlist')
          .upsert(
            {
              owner_user_id: user.id,
              season_id: id,
              player_id: playerId,
              note: null,
              updated_at: nowIso
            },
            { onConflict: 'owner_user_id,season_id,player_id' }
          )
          .select('id, player_id, note, created_at, updated_at')
          .single()

        if (error || !data) {
          toast.error(error?.message || 'Could not add player to shortlist.')
          return
        }

        const inserted = data as OwnerShortlistRow
        setShortlistRows((prev) => [
          inserted,
          ...prev.filter((r) => r.player_id !== inserted.player_id)
        ])
      }
    } catch (err) {
      logError('Failed to update shortlist:', err)
      toast.error('Could not update shortlist.')
    } finally {
      setShortlistBusyKey(null)
    }
  }

  const handleSaveShortlistNote = async (rowId: string) => {
    if (!supabase || !user || user.role !== 'owner' || shortlistBusyKey) return

    const trimmed = editingNoteValue.trim().slice(0, SHORTLIST_NOTE_MAX)
    const nextNote = trimmed.length > 0 ? trimmed : null

    setShortlistBusyKey(rowId)
    try {
      const { data, error } = await supabase
        .from('owner_shortlist')
        .update({
          note: nextNote,
          updated_at: new Date().toISOString()
        })
        .eq('id', rowId)
        .eq('owner_user_id', user.id)
        .select('id, player_id, note, created_at, updated_at')
        .single()

      if (error || !data) {
        toast.error(error?.message || 'Could not save shortlist note.')
        return
      }

      const updated = data as OwnerShortlistRow
      setShortlistRows((prev) => prev.map((r) => (r.id === rowId ? updated : r)))
      setEditingNoteRowId(null)
      setEditingNoteValue('')
    } catch (err) {
      logError('Failed to save shortlist note:', err)
      toast.error('Could not save shortlist note.')
    } finally {
      setShortlistBusyKey(null)
    }
  }

  const fetchLatestAnnouncement = useCallback(
    async (options?: { notifyIfNew?: boolean }) => {
      if (!supabase || !id || !user || user.role !== 'owner') return

      const reqId = ++announcementReqIdRef.current
      try {
        const { data, error } = await supabase
          .from('owner_announcements')
          .select('id, season_id, message, is_active, created_at')
          .eq('season_id', id)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)

        if (reqId !== announcementReqIdRef.current) return
        if (error) {
          logError('Failed to load owner announcements:', error.message)
          return
        }

        const next = ((data as OwnerAnnouncementRow[] | null) ?? [])[0] ?? null
        setLatestAnnouncement(next)

        if (next) {
          const alreadySeen = seenAnnouncementIdsRef.current.has(next.id)
          const isDismissed = next.id === dismissedAnnouncementIdRef.current
          if (
            hasLoadedAnnouncementRef.current &&
            options?.notifyIfNew &&
            !alreadySeen &&
            !isDismissed
          ) {
            seenAnnouncementIdsRef.current.add(next.id)
            toast.toast(`Announcement: ${next.message}`, 'info')
          } else {
            seenAnnouncementIdsRef.current.add(next.id)
          }
        }
        hasLoadedAnnouncementRef.current = true
      } catch (err) {
        logError('Failed to load owner announcements:', err)
      }
    },
    [id, user, toast]
  )

  const handleDismissAnnouncement = (announcementId: string) => {
    setDismissedAnnouncementId(announcementId)
    dismissedAnnouncementIdRef.current = announcementId
    seenAnnouncementIdsRef.current.add(announcementId)
    if (id && typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(
          `fieldr_owner_dismissed_announcement_${id}`,
          announcementId
        )
      } catch {
        // Ignore storage access errors
      }
    }
  }

  useEffect(() => {
    if (!isOwnerPanelActive) {
      setShortlistRows([])
      setIsShortlistPickerOpen(false)
      setEditingNoteRowId(null)
      setEditingNoteValue('')
      return
    }
    void fetchOwnerShortlist()
  }, [isOwnerPanelActive, fetchOwnerShortlist])

  useEffect(() => {
    if (!isOwnerPanelActive || !supabase || !id) {
      setLatestAnnouncement(null)
      hasLoadedAnnouncementRef.current = false
      seenAnnouncementIdsRef.current = new Set()
      return
    }

    hasLoadedAnnouncementRef.current = false
    seenAnnouncementIdsRef.current = new Set(
      dismissedAnnouncementIdRef.current ? [dismissedAnnouncementIdRef.current] : []
    )

    void fetchLatestAnnouncement({ notifyIfNew: false })

    let active = true
    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    const scheduleAnnouncementFetch = () => {
      if (!active) return
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        debounceTimer = null
        if (!active) return
        void fetchLatestAnnouncement({ notifyIfNew: true })
      }, ANNOUNCEMENT_REALTIME_DEBOUNCE_MS)
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void fetchLatestAnnouncement({ notifyIfNew: true })
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    const channel = supabase
      .channel(`owner_announcements_${id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'owner_announcements',
          filter: `season_id=eq.${id}`
        },
        () => {
          scheduleAnnouncementFetch()
        }
      )
      .subscribe()

    return () => {
      active = false
      if (debounceTimer) clearTimeout(debounceTimer)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (supabase) {
        supabase.removeChannel(channel)
      }
    }
  }, [isOwnerPanelActive, id, user?.id, fetchLatestAnnouncement])

  const isMountedRef = useRef(true)
  const overviewReqIdRef = useRef(0)
  const detailReqIdRef = useRef(0)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const fetchOwnerOverview = async () => {
    const reqId = ++overviewReqIdRef.current
    if (!user || user.role !== 'owner' || !teamId || !supabase) {
      setOwnerOverview(null)
      setOverviewUpdatedAt(null)
      setOwnerMaxSquadSize(null)
      setOwnerMinAvailableBase(null)
      setOwnerPublicBaseById(null)
      setOwnerPlayerMetaById({})
      return
    }
    try {
      setIsLoadingOverview(true)
      const [overviewRes, settingsRes] = await Promise.all([
        supabase.rpc('owner_team_overview'),
        id ? getAuctionSettings(id).catch(() => null) : Promise.resolve(null)
      ])
      if (!isMountedRef.current || reqId !== overviewReqIdRef.current) return

      const { data, error } = overviewRes
      if (error) {
        logError('owner_team_overview error:', error)
        setOwnerOverview(null)
        setOverviewUpdatedAt(null)
        return
      }
      const items = Array.isArray(data) ? data : data ? [data] : []
      const matched = items.find(
        (item: any) => String(item.team_id || item.id) === String(teamId)
      )
      setOwnerOverview(matched || null)
      setOverviewUpdatedAt(matched ? new Date() : null)

      const rawSettingsMax = settingsRes?.max_squad_size
      const resolvedSettingsMax =
        rawSettingsMax !== null &&
        rawSettingsMax !== undefined &&
        Number.isFinite(Number(rawSettingsMax)) &&
        Number(rawSettingsMax) > 0
          ? Math.round(Number(rawSettingsMax))
          : null
      setOwnerMaxSquadSize(resolvedSettingsMax)

      if (matched && id) {
        const directMinBase =
          matched.min_available_base_points ??
          matched.lowest_available_base_points ??
          matched.min_base_points
        const hasDirectMinBase =
          directMinBase !== undefined &&
          directMinBase !== null &&
          Number.isFinite(Number(directMinBase))

        const { data: seasonPlayerRows, error: seasonPlayerErr } = await supabase
          .from('players')
          .select('id, base_points, status')
          .eq('season_id', id)
        if (!isMountedRef.current || reqId !== overviewReqIdRef.current) return

        if (!seasonPlayerErr && Array.isArray(seasonPlayerRows)) {
          const metaMap: Record<string, OwnerPlayerMeta> = {}
          const availableBases: number[] = []
          for (const row of seasonPlayerRows as Array<{
            id?: string
            base_points?: unknown
            status?: unknown
          }>) {
            if (!row.id) continue
            const parsedBase =
              row.base_points !== null &&
              row.base_points !== undefined &&
              Number.isFinite(Number(row.base_points))
                ? Math.max(0, Number(row.base_points))
                : null
            const statusStr =
              typeof row.status === 'string' && row.status.trim()
                ? row.status.trim().toLowerCase()
                : null
            metaMap[String(row.id)] = {
              base_points: parsedBase,
              status: statusStr
            }
            if (statusStr === 'available' && parsedBase !== null) {
              availableBases.push(parsedBase)
            }
          }
          setOwnerPlayerMetaById(metaMap)
          setOwnerPublicBaseById(null)
          if (hasDirectMinBase) {
            setOwnerMinAvailableBase(Math.max(0, Number(directMinBase)))
          } else {
            setOwnerMinAvailableBase(
              availableBases.length > 0 ? Math.min(...availableBases) : 0
            )
          }
        } else {
          setOwnerPlayerMetaById({})
          const { data: pubBaseRows, error: pubBaseErr } = await supabase
            .from('public_players')
            .select('id, base_points')
            .eq('season_id', id)
          if (!isMountedRef.current || reqId !== overviewReqIdRef.current) return

          if (!pubBaseErr && Array.isArray(pubBaseRows)) {
            const baseMap: Record<string, number> = {}
            for (const row of pubBaseRows as Array<{ id?: string; base_points?: unknown }>) {
              if (
                row.id &&
                row.base_points !== null &&
                row.base_points !== undefined &&
                Number.isFinite(Number(row.base_points))
              ) {
                baseMap[String(row.id)] = Math.max(0, Number(row.base_points))
              }
            }
            setOwnerPublicBaseById(Object.keys(baseMap).length > 0 ? baseMap : null)
          } else {
            setOwnerPublicBaseById(null)
          }

          if (hasDirectMinBase) {
            setOwnerMinAvailableBase(Math.max(0, Number(directMinBase)))
          } else {
            setOwnerMinAvailableBase(null)
          }
        }
      } else {
        setOwnerMinAvailableBase(null)
        setOwnerPublicBaseById(null)
        setOwnerPlayerMetaById({})
      }
    } catch (err) {
      if (!isMountedRef.current || reqId !== overviewReqIdRef.current) return
      logError('Failed to load owner overview:', err)
      setOwnerOverview(null)
      setOverviewUpdatedAt(null)
    } finally {
      if (isMountedRef.current && reqId === overviewReqIdRef.current) {
        setIsLoadingOverview(false)
      }
    }
  }

  useEffect(() => {
    if (user?.role === 'owner' && teamId) {
      setOwnerOverview(null)
      setOverviewUpdatedAt(null)
      setOwnerMaxSquadSize(null)
      setOwnerMinAvailableBase(null)
      setOwnerPublicBaseById(null)
      setOwnerPlayerMetaById({})
      fetchOwnerOverview()
    } else {
      setOwnerOverview(null)
      setOverviewUpdatedAt(null)
      setOwnerMaxSquadSize(null)
      setOwnerMinAvailableBase(null)
      setOwnerPublicBaseById(null)
      setOwnerPlayerMetaById({})
      setIsLoadingOverview(false)
    }
  }, [user?.role, user?.id, id, teamId])

  const loadData = async (options?: { force?: boolean }) => {
    if (!id || !teamId) return
    const reqId = ++detailReqIdRef.current
    const key = getTeamCacheKey(id, teamId)
    const queryKey = `public:teamDetail:${key}`
    const cached = getCachedTeamDetail(id, teamId)

    if (cached && !options?.force) {
      setSeason(cached.season)
      setTeam(cached.team)
      setTeamPlayers(cached.teamPlayers)
      setAllPlayers(cached.allPlayers)
      setSportRoles(cached.sportRoles)
      setIsLoading(false)
      if (isQueryFresh(queryKey) && !shouldRevalidateQuery(queryKey)) {
        return
      }
    } else if (!cached) {
      setIsLoading(true)
    }
    setHasError(false)

    try {
      const [active, s, publicTeams, seasonPlayers, allSports] = await Promise.all([
        publicCache.activeSeason.loaded && !options?.force
          ? Promise.resolve(publicCache.activeSeason.value)
          : getActiveSeason(),
        getSeason(id),
        getPublicTeams(id),
        getPublicPlayersBySeason(id),
        getSports()
      ])
      if (!isMountedRef.current || reqId !== detailReqIdRef.current) return

      const prevActive = publicCache.activeSeason.value
      const activeChanged =
        !publicCache.activeSeason.loaded || hasDataChanged(prevActive, active)
      publicCache.activeSeason = { loaded: true, value: active }
      if (activeChanged) {
        setActiveSeason(active)
      }

      publicCache.teamsBySeason.set(id, publicTeams)
      publicCache.playersBySeason.set(id, seasonPlayers)
      if (Array.isArray(allSports)) {
        publicCache.sports = { loaded: true, value: allSports }
      }

      const foundTeam = publicTeams.find((t) => t.id === teamId) || null
      if (!foundTeam) {
        const notFoundEntry: SeasonTeamDetailCacheEntry = {
          season: s,
          team: null,
          teamPlayers: [],
          allPlayers: [],
          sportRoles: []
        }
        publicCache.seasonTeamDetails.set(key, notFoundEntry)
        setCachedQuery(queryKey, notFoundEntry)
        setTeam(null)
        return
      }

      const matchedSport = Array.isArray(allSports)
        ? allSports.find(
            (sp) =>
              sp.id.toLowerCase() === foundTeam.sport.toLowerCase() ||
              sp.name.toLowerCase() === foundTeam.sport.toLowerCase()
          )
        : undefined
      const roles =
        matchedSport && matchedSport.roles.length > 0
          ? matchedSport.roles
          : await getRolesForSport(foundTeam.sport)
      if (!isMountedRef.current || reqId !== detailReqIdRef.current) return

      const nextEntry: SeasonTeamDetailCacheEntry = {
        season: s,
        team: foundTeam,
        teamPlayers: seasonPlayers.filter((p) => p.team_id === teamId),
        allPlayers: seasonPlayers,
        sportRoles: roles
      }
      const prevEntry = publicCache.seasonTeamDetails.get(key) ?? cached
      const changed = !prevEntry || hasDataChanged(prevEntry, nextEntry)
      publicCache.seasonTeamDetails.set(key, nextEntry)
      setCachedQuery(queryKey, nextEntry)

      if (changed) {
        setSeason(s)
        setTeam(foundTeam)
        setAllPlayers(seasonPlayers)
        setTeamPlayers(nextEntry.teamPlayers)
        setSportRoles(roles)
      }
    } catch (err) {
      if (!isMountedRef.current || reqId !== detailReqIdRef.current) return
      logError(
        'Failed to load season team detail data:',
        err instanceof Error ? err.message : err,
        err
      )
      if (!cached) {
        setHasError(true)
      }
    } finally {
      if (isMountedRef.current && reqId === detailReqIdRef.current) {
        setIsLoading(false)
      }
    }
  }

  const sportsByAthleteId = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const player of allPlayers) {
      if (!player.athlete_id) continue
      const existing = map.get(player.athlete_id)
      if (existing) {
        existing.push(player.sport)
      } else {
        map.set(player.athlete_id, [player.sport])
      }
    }
    return map
  }, [allPlayers])

  useEffect(() => {
    void loadData()
  }, [id, teamId])

  const ownerName = team?.owner_display_name?.trim() || ''
  const ownerPhotoUrl = team?.owner_photo_url?.trim() || ''
  const showOwnerPhoto =
    Boolean(ownerPhotoUrl) && failedOwnerPhotoUrl !== ownerPhotoUrl
  const showOwnerSection = Boolean(ownerName) || showOwnerPhoto

  const handleSharePublicSquad = async () => {
    if (!team || isSharingPublic) return
    if (teamPlayers.length === 0) {
      toast.toast('No players in this squad to share yet.', 'info')
      return
    }

    setIsSharingPublic(true)
    try {
      const orderedRoleKeys = [
        ...sportRoles,
        ...Array.from(
          new Set(
            teamPlayers
              .map((p) => p.playing_role)
              .filter(
                (r) =>
                  !sportRoles.some((sr) => sr.toLowerCase() === r.toLowerCase())
              )
          )
        )
      ]
      const orderedPlayers = orderedRoleKeys.flatMap((role) =>
        teamPlayers.filter(
          (p) => p.playing_role.toLowerCase() === role.toLowerCase()
        )
      )
      const playersForShare = (orderedPlayers.length > 0 ? orderedPlayers : teamPlayers).map(
        (p) => ({
          name: p.name,
          role: p.playing_role,
          photoUrl: p.photo_thumb_url || p.photo_url || null
        })
      )

      const { shareSquadImage } = await import('../../lib/shareSquadImage')
      const result = await shareSquadImage({
        teamName: team.name,
        sport: team.sport,
        seasonName: season?.name || activeSeason?.name || null,
        ownerName: ownerName || null,
        teamColor: getValidTeamColor(team.color),
        players: playersForShare,
        showPrices: false
      })

      if (result.outcome === 'downloaded') {
        toast.success('Squad image downloaded.')
      }
    } catch (err) {
      logError('Failed to generate squad share image:', err)
      toast.error('Could not generate squad image.')
    } finally {
      setIsSharingPublic(false)
    }
  }

  const handleShareOwnerSquad = async (
    boughtPlayers: Array<{
      name: string
      playing_role: string
      purchase_price: number
      photo_url: string | null
    }>,
    purseSummary: { spent: number; remaining: number }
  ) => {
    if (!team || isSharingOwner) return
    if (boughtPlayers.length === 0) {
      toast.toast('No players acquired yet to share.', 'info')
      return
    }

    setIsSharingOwner(true)
    try {
      const { shareSquadImage } = await import('../../lib/shareSquadImage')
      const result = await shareSquadImage({
        teamName: team.name,
        sport: team.sport,
        seasonName: season?.name || activeSeason?.name || null,
        ownerName: ownerName || null,
        teamColor: getValidTeamColor(team.color),
        players: boughtPlayers.map((bp) => ({
          name: bp.name,
          role: bp.playing_role,
          photoUrl: bp.photo_url,
          price: bp.purchase_price
        })),
        showPrices: true,
        purseSummary
      })

      if (result.outcome === 'downloaded') {
        toast.success('Squad image downloaded.')
      }
    } catch (err) {
      logError('Failed to generate owner squad share image:', err)
      toast.error('Could not generate squad image.')
    } finally {
      setIsSharingOwner(false)
    }
  }

  useEffect(() => {
    if (!isOwnerPhotoOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOwnerPhotoOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOwnerPhotoOpen])

  return (
    <div className={PUBLIC_PAGE_SHELL}>
      <HeaderBar onOpenMenu={() => setIsMenuOpen(true)} />
      <NavigationMenu
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
      />

      <main className={PUBLIC_MAIN_MEDIUM}>
        <div className="mb-6">
          <Link
            to="/teams"
            onMouseEnter={() => prefetchRoute('/teams')}
            onFocus={() => prefetchRoute('/teams')}
            onTouchStart={() => prefetchRoute('/teams')}
            className={PUBLIC_BACK_LINK}
          >
            <ArrowLeft size={14} weight="regular" />
            <span>Back to Teams</span>
          </Link>
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-6">
            <div className={`${PUBLIC_CARD} flex flex-col md:flex-row items-center justify-between gap-6`}>
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 flex-1 w-full">
                <SkeletonBlock className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl shrink-0" />
                <div className="space-y-3 flex-1 w-full">
                  <SkeletonBlock className="w-28 h-5 rounded-lg" />
                  <SkeletonBlock className="w-64 h-10 rounded-2xl" />
                  <SkeletonText width="w-40" />
                </div>
              </div>
              <SkeletonBlock className="w-44 h-52 rounded-2xl shrink-0" />
            </div>
            <div className="space-y-4">
              <SkeletonBlock className="w-48 h-7 rounded-2xl" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <SkeletonCard key={idx} className="rounded-2xl min-h-[150px]" />
                ))}
              </div>
            </div>
          </div>
        ) : hasError ? (
          <ErrorState
            title="Failed to Load Franchise Details"
            description="We encountered an issue loading this team's roster."
            onRetry={() => void loadData({ force: true })}
            className="rounded-2xl"
          />
        ) : !team ? (
          <EmptyState
            icon={ShieldCheck}
            statusLabel="NO RECORDS"
            title="Team Not Found"
            description="The requested team does not exist for this season."
            actionLabel="Return to Teams"
            onAction={() => navigate('/teams')}
          />
        ) : (
          <div className="flex flex-col gap-10">
            {/* Team Header (Featured: corner registration ticks + 2px top team strip) */}
            {(() => {
              const teamColor = getValidTeamColor(team.color)
              return (
                <section
                  style={
                    teamColor
                      ? ({ '--team-color': teamColor } as React.CSSProperties)
                      : undefined
                  }
                  className={`pub-corner-ticks pub-enter overflow-hidden p-6 sm:p-8 rounded-2xl border border-solid flex flex-col md:flex-row items-center justify-between gap-6 min-w-0 ${
                    teamColor ? 'pub-team-card' : 'bg-surface border-border'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 flex-1 min-w-0">
                    <div
                      className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl flex items-center justify-center overflow-hidden border border-border font-syne font-extrabold text-on-accent text-2xl shrink-0"
                      style={{ backgroundColor: team.color || 'var(--accent)' }}
                    >
                      {team.logo_url ? (
                        <img
                          src={team.logo_url}
                          alt={team.name}
                          width={96}
                          height={96}
                          decoding="async"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span>{team.short_code}</span>
                      )}
                    </div>

                    <div className="flex-1 text-center sm:text-left min-w-0">
                      <span className={PUBLIC_KICKER}>FRANCHISE ROSTER</span>
                      <h1 className={PUBLIC_PAGE_TITLE}>
                        {team.name}
                      </h1>
                      <div className={`${PUBLIC_META_ROW} justify-center sm:justify-start mt-2.5`}>
                        <span className="text-text font-semibold">{team.short_code}</span>
                        <span aria-hidden="true">·</span>
                        <span>{team.sport}</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {teamPlayers.length} {teamPlayers.length === 1 ? 'player' : 'players'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {showOwnerSection && (
                    <div className="flex flex-col md:flex-row items-center gap-5 md:gap-6 pt-6 md:pt-0 border-t md:border-t-0 md:border-l border-border md:pl-8 w-full md:w-auto justify-center md:justify-start shrink-0">
                      {showOwnerPhoto ? (
                        <button
                          type="button"
                          onClick={() => setIsOwnerPhotoOpen(true)}
                          aria-label={`View full size photo of ${ownerName || 'Franchise Owner'}`}
                          className="w-44 md:w-56 aspect-[4/5] rounded-2xl overflow-hidden bg-surface-2 border border-border flex items-center justify-center shrink-0 select-none cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright"
                        >
                          <img
                            src={ownerPhotoUrl}
                            alt={ownerName || 'Franchise Owner'}
                            width={224}
                            height={280}
                            loading="lazy"
                            decoding="async"
                            referrerPolicy="no-referrer"
                            onError={() => {
                              setIsOwnerPhotoOpen(false)
                              setFailedOwnerPhotoUrl(ownerPhotoUrl)
                            }}
                            className="w-full h-full object-cover"
                          />
                        </button>
                      ) : (
                        <div className="w-44 md:w-56 aspect-[4/5] rounded-2xl overflow-hidden bg-surface-2 border border-border flex items-center justify-center shrink-0 select-none">
                          <span
                            aria-hidden="true"
                            className="font-syne font-bold text-4xl md:text-5xl text-muted tracking-tight uppercase"
                          >
                            {getInitials(ownerName)}
                          </span>
                        </div>
                      )}

                      <div className="text-center md:text-left">
                        <span className="block font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
                          Owner
                        </span>
                        {ownerName && (
                          <span className="font-syne font-bold text-xl md:text-2xl text-text tracking-tight block mt-1">
                            {ownerName}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </section>
              )
            })()}

            {isOwnerPhotoOpen && showOwnerPhoto && (
              <div
                role="dialog"
                aria-modal="true"
                aria-label={ownerName || 'Franchise Owner photo'}
                onClick={() => setIsOwnerPhotoOpen(false)}
                className="fixed inset-0 z-50 bg-scrim flex items-center justify-center p-4 sm:p-8 cursor-pointer"
              >
                <img
                  src={ownerPhotoUrl}
                  alt={ownerName || 'Franchise Owner'}
                  width={800}
                  height={800}
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  className="max-w-full max-h-[90dvh] w-auto h-auto object-contain rounded-3xl border border-border"
                />
              </div>
            )}

            {/* Owner Panel (Visible ONLY to signed-in owner of this specific franchise) */}
            {user?.role === 'owner' && isLoadingOverview && !ownerOverview ? (
              <div
                aria-busy="true"
                aria-label="Loading Owner Panel"
                className={`${PUBLIC_CARD} relative overflow-hidden`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-5 border-b border-border">
                  <div className="space-y-2">
                    <SkeletonBlock className="h-3.5 w-48 rounded-full" />
                    <SkeletonBlock className="h-8 sm:h-9 w-44 rounded-xl" />
                    <SkeletonBlock className="h-3.5 w-28 rounded-full" />
                  </div>
                  <div className="flex items-center gap-2 self-start shrink-0">
                    <SkeletonBlock className="h-9 w-24 rounded-full" />
                    <SkeletonBlock className="h-9 w-24 rounded-full" />
                  </div>
                </div>

                <div className="py-6 border-b border-border flex flex-col md:flex-row md:items-end justify-between gap-6">
                  <div className="flex-1 min-w-0">
                    <SkeletonBlock className="h-3.5 w-28 rounded-full mb-2" />
                    <SkeletonBlock className="h-9 sm:h-10 w-44 rounded-xl" />
                    <SkeletonBlock className="mt-4 h-1.5 w-full max-w-md rounded-full" />
                  </div>
                  <div className="flex flex-wrap items-start gap-x-8 gap-y-4 md:shrink-0">
                    <div className="space-y-1.5">
                      <SkeletonBlock className="h-3.5 w-20 rounded-full" />
                      <SkeletonBlock className="h-6 w-24 rounded-lg" />
                    </div>
                    <div className="space-y-1.5">
                      <SkeletonBlock className="h-3.5 w-24 rounded-full" />
                      <SkeletonBlock className="h-6 w-12 rounded-lg" />
                    </div>
                  </div>
                </div>

                <div className="pt-6">
                  <SkeletonBlock className="h-5 w-36 rounded-lg mb-3" />
                  <div className="space-y-2.5">
                    {Array.from({ length: 3 }).map((_, idx) => (
                      <div
                        key={idx}
                        className={`${PUBLIC_WELL} px-3.5 py-3 sm:px-4 flex items-center justify-between gap-3`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <SkeletonBlock className="h-5 w-12 rounded-full shrink-0" />
                          <div className="space-y-1.5 min-w-0 flex-1 max-w-xs">
                            <SkeletonBlock className="h-4 w-36 rounded-md" />
                            <SkeletonBlock className="h-3 w-20 rounded-md" />
                          </div>
                        </div>
                        <SkeletonBlock className="h-4 w-16 rounded-md shrink-0" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : ownerOverview && (() => {
              const rawPlayers =
                ownerOverview.players ??
                ownerOverview.players_bought ??
                ownerOverview.bought_players ??
                ownerOverview.squad ??
                []
              let list: any[] = []
              if (typeof rawPlayers === 'string') {
                try {
                  list = JSON.parse(rawPlayers)
                } catch {
                  list = []
                }
              } else if (Array.isArray(rawPlayers)) {
                list = rawPlayers
              }

              const boughtPlayers = list.map((p: any, index: number) => {
                const rawPhoto = p.photo_thumb_url ?? p.photo_url ?? null
                const photoUrl =
                  typeof rawPhoto === 'string' && rawPhoto.trim() ? rawPhoto.trim() : null
                const rawSoldAt =
                  p.sold_at ?? p.purchased_at ?? p.sale_at ?? p.bought_at ?? p.created_at ?? null
                const parsedSoldAt =
                  rawSoldAt && !Number.isNaN(new Date(rawSoldAt).getTime())
                    ? new Date(rawSoldAt)
                    : null
                const rawPurseAfter = p.purse_after ?? p.balance_after ?? null
                const explicitPurseAfter =
                  rawPurseAfter !== null &&
                  rawPurseAfter !== undefined &&
                  Number.isFinite(Number(rawPurseAfter))
                    ? Math.max(0, Number(rawPurseAfter))
                    : null
                return {
                  index,
                  athlete_code: formatAthleteCode(p.athlete_code ?? p.player_code ?? p.code ?? p.id),
                  name: String(p.name || p.player_name || 'Unnamed Player'),
                  playing_role: String(p.playing_role || p.role || 'Player'),
                  purchase_price: Number(p.purchase_price ?? p.price ?? p.amount ?? 0),
                  photo_url: photoUrl,
                  sold_at: parsedSoldAt,
                  purse_after: explicitPurseAfter
                }
              })

              const purseSpent =
                ownerOverview.purse_spent ??
                ownerOverview.spent ??
                ownerOverview.spent_purse ??
                (ownerOverview.initial_purse != null && ownerOverview.current_purse != null
                  ? Math.max(0, Number(ownerOverview.initial_purse) - Number(ownerOverview.current_purse))
                  : boughtPlayers.reduce((sum, p) => sum + p.purchase_price, 0))

              const currentPurse =
                ownerOverview.current_purse ??
                ownerOverview.purse_remaining ??
                ownerOverview.remaining_purse ??
                0

              const rosterCount =
                ownerOverview.roster_count ??
                ownerOverview.player_count ??
                boughtPlayers.length

              const safeSpent = Math.max(0, Number(purseSpent) || 0)
              const safeRemaining = Math.max(0, Number(currentPurse) || 0)
              const totalPurse = safeSpent + safeRemaining
              const spentRatio =
                totalPurse > 0 ? Math.min(1, Math.max(0, safeSpent / totalPurse)) : 0
              const updatedTimeLabel = overviewUpdatedAt
                ? overviewUpdatedAt.toLocaleTimeString([], {
                    hour: 'numeric',
                    minute: '2-digit'
                  })
                : null

              // 1. Max Bid calculation
              const rawOverviewMaxSquad =
                ownerOverview.max_squad_size ??
                ownerOverview.maximum_squad_size ??
                ownerOverview.squad_limit ??
                null
              const resolvedMaxSquadSize =
                rawOverviewMaxSquad !== null &&
                rawOverviewMaxSquad !== undefined &&
                Number.isFinite(Number(rawOverviewMaxSquad)) &&
                Number(rawOverviewMaxSquad) > 0
                  ? Math.round(Number(rawOverviewMaxSquad))
                  : ownerMaxSquadSize

              const lowestAvailableBaseFromLoaded = (() => {
                if (ownerMinAvailableBase !== null) return ownerMinAvailableBase
                const availableBases: number[] = []
                for (const p of allPlayers) {
                  const isAvailable = p.status === 'available' || (!p.status && !p.team_id)
                  if (!isAvailable) continue
                  const baseVal =
                    p.base_points !== undefined && p.base_points !== null
                      ? Number(p.base_points)
                      : ownerPublicBaseById && ownerPublicBaseById[p.id] !== undefined
                      ? ownerPublicBaseById[p.id]
                      : null
                  if (baseVal !== null && Number.isFinite(baseVal)) {
                    availableBases.push(Math.max(0, baseVal))
                  }
                }
                if (availableBases.length > 0) {
                  return Math.min(...availableBases)
                }
                return null
              })()

              const hasConfiguredMaxSquad =
                resolvedMaxSquadSize !== null && resolvedMaxSquadSize > 0
              const minTargetSquadSize = rosterCount + 1
              const effectiveTargetSquadSize = Math.max(
                minTargetSquadSize,
                customTargetSquadSize ?? minTargetSquadSize
              )
              const activeSquadLimit = hasConfiguredMaxSquad
                ? resolvedMaxSquadSize
                : effectiveTargetSquadSize

              const remainingSlots = Math.max(0, activeSquadLimit - rosterCount)
              const reserveSlots = Math.max(0, remainingSlots - 1)
              const effectiveMinBase = lowestAvailableBaseFromLoaded ?? 0
              const rawMaxBid = safeRemaining - reserveSlots * effectiveMinBase
              const isNotEnoughPurse =
                remainingSlots > 0 &&
                lowestAvailableBaseFromLoaded !== null &&
                lowestAvailableBaseFromLoaded > 0 &&
                rawMaxBid < lowestAvailableBaseFromLoaded
              const maxBidValue =
                remainingSlots > 0 && !isNotEnoughPurse ? Math.max(0, rawMaxBid) : 0

              // 2. Role coverage in the sport's configured role order (numbers only)
              const roleCoverageCounts = sportRoles.map((role) => {
                const target = role.trim().toLowerCase()
                const count = boughtPlayers.filter(
                  (bp) => bp.playing_role.trim().toLowerCase() === target
                ).length
                return { role, count }
              })

              // 3. Merged Players Bought & Purchases timeline computed in the browser
              const hasAnySaleTime = boughtPlayers.some((bp) => bp.sold_at !== null)
              const orderedTimelineSource = hasAnySaleTime
                ? [...boughtPlayers].sort((a, b) => {
                    const ta = a.sold_at ? a.sold_at.getTime() : Number.MAX_SAFE_INTEGER
                    const tb = b.sold_at ? b.sold_at.getTime() : Number.MAX_SAFE_INTEGER
                    return ta - tb || a.index - b.index
                  })
                : boughtPlayers

              const totalPurchaseSum = orderedTimelineSource.reduce(
                (sum, bp) => sum + bp.purchase_price,
                0
              )
              let runningPurse = safeRemaining + totalPurchaseSum
              const mergedPurchases = orderedTimelineSource.map((bp) => {
                runningPurse = Math.max(0, runningPurse - bp.purchase_price)
                return {
                  key: `${bp.athlete_code}-${bp.index}`,
                  athlete_code: bp.athlete_code,
                  name: bp.name,
                  playing_role: bp.playing_role,
                  photo_url: bp.photo_url,
                  price: bp.purchase_price,
                  purseAfter: bp.purse_after !== null ? bp.purse_after : runningPurse,
                  timeLabel: bp.sold_at
                    ? bp.sold_at.toLocaleTimeString([], {
                        hour: 'numeric',
                        minute: '2-digit'
                      })
                    : null
                }
              })

              const ownerSharePayload = {
                spent: safeSpent,
                remaining: safeRemaining
              }

              // 4. Shortlist derived data
              const allPlayersById = new Map<string, PublicPlayer>()
              for (const p of allPlayers) {
                allPlayersById.set(p.id, p)
              }

              const shortlistedIds = new Set(shortlistRows.map((r) => r.player_id))

              const enrichedShortlist = shortlistRows
                .map((row) => {
                  const player = allPlayersById.get(row.player_id)
                  const meta = ownerPlayerMetaById[row.player_id]
                  const resolvedStatus = (
                    meta?.status ??
                    player?.status ??
                    'available'
                  ).toLowerCase()
                  const resolvedBase =
                    meta?.base_points ??
                    (player?.base_points !== undefined && player?.base_points !== null
                      ? Number(player.base_points)
                      : ownerPublicBaseById?.[row.player_id] ?? null)
                  return {
                    row,
                    name: player?.name || 'Player',
                    athleteCode: player
                      ? formatAthleteCode(player.athlete_code ?? player.player_code)
                      : null,
                    playingRole: player?.playing_role || 'Player',
                    sport: player?.sport || '',
                    photoUrl: player?.photo_thumb_url || player?.photo_url || null,
                    basePoints: resolvedBase,
                    status: resolvedStatus,
                    isSold: resolvedStatus === 'sold'
                  }
                })
                .sort((a, b) => Number(a.isSold) - Number(b.isSold))

              const teamSportLower = team.sport.trim().toLowerCase()
              const hasOtherSports = allPlayers.some(
                (p) => p.sport.trim().toLowerCase() !== teamSportLower
              )
              const cleanSearch = shortlistSearch.trim().toLowerCase()
              const availableSeasonPlayers = allPlayers
                .filter((p) => {
                  const effStatus = (
                    ownerPlayerMetaById[p.id]?.status ??
                    p.status ??
                    'available'
                  ).toLowerCase()
                  if (effStatus !== 'available') return false
                  if (
                    shortlistScope === 'team_sport' &&
                    p.sport.trim().toLowerCase() !== teamSportLower
                  ) {
                    return false
                  }
                  if (!cleanSearch) return true
                  const codeStr = formatAthleteCode(p.athlete_code ?? p.player_code).toLowerCase()
                  return (
                    p.name.toLowerCase().includes(cleanSearch) ||
                    p.playing_role.toLowerCase().includes(cleanSearch) ||
                    codeStr.includes(cleanSearch)
                  )
                })
                .map((p) => {
                  const meta = ownerPlayerMetaById[p.id]
                  const basePoints =
                    meta?.base_points ??
                    (p.base_points !== undefined && p.base_points !== null
                      ? Number(p.base_points)
                      : ownerPublicBaseById?.[p.id] ?? null)
                  return {
                    player: p,
                    athleteCode: formatAthleteCode(p.athlete_code ?? p.player_code),
                    basePoints,
                    isStarred: shortlistedIds.has(p.id)
                  }
                })

              const showAnnouncementBanner = Boolean(
                latestAnnouncement &&
                  latestAnnouncement.is_active &&
                  latestAnnouncement.id !== dismissedAnnouncementId
              )

              return (
                <div className={`${PUBLIC_CARD} relative overflow-hidden`}>
                  {showAnnouncementBanner && latestAnnouncement && (
                    <div
                      role="status"
                      className="frost border border-accent-bright/35 rounded-2xl p-4 mb-6 flex items-start justify-between gap-3"
                    >
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <span className="w-8 h-8 rounded-full bg-accent/15 border border-accent-bright/30 flex items-center justify-center shrink-0 mt-0.5">
                          <Megaphone
                            size={15}
                            weight="regular"
                            className="text-accent-bright"
                          />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent-bright font-semibold">
                              Announcement
                            </span>
                            {latestAnnouncement.created_at && (
                              <span className="font-mono text-[11px] text-muted tabular-nums">
                                {formatShortTime(latestAnnouncement.created_at)}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-text mt-1 break-words leading-snug">
                            {latestAnnouncement.message}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDismissAnnouncement(latestAnnouncement.id)}
                        aria-label="Dismiss announcement"
                        className="relative hit-44 w-8 h-8 rounded-full bg-surface-2 border border-border inline-flex items-center justify-center text-muted hover:text-text hover:border-accent-bright/40 transition-colors cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright"
                      >
                        <X size={14} weight="bold" />
                      </button>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-5 border-b border-border">
                    <div className="min-w-0">
                      <span className="block text-[11px] font-mono uppercase tracking-[0.16em] text-accent-bright font-semibold mb-1">
                        CONFIDENTIAL FRANCHISE PORTAL
                      </span>
                      <h2 className="font-syne font-bold text-2xl sm:text-3xl text-text tracking-tight">
                        Owner Panel
                      </h2>
                      {updatedTimeLabel && (
                        <span className="block font-mono text-[11px] text-muted mt-1 tabular-nums">
                          Updated {updatedTimeLabel}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 self-start shrink-0">
                      <div className="hidden sm:block shrink-0">
                        <button
                          type="button"
                          onClick={() => void handleShareOwnerSquad(boughtPlayers, ownerSharePayload)}
                          disabled={isSharingOwner}
                          className={`${PUBLIC_BTN_PRIMARY} px-5 py-2.5 text-sm whitespace-nowrap`}
                        >
                          {isSharingOwner ? (
                            <CircleNotch
                              size={16}
                              weight="regular"
                              className="animate-spin motion-reduce:animate-none"
                            />
                          ) : (
                            <ShareNetwork size={16} weight="regular" />
                          )}
                          <span>Share squad</span>
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          void loadData({ force: true })
                          void fetchOwnerOverview()
                          void fetchOwnerShortlist()
                          void fetchLatestAnnouncement({ notifyIfNew: false })
                        }}
                        disabled={isLoadingOverview}
                        className={`${PUBLIC_BTN_SECONDARY} px-3.5 py-2 text-xs disabled:opacity-50`}
                      >
                        {isLoadingOverview ? (
                          <CircleNotch
                            size={14}
                            className="animate-spin motion-reduce:animate-none"
                          />
                        ) : (
                          <ArrowsClockwise size={14} />
                        )}
                        <span>Refresh</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => logout()}
                        className={`${PUBLIC_BTN_SECONDARY} px-3.5 py-2 text-xs text-muted hover:text-text`}
                      >
                        <SignOut size={14} />
                        <span>Sign out</span>
                      </button>
                    </div>
                  </div>

                  {/* Purse Block */}
                  <div className="py-6 border-b border-border space-y-4">
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <span className="block font-mono text-[11px] uppercase tracking-[0.14em] text-muted mb-1">
                          PURSE REMAINING
                        </span>
                        <div className="font-mono text-3xl sm:text-4xl font-bold text-accent-bright tabular-nums tracking-tight leading-none">
                          {formatPoints(currentPurse)}
                        </div>
                        <div
                          role="progressbar"
                          aria-label="Purse spent"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={Math.round(spentRatio * 100)}
                          className="mt-3.5 h-1.5 w-full max-w-md rounded-full bg-surface-2 overflow-hidden"
                        >
                          <div
                            className="h-full w-full rounded-full bg-accent-bright origin-left transition-transform duration-300 motion-reduce:transition-none"
                            style={{ transform: `scaleX(${spentRatio})` }}
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap items-start gap-x-8 gap-y-3 md:shrink-0 md:pb-0.5">
                        <div>
                          <span className="block font-mono text-[11px] uppercase tracking-[0.14em] text-muted mb-0.5">
                            PURSE SPENT
                          </span>
                          <span className="font-mono text-lg sm:text-xl font-bold text-points tabular-nums">
                            {formatPoints(purseSpent)}
                          </span>
                        </div>

                        <div>
                          <span className="block font-mono text-[11px] uppercase tracking-[0.14em] text-muted mb-0.5">
                            ROSTER COUNT
                          </span>
                          <span className="font-mono text-lg sm:text-xl font-bold text-text tabular-nums">
                            {rosterCount}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Mobile primary Share squad button directly under purse stats */}
                    <div className="sm:hidden">
                      <button
                        type="button"
                        onClick={() => void handleShareOwnerSquad(boughtPlayers, ownerSharePayload)}
                        disabled={isSharingOwner}
                        className={`w-full ${PUBLIC_BTN_PRIMARY} px-5 py-3 text-sm`}
                      >
                        {isSharingOwner ? (
                          <CircleNotch
                            size={16}
                            weight="regular"
                            className="animate-spin motion-reduce:animate-none"
                          />
                        ) : (
                          <ShareNetwork size={16} weight="regular" />
                        )}
                        <span>Share squad</span>
                      </button>
                    </div>
                  </div>

                  {/* Max Bid & Role Coverage side by side on wide screens */}
                  <div
                    className={`py-6 border-b border-border grid grid-cols-1 gap-4 ${
                      roleCoverageCounts.length > 0
                        ? 'lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]'
                        : ''
                    }`}
                  >
                    {/* 1. Max Bid Card */}
                    <div className="frost border border-border rounded-2xl p-4 sm:p-5 flex flex-col justify-between gap-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
                          MAX BID
                        </span>

                        {!hasConfiguredMaxSquad && (
                          <div className="inline-flex items-center gap-2">
                            <span className="text-xs text-muted">Target squad size</span>
                            <div className="inline-flex items-center rounded-full bg-surface-2 border border-border p-0.5">
                              <button
                                type="button"
                                aria-label="Decrease target squad size"
                                disabled={effectiveTargetSquadSize <= minTargetSquadSize}
                                onClick={() =>
                                  updateTargetSquadSize(effectiveTargetSquadSize - 1)
                                }
                                className="w-6 h-6 rounded-full inline-flex items-center justify-center text-text hover:bg-surface disabled:opacity-35 cursor-pointer disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright"
                              >
                                <Minus size={12} weight="bold" />
                              </button>
                              <span className="px-2 font-mono text-xs font-bold text-text tabular-nums min-w-[24px] text-center">
                                {effectiveTargetSquadSize}
                              </span>
                              <button
                                type="button"
                                aria-label="Increase target squad size"
                                onClick={() =>
                                  updateTargetSquadSize(effectiveTargetSquadSize + 1)
                                }
                                className="relative hit-44 w-6 h-6 rounded-full inline-flex items-center justify-center text-text hover:bg-surface cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright"
                              >
                                <Plus size={12} weight="bold" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
                        <div className="min-w-0">
                          <span className="block text-[11px] text-muted">Purse left</span>
                          <div className="font-mono text-lg sm:text-xl font-bold text-text tabular-nums mt-0.5">
                            {formatPoints(safeRemaining)}
                          </div>
                        </div>

                        <div className="min-w-0">
                          <span className="block text-[11px] text-muted">Remaining slots</span>
                          <div className="font-mono text-lg sm:text-xl font-bold text-text tabular-nums mt-0.5">
                            {remainingSlots}
                            <span className="text-[11px] font-normal text-muted ml-1">
                              / {activeSquadLimit}
                            </span>
                          </div>
                        </div>

                        <div className="col-span-2 sm:col-span-1 min-w-0">
                          <span className="block text-[11px] text-muted">Max bid</span>
                          {remainingSlots === 0 ? (
                            <div className="font-syne font-bold text-lg sm:text-xl text-text tracking-tight mt-0.5">
                              Squad full
                            </div>
                          ) : (
                            <div className="font-mono text-lg sm:text-xl font-bold text-accent-bright tabular-nums mt-0.5">
                              {formatPoints(maxBidValue)}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="pt-2.5 border-t border-border space-y-1 text-xs text-muted">
                        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
                          <span className="font-mono text-[11px] tabular-nums">
                            Lowest base available:{' '}
                            <span className="text-points font-semibold">
                              {lowestAvailableBaseFromLoaded !== null
                                ? formatPoints(lowestAvailableBaseFromLoaded)
                                : '—'}
                            </span>
                          </span>
                          {isNotEnoughPurse && (
                            <span className="text-error font-medium">
                              Not enough purse to fill the squad
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] leading-snug">
                          {remainingSlots === 0
                            ? `All ${activeSquadLimit} squad slots are filled (${rosterCount} owned).`
                            : `Purse (${formatPoints(safeRemaining)}) minus (${remainingSlots} - 1) remaining ${
                                reserveSlots === 1 ? 'slot' : 'slots'
                              } x ${formatPoints(effectiveMinBase)} lowest base available.`}
                        </p>
                      </div>
                    </div>

                    {/* 2. Role Coverage */}
                    {roleCoverageCounts.length > 0 && (
                      <div className="frost border border-border rounded-2xl p-4 sm:p-5 flex flex-col justify-between gap-3">
                        <span className="block font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
                          ROLE COVERAGE
                        </span>
                        <div className="flex flex-wrap items-center gap-2 my-auto">
                          {roleCoverageCounts.map(({ role, count }) => (
                            <div
                              key={role}
                              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-surface-2 border border-border"
                            >
                              <span className="text-xs text-muted">{role}</span>
                              <span className="font-mono text-xs font-bold text-text tabular-nums">
                                {count}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Merged Players Bought & Purchases Timeline */}
                  <div className="pt-6">
                    <div className="flex items-center justify-between gap-3 pb-3 border-b border-border mb-4">
                      <h3 className={PUBLIC_SECTION_TITLE}>Players Bought</h3>
                      <span className={PUBLIC_COUNT_PILL}>{mergedPurchases.length}</span>
                    </div>

                    {mergedPurchases.length === 0 ? (
                      <p className={`${PUBLIC_WELL} px-4 py-6 text-xs text-muted text-center`}>
                        No players acquired yet.
                      </p>
                    ) : (
                      <ul className="space-y-2.5">
                        {mergedPurchases.map((entry) => {
                          const showPhoto =
                            Boolean(entry.photo_url) &&
                            !failedBoughtPhotoUrls[entry.photo_url as string]
                          return (
                            <li
                              key={entry.key}
                              className={`${PUBLIC_WELL} px-3.5 py-3 sm:px-4 flex items-center justify-between gap-3`}
                            >
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                {showPhoto && (
                                  <img
                                    src={entry.photo_url as string}
                                    alt={entry.name}
                                    width={40}
                                    height={40}
                                    loading="lazy"
                                    decoding="async"
                                    referrerPolicy="no-referrer"
                                    onError={() => {
                                      if (entry.photo_url) {
                                        setFailedBoughtPhotoUrls((prev) =>
                                          prev[entry.photo_url as string]
                                            ? prev
                                            : { ...prev, [entry.photo_url as string]: true }
                                        )
                                      }
                                    }}
                                    className="w-10 h-10 rounded-xl object-cover bg-surface-2 border border-border shrink-0"
                                  />
                                )}
                                <div className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-surface-2 border border-border font-mono text-[11px] font-semibold text-accent-bright tabular-nums shrink-0">
                                      #{entry.athlete_code}
                                    </span>
                                    <span className="font-syne font-bold text-sm text-text truncate">
                                      {entry.name}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-xs text-muted truncate">
                                      {entry.playing_role}
                                    </span>
                                    {entry.timeLabel && (
                                      <span className="font-mono text-[11px] text-muted tabular-nums shrink-0">
                                        {entry.timeLabel}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="flex flex-col items-end shrink-0 text-right">
                                <span className="font-mono text-xs sm:text-sm font-semibold text-points tabular-nums">
                                  {formatPoints(entry.price)}
                                </span>
                                <span className="font-mono text-[11px] text-muted tabular-nums">
                                  Purse after {formatPoints(entry.purseAfter)}
                                </span>
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>

                  {/* Private Owner Shortlist */}
                  <div className="pt-6 mt-6 border-t border-border">
                    <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border mb-4">
                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                        <h3 className={PUBLIC_SECTION_TITLE}>Shortlist</h3>
                        <span className={PUBLIC_COUNT_PILL}>{enrichedShortlist.length}</span>
                        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted px-2.5 py-0.5 rounded-full bg-surface-2 border border-border">
                          Private
                        </span>
                        {isLoadingShortlist && (
                          <CircleNotch
                            size={14}
                            weight="regular"
                            className="text-muted animate-spin motion-reduce:animate-none"
                          />
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => setIsShortlistPickerOpen((prev) => !prev)}
                        className={`relative hit-44 ${PUBLIC_BTN_SECONDARY} px-3.5 py-1.5 text-xs shrink-0`}
                      >
                        {isShortlistPickerOpen ? (
                          <>
                            <X size={13} weight="bold" />
                            <span>Done</span>
                          </>
                        ) : (
                          <>
                            <Star size={13} weight="regular" className="text-accent-bright" />
                            <span>Star available players</span>
                          </>
                        )}
                      </button>
                    </div>

                    {isShortlistPickerOpen && (
                      <div className="frost border border-border rounded-2xl p-3.5 sm:p-4 mb-4 space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
                          <div className="relative flex-1 min-w-0">
                            <MagnifyingGlass
                              size={14}
                              weight="regular"
                              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
                            />
                            <input
                              type="text"
                              value={shortlistSearch}
                              onChange={(e) => setShortlistSearch(e.target.value)}
                              placeholder="Search available players by name, ID, or role..."
                              className="w-full min-h-[38px] pl-9 pr-3.5 rounded-2xl bg-bg border border-border text-xs text-text placeholder:text-muted focus:outline-none focus:border-accent-bright"
                            />
                          </div>

                          {hasOtherSports && (
                            <div className={`${PUBLIC_PILL_BAR} self-start shrink-0`}>
                              <button
                                type="button"
                                onClick={() => setShortlistScope('team_sport')}
                                className={`relative hit-44 px-3 py-1 rounded-full text-[11px] font-medium transition-colors cursor-pointer ${
                                  shortlistScope === 'team_sport'
                                    ? 'bg-btn-bg text-btn-fg'
                                    : 'text-muted hover:text-text'
                                }`}
                              >
                                {team.sport}
                              </button>
                              <button
                                type="button"
                                onClick={() => setShortlistScope('all')}
                                className={`relative hit-44 px-3 py-1 rounded-full text-[11px] font-medium transition-colors cursor-pointer ${
                                  shortlistScope === 'all'
                                    ? 'bg-btn-bg text-btn-fg'
                                    : 'text-muted hover:text-text'
                                }`}
                              >
                                All sports
                              </button>
                            </div>
                          )}
                        </div>

                        {availableSeasonPlayers.length === 0 ? (
                          <p className="text-xs text-muted text-center py-3">
                            No available players match this filter.
                          </p>
                        ) : (
                          <ul className="max-h-56 overflow-y-auto thin-scrollbar space-y-2 pr-0.5">
                            {availableSeasonPlayers.map(
                              ({ player, athleteCode, basePoints, isStarred }) => {
                                const isBusy = shortlistBusyKey === player.id
                                return (
                                  <li
                                    key={player.id}
                                    className={`${PUBLIC_WELL} px-3.5 py-2.5 flex items-center justify-between gap-2.5`}
                                  >
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2 min-w-0">
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-surface-2 border border-border font-mono text-[10px] font-semibold text-accent-bright tabular-nums shrink-0">
                                          #{athleteCode}
                                        </span>
                                        <span className="font-syne font-bold text-xs sm:text-sm text-text truncate">
                                          {player.name}
                                        </span>
                                      </div>
                                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted mt-0.5">
                                        <span>{player.playing_role}</span>
                                        {shortlistScope === 'all' && (
                                          <span>· {player.sport}</span>
                                        )}
                                        {basePoints !== null && (
                                          <span className="font-mono tabular-nums text-points font-semibold">
                                            · Base {formatPoints(basePoints)}
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    <button
                                      type="button"
                                      onClick={() => void handleToggleShortlist(player.id)}
                                      disabled={Boolean(shortlistBusyKey)}
                                      aria-label={
                                        isStarred
                                          ? `Remove ${player.name} from shortlist`
                                          : `Add ${player.name} to shortlist`
                                      }
                                      className={`inline-flex items-center gap-1 px-3 py-1 rounded-full border text-xs font-medium transition-colors cursor-pointer disabled:opacity-45 shrink-0 ${
                                        isStarred
                                          ? 'bg-accent/15 border-accent-bright/40 text-accent-bright'
                                          : 'bg-surface-2 border-border text-muted hover:text-text hover:border-accent-bright/40'
                                      }`}
                                    >
                                      {isBusy ? (
                                        <CircleNotch
                                          size={13}
                                          weight="regular"
                                          className="animate-spin motion-reduce:animate-none"
                                        />
                                      ) : (
                                        <Star
                                          size={13}
                                          weight={isStarred ? 'fill' : 'regular'}
                                        />
                                      )}
                                      <span>{isStarred ? 'Starred' : 'Star'}</span>
                                    </button>
                                  </li>
                                )
                              }
                            )}
                          </ul>
                        )}
                      </div>
                    )}

                    {enrichedShortlist.length === 0 ? (
                      <p className={`${PUBLIC_WELL} px-4 py-6 text-xs text-muted text-center`}>
                        No players shortlisted yet. Star available players to track targets and private notes.
                      </p>
                    ) : (
                      <ul className="space-y-2.5">
                        {enrichedShortlist.map((item) => {
                          const isEditingNote = editingNoteRowId === item.row.id
                          const isRowBusy =
                            shortlistBusyKey === item.row.id ||
                            shortlistBusyKey === item.row.player_id
                          const showPhoto =
                            Boolean(item.photoUrl) &&
                            !failedBoughtPhotoUrls[item.photoUrl as string]
                          const statusLabel = item.isSold
                            ? 'Sold'
                            : item.status === 'unsold'
                            ? 'Unsold'
                            : 'Available'

                          return (
                            <li
                              key={item.row.id}
                              className={`${PUBLIC_WELL} px-3.5 py-3 sm:px-4 space-y-2 transition-opacity ${
                                item.isSold ? 'opacity-55' : ''
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2.5">
                                <div className="flex items-start gap-3 min-w-0 flex-1">
                                  {showPhoto && (
                                    <img
                                      src={item.photoUrl as string}
                                      alt={item.name}
                                      width={40}
                                      height={40}
                                      loading="lazy"
                                      decoding="async"
                                      referrerPolicy="no-referrer"
                                      onError={() => {
                                        if (item.photoUrl) {
                                          setFailedBoughtPhotoUrls((prev) =>
                                            prev[item.photoUrl as string]
                                              ? prev
                                              : { ...prev, [item.photoUrl as string]: true }
                                          )
                                        }
                                      }}
                                      className={`w-10 h-10 rounded-xl object-cover bg-surface-2 border border-border shrink-0 mt-0.5 ${
                                        item.isSold ? 'grayscale' : ''
                                      }`}
                                    />
                                  )}

                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                      {item.athleteCode && (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-surface-2 border border-border font-mono text-[11px] font-semibold text-accent-bright tabular-nums shrink-0">
                                          #{item.athleteCode}
                                        </span>
                                      )}
                                      <span className="font-syne font-bold text-sm text-text truncate">
                                        {item.name}
                                      </span>
                                      <span
                                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border font-mono text-[10px] uppercase tracking-wider shrink-0 ${
                                          item.isSold
                                            ? 'bg-surface-2 border-border text-muted'
                                            : item.status === 'available'
                                            ? 'bg-accent/10 border-accent-bright/30 text-accent-bright font-medium'
                                            : 'bg-surface-2 border-border text-muted'
                                        }`}
                                      >
                                        {!item.isSold && (
                                          <span
                                            aria-hidden="true"
                                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                              item.status === 'available'
                                                ? 'bg-accent-bright'
                                                : 'bg-muted'
                                            }`}
                                          />
                                        )}
                                        <span>{statusLabel}</span>
                                      </span>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-muted mt-0.5">
                                      <span>{item.playingRole}</span>
                                      <span className="font-mono text-[11px] tabular-nums">
                                        Base{' '}
                                        <span className="text-points font-semibold">
                                          {item.basePoints !== null
                                            ? formatPoints(item.basePoints)
                                            : '—'}
                                        </span>
                                      </span>
                                    </div>

                                    {!isEditingNote && item.row.note && (
                                      <p className="text-xs text-muted mt-1.5 break-words leading-snug">
                                        {item.row.note}
                                      </p>
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  {!isEditingNote && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingNoteRowId(item.row.id)
                                        setEditingNoteValue(item.row.note || '')
                                      }}
                                      disabled={Boolean(shortlistBusyKey)}
                                      aria-label={
                                        item.row.note
                                          ? `Edit note for ${item.name}`
                                          : `Add note for ${item.name}`
                                      }
                                      className={`${PUBLIC_BTN_SECONDARY} px-2.5 py-1 text-[11px] text-muted hover:text-text disabled:opacity-45`}
                                    >
                                      <PencilSimple size={12} weight="regular" />
                                      <span className="hidden sm:inline">
                                        {item.row.note ? 'Edit note' : 'Note'}
                                      </span>
                                    </button>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() => void handleToggleShortlist(item.row.player_id)}
                                    disabled={Boolean(shortlistBusyKey)}
                                    aria-label={`Remove ${item.name} from shortlist`}
                                    className="relative hit-44 w-7 h-7 rounded-full bg-surface-2 border border-border inline-flex items-center justify-center text-accent-bright hover:border-accent-bright/50 transition-colors cursor-pointer disabled:opacity-45 shrink-0"
                                  >
                                    {isRowBusy ? (
                                      <CircleNotch
                                        size={13}
                                        weight="regular"
                                        className="animate-spin motion-reduce:animate-none"
                                      />
                                    ) : (
                                      <Star size={14} weight="fill" />
                                    )}
                                  </button>
                                </div>
                              </div>

                              {isEditingNote && (
                                <form
                                  onSubmit={(e) => {
                                    e.preventDefault()
                                    void handleSaveShortlistNote(item.row.id)
                                  }}
                                  className="pt-2.5 border-t border-border space-y-2"
                                >
                                  <input
                                    type="text"
                                    maxLength={SHORTLIST_NOTE_MAX}
                                    value={editingNoteValue}
                                    onChange={(e) => setEditingNoteValue(e.target.value)}
                                    placeholder="Optional private note (max 140 characters)..."
                                    className="w-full min-h-[38px] px-3.5 rounded-2xl bg-surface border border-border text-xs text-text placeholder:text-muted focus:outline-none focus:border-accent-bright"
                                  />
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-mono text-[11px] text-muted tabular-nums">
                                      {editingNoteValue.length} / {SHORTLIST_NOTE_MAX}
                                    </span>
                                    <div className="flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingNoteRowId(null)
                                          setEditingNoteValue('')
                                        }}
                                        disabled={isRowBusy}
                                        className={`${PUBLIC_BTN_SECONDARY} px-3 py-1 text-xs text-muted hover:text-text`}
                                      >
                                        Cancel
                                      </button>
                                      <button
                                        type="submit"
                                        disabled={isRowBusy}
                                        className={`relative hit-44 ${PUBLIC_BTN_SECONDARY} px-3.5 py-1 text-xs border-accent-bright/40 text-accent-bright hover:border-accent-bright disabled:opacity-50`}
                                      >
                                        {isRowBusy ? (
                                          <CircleNotch
                                            size={12}
                                            weight="regular"
                                            className="animate-spin motion-reduce:animate-none"
                                          />
                                        ) : (
                                          <Check size={12} weight="bold" />
                                        )}
                                        <span>Save</span>
                                      </button>
                                    </div>
                                  </div>
                                </form>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              )
            })()}

            {/* Team Roster Squad (flat on --bg, no card-inside-card nesting) */}
            <section className="space-y-8">
              <div className={`${PUBLIC_SECTION_HEADER} items-center`}>
                <div className="flex items-baseline gap-3">
                  <span className={PUBLIC_FOLIO}>01</span>
                  <h2 className={`${PUBLIC_SECTION_TITLE} flex items-center gap-2.5`}>
                    <Users size={19} weight="regular" className="text-accent-bright shrink-0" />
                    <span>Squad Roster</span>
                  </h2>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <span className="font-mono text-xs tabular-nums text-muted">
                    {teamPlayers.length} {teamPlayers.length === 1 ? 'player' : 'players'}
                  </span>
                  {!ownerOverview && (
                    <button
                      type="button"
                      onClick={() => void handleSharePublicSquad()}
                      disabled={isSharingPublic}
                      className={`${PUBLIC_BTN_PRIMARY} px-4 py-2 text-xs whitespace-nowrap shrink-0`}
                    >
                      {isSharingPublic ? (
                        <CircleNotch
                          size={14}
                          weight="regular"
                          className="animate-spin motion-reduce:animate-none"
                        />
                      ) : (
                        <ShareNetwork size={14} weight="regular" />
                      )}
                      <span>Share squad</span>
                    </button>
                  )}
                </div>
              </div>

              {teamPlayers.length === 0 ? (
                <EmptyState
                  icon={Users}
                  statusLabel="AWAITING LOT"
                  title="No Players Drafted"
                  description="No players have been drafted into this team roster yet."
                />
              ) : (
                <div className="space-y-9">
                  {(() => {
                    const orderedRoleKeys = [
                      ...sportRoles,
                      ...Array.from(
                        new Set(
                          teamPlayers
                            .map((p) => p.playing_role)
                            .filter(
                              (r) =>
                                !sportRoles.some(
                                  (sr) => sr.toLowerCase() === r.toLowerCase()
                                )
                            )
                        )
                      )
                    ]

                    const groups = orderedRoleKeys
                      .map((role) => ({
                        role,
                        players: teamPlayers.filter(
                          (p) => p.playing_role.toLowerCase() === role.toLowerCase()
                        )
                      }))
                      .filter((g) => g.players.length > 0)

                    return groups.map((group, groupIndex) => (
                      <div key={group.role} className="space-y-4">
                        <div className="flex items-baseline justify-between gap-3 pb-2.5 border-b border-border">
                          <div className="flex items-baseline gap-2.5">
                            <span className={PUBLIC_FOLIO}>
                              {String(groupIndex + 1).padStart(2, '0')}
                            </span>
                            <h3 className="font-syne font-bold text-base sm:text-lg text-text tracking-tight">
                              {group.role}
                            </h3>
                          </div>
                          <span className="font-mono text-xs tabular-nums text-muted">
                            {group.players.length}{' '}
                            {group.players.length === 1 ? 'player' : 'players'}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          {group.players.map((p) => {
                            const athleteSports = p.athlete_id
                              ? sportsByAthleteId.get(p.athlete_id)
                              : undefined
                            const otherSports = athleteSports
                              ? athleteSports.filter((sp) => sp !== p.sport)
                              : []

                            return (
                              <RosterPlayerCard
                                key={p.id}
                                player={{
                                  id: p.id,
                                  player_code: p.player_code,
                                  athlete_code: p.athlete_code,
                                  name: p.name,
                                  sport: p.sport,
                                  playing_role: p.playing_role,
                                  academic_year: p.academic_year,
                                  season_id: p.season_id,
                                  photo_url: p.photo_url,
                                  photo_thumb_url: p.photo_thumb_url,
                                  purchase_price: p.purchase_price,
                                  base_points: p.base_points
                                }}
                                team={team}
                                otherSports={otherSports}
                              />
                            )
                          })}
                        </div>
                      </div>
                    ))
                  })()}
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  )
}
