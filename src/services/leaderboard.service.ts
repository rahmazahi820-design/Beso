/**
 * Leaderboard Service
 * Handles wealth/charm leaderboards, rankings, and real-time updates
 */

import { supabaseAdmin } from '../lib/supabase';
import { redis, REDIS_KEYS } from '../lib/redis';
import { 
  AppError,
  getStartOfDay,
  getStartOfWeek,
  getStartOfMonth,
  paginatedResponse
} from '../lib/utils';
import type { LeaderboardPeriod } from '../types/database.types';

// =============================================================================
// TYPES
// =============================================================================

export interface LeaderboardEntry {
  rank: number;
  user_id: string;
  score: number;
  display_name: string;
  avatar_url?: string;
  svip_level: number;
  aristocracy_tier: number;
}

export interface LeaderboardResult {
  period: LeaderboardPeriod;
  type: 'wealth' | 'charm' | 'room_gifts' | 'host_hours';
  last_updated: string;
  entries: LeaderboardEntry[];
  user_rank?: number;
  user_score?: number;
}

export interface RoomLeaderboard {
  room_id: string;
  room_name: string;
  period: 'daily' | 'weekly' | 'all_time';
  type: 'top_gifters' | 'top_receivers';
  entries: LeaderboardEntry[];
}

// =============================================================================
// GLOBAL LEADERBOARDS
// =============================================================================

/**
 * Get wealth leaderboard (diamonds spent)
 */
export async function getWealthLeaderboard(
  period: LeaderboardPeriod,
  limit: number = 100,
  userId?: string
): Promise<LeaderboardResult> {
  const periodStart = getPeriodStart(period);
  
  // Use Redis sorted set for real-time leaderboard
  const redisKey = period === 'daily' 
    ? REDIS_KEYS.LEADERBOARD_WEALTH_DAILY 
    : REDIS_KEYS.LEADERBOARD_WEALTH_WEEKLY;

  // Get top entries from Redis
  const redisEntries = await redis.zrevrange(redisKey, 0, limit - 1, 'WITHSCORES');
  
  if (redisEntries.length >= limit * 2) {
    // Parse Redis results
    const entries = await parseRedisLeaderboard(redisEntries);
    
    let userRank: number | undefined;
    let userScore: number | undefined;
    
    if (userId) {
      userRank = await redis.zrevrank(redisKey, userId);
      if (userRank !== null) {
        userRank += 1; // Convert to 1-indexed
        userScore = await redis.zscore(redisKey, userId).then(s => s ? parseFloat(s) : 0);
      }
    }
    
    return {
      period,
      type: 'wealth',
      last_updated: new Date().toISOString(),
      entries,
      user_rank: userRank,
      user_score: userScore,
    };
  }

  // Fallback to database query
  const { data, error } = await supabaseAdmin
    .from('leaderboard_wealth')
    .select(`
      *,
      user:users!leaderboard_wealth_user_id_fkey(
        id, display_name, avatar_url, svip_level, aristocracy_tier
      )
    `)
    .eq('period', period)
    .gte('period_start', periodStart.toISOString())
    .order('total_spent', { ascending: false })
    .limit(limit);

  if (error) throw new AppError('Failed to fetch leaderboard', 'LEADERBOARD_FETCH_ERROR', 500);

  const entries: LeaderboardEntry[] = (data || []).map((entry, index) => ({
    rank: index + 1,
    user_id: entry.user_id,
    score: entry.total_spent,
    display_name: entry.user?.display_name || 'Unknown',
    avatar_url: entry.user?.avatar_url,
    svip_level: entry.user?.svip_level || 0,
    aristocracy_tier: entry.user?.aristocracy_tier || 0,
  }));

  // Sync to Redis for faster future queries
  await syncLeaderboardToRedis(redisKey, entries);

  // Get user's rank if requested
  let userRank: number | undefined;
  let userScore: number | undefined;

  if (userId) {
    const userEntry = entries.find(e => e.user_id === userId);
    if (userEntry) {
      userRank = userEntry.rank;
      userScore = userEntry.score;
    } else {
      // User not in top 100, get their actual rank
      const { data: userRankData } = await supabaseAdmin
        .from('leaderboard_wealth')
        .select('total_spent')
        .eq('user_id', userId)
        .eq('period', period)
        .gte('period_start', periodStart.toISOString())
        .single();

      if (userRankData) {
        userScore = userRankData.total_spent;
        // Count users with higher score
        const { count } = await supabaseAdmin
          .from('leaderboard_wealth')
          .select('*', { count: 'exact', head: true })
          .eq('period', period)
          .gte('period_start', periodStart.toISOString())
          .gt('total_spent', userScore);
        
        userRank = (count || 0) + 1;
      }
    }
  }

  return {
    period,
    type: 'wealth',
    last_updated: new Date().toISOString(),
    entries,
    user_rank: userRank,
    user_score: userScore,
  };
}

