/**
 * Love Tree Service
 * Handles love tree pairs, blessings, album photos, and progression
 */

import { supabaseAdmin } from '../lib/supabase';
import { 
  AppError, 
  NotFoundError,
  AuthorizationError,
  calculateLoveTreeLevel,
  LOVE_TREE_THRESHOLDS,
  paginatedResponse 
} from '../lib/utils';

// =============================================================================
// TYPES
// =============================================================================

export interface LoveTreePair {
  id: string;
  user1_id: string;
  user2_id: string;
  tree_level: number;
  total_grams: number;
  user1_grams_contributed: number;
  user2_grams_contributed: number;
  anniversary_date: string;
  is_active: boolean;
  created_at: string;
  user1?: {
    id: string;
    display_name: string;
    avatar_url?: string;
  };
  user2?: {
    id: string;
    display_name: string;
    avatar_url?: string;
  };
}

export interface LoveTreeBlessing {
  id: string;
  pair_id: string;
  user_id: string;
  blessing_type: 'dm_task' | 'gift' | 'call' | 'daily_login' | 'event';
  grams_earned: number;
  description?: string;
  reference_type?: string;
  reference_id?: string;
  created_at: string;
}

export interface LoveTreeAlbumPhoto {
  id: string;
  pair_id: string;
  uploaded_by_id: string;
  image_url: string;
  caption?: string;
  is_cover: boolean;
  likes_count: number;
  created_at: string;
}

export interface LoveTreeProgress {
  current_level: number;
  current_level_name: string;
  total_grams: number;
  grams_to_next_level: number;
  next_level?: number;
  next_level_name?: string;
  progress_percentage: number;
}

// =============================================================================
// LOVE TREE PAIR MANAGEMENT
// =============================================================================

/**
 * Create a new love tree pair
 */
export async function createLoveTreePair(
  requesterId: string,
  partnerId: string
): Promise<LoveTreePair> {
  // Check if either user already has an active love tree
  const { data: existingUser1 } = await supabaseAdmin
    .from('love_tree_pairs')
    .select('id')
    .or(`user1_id.eq.${requesterId},user2_id.eq.${requesterId}`)
    .eq('is_active', true)
    .single();

  if (existingUser1) {
    throw new AppError('You already have an active love tree', 'ALREADY_PAIRED', 400);
  }

  const { data: existingUser2 } = await supabaseAdmin
    .from('love_tree_pairs')
    .select('id')
    .or(`user1_id.eq.${partnerId},user2_id.eq.${partnerId}`)
    .eq('is_active', true)
    .single();

  if (existingUser2) {
    throw new AppError('This user already has an active love tree', 'PARTNER_ALREADY_PAIRED', 400);
  }

  // Normalize user order (smaller UUID first)
  const [user1_id, user2_id] = [requesterId, partnerId].sort();

  // Create the love tree pair
  const { data, error } = await supabaseAdmin
    .from('love_tree_pairs')
    .insert({
      user1_id,
      user2_id,
      tree_level: 1,
      total_grams: 0,
      user1_grams_contributed: 0,
      user2_grams_contributed: 0,
      anniversary_date: new Date().toISOString().split('T')[0],
      is_active: true,
    })
    .select(`
      *,
      user1:users!love_tree_pairs_user1_id_fkey(id, display_name, avatar_url),
      user2:users!love_tree_pairs_user2_id_fkey(id, display_name, avatar_url)
    `)
    .single();

  if (error) {
    console.error('[v0] Create love tree error:', error);
    throw new AppError('Failed to create love tree', 'LOVE_TREE_CREATE_ERROR', 500);
  }

  return data as LoveTreePair;
}

/**
 * Get love tree pair by ID
 */
