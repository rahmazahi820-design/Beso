/**
 * Gift Service
 * Handles gift catalog, sending gifts, combos, and asset injection
 */

import { supabaseAdmin } from '../lib/supabase';
import { redis, REDIS_KEYS, REDIS_TTL } from '../lib/redis';
import { executeGiftTransfer } from './wallet.service';
import { 
  AppError, 
  NotFoundError,
  InsufficientBalanceError,
  paginatedResponse 
} from '../lib/utils';
import type { GiftRarity } from '../types/database.types';

// =============================================================================
// TYPES
// =============================================================================

export interface GiftInfo {
  id: string;
  name: string;
  description?: string;
  icon_url: string;
  animation_url?: string;
  sound_url?: string;
  diamond_cost: number;
  charm_value: number;
  category: string;
  rarity: GiftRarity;
  is_global_broadcast: boolean;
  supports_combo: boolean;
  max_combo: number;
  combo_multiplier: number;
  min_svip_level: number;
}

export interface SendGiftResult {
  success: boolean;
  order_id?: string;
  order_number?: string;
  total_cost?: number;
  charm_earned?: number;
  combo_count?: number;
  is_broadcast?: boolean;
  error?: string;
}

export interface GiftComboState {
  sender_id: string;
  receiver_id: string;
  gift_id: string;
  current_combo: number;
  expires_at: number;
}

export interface UserEquippedAssets {
  chat_bubble_id?: string;
  chat_bubble_url?: string;
  nickname_color?: string;
  entrance_effect_id?: string;
  entrance_effect_url?: string;
  profile_frame_id?: string;
  profile_frame_url?: string;
  mic_ring_id?: string;
  mic_ring_url?: string;
}

// =============================================================================
// GIFT CATALOG
// =============================================================================

/**
 * Get all active gifts
 */
export async function getGiftCatalog(
  category?: string,
  page: number = 1,
  limit: number = 50
) {
  const offset = (page - 1) * limit;

  let query = supabaseAdmin
    .from('gift_catalog')
    .select('*', { count: 'exact' })
    .eq('is_active', true)
    .order('sort_order')
    .range(offset, offset + limit - 1);

  if (category) {
    query = query.eq('category', category);
  }

  const { data, error, count } = await query;

  if (error) throw new AppError('Failed to fetch gift catalog', 'CATALOG_FETCH_ERROR', 500);

  return paginatedResponse(
    (data || []).map(mapGiftToInfo),
    page,
    limit,
    count || 0
  );
}

/**
 * Get gift by ID
 */
export async function getGiftById(giftId: string): Promise<GiftInfo | null> {
  const { data, error } = await supabaseAdmin
    .from('gift_catalog')
    .select('*')
    .eq('id', giftId)
    .eq('is_active', true)
    .single();

  if (error || !data) return null;
  return mapGiftToInfo(data);
}

/**
 * Get gifts by category
 */
export async function getGiftsByCategory(category: string): Promise<GiftInfo[]> {
  const { data, error } = await supabaseAdmin
    .from('gift_catalog')
    .select('*')
    .eq('category', category)
    .eq('is_active', true)
    .order('diamond_cost');

  if (error) throw new AppError('Failed to fetch gifts', 'GIFTS_FETCH_ERROR', 500);
  return (data || []).map(mapGiftToInfo);
}

/**
 * Get gift categories with counts
 */
export async function getGiftCategories() {
  const { data, error } = await supabaseAdmin
    .from('gift_catalog')
    .select('category')
    .eq('is_active', true);

  if (error) throw new AppError('Failed to fetch categories', 'CATEGORIES_FETCH_ERROR', 500);

  // Count by category
  const counts: Record<string, number> = {};
  (data || []).forEach(g => {
    counts[g.category] = (counts[g.category] || 0) + 1;
  });

  return Object.entries(counts).map(([category, count]) => ({ category, count }));
}

// =============================================================================
// SEND GIFT (WITH COMBO SUPPORT)
// =============================================================================