/**
 * Get charm leaderboard (charm earned)
 */
export async function getCharmLeaderboard(
  period: LeaderboardPeriod,
  limit: number = 100,
  userId?: string
): Promise<LeaderboardResult> {
  const periodStart = getPeriodStart(period);
  
  const redisKey = period === 'daily' 
    ? REDIS_KEYS.LEADERBOARD_CHARM_DAILY 
    : REDIS_KEYS.LEADERBOARD_CHARM_WEEKLY;

  // Get top entries from Redis
  const redisEntries = await redis.zrevrange(redisKey, 0, limit - 1, 'WITHSCORES');
  
  if (redisEntries.length >= limit * 2) {
    const entries = await parseRedisLeaderboard(redisEntries);
    
    let userRank: number | undefined;
    let userScore: number | undefined;
    
    if (userId) {
      userRank = await redis.zrevrank(redisKey, userId);
      if (userRank !== null) {
        userRank += 1;
        userScore = await redis.zscore(redisKey, userId).then(s => s ? parseFloat(s) : 0);
      }
    }
    
    return {
      period,
      type: 'charm',
      last_updated: new Date().toISOString(),
      entries,
      user_rank: userRank,
      user_score: userScore,
    };
  }

  // Fallback to database
  const { data, error } = await supabaseAdmin
    .from('leaderboard_charm')
    .select(`
      *,
      user:users!leaderboard_charm_user_id_fkey(
        id, display_name, avatar_url, svip_level, aristocracy_tier
      )
    `)
    .eq('period', period)
    .gte('period_start', periodStart.toISOString())
    .order('total_earned', { ascending: false })
    .limit(limit);

  if (error) throw new AppError('Failed to fetch leaderboard', 'LEADERBOARD_FETCH_ERROR', 500);

  const entries: LeaderboardEntry[] = (data || []).map((entry, index) => ({
    rank: index + 1,
    user_id: entry.user_id,
    score: entry.total_earned,
    display_name: entry.user?.display_name || 'Unknown',
    avatar_url: entry.user?.avatar_url,
    svip_level: entry.user?.svip_level || 0,
    aristocracy_tier: entry.user?.aristocracy_tier || 0,
  }));

  await syncLeaderboardToRedis(redisKey, entries);

  let userRank: number | undefined;
  let userScore: number | undefined;

  if (userId) {
    const userEntry = entries.find(e => e.user_id === userId);
    if (userEntry) {
      userRank = userEntry.rank;
      userScore = userEntry.score;
    }
  }

  return {
    period,
    type: 'charm',
    last_updated: new Date().toISOString(),
    entries,
    user_rank: userRank,
    user_score: userScore,
  };
}

// =============================================================================
// ROOM LEADERBOARDS
// =============================================================================

/**
 * Get room's top gifters
 */
