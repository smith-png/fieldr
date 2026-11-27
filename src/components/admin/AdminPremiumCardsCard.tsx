import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { MagnifyingGlass, Star, Trash, X } from '@phosphor-icons/react'
import { getActiveSeason, getPlayers } from '../../lib/data'
import { getPremiumPlayerIds, setPlayerPremium } from '../../lib/data/premiumCards'
import { getErrorMessage } from '../../lib/errors'
import { useToast } from '../../lib/ToastContext'
import type { Player, Season } from '../../types'
import { Button, Dialog, EmptyState, SkeletonBlock } from '../ui'
import {
  ADMIN_CARD,
  ADMIN_CARD_HEADER,
  ADMIN_CARD_TITLE,
  ADMIN_COUNT_PILL,
  ADMIN_DIALOG_CLASS,
  ADMIN_INPUT,
  ADMIN_TABLE_SHELL
} from './adminStyles'

interface AdminPremiumCardsCardProps {
  activeSeason?: Season | null
}

export const AdminPremiumCardsCard: React.FC<AdminPremiumCardsCardProps> = ({
  activeSeason
}) => {
  const { showToast } = useToast()

  const [resolvedSeason, setResolvedSeason] = useState<Season | null>(activeSeason ?? null)
  const [players, setPlayers] = useState<Player[]>([])
  const [premiumIds, setPremiumIds] = useState<Set<string>>(() => new Set())
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set())
  const [isLoading, setIsLoading] = useState(true)
  const [isClearing, setIsClearing] = useState(false)
  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSport, setSelectedSport] = useState<string>('all')

  // Sync season prop or fall back to getActiveSeason() if prop is omitted
  useEffect(() => {
    if (activeSeason !== undefined) {
      setResolvedSeason(activeSeason)
      return
    }

    let cancelled = false
    getActiveSeason()
      .then((season) => {
        if (!cancelled) setResolvedSeason(season)
      })
      .catch(() => {
        if (!cancelled) setResolvedSeason(null)
      })
    return () => {
      cancelled = true
    }
  }, [activeSeason])

  const seasonId = resolvedSeason?.id ?? null

  const loadData = useCallback(async () => {
    if (!seasonId) {
      setPlayers([])
      setPremiumIds(new Set())
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    try {
      const [seasonPlayers, storedPremiumIds] = await Promise.all([
        getPlayers(seasonId),
        getPremiumPlayerIds(seasonId)
      ])
      const sortedPlayers = seasonPlayers
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
      setPlayers(sortedPlayers)
      setPremiumIds(new Set(storedPremiumIds))
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to load players'), 'error')
      setPlayers([])
      setPremiumIds(new Set())
    } finally {
      setIsLoading(false)
    }
  }, [seasonId, showToast])

  useEffect(() => {
    setSelectedSport('all')
    setSearchQuery('')
    void loadData()
  }, [loadData])

  const sports = useMemo(() => {
    const unique = new Set<string>()
    for (const player of players) {
      if (player.sport) unique.add(player.sport)
    }
    return Array.from(unique).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' })
    )
  }, [players])

  const filteredPlayers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return players.filter((player) => {
      if (selectedSport !== 'all' && player.sport !== selectedSport) {
        return false
      }
      if (!q) return true
      return (
        player.name.toLowerCase().includes(q) ||
        player.sport.toLowerCase().includes(q) ||
        player.playing_role.toLowerCase().includes(q) ||
        player.player_code.toLowerCase().includes(q)
      )
    })
  }, [players, searchQuery, selectedSport])

  const activePremiumCount = useMemo(() => {
    if (players.length === 0) return premiumIds.size
    let count = 0
    for (const player of players) {
      if (premiumIds.has(player.id)) count += 1
    }
    return count
  }, [players, premiumIds])

  const handleTogglePremium = async (player: Player) => {
    if (!seasonId || isClearing || pendingIds.has(player.id)) return

    const wasPremium = premiumIds.has(player.id)
    const nextIsPremium = !wasPremium

    setPendingIds((prev) => {
      const next = new Set(prev)
      next.add(player.id)
      return next
    })
    setPremiumIds((prev) => {
      const next = new Set(prev)
      if (nextIsPremium) {
        next.add(player.id)
      } else {
        next.delete(player.id)
      }
      return next
    })

    try {
      await setPlayerPremium(seasonId, player.id, nextIsPremium)
    } catch (err) {
      setPremiumIds((prev) => {
        const rollback = new Set(prev)
        if (wasPremium) {
          rollback.add(player.id)
        } else {
          rollback.delete(player.id)
        }
        return rollback
      })
      showToast(
        getErrorMessage(err, `Failed to update premium status for ${player.name}`),
        'error'
      )
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev)
        next.delete(player.id)
        return next
      })
    }
  }

  const handleConfirmClearAll = async () => {
    if (!seasonId || isClearing) return

    const idsToClear = Array.from(premiumIds)
    setIsClearDialogOpen(false)
    if (idsToClear.length === 0) return

    setIsClearing(true)
    setPremiumIds(new Set())

    try {
      const results = await Promise.allSettled(
        idsToClear.map((playerId) => setPlayerPremium(seasonId, playerId, false))
      )

      const failedIds: string[] = []
      let firstError: unknown = null
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          failedIds.push(idsToClear[index])
          if (!firstError) firstError = result.reason
        }
      })

      if (failedIds.length > 0) {
        setPremiumIds((prev) => {
          const restored = new Set(prev)
          for (const id of failedIds) restored.add(id)
          return restored
        })
        showToast(
          getErrorMessage(firstError, 'Failed to clear all premium cards'),
          'error'
        )
      } else {
        showToast('Cleared all premium cards', 'success')
      }
    } finally {
      setIsClearing(false)
    }
  }

  return (
    <section className={ADMIN_CARD}>
      <div className={ADMIN_CARD_HEADER}>
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className={ADMIN_CARD_TITLE}>Premium cards</h2>
            <span className={ADMIN_COUNT_PILL}>{activePremiumCount} premium</span>
          </div>
          <p className="text-sm text-muted">
            {resolvedSeason
              ? `Choose which ${resolvedSeason.name} athletes appear as premium foil cards.`
              : 'Select an active season to manage premium cards.'}
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          leftIcon={Trash}
          disabled={!seasonId || activePremiumCount === 0 || isLoading || isClearing}
          isLoading={isClearing}
          onClick={() => setIsClearDialogOpen(true)}
          className="rounded-full shrink-0"
        >
          Clear all
        </Button>
      </div>

      {!seasonId ? (
        <EmptyState
          icon={Star}
          title="No active season"
          description="Create or activate a season to configure premium cards."
        />
      ) : isLoading ? (
        <div className="space-y-3">
          <SkeletonBlock className="h-11 w-full rounded-xl" />
          <div className="flex gap-2">
            <SkeletonBlock className="h-9 w-16 rounded-full" />
            <SkeletonBlock className="h-9 w-24 rounded-full" />
            <SkeletonBlock className="h-9 w-24 rounded-full" />
          </div>
          <SkeletonBlock className="h-64 w-full rounded-2xl" />
        </div>
      ) : players.length === 0 ? (
        <EmptyState
          icon={Star}
          title="No players in this season"
          description="Add athletes to the active season before marking premium cards."
        />
      ) : (
        <div className="space-y-4">
          {/* Search box */}
          <div className="relative">
            <MagnifyingGlass
              size={16}
              weight="bold"
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search athletes by name, sport, or role..."
              aria-label="Search athletes"
              className={`${ADMIN_INPUT} pl-10 pr-10`}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:text-text hover:bg-surface-2 transition-colors cursor-pointer"
              >
                <X size={15} weight="bold" aria-hidden="true" />
              </button>
            )}
          </div>

          {/* Sport filter chips */}
          {sports.length > 1 && (
            <div
              role="group"
              aria-label="Filter by sport"
              className="flex flex-wrap items-center gap-2"
            >
              <button
                type="button"
                onClick={() => setSelectedSport('all')}
                aria-pressed={selectedSport === 'all'}
                className={`min-h-[36px] px-3.5 rounded-full border text-xs font-medium transition-colors cursor-pointer ${
                  selectedSport === 'all'
                    ? 'bg-text text-bg border-text'
                    : 'bg-bg text-muted border-border hover:text-text hover:bg-surface-2'
                }`}
              >
                All
              </button>
              {sports.map((sport) => {
                const isSelected = selectedSport === sport
                return (
                  <button
                    key={sport}
                    type="button"
                    onClick={() => setSelectedSport(sport)}
                    aria-pressed={isSelected}
                    className={`min-h-[36px] px-3.5 rounded-full border text-xs font-medium transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-text text-bg border-text'
                        : 'bg-bg text-muted border-border hover:text-text hover:bg-surface-2'
                    }`}
                  >
                    {sport}
                  </button>
                )
              })}
            </div>
          )}

          {/* Player rows (44px touch targets) */}
          {filteredPlayers.length === 0 ? (
            <div className={`${ADMIN_TABLE_SHELL} px-4 py-8 text-center text-sm text-muted`}>
              No athletes match your current filter.
            </div>
          ) : (
            <div className={`${ADMIN_TABLE_SHELL} max-h-[420px] overflow-y-auto`}>
              <ul className="divide-y divide-border" aria-label="Season players">
                {filteredPlayers.map((player) => {
                  const isPremium = premiumIds.has(player.id)
                  const isPending = pendingIds.has(player.id)
                  return (
                    <li
                      key={player.id}
                      className="flex items-center justify-between gap-3 min-h-[44px] px-4 py-1.5 hover:bg-surface-2/60 transition-colors"
                    >
                      <div className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-center sm:gap-3">
                        <span className="text-sm font-medium text-text truncate">
                          {player.name}
                        </span>
                        <div className="flex items-center gap-2 text-xs text-muted min-w-0">
                          <span className="truncate">{player.sport}</span>
                          {player.playing_role && (
                            <>
                              <span aria-hidden="true" className="text-border">
                                /
                              </span>
                              <span className="truncate">{player.playing_role}</span>
                            </>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => void handleTogglePremium(player)}
                        disabled={isPending || isClearing}
                        aria-pressed={isPremium}
                        aria-label={
                          isPremium
                            ? `Remove ${player.name} from premium cards`
                            : `Mark ${player.name} as premium card`
                        }
                        className={`inline-flex h-[44px] w-[44px] -mr-2 items-center justify-center rounded-full transition-colors cursor-pointer shrink-0 disabled:opacity-50 disabled:cursor-not-allowed ${
                          isPremium
                            ? 'text-accent-bright hover:bg-accent-bright/10'
                            : 'text-muted hover:text-text hover:bg-surface-2'
                        }`}
                      >
                        <Star
                          size={19}
                          weight={isPremium ? 'fill' : 'regular'}
                          aria-hidden="true"
                        />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      )}

      <Dialog
        isOpen={isClearDialogOpen}
        onClose={() => setIsClearDialogOpen(false)}
        title="Clear all premium cards"
        description={`Remove premium status from all ${activePremiumCount} selected ${
          activePremiumCount === 1 ? 'athlete' : 'athletes'
        } for this season?`}
        size="sm"
        className={ADMIN_DIALOG_CLASS}
      >
        <div className="mt-5 flex items-center justify-end gap-2.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsClearDialogOpen(false)}
            className="rounded-full"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            size="sm"
            onClick={() => void handleConfirmClearAll()}
            className="rounded-full"
          >
            Clear all
          </Button>
        </div>
      </Dialog>
    </section>
  )
}