/**
 * Send a gift from sender to receiver
 */
export async function sendGift(
  senderId: string,
  receiverId: string,
  giftId: string,
  quantity: number = 1,
  roomId?: string,
  message?: string
): Promise<SendGiftResult> {
  // Get gift info
  const gift = await getGiftById(giftId);
  if (!gift) {
    return { success: false, error: 'Gift not found or inactive' };
  }

  // Check sender's SVIP level requirement
  const { data: sender } = await supabaseAdmin
    .from('users')
    .select('svip_level')
    .eq('id', senderId)
    .single();

  if (sender && sender.svip_level < gift.min_svip_level) {
    return { success: false, error: `Requires SVIP level ${gift.min_svip_level}` };
  }

  // Execute the gift transaction (uses database function for atomicity)
  const result = await executeGiftTransfer(
    senderId,
    receiverId,
    giftId,
    quantity,
    roomId,
    message
  );

  if (!result.success) {
    return { success: false, error: result.error };
  }

  // Handle global broadcast if applicable
  if (gift.is_global_broadcast && quantity * gift.diamond_cost >= 1000) {
    await createGlobalAnnouncement(
      senderId,
      receiverId,
      giftId,
      quantity,
      roomId
    );
  }

  return {
    success: true,
    order_id: result.order_id,
    order_number: result.order_number,
    total_cost: result.amount,
    charm_earned: result.charm_earned,
    combo_count: result.combo_count,
    is_broadcast: gift.is_global_broadcast,
  };
}

/**
 * Get current combo state for a gift
 */
export async function getComboState(
  senderId: string,
  receiverId: string,
  giftId: string,
  roomId?: string
): Promise<GiftComboState | null> {
  const key = REDIS_KEYS.GIFT_COMBO(senderId, receiverId, giftId);
  const data = await redis.get(key);
  
  if (!data) return null;
  
  try {
    return JSON.parse(data) as GiftComboState;
  } catch {
    return null;
  }
}

/**
 * Create global announcement for high-value gifts
 */
async function createGlobalAnnouncement(
  senderId: string,
  receiverId: string,
  giftId: string,
  quantity: number,
  roomId?: string
): Promise<void> {
  // Get user and gift info for announcement
  const [senderData, receiverData, giftData] = await Promise.all([
    supabaseAdmin.from('users').select('display_name').eq('id', senderId).single(),
    supabaseAdmin.from('users').select('display_name').eq('id', receiverId).single(),
    supabaseAdmin.from('gift_catalog').select('name, icon_url, broadcast_message_template').eq('id', giftId).single(),
  ]);

  const senderName = senderData.data?.display_name || 'Someone';
  const receiverName = receiverData.data?.display_name || 'Someone';
  const giftName = giftData.data?.name || 'a gift';
  const iconUrl = giftData.data?.icon_url;

  let message = giftData.data?.broadcast_message_template || 
    `${senderName} sent ${quantity}x ${giftName} to ${receiverName}!`;
  
  message = message
    .replace('{sender}', senderName)
    .replace('{receiver}', receiverName)
    .replace('{gift}', giftName)
    .replace('{quantity}', quantity.toString());

  await supabaseAdmin.from('global_announcements').insert({
    trigger_type: 'gift',
    trigger_user_id: senderId,
    target_user_id: receiverId,
    message,
    icon_url: iconUrl,
    room_id: roomId,
    gift_id: giftId,
    duration_ms: 5000,
    priority: quantity >= 100 ? 10 : 5,
    expires_at: new Date(Date.now() + 30000).toISOString(), // 30 seconds
  });
}

// =============================================================================
// GIFT HISTORY
// =============================================================================

/**
 * Get gifts sent by a user
 */
