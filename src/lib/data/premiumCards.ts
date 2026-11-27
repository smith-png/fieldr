import { supabase } from './client'

export async function getPremiumPlayerIds(seasonId: string): Promise<string[]> {
  if (!seasonId || !supabase) return []

  try {
    const { data, error } = await supabase
      .from('premium_cards')
      .select('player_id')
      .eq('season_id', seasonId)

    if (error || !Array.isArray(data)) {
      return []
    }

    const ids = new Set<string>()
    for (const row of data as Array<{ player_id?: unknown }>) {
      if (typeof row?.player_id === 'string' && row.player_id.length > 0) {
        ids.add(row.player_id)
      }
    }
    return Array.from(ids)
  } catch {
    return []
  }
}

export async function setPlayerPremium(
  seasonId: string,
  playerId: string,
  isPremium: boolean
): Promise<void> {
  if (!supabase) {
    throw new Error('Supabase client is not configured')
  }
  if (!seasonId || !playerId) {
    throw new Error('Season ID and player ID are required')
  }

  if (isPremium) {
    const { error } = await supabase
      .from('premium_cards')
      .insert({ season_id: seasonId, player_id: playerId })

    // Treat duplicate key (23505) as idempotent success
    if (error && error.code !== '23505') {
      throw new Error(error.message || 'Failed to mark player as premium')
    }
    return
  }

  const { error } = await supabase
    .from('premium_cards')
    .delete()
    .eq('season_id', seasonId)
    .eq('player_id', playerId)

  if (error) {
    throw new Error(error.message || 'Failed to remove premium status')
  }
}