export async function getLoveTreePair(pairId: string): Promise<LoveTreePair | null> {
  const { data, error } = await supabaseAdmin
    .from('love_tree_pairs')
    .select(`
      *,
      user1:users!love_tree_pairs_user1_id_fkey(id, display_name, avatar_url),
      user2:users!love_tree_pairs_user2_id_fkey(id, display_name, avatar_url)
    `)
    .eq('id', pairId)
    .single();

  if (error || !data) return null;
  return data as LoveTreePair;
}

/**
 * Get user's active love tree
 */
export async function getUserLoveTree(userId: string): Promise<LoveTreePair | null> {
  const { data, error } = await supabaseAdmin
    .from('love_tree_pairs')
    .select(`
      *,
      user1:users!love_tree_pairs_user1_id_fkey(id, display_name, avatar_url),
      user2:users!love_tree_pairs_user2_id_fkey(id, display_name, avatar_url)
    `)
    .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
    .eq('is_active', true)
    .single();

  if (error || !data) return null;
  return data as LoveTreePair;
}

/**
 * Dissolve love tree pair
 */
export async function dissolveLoveTree(
  pairId: string,
  userId: string
): Promise<void> {
  // Verify user is part of the pair
  const pair = await getLoveTreePair(pairId);
  if (!pair) throw new NotFoundError('Love tree pair');
  
  if (pair.user1_id !== userId && pair.user2_id !== userId) {
    throw new AuthorizationError('Not part of this love tree');
  }

  await supabaseAdmin
    .from('love_tree_pairs')
    .update({ is_active: false })
    .eq('id', pairId);
}

// =============================================================================
// LOVE TREE BLESSINGS (GRAM EARNING)
// =============================================================================

/**
 * Add blessing (grams) to love tree
 */
export async function addBlessing(
  pairId: string,
  userId: string,
  blessingType: LoveTreeBlessing['blessing_type'],
  grams: number,
  description?: string,
  referenceType?: string,
  referenceId?: string
): Promise<LoveTreeBlessing> {
  // Verify user is part of the pair
  const pair = await getLoveTreePair(pairId);
  if (!pair) throw new NotFoundError('Love tree pair');
  
  if (pair.user1_id !== userId && pair.user2_id !== userId) {
    throw new AuthorizationError('Not part of this love tree');
  }

  if (!pair.is_active) {
    throw new AppError('Love tree is not active', 'LOVE_TREE_INACTIVE', 400);
  }

  // Record the blessing
  const { data: blessing, error } = await supabaseAdmin
    .from('love_tree_blessings')
    .insert({
      pair_id: pairId,
      user_id: userId,
      blessing_type: blessingType,
      grams_earned: grams,
      description,
      reference_type: referenceType,
      reference_id: referenceId,
    })
    .select()
    .single();

  if (error) throw new AppError('Failed to add blessing', 'BLESSING_CREATE_ERROR', 500);

  // Update pair's total grams and individual contribution
  const isUser1 = pair.user1_id === userId;
  const userGramsField = isUser1 ? 'user1_grams_contributed' : 'user2_grams_contributed';
  const currentUserGrams = isUser1 ? pair.user1_grams_contributed : pair.user2_grams_contributed;

  const newTotalGrams = pair.total_grams + grams;
  const newLevel = calculateLoveTreeLevel(newTotalGrams);

  await supabaseAdmin
    .from('love_tree_pairs')
    .update({
      total_grams: newTotalGrams,
      tree_level: newLevel,
      [userGramsField]: currentUserGrams + grams,
    })
    .eq('id', pairId);

  return blessing as LoveTreeBlessing;
}

/**
 * Get blessings history for a love tree
 */