export async function getGiftsSent(
  userId: string,
  page: number = 1,
  limit: number = 20
) {
  const offset = (page - 1) * limit;

  const { data, error, count } = await supabaseAdmin
    .from('gift_transactions')
    .select(`
      *,
      gift:gift_catalog(id, name, icon_url, rarity),
      receiver:users!gift_transactions_receiver_id_fkey(id, display_name, avatar_url)
    `, { count: 'exact' })
    .eq('sender_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new AppError('Failed to fetch gift history', 'HISTORY_FETCH_ERROR', 500);

  return paginatedResponse(data || [], page, limit, count || 0);
}

/**
 * Get gifts received by a user
 */
export async function getGiftsReceived(
  userId: string,
  page: number = 1,
  limit: number = 20
) {
  const offset = (page - 1) * limit;

  const { data, error, count } = await supabaseAdmin
    .from('gift_transactions')
    .select(`
      *,
      gift:gift_catalog(id, name, icon_url, rarity),
      sender:users!gift_transactions_sender_id_fkey(id, display_name, avatar_url)
    `, { count: 'exact' })
    .eq('receiver_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new AppError('Failed to fetch gift history', 'HISTORY_FETCH_ERROR', 500);

  return paginatedResponse(data || [], page, limit, count || 0);
}

// =============================================================================
// ASSET INJECTION PIPELINE
// =============================================================================

/**
 * Get user's equipped assets for WebSocket payload injection
 */
export async function getUserEquippedAssets(userId: string): Promise<UserEquippedAssets> {
  // Try cache first
  const cacheKey = REDIS_KEYS.CACHE_USER_ASSETS(userId);
  const cached = await redis.get(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached) as UserEquippedAssets;
    } catch {
      // Continue to fetch from DB
    }
  }

  // Get user profile with equipped asset IDs
  const { data: profile } = await supabaseAdmin
    .from('user_profiles')
    .select(`
      equipped_chat_bubble_id,
      equipped_nickname_color,
      equipped_entrance_effect_id,
      equipped_profile_frame_id,
      equipped_mic_ring_id
    `)
    .eq('user_id', userId)
    .single();

  if (!profile) {
    return {};
  }

  // Get asset URLs for equipped items
  const assetIds = [
    profile.equipped_chat_bubble_id,
    profile.equipped_entrance_effect_id,
    profile.equipped_profile_frame_id,
    profile.equipped_mic_ring_id,
  ].filter(Boolean);

  let assetMap: Record<string, { icon_url: string; animation_url?: string }> = {};
  
  if (assetIds.length > 0) {
    const { data: assets } = await supabaseAdmin
      .from('asset_catalog')
      .select('id, icon_url, animation_url')
      .in('id', assetIds);

    if (assets) {
      assetMap = Object.fromEntries(assets.map(a => [a.id, { icon_url: a.icon_url, animation_url: a.animation_url }]));
    }
  }

  const result: UserEquippedAssets = {
    chat_bubble_id: profile.equipped_chat_bubble_id,
    chat_bubble_url: profile.equipped_chat_bubble_id ? assetMap[profile.equipped_chat_bubble_id]?.icon_url : undefined,
    nickname_color: profile.equipped_nickname_color,
    entrance_effect_id: profile.equipped_entrance_effect_id,
    entrance_effect_url: profile.equipped_entrance_effect_id ? assetMap[profile.equipped_entrance_effect_id]?.animation_url : undefined,
    profile_frame_id: profile.equipped_profile_frame_id,
    profile_frame_url: profile.equipped_profile_frame_id ? assetMap[profile.equipped_profile_frame_id]?.icon_url : undefined,
    mic_ring_id: profile.equipped_mic_ring_id,
    mic_ring_url: profile.equipped_mic_ring_id ? assetMap[profile.equipped_mic_ring_id]?.animation_url : undefined,
  };

  // Cache for 10 minutes
  await redis.setex(cacheKey, REDIS_TTL.USER_PROFILE_CACHE, JSON.stringify(result));

  return result;
}

/**
 * Invalidate user's asset cache (call when assets are equipped/unequipped)
 */
export async function invalidateUserAssetCache(userId: string): Promise<void> {
  await redis.del(REDIS_KEYS.CACHE_USER_ASSETS(userId));
}