export async function getRoomTopGifters(
  roomId: string,
  period: 'daily' | 'weekly' | 'all_time' = 'all_time',
  limit: number = 50
): Promise<RoomLeaderboard> {
  const periodStart = period === 'all_time' 
    ? new Date(0) 
    : period === 'daily' 
      ? getStartOfDay() 
      : getStartOfWeek();

  const { data: room } = await supabaseAdmin
    .from('rooms')
    .select('name')
    .eq('id', roomId)
    .single();

  const { data, error } = await supabaseAdmin
    .from('gift_transactions')
    .select(`
      sender_id,
      total_value:total_cost.sum(),
      sender:users!gift_transactions_sender_id_fkey(
        id, display_name, avatar_url, svip_level, aristocracy_tier
      )
    `)
    .eq('room_id', roomId)
    .gte('created_at', periodStart.toISOString())
    .order('total_value', { ascending: false })
    .limit(limit);

  if (error) throw new AppError('Failed to fetch room leaderboard', 'LEADERBOARD_FETCH_ERROR', 500);

  const entries: LeaderboardEntry[] = (data || []).map((entry, index) => ({
    rank: index + 1,
    user_id: entry.sender_id,
    score: entry.total_value || 0,
    display_name: entry.sender?.display_name || 'Unknown',
    avatar_url: entry.sender?.avatar_url,
    svip_level: entry.sender?.svip_level || 0,
    aristocracy_tier: entry.sender?.aristocracy_tier || 0,
  }));

  return {
    room_id: roomId,
    room_name: room?.name || 'Unknown Room',
    period,
    type: 'top_gifters',
    entries,
  };
}

/**
 * Get room's top receivers (hosts)
 */
export async function getRoomTopReceivers(
  roomId: string,
  period: 'daily' | 'weekly' | 'all_time' = 'all_time',
  limit: number = 50
): Promise<RoomLeaderboard> {
  const periodStart = period === 'all_time' 
    ? new Date(0) 
    : period === 'daily' 
      ? getStartOfDay() 
      : getStartOfWeek();

  const { data: room } = await supabaseAdmin
    .from('rooms')
    .select('name')
    .eq('id', roomId)
    .single();

  const { data, error } = await supabaseAdmin
    .from('gift_transactions')
    .select(`
      receiver_id,
      total_value:charm_value.sum(),
      receiver:users!gift_transactions_receiver_id_fkey(
        id, display_name, avatar_url, svip_level, aristocracy_tier
      )
    `)
    .eq('room_id', roomId)
    .gte('created_at', periodStart.toISOString())
    .order('total_value', { ascending: false })
    .limit(limit);

  if (error) throw new AppError('Failed to fetch room leaderboard', 'LEADERBOARD_FETCH_ERROR', 500);

  const entries: LeaderboardEntry[] = (data || []).map((entry, index) => ({
    rank: index + 1,
    user_id: entry.receiver_id,
    score: entry.total_value || 0,
    display_name: entry.receiver?.display_name || 'Unknown',
    avatar_url: entry.receiver?.avatar_url,
    svip_level: entry.receiver?.svip_level || 0,
    aristocracy_tier: entry.receiver?.aristocracy_tier || 0,
  }));

  return {
    room_id: roomId,
    room_name: room?.name || 'Unknown Room',
    period,
    type: 'top_receivers',
    entries,
  };
}

// =============================================================================
// REAL-TIME LEADERBOARD UPDATES
// =============================================================================

/**
 * Update user's wealth score (call after diamond spending)
 */
export async function updateWealthScore(
  userId: string,
  diamondsSpent: number,
  period: LeaderboardPeriod = 'daily'
): Promise<void> {
  const redisKey = period === 'daily' 
    ? REDIS_KEYS.LEADERBOARD_WEALTH_DAILY 
    : REDIS_KEYS.LEADERBOARD_WEALTH_WEEKLY;

  // Increment score in Redis
  await redis.zincrby(redisKey, diamondsSpent, userId);

  // Also update database for persistence
  const periodStart = getPeriodStart(period);
  
  await supabaseAdmin.rpc('upsert_leaderboard_wealth', {
    p_user_id: userId,
    p_period: period,
    p_period_start: periodStart.toISOString(),
    p_amount: diamondsSpent,
  });
}

/**
 * Update user's charm score (call after charm earning)
 */
