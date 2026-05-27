/**
 * Room Service
 * Handles room creation, management, and seat state machine
 */

import { supabaseAdmin } from '../lib/supabase';
import { redis, REDIS_KEYS, REDIS_TTL, setWithTTL, getJSON } from '../lib/redis';
import { 
  generateRoomCode, 
  AppError, 
  NotFoundError, 
  AuthorizationError,
  SVIPImmunityError 
} from '../lib/utils';
import type { 
  RoomType, 
  RoomStatus, 
  SeatStatus, 
  ManagerLevel,
  BanType 
} from '../types/database.types';

// =============================================================================
// TYPES
// =============================================================================

export interface RoomInfo {
  id: string;
  room_code: string;
  name: string;
  description?: string;
  cover_image_url?: string;
  background_image_url?: string;
  owner_id: string;
  room_type: RoomType;
  max_seats: number;
  status: RoomStatus;
  is_private: boolean;
  min_user_level: number;
  min_svip_level: number;
  current_viewers: number;
  total_gifts_value: number;
  welcome_message?: string;
  announcement?: string;
  owner?: {
    id: string;
    display_name: string;
    avatar_url?: string;
    svip_level: number;
  };
}

export interface SeatInfo {
  seat_index: number;
  status: SeatStatus;
  is_muted: boolean;
  is_locked: boolean;
  occupant?: {
    id: string;
    display_name: string;
    avatar_url?: string;
    svip_level: number;
    aristocracy_tier: number;
    equipped_mic_ring_id?: string;
  };
}

export interface RoomStateUpdate {
  type: 'seat_update' | 'room_update' | 'viewer_update' | 'manager_action';
  room_id: string;
  data: Record<string, unknown>;
  timestamp: string;
}

// =============================================================================
// ROOM CRUD OPERATIONS
// =============================================================================

/**
 * Create a new room
 */
export async function createRoom(
  ownerId: string,
  data: {
    name: string;
    description?: string;
    room_type?: RoomType;
    category_id?: string;
    max_seats?: number;
    is_private?: boolean;
    password?: string;
    min_user_level?: number;
    min_svip_level?: number;
    welcome_message?: string;
  }
): Promise<RoomInfo> {
  const roomCode = generateRoomCode();
  
  const insertData: Record<string, unknown> = {
    room_code: roomCode,
    name: data.name,
    description: data.description,
    owner_id: ownerId,
    room_type: data.room_type || 'voice',
    category_id: data.category_id,
    max_seats: data.max_seats || 8,
    is_private: data.is_private || false,
    min_user_level: data.min_user_level || 0,
    min_svip_level: data.min_svip_level || 0,
    welcome_message: data.welcome_message,
    status: 'offline' as RoomStatus,
  };

  // Hash password if private room
  if (data.is_private && data.password) {
    const bcrypt = await import('bcryptjs');
    insertData.password_hash = await bcrypt.hash(data.password, 10);
  }

  const { data: room, error } = await supabaseAdmin
    .from('rooms')
    .insert(insertData)
    .select(`
      *,
      owner:users!rooms_owner_id_fkey(id, display_name, avatar_url, svip_level)
    `)
    .single();

  if (error) {
    console.error('[v0] Create room error:', error);
    throw new AppError('Failed to create room', 'ROOM_CREATE_ERROR', 500);
  }

  // Initialize seats for the room
  await initializeRoomSeats(room.id, room.max_seats);

  return mapRoomToInfo(room);
}

/**
 * Initialize seats for a room
 */
async function initializeRoomSeats(roomId: string, maxSeats: number): Promise<void> {
  const seats = Array.from({ length: maxSeats }, (_, i) => ({
    room_id: roomId,
    seat_index: i,
    status: 'open' as SeatStatus,
    is_muted: false,
    is_locked: false,
  }));

  await supabaseAdmin.from('room_seats').insert(seats);
}

/**
 * Get room by ID
 */
export async function getRoomById(roomId: string): Promise<RoomInfo | null> {
  // Try cache first
  const cached = await getJSON<RoomInfo>(REDIS_KEYS.CACHE_ROOM(roomId));
  if (cached) return cached;

  const { data, error } = await supabaseAdmin
    .from('rooms')
    .select(`
      *,
      owner:users!rooms_owner_id_fkey(id, display_name, avatar_url, svip_level)
    `)
    .eq('id', roomId)
    .single();

  if (error || !data) return null;

  const roomInfo = mapRoomToInfo(data);
  
  // Cache for 5 minutes
  await setWithTTL(REDIS_KEYS.CACHE_ROOM(roomId), roomInfo, REDIS_TTL.ROOM_CACHE);
  
  return roomInfo;
}