/**
 * Build chat message payload with asset injection
 */
export async function buildChatMessagePayload(
  userId: string,
  content: string,
  messageType: string = 'text',
  mediaUrl?: string
): Promise<{
  content: string;
  message_type: string;
  media_url?: string;
  chat_bubble_id?: string;
  chat_bubble_url?: string;
  nickname_color?: string;
  user_display_name: string;
  user_avatar_url?: string;
  user_svip_level: number;
  user_aristocracy_tier: number;
}> {
  // Get user info and equipped assets in parallel
  const [userInfo, assets] = await Promise.all([
    supabaseAdmin
      .from('users')
      .select('display_name, avatar_url, svip_level, aristocracy_tier')
      .eq('id', userId)
      .single(),
    getUserEquippedAssets(userId),
  ]);

  return {
    content,
    message_type: messageType,
    media_url: mediaUrl,
    chat_bubble_id: assets.chat_bubble_id,
    chat_bubble_url: assets.chat_bubble_url,
    nickname_color: assets.nickname_color,
    user_display_name: userInfo.data?.display_name || 'Anonymous',
    user_avatar_url: userInfo.data?.avatar_url,
    user_svip_level: userInfo.data?.svip_level || 0,
    user_aristocracy_tier: userInfo.data?.aristocracy_tier || 0,
  };
}

/**
 * Build entrance announcement payload
 */
export async function buildEntrancePayload(userId: string): Promise<{
  user_id: string;
  display_name: string;
  avatar_url?: string;
  svip_level: number;
  aristocracy_tier: number;
  entrance_effect_id?: string;
  entrance_effect_url?: string;
  has_vip_announcement: boolean;
  announcement_text?: string;
}> {
  const [userInfo, assets, svipTier] = await Promise.all([
    supabaseAdmin
      .from('users')
      .select('display_name, avatar_url, svip_level, aristocracy_tier')
      .eq('id', userId)
      .single(),
    getUserEquippedAssets(userId),
    supabaseAdmin
      .from('svip_tiers')
      .select('has_vip_entry_announcement, entry_announcement_template')
      .eq('tier_level', (await supabaseAdmin.from('users').select('svip_level').eq('id', userId).single()).data?.svip_level || 0)
      .single(),
  ]);

  const hasVipAnnouncement = svipTier.data?.has_vip_entry_announcement || false;
  let announcementText: string | undefined;

  if (hasVipAnnouncement && svipTier.data?.entry_announcement_template) {
    announcementText = svipTier.data.entry_announcement_template.replace(
      '{user}',
      userInfo.data?.display_name || 'A VIP'
    );
  }

  return {
    user_id: userId,
    display_name: userInfo.data?.display_name || 'Anonymous',
    avatar_url: userInfo.data?.avatar_url,
    svip_level: userInfo.data?.svip_level || 0,
    aristocracy_tier: userInfo.data?.aristocracy_tier || 0,
    entrance_effect_id: assets.entrance_effect_id,
    entrance_effect_url: assets.entrance_effect_url,
    has_vip_announcement: hasVipAnnouncement,
    announcement_text: announcementText,
  };
}

// =============================================================================
// HELPERS
// =============================================================================

function mapGiftToInfo(gift: Record<string, unknown>): GiftInfo {
  return {
    id: gift.id as string,
    name: gift.name as string,
    description: gift.description as string | undefined,
    icon_url: gift.icon_url as string,
    animation_url: gift.animation_url as string | undefined,
    sound_url: gift.sound_url as string | undefined,
    diamond_cost: gift.diamond_cost as number,
    charm_value: gift.charm_value as number,
    category: gift.category as string,
    rarity: gift.rarity as GiftRarity,
    is_global_broadcast: gift.is_global_broadcast as boolean,
    supports_combo: gift.supports_combo as boolean,
    max_combo: gift.max_combo as number,
    combo_multiplier: Number(gift.combo_multiplier) || 1,
    min_svip_level: gift.min_svip_level as number,
  };
}
