/**
 * Quest Engine Service
 * Handles quest definitions, progress tracking, and reward claiming
 */

import { supabaseAdmin } from '../lib/supabase';
import { redis, REDIS_KEYS } from '../lib/redis';
import { creditWallet } from './wallet.service';
import { 
  AppError, 
  NotFoundError,
  paginatedResponse,
  getStartOfDay,
  getStartOfWeek,
  getStartOfMonth
} from '../lib/utils';
import type { QuestType, QuestCategory, QuestResetPeriod } from '../types/database.types';

// =============================================================================
// TYPES
// =============================================================================

export interface Quest {
  id: string;
  quest_code: string;
  name: string;
  description: string;
  icon_url?: string;
  quest_type: QuestType;
  category: QuestCategory;
  target_action: string;
  target_count: number;
  reward_type: 'diamond' | 'gold' | 'xp' | 'asset';
  reward_amount: number;
  reward_asset_id?: string;
  reset_period: QuestResetPeriod;
  min_user_level: number;
  min_svip_level: number;
  start_date?: string;
  end_date?: string;
  is_active: boolean;
  sort_order: number;
}

export interface QuestProgress {
  id: string;
  quest_id: string;
  user_id: string;
  current_progress: number;
  is_completed: boolean;
  is_claimed: boolean;
  completed_at?: string;
  claimed_at?: string;
  reset_at?: string;
  quest?: Quest;
}

export interface QuestReward {
  type: 'diamond' | 'gold' | 'xp' | 'asset';
  amount: number;
  asset_id?: string;
}

// =============================================================================
// QUEST CATALOG
// =============================================================================

/**
 * Get active quests for a user
 */
export async function getActiveQuests(
  userId: string,
  category?: QuestCategory
) {
  // Get user info to check level requirements
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('user_level, svip_level')
    .eq('id', userId)
    .single();

  const userLevel = user?.user_level || 1;
  const svipLevel = user?.svip_level || 0;

  let query = supabaseAdmin
    .from('quest_definitions')
    .select('*')
    .eq('is_active', true)
    .lte('min_user_level', userLevel)
    .lte('min_svip_level', svipLevel)
    .or(`start_date.is.null,start_date.lte.${new Date().toISOString()}`)
    .or(`end_date.is.null,end_date.gte.${new Date().toISOString()}`)
    .order('sort_order');

  if (category) {
    query = query.eq('category', category);
  }

  const { data, error } = await query;

  if (error) throw new AppError('Failed to fetch quests', 'QUESTS_FETCH_ERROR', 500);

  return data || [];
}

/**
 * Get quest by ID
 */
export async function getQuestById(questId: string): Promise<Quest | null> {
  const { data, error } = await supabaseAdmin
    .from('quest_definitions')
    .select('*')
    .eq('id', questId)
    .single();

  if (error || !data) return null;
  return data as Quest;
}

// =============================================================================
// QUEST PROGRESS TRACKING
// =============================================================================

/**
 * Get user's quest progress
 */
export async function getUserQuestProgress(
  userId: string,
  category?: QuestCategory
): Promise<QuestProgress[]> {
  const quests = await getActiveQuests(userId, category);
  const questIds = quests.map(q => q.id);

  if (questIds.length === 0) return [];

  // Get existing progress
  const { data: existingProgress } = await supabaseAdmin
    .from('quest_progress')
    .select('*')
    .eq('user_id', userId)
    .in('quest_id', questIds);

  const progressMap = new Map(
    (existingProgress || []).map(p => [p.quest_id, p])
  );

  // Create progress entries for quests without progress
  const results: QuestProgress[] = [];

  for (const quest of quests) {
    let progress = progressMap.get(quest.id);

    // Check if progress needs reset
    if (progress && quest.reset_period !== 'never') {
      const resetNeeded = checkResetNeeded(progress.reset_at, quest.reset_period);
      if (resetNeeded) {
        // Reset progress
        await supabaseAdmin
          .from('quest_progress')
          .update({
            current_progress: 0,
            is_completed: false,
            is_claimed: false,
            completed_at: null,
            claimed_at: null,
            reset_at: new Date().toISOString(),
          })
          .eq('id', progress.id);

        progress = {
          ...progress,
          current_progress: 0,
          is_completed: false,
          is_claimed: false,
          completed_at: null,
          claimed_at: null,
          reset_at: new Date().toISOString(),
        };
      }
    }

    if (!progress) {
      // Create new progress entry
      const { data: newProgress, error } = await supabaseAdmin
        .from('quest_progress')
        .insert({
          quest_id: quest.id,
          user_id: userId,
          current_progress: 0,
          is_completed: false,
          is_claimed: false,
          reset_at: quest.reset_period !== 'never' ? new Date().toISOString() : null,
        })
        .select()
        .single();

      if (!error && newProgress) {
        progress = newProgress;
      }
    }

    if (progress) {
      results.push({
        ...progress,
        quest,
      } as QuestProgress);
    }
  }

  return results;
}

/**
 * Increment quest progress
 */