/**
 * Get room by code
 */
export async function getRoomByCode(roomCode: string): Promise<RoomInfo | null> {
  const { data, error } = await supabaseAdmin
    .from('rooms')
    .select(`
      *,
      owner:users!rooms_owner_id_fkey(id, display_name, avatar_url, svip_level)
    `)
    .eq('room_code', roomCode)
    .single();

  if (error || !data) return null;
  return mapRoomToInfo(data);
}

/**
 * Update room settings
 */
export async function updateRoom(
  roomId: string,
  ownerId: string,
  updates: Partial<{
    name: string;
    description: string;
    cover_image_url: string;
    background_image_url: string;
    max_seats: number;
    is_private: boolean;
    password: string;
    min_user_level: number;
    min_svip_level: number;
    welcome_message: string;
    announcement: string;
  }>
): Promise<RoomInfo> {
  // Verify ownership
  const room = await getRoomById(roomId);
  if (!room) throw new NotFoundError('Room');
  if (room.owner_id !== ownerId) throw new AuthorizationError('Only the owner can update the room');

  const updateData: Record<string, unknown> = { ...updates };
  
  // Handle password update
  if (updates.password) {
    const bcrypt = await import('bcryptjs');
    updateData.password_hash = await bcrypt.hash(updates.password, 10);
    delete updateData.password;
  }

  const { data, error } = await supabaseAdmin
    .from('rooms')
    .update(updateData)
    .eq('id', roomId)
    .select(`
      *,
      owner:users!rooms_owner_id_fkey(id, display_name, avatar_url, svip_level)
    `)
    .single();

  if (error) throw new AppError('Failed to update room', 'ROOM_UPDATE_ERROR', 500);

  // Invalidate cache
  await redis.del(REDIS_KEYS.CACHE_ROOM(roomId));

  return mapRoomToInfo(data);
}

/**
 * Go live / Go offline
 */
export async function setRoomStatus(
  roomId: string,
  ownerId: string,
  status: 'live' | 'offline'
): Promise<void> {
  const room = await getRoomById(roomId);
  if (!room) throw new NotFoundError('Room');
  if (room.owner_id !== ownerId) throw new AuthorizationError('Only the owner can change room status');

  const updates: Record<string, unknown> = { status };
  if (status === 'live') {
    updates.went_live_at = new Date().toISOString();
  }

  await supabaseAdmin.from('rooms').update(updates).eq('id', roomId);
  await redis.del(REDIS_KEYS.CACHE_ROOM(roomId));
}

// =============================================================================
// SEAT STATE MACHINE
// =============================================================================

/**
 * Get all seats for a room
 */
export async function getRoomSeats(roomId: string): Promise<SeatInfo[]> {
  const { data, error } = await supabaseAdmin
    .from('room_seats')
    .select(`
      *,
      occupant:users!room_seats_occupant_id_fkey(
        id, display_name, avatar_url, svip_level, aristocracy_tier
      )
    `)
    .eq('room_id', roomId)
    .order('seat_index');

  if (error) throw new AppError('Failed to fetch seats', 'SEATS_FETCH_ERROR', 500);

  return (data || []).map(seat => ({
    seat_index: seat.seat_index,
    status: seat.status as SeatStatus,
    is_muted: seat.is_muted,
    is_locked: seat.is_locked,
    occupant: seat.occupant ? {
      id: seat.occupant.id,
      display_name: seat.occupant.display_name,
      avatar_url: seat.occupant.avatar_url,
      svip_level: seat.occupant.svip_level,
      aristocracy_tier: seat.occupant.aristocracy_tier,
    } : undefined,
  }));
}

/**
 * Take a seat
 */
