import type { PurseTransaction, PurseTransactionType } from '../../types'
import { AppError } from '../errors'
import { supabase, markLocalMutation } from './client'
import type { PursesService } from './types'

const PURSE_TX_COLS =
  'id, season_id, team_id, type, amount, balance_after, reason, created_at, created_by'

const supabasePursesService: PursesService = {
  async getPurseTransactions(
    seasonId: string,
    teamId?: string
  ): Promise<PurseTransaction[]> {
    if (!supabase) return []
    let query = supabase
      .from('purse_transactions')
      .select(PURSE_TX_COLS)
      .eq('season_id', seasonId)
      .order('created_at', { ascending: false })

    if (teamId) {
      query = query.eq('team_id', teamId)
    }

    const { data, error } = await query
    if (error) throw new AppError(error.message, { original: error })
    return (data as PurseTransaction[]) || []
  },

  async executePurseTransaction(
    seasonId: string,
    teamId: string,
    type: PurseTransactionType,
    amount: number,
    reason?: string
  ): Promise<PurseTransaction> {
    if (amount < 0 && (type === 'add' || type === 'deduct')) {
      throw new AppError('Transaction amount must be positive')
    }

    if (!supabase) throw new AppError('Supabase not configured')

    markLocalMutation(['teams', 'auction'])
    const { data: newBalance, error: rpcErr } = await supabase.rpc(
      'execute_purse_transaction',
      {
        p_team_id: teamId,
        p_season_id: seasonId,
        p_type: type,
        p_amount: amount,
        p_reason: reason || `Purse ${type} action`,
        p_created_by: 'admin'
      }
    )

    if (rpcErr) throw new AppError(rpcErr.message, { original: rpcErr })
    markLocalMutation(['teams', 'auction'])

    const { data: txList } = await supabase
      .from('purse_transactions')
      .select(PURSE_TX_COLS)
      .eq('team_id', teamId)
      .order('created_at', { ascending: false })
      .limit(1)

    const latestTx = txList?.[0] as PurseTransaction
    if (!latestTx) {
      return {
        id: `tx-${Date.now()}`,
        season_id: seasonId,
        team_id: teamId,
        type,
        amount,
        balance_after: typeof newBalance === 'number' ? newBalance : 0,
        reason,
        created_at: new Date().toISOString(),
        created_by: 'admin'
      }
    }
    return latestTx
  },

  async resetAllPurses(
    seasonId: string,
    startingAmount: number,
    reason = 'Global starting purse reset'
  ): Promise<void> {
    if (startingAmount < 0) {
      throw new AppError('Starting amount must be non-negative')
    }

    if (!supabase) throw new AppError('Supabase not configured')

    markLocalMutation(['teams', 'auction'])
    const { error } = await supabase.rpc('reset_all_purses', {
      p_season_id: seasonId,
      p_starting_amount: startingAmount,
      p_reason: reason
    })

    if (error) throw new AppError(error.message, { original: error })
    markLocalMutation(['teams', 'auction'])
  }
}

export const pursesService: PursesService = supabasePursesService

export const getPurseTransactions = (seasonId: string, teamId?: string) =>
  pursesService.getPurseTransactions(seasonId, teamId)

// Backward-compatible executePurseTransaction returning { newBalance, transaction }
export async function executePurseTransaction(
  seasonId: string,
  teamId: string,
  type: PurseTransactionType,
  amount: number,
  reason?: string
): Promise<{ newBalance: number; transaction: PurseTransaction }> {
  const transaction = await pursesService.executePurseTransaction(
    seasonId,
    teamId,
    type,
    amount,
    reason
  )
  return {
    newBalance: transaction.balance_after,
    transaction
  }
}

export const resetAllPurses = (
  seasonId: string,
  startingAmount: number,
  reason?: string
) => pursesService.resetAllPurses(seasonId, startingAmount, reason)
