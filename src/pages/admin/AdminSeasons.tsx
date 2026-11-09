import React, { useState } from 'react'
import { Calendar, CheckCircle, Plus } from '@phosphor-icons/react'
import type { Season } from '../../lib/types'
import { createSeason, setActiveSeason } from '../../lib/data'
import { useToast } from '../../lib/ToastContext'

interface AdminSeasonsProps {
  seasons: Season[]
  activeSeason: Season | null
  onRefresh: () => Promise<void>
}

export const AdminSeasons: React.FC<AdminSeasonsProps> = ({
  seasons,
  activeSeason,
  onRefresh
}) => {
  const { success, error } = useToast()
  const [newSeasonName, setNewSeasonName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newSeasonName.trim()) return

    try {
      setIsSubmitting(true)
      const created = await createSeason(newSeasonName.trim())
      setNewSeasonName('')
      success(`Season "${created.name}" created successfully`)
      await onRefresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create season'
      error(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSetActive = async (id: string, name: string) => {
    try {
      await setActiveSeason(id)
      success(`"${name}" is now the active tournament`)
      await onRefresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to set active season'
      error(msg)
    }
  }

  return (
    <div className="flex flex-col gap-8 max-w-4xl">
      {/* Header */}
      <div>
        <span className="text-xs font-mono uppercase tracking-widest text-[#047554] block mb-1">
          Season Management
        </span>
        <h1 className="font-syne font-bold text-3xl sm:text-4xl text-white tracking-tight">
          Tournament Seasons
        </h1>
        <p className="text-xs sm:text-sm text-[#8E928C] mt-1">
          Configure academic calendar sports seasons. The active season controls all player, team, and projector views.
        </p>
      </div>

      {/* Create Season Card */}
      <div className="p-6 rounded-3xl bg-[#141414] border border-white/10">
        <h2 className="font-syne font-bold text-lg text-white mb-3">
          Create New Season
        </h2>
        <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={newSeasonName}
            onChange={(e) => setNewSeasonName(e.target.value)}
            placeholder="e.g. DRGMC Annual Sports 2027"
            required
            className="flex-1 px-4 py-3 bg-[#0B0B0B] border border-white/10 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#047554]"
          />
          <button
            type="submit"
            disabled={isSubmitting || !newSeasonName.trim()}
            className="min-h-[44px] px-6 py-3 rounded-xl bg-white text-[#0B0B0B] font-medium text-xs sm:text-sm hover:bg-[#F0F2EE] transition-all disabled:opacity-50 flex items-center justify-center gap-2 shrink-0"
          >
            <Plus size={16} weight="bold" />
            <span>{isSubmitting ? 'Creating...' : 'Create Season'}</span>
          </button>
        </form>
      </div>

      {/* Seasons List */}
      <div className="flex flex-col gap-3">
        <h2 className="text-xs font-mono uppercase tracking-wider text-[#8E928C]">
          All Seasons ({seasons.length})
        </h2>

        {seasons.map((season) => {
          const isActive = season.is_active || season.id === activeSeason?.id
          return (
            <div
              key={season.id}
              className={`p-4 sm:p-5 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                isActive
                  ? 'bg-[#19241B] border-[#047554]'
                  : 'bg-[#141414] border-white/10 hover:border-white/20'
              }`}
            >
              <div className="flex items-center gap-3.5">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    isActive ? 'bg-[#047554] text-white' : 'bg-white/5 text-[#8E928C]'
                  }`}
                >
                  <Calendar size={20} weight={isActive ? 'fill' : 'regular'} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-syne font-bold text-base text-white">
                      {season.name}
                    </span>
                    {isActive && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-[#047554]/30 text-[#047554] border border-[#047554]/50">
                        Active
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[#8E928C] mt-0.5">
                    Created on {new Date(season.created_at).toLocaleDateString()}
                  </div>
                </div>
              </div>

              {!isActive && (
                <button
                  type="button"
                  onClick={() => handleSetActive(season.id, season.name)}
                  className="min-h-[44px] px-4 py-2 rounded-xl border border-white/10 hover:border-[#047554] text-xs font-medium text-[#CBD1CB] hover:text-white transition-colors self-start sm:self-auto"
                >
                  Set as Active
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