export async function incrementQuestProgress(
  userId: string,
  targetAction: string,
  increment: number = 1,
  metadata?: Record<string, unknown>
): Promise<void> {
  // Find quests matching this action
  const { data: matchingQuests } = await supabaseAdmin
    .from('quest_definitions')
    .select('id, target_count')
    .eq('target_action', targetAction)
    .eq('is_active', true);

  if (!matchingQuests || matchingQuests.length === 0) return;

  for (const quest of matchingQuests) {
    // Get or create progress
    const { data: progress } = await supabaseAdmin
      .from('quest_progress')
      .select('*')
      .eq('quest_id', quest.id)
      .eq('user_id', userId)
      .single();

    if (progress?.is_completed) continue; // Already completed

    const currentProgress = progress?.current_progress || 0;
    const newProgress = currentProgress + increment;
    const isCompleted = newProgress >= quest.target_count;

    if (progress) {
      await supabaseAdmin
        .from('quest_progress')
        .update({
          current_progress: Math.min(newProgress, quest.target_count),
          is_completed: isCompleted,
          completed_at: isCompleted ? new Date().toISOString() : null,
        })
        .eq('id', progress.id);
    } else {
      await supabaseAdmin
        .from('quest_progress')
        .insert({
          quest_id: quest.id,
          user_id: userId,
          current_progress: Math.min(newProgress, quest.target_count),
          is_completed: isCompleted,
          completed_at: isCompleted ? new Date().toISOString() : null,
        });
    }
  }
}

/**
 * Claim quest reward
 */
export async function claimQuestReward(
  userId: string,
  progressId: string
): Promise<QuestReward> {
  // Get progress with quest details
  const { data: progress, error } = await supabaseAdmin
    .from('quest_progress')
    .select(`
      *,
      quest:quest_definitions(*)
    `)
    .eq('id', progressId)
    .eq('user_id', userId)
    .single();

  if (error || !progress) {
    throw new NotFoundError('Quest progress');
  }

  if (!progress.is_completed) {
    throw new AppError('Quest not completed', 'QUEST_NOT_COMPLETED', 400);
  }

  if (progress.is_claimed) {
    throw new AppError('Reward already claimed', 'ALREADY_CLAIMED', 400);
  }

  const quest = progress.quest;

  // Grant reward based on type
  if (quest.reward_type === 'diamond' || quest.reward_type === 'gold') {
    await creditWallet(
      userId,
      quest.reward_type,
      quest.reward_amount,
      'quest_reward',
      `Quest reward: ${quest.name}`,
      'quest',
      quest.id
    );
  } else if (quest.reward_type === 'xp') {
    await supabaseAdmin.rpc('add_user_xp', {
      p_user_id: userId,
      p_xp_amount: quest.reward_amount,
      p_source: 'quest',
      p_reference_id: quest.id,
    });
  } else if (quest.reward_type === 'asset' && quest.reward_asset_id) {
    // Add asset to inventory
    await supabaseAdmin.from('user_inventory').insert({
      user_id: userId,
      asset_id: quest.reward_asset_id,
      acquired_via: 'quest_reward',
      // Permanent asset from quest
    });
  }

  // Mark as claimed
  await supabaseAdmin
    .from('quest_progress')
    .update({
      is_claimed: true,
      claimed_at: new Date().toISOString(),
    })
    .eq('id', progressId);

  return {
    type: quest.reward_type,
    amount: quest.reward_amount,
    asset_id: quest.reward_asset_id,
  };
}

// =============================================================================
// HELPERS
// =============================================================================

function checkResetNeeded(resetAt: string | null, resetPeriod: QuestResetPeriod): boolean {
  if (!resetAt || resetPeriod === 'never') return false;

  const lastReset = new Date(resetAt);
  const now = new Date();

  switch (resetPeriod) {
    case 'daily':
      return lastReset < getStartOfDay();
    case 'weekly':
      return lastReset < getStartOfWeek();
    case 'monthly':
      return lastReset < getStartOfMonth();
    default:
      return false;
  }
}

// =============================================================================
// QUEST TRIGGER ACTIONS (for event-driven progress)
// =============================================================================

/**
 * Available quest actions for tracking
 */
export const QUEST_ACTIONS = {
  // Room actions
  JOIN_ROOM: 'join_room',
  HOST_ROOM_MINUTES: 'host_room_minutes',
  TAKE_SEAT: 'take_seat',
  
  // Gift actions
  SEND_GIFT: 'send_gift',
  SEND_GIFT_DIAMONDS: 'send_gift_diamonds',
  RECEIVE_GIFT: 'receive_gift',
  
  // Social actions
  FOLLOW_USER: 'follow_user',
  SEND_DM: 'send_dm',
  
  // Engagement
  DAILY_LOGIN: 'daily_login',
  CONSECUTIVE_LOGIN: 'consecutive_login',
  RECHARGE: 'recharge',
  
  // Love Tree
  LOVE_TREE_BLESSING: 'love_tree_blessing',
  LOVE_TREE_ALBUM_PHOTO: 'love_tree_album_photo',
} as const;

/**
 * Track quest action (call from other services)
 */
export async function trackQuestAction(
  userId: string,
  action: string,
  value: number = 1
): Promise<void> {
  await incrementQuestProgress(userId, action, value);
}