export async function takeSeat(
  roomId: string,
  userId: string,
  seatIndex: number
): Promise<SeatInfo> {
  // Verify room exists and is live
  const room = await getRoomById(roomId);
  if (!room) throw new NotFoundError('Room');
  if (room.status !== 'live') throw new AppError('Room is not live', 'ROOM_NOT_LIVE', 400);

  // Check if user is banned
  const isBanned = await isUserBannedFromRoom(roomId, userId);
  if (isBanned) throw new AppError('You are banned from this room', 'USER_BANNED', 403);

  // Get seat
  const { data: seat, error } = await supabaseAdmin
    .from('room_seats')
    .select('*')
    .eq('room_id', roomId)
    .eq('seat_index', seatIndex)
    .single();

  if (error || !seat) throw new NotFoundError('Seat');
  if (seat.is_locked) throw new AppError('Seat is locked', 'SEAT_LOCKED', 400);
  if (seat.status === 'occupied') throw new AppError('Seat is occupied', 'SEAT_OCCUPIED', 400);

  // Check if user is already on another seat
  const { data: existingSeat } = await supabaseAdmin
    .from('room_seats')
    .select('seat_index')
    .eq('room_id', roomId)
    .eq('occupant_id', userId)
    .single();

  if (existingSeat) {
    throw new AppError('You are already on a seat', 'ALREADY_ON_SEAT', 400);
  }

  // Update seat
  const { data: updatedSeat, error: updateError } = await supabaseAdmin
    .from('room_seats')
    .update({
      status: 'occupied' as SeatStatus,
      occupant_id: userId,
      is_muted: false,
    })
    .eq('id', seat.id)
    .select(`
      *,
      occupant:users!room_seats_occupant_id_fkey(
        id, display_name, avatar_url, svip_level, aristocracy_tier
      )
    `)
    .single();

  if (updateError) throw new AppError('Failed to take seat', 'SEAT_TAKE_ERROR', 500);

  return {
    seat_index: updatedSeat.seat_index,
    status: updatedSeat.status as SeatStatus,
    is_muted: updatedSeat.is_muted,
    is_locked: updatedSeat.is_locked,
    occupant: updatedSeat.occupant ? {
      id: updatedSeat.occupant.id,
      display_name: updatedSeat.occupant.display_name,
      avatar_url: updatedSeat.occupant.avatar_url,
      svip_level: updatedSeat.occupant.svip_level,
      aristocracy_tier: updatedSeat.occupant.aristocracy_tier,
    } : undefined,
  };
}

/**
 * Leave seat
 */
export async function leaveSeat(roomId: string, userId: string): Promise<void> {
  await supabaseAdmin
    .from('room_seats')
    .update({
      status: 'open' as SeatStatus,
      occupant_id: null,
      is_muted: false,
    })
    .eq('room_id', roomId)
    .eq('occupant_id', userId);
}

/**
 * Lock/Unlock seat (manager action)
 */
export async function toggleSeatLock(
  roomId: string,
  actorId: string,
  seatIndex: number,
  locked: boolean
): Promise<void> {
  // Verify actor has permission
  const hasPermission = await hasManagerPermission(roomId, actorId, 'can_lock_seats');
  if (!hasPermission) throw new AuthorizationError('No permission to lock seats');

  await supabaseAdmin
    .from('room_seats')
    .update({ is_locked: locked })
    .eq('room_id', roomId)
    .eq('seat_index', seatIndex);
}

/**
 * Mute/Unmute seat occupant (manager action with SVIP immunity check)
 */
export async function toggleSeatMute(
  roomId: string,
  actorId: string,
  seatIndex: number,
  muted: boolean
): Promise<void> {
  // Verify actor has permission
  const hasPermission = await hasManagerPermission(roomId, actorId, 'can_mute');
  if (!hasPermission) throw new AuthorizationError('No permission to mute');

  // Get seat occupant
  const { data: seat } = await supabaseAdmin
    .from('room_seats')
    .select('occupant_id')
    .eq('room_id', roomId)
    .eq('seat_index', seatIndex)
    .single();

  if (seat?.occupant_id) {
    // Check SVIP immunity
    const canAct = await checkSVIPImmunity(actorId, seat.occupant_id);
    if (!canAct) throw new SVIPImmunityError();
  }

  await supabaseAdmin
    .from('room_seats')
    .update({ is_muted: muted })
    .eq('room_id', roomId)
    .eq('seat_index', seatIndex);
}

/**
 * Kick user from seat (manager action with SVIP immunity check)
 */
export async function kickFromSeat(
  roomId: string,
  actorId: string,
  targetUserId: string
): Promise<void> {
  // Verify actor has permission
  const hasPermission = await hasManagerPermission(roomId, actorId, 'can_kick');
  if (!hasPermission) throw new AuthorizationError('No permission to kick');

  // Check SVIP immunity
  const canAct = await checkSVIPImmunity(actorId, targetUserId);
  if (!canAct) throw new SVIPImmunityError();

  await leaveSeat(roomId, targetUserId);
}