export async function getBlessings(
  pairId: string,
  page: number = 1,
  limit: number = 20
) {
  const offset = (page - 1) * limit;

  const { data, error, count } = await supabaseAdmin
    .from('love_tree_blessings')
    .select(`
      *,
      user:users!love_tree_blessings_user_id_fkey(id, display_name, avatar_url)
    `, { count: 'exact' })
    .eq('pair_id', pairId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new AppError('Failed to fetch blessings', 'BLESSINGS_FETCH_ERROR', 500);

  return paginatedResponse(data || [], page, limit, count || 0);
}

/**
 * Get progress towards next level
 */
export function getLoveTreeProgress(pair: LoveTreePair): LoveTreeProgress {
  const currentLevel = pair.tree_level;
  const currentThreshold = LOVE_TREE_THRESHOLDS.find(t => t.level === currentLevel);
  const nextThreshold = LOVE_TREE_THRESHOLDS.find(t => t.level === currentLevel + 1);

  const currentLevelName = currentThreshold?.name || 'Unknown';
  
  if (!nextThreshold) {
    // Max level reached
    return {
      current_level: currentLevel,
      current_level_name: currentLevelName,
      total_grams: pair.total_grams,
      grams_to_next_level: 0,
      progress_percentage: 100,
    };
  }

  const gramsInCurrentLevel = pair.total_grams - (currentThreshold?.grams || 0);
  const gramsNeededForLevel = nextThreshold.grams - (currentThreshold?.grams || 0);
  const gramsToNextLevel = nextThreshold.grams - pair.total_grams;
  const progressPercentage = Math.min(100, (gramsInCurrentLevel / gramsNeededForLevel) * 100);

  return {
    current_level: currentLevel,
    current_level_name: currentLevelName,
    total_grams: pair.total_grams,
    grams_to_next_level: gramsToNextLevel,
    next_level: nextThreshold.level,
    next_level_name: nextThreshold.name,
    progress_percentage: Math.round(progressPercentage * 100) / 100,
  };
}

// =============================================================================
// LOVE TREE ALBUM
// =============================================================================

/**
 * Upload photo to love tree album
 */
export async function uploadAlbumPhoto(
  pairId: string,
  userId: string,
  imageUrl: string,
  caption?: string
): Promise<LoveTreeAlbumPhoto> {
  // Verify user is part of the pair
  const pair = await getLoveTreePair(pairId);
  if (!pair) throw new NotFoundError('Love tree pair');
  
  if (pair.user1_id !== userId && pair.user2_id !== userId) {
    throw new AuthorizationError('Not part of this love tree');
  }

  const { data, error } = await supabaseAdmin
    .from('love_tree_album_photos')
    .insert({
      pair_id: pairId,
      uploaded_by_id: userId,
      image_url: imageUrl,
      caption,
    })
    .select()
    .single();

  if (error) throw new AppError('Failed to upload photo', 'PHOTO_UPLOAD_ERROR', 500);

  return data as LoveTreeAlbumPhoto;
}

/**
 * Get album photos
 */
export async function getAlbumPhotos(
  pairId: string,
  page: number = 1,
  limit: number = 20
) {
  const offset = (page - 1) * limit;

  const { data, error, count } = await supabaseAdmin
    .from('love_tree_album_photos')
    .select(`
      *,
      uploaded_by:users!love_tree_album_photos_uploaded_by_id_fkey(id, display_name, avatar_url)
    `, { count: 'exact' })
    .eq('pair_id', pairId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new AppError('Failed to fetch photos', 'PHOTOS_FETCH_ERROR', 500);

  return paginatedResponse(data || [], page, limit, count || 0);
}

/**
 * Set cover photo
 */
export async function setCoverPhoto(
  pairId: string,
  photoId: string,
  userId: string
): Promise<void> {
  // Verify user is part of the pair
  const pair = await getLoveTreePair(pairId);
  if (!pair) throw new NotFoundError('Love tree pair');
  
  if (pair.user1_id !== userId && pair.user2_id !== userId) {
    throw new AuthorizationError('Not part of this love tree');
  }

  // Unset current cover
  await supabaseAdmin
    .from('love_tree_album_photos')
    .update({ is_cover: false })
    .eq('pair_id', pairId)
    .eq('is_cover', true);

  // Set new cover
  await supabaseAdmin
    .from('love_tree_album_photos')
    .update({ is_cover: true })
    .eq('id', photoId)
    .eq('pair_id', pairId);
}

/**
 * Delete album photo
 */
export async function deleteAlbumPhoto(
  pairId: string,
  photoId: string,
  userId: string
): Promise<void> {
  // Get the photo
  const { data: photo } = await supabaseAdmin
    .from('love_tree_album_photos')
    .select('uploaded_by_id')
    .eq('id', photoId)
    .eq('pair_id', pairId)
    .single();

  if (!photo) throw new NotFoundError('Photo');
  
  // Only the uploader can delete
  if (photo.uploaded_by_id !== userId) {
    throw new AuthorizationError('Only the uploader can delete this photo');
  }

  await supabaseAdmin
    .from('love_tree_album_photos')
    .delete()
    .eq('id', photoId);
}

/**
 * Like/Unlike album photo
 */
export async function togglePhotoLike(
  photoId: string,
  userId: string
): Promise<{ liked: boolean; likes_count: number }> {
  // Check if already liked
  const { data: existing } = await supabaseAdmin
    .from('love_tree_photo_likes')
    .select('id')
    .eq('photo_id', photoId)
    .eq('user_id', userId)
    .single();

  if (existing) {
    // Unlike
    await supabaseAdmin
      .from('love_tree_photo_likes')
      .delete()
      .eq('id', existing.id);

    await supabaseAdmin.rpc('decrement_photo_likes', { p_photo_id: photoId });

    const { data: photo } = await supabaseAdmin
      .from('love_tree_album_photos')
      .select('likes_count')
      .eq('id', photoId)
      .single();

    return { liked: false, likes_count: photo?.likes_count || 0 };
  } else {
    // Like
    await supabaseAdmin
      .from('love_tree_photo_likes')
      .insert({ photo_id: photoId, user_id: userId });

    await supabaseAdmin.rpc('increment_photo_likes', { p_photo_id: photoId });

    const { data: photo } = await supabaseAdmin
      .from('love_tree_album_photos')
      .select('likes_count')
      .eq('id', photoId)
      .single();

    return { liked: true, likes_count: photo?.likes_count || 0 };
  }
}

// =============================================================================
// DM TASK BLESSINGS (Special integration)
// =============================================================================

/**
 * Award daily login blessing to love tree
 */
export async function awardDailyLoginBlessing(userId: string): Promise<void> {
  const pair = await getUserLoveTree(userId);
  if (!pair || !pair.is_active) return;

  // Check if already awarded today
  const today = new Date().toISOString().split('T')[0];
  const { data: existing } = await supabaseAdmin
    .from('love_tree_blessings')
    .select('id')
    .eq('pair_id', pair.id)
    .eq('user_id', userId)
    .eq('blessing_type', 'daily_login')
    .gte('created_at', `${today}T00:00:00Z`)
    .lt('created_at', `${today}T23:59:59Z`)
    .single();

  if (existing) return; // Already awarded today

  await addBlessing(
    pair.id,
    userId,
    'daily_login',
    10, // 10 grams for daily login
    'Daily login blessing'
  );
}

/**
 * Award gift blessing to love tree (when gifting partner)
 */
export async function awardGiftBlessing(
  senderId: string,
  receiverId: string,
  giftValue: number,
  giftId?: string
): Promise<void> {
  // Check if they are love tree partners
  const senderTree = await getUserLoveTree(senderId);
  if (!senderTree || !senderTree.is_active) return;

  const partnerId = senderTree.user1_id === senderId 
    ? senderTree.user2_id 
    : senderTree.user1_id;

  if (partnerId !== receiverId) return; // Not gifting partner

  // Award grams based on gift value (1 gram per 10 diamonds)
  const gramsEarned = Math.floor(giftValue / 10);
  if (gramsEarned <= 0) return;

  await addBlessing(
    senderTree.id,
    senderId,
    'gift',
    gramsEarned,
    `Gift to partner worth ${giftValue} diamonds`,
    'gift',
    giftId
  );
}