export async function updateCharmScore(
  userId: string,
  charmEarned: number,
  period: LeaderboardPeriod = 'daily'
): Promise<void> {
  const redisKey = period === 'daily' 
    ? REDIS_KEYS.LEADERBOARD_CHARM_DAILY 
    : REDIS_KEYS.LEADERBOARD_CHARM_WEEKLY;

  await redis.zincrby(redisKey, charmEarned, userId);

  const periodStart = getPeriodStart(period);
  
  await supabaseAdmin.rpc('upsert_leaderboard_charm', {
    p_user_id: userId,
    p_period: period,
    p_period_start: periodStart.toISOString(),
    p_amount: charmEarned,
  });
}

/**
 * Reset daily leaderboards (call via cron job)
 */
export async function resetDailyLeaderboards(): Promise<void> {
  await Promise.all([
    redis.del(REDIS_KEYS.LEADERBOARD_WEALTH_DAILY),
    redis.del(REDIS_KEYS.LEADERBOARD_CHARM_DAILY),
  ]);
}

/**
 * Reset weekly leaderboards (call via cron job)
 */
export async function resetWeeklyLeaderboards(): Promise<void> {
  await Promise.all([
    redis.del(REDIS_KEYS.LEADERBOARD_WEALTH_WEEKLY),
    redis.del(REDIS_KEYS.LEADERBOARD_CHARM_WEEKLY),
  ]);
}

// =============================================================================
// ARISTOCRACY RANKINGS
// =============================================================================

/**
 * Get aristocracy rankings (top spenders for aristocracy tier)
 */
export async function getAristocracyRankings(tier: number, limit: number = 100) {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, display_name, avatar_url, svip_level, aristocracy_tier, aristocracy_points')
    .eq('aristocracy_tier', tier)
    .order('aristocracy_points', { ascending: false })
    .limit(limit);

  if (error) throw new AppError('Failed to fetch aristocracy rankings', 'RANKINGS_FETCH_ERROR', 500);

  return (data || []).map((user, index) => ({
    rank: index + 1,
    user_id: user.id,
    display_name: user.display_name,
    avatar_url: user.avatar_url,
    svip_level: user.svip_level,
    aristocracy_tier: user.aristocracy_tier,
    points: user.aristocracy_points,
  }));
}

// =============================================================================
// HELPERS
// =============================================================================

function getPeriodStart(period: LeaderboardPeriod): Date {
  switch (period) {
    case 'daily':
      return getStartOfDay();
    case 'weekly':
      return getStartOfWeek();
    case 'monthly':
      return getStartOfMonth();
    case 'all_time':
    default:
      return new Date(0);
  }
}

async function parseRedisLeaderboard(redisEntries: string[]): Promise<LeaderboardEntry[]> {
  const userIds: string[] = [];
  const scores: number[] = [];

  for (let i = 0; i < redisEntries.length; i += 2) {
    userIds.push(redisEntries[i]);
    scores.push(parseFloat(redisEntries[i + 1]));
  }

  if (userIds.length === 0) return [];

  // Fetch user details
  const { data: users } = await supabaseAdmin
    .from('users')
    .select('id, display_name, avatar_url, svip_level, aristocracy_tier')
    .in('id', userIds);

  const userMap = new Map((users || []).map(u => [u.id, u]));

  return userIds.map((userId, index) => {
    const user = userMap.get(userId);
    return {
      rank: index + 1,
      user_id: userId,
      score: scores[index],
      display_name: user?.display_name || 'Unknown',
      avatar_url: user?.avatar_url,
      svip_level: user?.svip_level || 0,
      aristocracy_tier: user?.aristocracy_tier || 0,
    };
  });
}

async function syncLeaderboardToRedis(key: string, entries: LeaderboardEntry[]): Promise<void> {
  if (entries.length === 0) return;

  const pipeline = redis.pipeline();
  pipeline.del(key);
  
  for (const entry of entries) {
    pipeline.zadd(key, entry.score, entry.user_id);
  }

  // Set TTL based on key type
  const ttl = key.includes('daily') ? 86400 : 604800; // 1 day or 1 week
  pipeline.expire(key, ttl);

  await pipeline.exec();
}