// =============================================================================
// ROOM MANAGERS
// =============================================================================

/**
 * Add room manager
 */
export async function addRoomManager(
  roomId: string,
  granterId: string,
  userId: string,
  level: ManagerLevel,
  permissions?: Partial<{
    can_mute: boolean;
    can_kick: boolean;
    can_ban: boolean;
    can_lock_seats: boolean;
    can_manage_queue: boolean;
    can_edit_room: boolean;
    can_grant_manager: boolean;
  }>
): Promise<void> {
  // Verify granter has permission
  const room = await getRoomById(roomId);
  if (!room) throw new NotFoundError('Room');
  
  const isOwner = room.owner_id === granterId;
  const canGrant = isOwner || await hasManagerPermission(roomId, granterId, 'can_grant_manager');
  if (!canGrant) throw new AuthorizationError('No permission to grant manager');

  await supabaseAdmin.from('room_managers').upsert({
    room_id: roomId,
    user_id: userId,
    manager_level: level,
    granted_by_id: granterId,
    ...permissions,
  });
}

/**
 * Remove room manager
 */
export async function removeRoomManager(
  roomId: string,
  removerId: string,
  userId: string
): Promise<void> {
  const room = await getRoomById(roomId);
  if (!room) throw new NotFoundError('Room');
  if (room.owner_id !== removerId) throw new AuthorizationError('Only owner can remove managers');

  await supabaseAdmin
    .from('room_managers')
    .delete()
    .eq('room_id', roomId)
    .eq('user_id', userId);
}

/**
 * Check if user has specific manager permission
 */
export async function hasManagerPermission(
  roomId: string,
  userId: string,
  permission: string
): Promise<boolean> {
  // Check if owner
  const room = await getRoomById(roomId);
  if (room?.owner_id === userId) return true;

  const { data } = await supabaseAdmin
    .from('room_managers')
    .select('*')
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .single();

  if (!data) return false;
  return data[permission as keyof typeof data] === true;
}

// =============================================================================
// BAN MANAGEMENT
// =============================================================================

/**
 * Ban user from room
 */
export async function banUserFromRoom(
  roomId: string,
  bannerId: string,
  userId: string,
  banType: BanType = 'room',
  reason?: string,
  durationHours?: number
): Promise<void> {
  // Verify banner has permission
  const hasPermission = await hasManagerPermission(roomId, bannerId, 'can_ban');
  if (!hasPermission) throw new AuthorizationError('No permission to ban');

  // Check SVIP immunity
  const canAct = await checkSVIPImmunity(bannerId, userId);
  if (!canAct) throw new SVIPImmunityError();

  // Remove from seat if on one
  await leaveSeat(roomId, userId);

  const expiresAt = durationHours 
    ? new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString()
    : null;

  await supabaseAdmin.from('room_bans').upsert({
    room_id: roomId,
    user_id: userId,
    ban_type: banType,
    reason,
    banned_by_id: bannerId,
    expires_at: expiresAt,
    is_active: true,
  });
}

/**
 * Unban user from room
 */
export async function unbanUserFromRoom(
  roomId: string,
  unbannerId: string,
  userId: string
): Promise<void> {
  const hasPermission = await hasManagerPermission(roomId, unbannerId, 'can_ban');
  if (!hasPermission) throw new AuthorizationError('No permission to unban');

  await supabaseAdmin
    .from('room_bans')
    .update({ is_active: false })
    .eq('room_id', roomId)
    .eq('user_id', userId);
}

/**
 * Check if user is banned from room
 */
export async function isUserBannedFromRoom(roomId: string, userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('room_bans')
    .select('id, expires_at')
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .single();

  if (!data) return false;
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    // Ban expired, mark as inactive
    await supabaseAdmin
      .from('room_bans')
      .update({ is_active: false })
      .eq('id', data.id);
    return false;
  }

  return true;
}

// =============================================================================
// SVIP IMMUNITY CHECK
// =============================================================================

/**
 * Check if actor can perform action on target based on SVIP level
 */
export async function checkSVIPImmunity(actorId: string, targetId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc('check_svip_immunity', {
    actor_id: actorId,
    target_id: targetId,
  });

  if (error) {
    console.error('[v0] SVIP immunity check error:', error);
    return true; // Allow action if check fails
  }

  return data === true;
}

// =============================================================================
// ROOM DISCOVERY
// =============================================================================

/**
 * Get live rooms with pagination
 */
export async function getLiveRooms(
  page: number = 1,
  limit: number = 20,
  categoryId?: string
) {
  const offset = (page - 1) * limit;

  let query = supabaseAdmin
    .from('rooms')
    .select(`
      *,
      owner:users!rooms_owner_id_fkey(id, display_name, avatar_url, svip_level),
      category:room_categories(id, name)
    `, { count: 'exact' })
    .eq('status', 'live')
    .eq('is_private', false)
    .order('current_viewers', { ascending: false })
    .range(offset, offset + limit - 1);

  if (categoryId) {
    query = query.eq('category_id', categoryId);
  }

  const { data, error, count } = await query;

  if (error) throw new AppError('Failed to fetch rooms', 'ROOMS_FETCH_ERROR', 500);

  return {
    items: (data || []).map(mapRoomToInfo),
    total: count || 0,
    page,
    limit,
  };
}

/**
 * Search rooms
 */
export async function searchRooms(
  query: string,
  page: number = 1,
  limit: number = 20
) {
  const offset = (page - 1) * limit;

  const { data, error, count } = await supabaseAdmin
    .from('rooms')
    .select(`
      *,
      owner:users!rooms_owner_id_fkey(id, display_name, avatar_url, svip_level)
    `, { count: 'exact' })
    .eq('status', 'live')
    .eq('is_private', false)
    .ilike('name', `%${query}%`)
    .order('current_viewers', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new AppError('Failed to search rooms', 'ROOMS_SEARCH_ERROR', 500);

  return {
    items: (data || []).map(mapRoomToInfo),
    total: count || 0,
    page,
    limit,
  };
}

/**
 * Get room categories
 */
export async function getRoomCategories() {
  const { data, error } = await supabaseAdmin
    .from('room_categories')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');

  if (error) throw new AppError('Failed to fetch categories', 'CATEGORIES_FETCH_ERROR', 500);
  return data;
}

// =============================================================================
// VIEWER TRACKING
// =============================================================================

/**
 * Update room viewer count
 */
export async function updateViewerCount(roomId: string, delta: number): Promise<number> {
  const key = REDIS_KEYS.ROOM_VIEWERS(roomId);
  const newCount = await redis.incrby(key, delta);
  
  // Update database periodically (every 10 changes or so)
  if (Math.abs(delta) >= 1) {
    await supabaseAdmin
      .from('rooms')
      .update({ current_viewers: Math.max(0, newCount) })
      .eq('id', roomId);
  }

  return Math.max(0, newCount);
}

/**
 * Record room visit
 */
export async function recordRoomVisit(
  roomId: string,
  userId: string,
  entrySource: string = 'browse'
): Promise<void> {
  await supabaseAdmin.from('room_visits').insert({
    room_id: roomId,
    user_id: userId,
    entry_source: entrySource,
  });

  // Increment total visitors
  await supabaseAdmin.rpc('increment_room_visitors', { p_room_id: roomId });
}

// =============================================================================
// HELPERS
// =============================================================================

function mapRoomToInfo(room: Record<string, unknown>): RoomInfo {
  return {
    id: room.id as string,
    room_code: room.room_code as string,
    name: room.name as string,
    description: room.description as string | undefined,
    cover_image_url: room.cover_image_url as string | undefined,
    background_image_url: room.background_image_url as string | undefined,
    owner_id: room.owner_id as string,
    room_type: room.room_type as RoomType,
    max_seats: room.max_seats as number,
    status: room.status as RoomStatus,
    is_private: room.is_private as boolean,
    min_user_level: room.min_user_level as number,
    min_svip_level: room.min_svip_level as number,
    current_viewers: room.current_viewers as number,
    total_gifts_value: room.total_gifts_value as number,
    welcome_message: room.welcome_message as string | undefined,
    announcement: room.announcement as string | undefined,
    owner: room.owner ? {
      id: (room.owner as Record<string, unknown>).id as string,
      display_name: (room.owner as Record<string, unknown>).display_name as string,
      avatar_url: (room.owner as Record<string, unknown>).avatar_url as string | undefined,
      svip_level: (room.owner as Record<string, unknown>).svip_level as number,
    } : undefined,
  };
}
