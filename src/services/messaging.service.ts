/**
 * Messaging Service
 * Handles DM conversations, room chat, and message delivery
 */

import { supabaseAdmin } from '../lib/supabase';
import { 
  AppError, 
  NotFoundError,
  AuthorizationError,
  paginatedResponse 
} from '../lib/utils';
import { buildChatMessagePayload, getUserEquippedAssets } from './gift.service';
import type { MessageType } from '../types/database.types';

// =============================================================================
// TYPES
// =============================================================================

export interface DMConversation {
  id: string;
  participant1_id: string;
  participant2_id: string;
  last_message_id?: string;
  last_message_at?: string;
  participant1_unread_count: number;
  participant2_unread_count: number;
  last_message_preview?: string;
  other_user?: {
    id: string;
    display_name: string;
    avatar_url?: string;
    is_online: boolean;
  };
}

export interface DirectMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  message_type: MessageType;
  media_url?: string;
  is_read: boolean;
  read_at?: string;
  reply_to_message_id?: string;
  created_at: string;
  sender?: {
    id: string;
    display_name: string;
    avatar_url?: string;
  };
}

export interface RoomMessage {
  id: string;
  room_id: string;
  sender_id: string;
  content: string;
  message_type: MessageType;
  media_url?: string;
  reply_to_message_id?: string;
  is_pinned: boolean;
  created_at: string;
  sender?: {
    id: string;
    display_name: string;
    avatar_url?: string;
    svip_level: number;
    aristocracy_tier: number;
  };
  chat_bubble_url?: string;
  nickname_color?: string;
}

// =============================================================================
// DM PERMISSION CHECKS
// =============================================================================

/**
 * Check if user can send DM to target
 */
export async function canSendDMTo(senderId: string, receiverId: string): Promise<{ 
  allowed: boolean; 
  reason?: string;
}> {
  // Check if target has blocked sender
  const { data: block } = await supabaseAdmin
    .from('user_blocks')
    .select('id')
    .eq('blocker_id', receiverId)
    .eq('blocked_id', senderId)
    .single();

  if (block) {
    return { allowed: false, reason: 'You cannot message this user' };
  }

  // Check target's DM settings
  const { data: settings } = await supabaseAdmin
    .from('user_settings')
    .select('allow_dm_from')
    .eq('user_id', receiverId)
    .single();

  const dmSetting = settings?.allow_dm_from || 'everyone';

  if (dmSetting === 'nobody') {
    return { allowed: false, reason: 'This user does not accept messages' };
  }

  if (dmSetting === 'friends') {
    // Check if they follow each other (mutual follow = friends)
    const { data: follows } = await supabaseAdmin
      .from('user_follows')
      .select('follower_id, following_id')
      .or(`and(follower_id.eq.${senderId},following_id.eq.${receiverId}),and(follower_id.eq.${receiverId},following_id.eq.${senderId})`);

    const isMutual = follows && follows.length >= 2;
    if (!isMutual) {
      return { allowed: false, reason: 'This user only accepts messages from friends' };
    }
  }

  return { allowed: true };
}

// =============================================================================
// DM CONVERSATIONS
// =============================================================================

/**
 * Get or create DM conversation between two users
 */
export async function getOrCreateDMConversation(
  user1Id: string,
  user2Id: string
): Promise<DMConversation> {
  // Normalize participant order (smaller UUID first)
  const [participant1_id, participant2_id] = [user1Id, user2Id].sort();

  // Try to find existing conversation
  const { data: existing } = await supabaseAdmin
    .from('dm_conversations')
    .select('*')
    .eq('participant1_id', participant1_id)
    .eq('participant2_id', participant2_id)
    .single();

  if (existing) {
    return existing as DMConversation;
  }

  // Create new conversation
  const { data: created, error } = await supabaseAdmin
    .from('dm_conversations')
    .insert({ participant1_id, participant2_id })
    .select()
    .single();

  if (error) throw new AppError('Failed to create conversation', 'CONVERSATION_CREATE_ERROR', 500);
  return created as DMConversation;
}

/**
 * Get user's DM conversations with pagination
 */
export async function getDMConversations(
  userId: string,
  page: number = 1,
  limit: number = 20
) {
  const offset = (page - 1) * limit;

  const { data, error, count } = await supabaseAdmin
    .from('dm_conversations')
    .select(`
      *,
      participant1:users!dm_conversations_participant1_id_fkey(id, display_name, avatar_url),
      participant2:users!dm_conversations_participant2_id_fkey(id, display_name, avatar_url)
    `, { count: 'exact' })
    .or(`participant1_id.eq.${userId},participant2_id.eq.${userId}`)
    .not('last_message_at', 'is', null)
    .order('last_message_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new AppError('Failed to fetch conversations', 'CONVERSATIONS_FETCH_ERROR', 500);

  // Transform to include other_user
  const conversations = (data || []).map(conv => {
    const isParticipant1 = conv.participant1_id === userId;
    const otherUser = isParticipant1 ? conv.participant2 : conv.participant1;
    const unreadCount = isParticipant1 
      ? conv.participant1_unread_count 
      : conv.participant2_unread_count;

    return {
      ...conv,
      unread_count: unreadCount,
      other_user: otherUser ? {
        id: otherUser.id,
        display_name: otherUser.display_name,
        avatar_url: otherUser.avatar_url,
        is_online: false, // Would be fetched from Redis presence
      } : undefined,
    };
  });

  return paginatedResponse(conversations, page, limit, count || 0);
}

/**
 * Get messages in a DM conversation
 */
export async function getDMMessages(
  conversationId: string,
  userId: string,
  page: number = 1,
  limit: number = 50
) {
  // Verify user is part of conversation
  const { data: conv } = await supabaseAdmin
    .from('dm_conversations')
    .select('participant1_id, participant2_id')
    .eq('id', conversationId)
    .single();

  if (!conv || (conv.participant1_id !== userId && conv.participant2_id !== userId)) {
    throw new AuthorizationError('Not part of this conversation');
  }

  const offset = (page - 1) * limit;

  const { data, error, count } = await supabaseAdmin
    .from('direct_messages')
    .select(`
      *,
      sender:users!direct_messages_sender_id_fkey(id, display_name, avatar_url)
    `, { count: 'exact' })
    .eq('conversation_id', conversationId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new AppError('Failed to fetch messages', 'MESSAGES_FETCH_ERROR', 500);

  // Mark messages as read
  await markDMsAsRead(conversationId, userId);

  return paginatedResponse(data || [], page, limit, count || 0);
}

/**
 * Send a DM
 */
export async function sendDM(
  senderId: string,
  recipientId: string,
  content: string,
  messageType: MessageType = 'text',
  mediaUrl?: string,
  replyToMessageId?: string
): Promise<DirectMessage> {
  // Check permission
  const permCheck = await canSendDMTo(senderId, recipientId);
  if (!permCheck.allowed) {
    throw new AuthorizationError(permCheck.reason || 'Cannot send message');
  }

  // Get or create conversation
  const conversation = await getOrCreateDMConversation(senderId, recipientId);

  // Insert message
  const { data: message, error } = await supabaseAdmin
    .from('direct_messages')
    .insert({
      conversation_id: conversation.id,
      sender_id: senderId,
      content,
      message_type: messageType,
      media_url: mediaUrl,
      reply_to_message_id: replyToMessageId,
    })
    .select(`
      *,
      sender:users!direct_messages_sender_id_fkey(id, display_name, avatar_url)
    `)
    .single();

  if (error) throw new AppError('Failed to send message', 'MESSAGE_SEND_ERROR', 500);

  // Update conversation metadata
  const isParticipant1 = conversation.participant1_id === senderId;
  const unreadField = isParticipant1 
    ? 'participant2_unread_count' 
    : 'participant1_unread_count';

  await supabaseAdmin
    .from('dm_conversations')
    .update({
      last_message_id: message.id,
      last_message_at: message.created_at,
      last_message_preview: content.slice(0, 100),
      [unreadField]: supabaseAdmin.rpc('increment_counter', { value: 1 }),
    })
    .eq('id', conversation.id);

  return message as DirectMessage;
}

/**
 * Mark DMs as read
 */
export async function markDMsAsRead(conversationId: string, userId: string): Promise<void> {
  const now = new Date().toISOString();

  // Update messages
  await supabaseAdmin
    .from('direct_messages')
    .update({ is_read: true, read_at: now })
    .eq('conversation_id', conversationId)
    .neq('sender_id', userId)
    .eq('is_read', false);

  // Reset unread count
  const { data: conv } = await supabaseAdmin
    .from('dm_conversations')
    .select('participant1_id, participant2_id')
    .eq('id', conversationId)
    .single();

  if (conv) {
    const isParticipant1 = conv.participant1_id === userId;
    const unreadField = isParticipant1 
      ? 'participant1_unread_count' 
      : 'participant2_unread_count';

    await supabaseAdmin
      .from('dm_conversations')
      .update({ [unreadField]: 0 })
      .eq('id', conversationId);
  }
}

// =============================================================================
// ROOM CHAT
// =============================================================================

/**
 * Send message to room chat
 */
export async function sendRoomMessage(
  roomId: string,
  senderId: string,
  content: string,
  messageType: MessageType = 'text',
  mediaUrl?: string,
  replyToMessageId?: string
): Promise<RoomMessage & { chat_bubble_url?: string; nickname_color?: string }> {
  // Build message payload with asset injection
  const payload = await buildChatMessagePayload(senderId, content, messageType, mediaUrl);

  // Insert message
  const { data: message, error } = await supabaseAdmin
    .from('room_messages')
    .insert({
      room_id: roomId,
      sender_id: senderId,
      content,
      message_type: messageType,
      media_url: mediaUrl,
      reply_to_message_id: replyToMessageId,
    })
    .select(`
      *,
      sender:users!room_messages_sender_id_fkey(id, display_name, avatar_url, svip_level, aristocracy_tier)
    `)
    .single();

  if (error) throw new AppError('Failed to send message', 'MESSAGE_SEND_ERROR', 500);

  return {
    ...message,
    chat_bubble_url: payload.chat_bubble_url,
    nickname_color: payload.nickname_color,
  } as RoomMessage & { chat_bubble_url?: string; nickname_color?: string };
}

/**
 * Get room chat history
 */
export async function getRoomMessages(
  roomId: string,
  page: number = 1,
  limit: number = 50
) {
  const offset = (page - 1) * limit;

  const { data, error, count } = await supabaseAdmin
    .from('room_messages')
    .select(`
      *,
      sender:users!room_messages_sender_id_fkey(id, display_name, avatar_url, svip_level, aristocracy_tier)
    `, { count: 'exact' })
    .eq('room_id', roomId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new AppError('Failed to fetch messages', 'MESSAGES_FETCH_ERROR', 500);

  return paginatedResponse(data || [], page, limit, count || 0);
}

/**
 * Pin/Unpin room message
 */
export async function toggleRoomMessagePin(
  roomId: string,
  messageId: string,
  actorId: string,
  pinned: boolean
): Promise<void> {
  // Verify actor is room owner or manager
  const { data: room } = await supabaseAdmin
    .from('rooms')
    .select('owner_id')
    .eq('id', roomId)
    .single();

  if (room?.owner_id !== actorId) {
    const { data: manager } = await supabaseAdmin
      .from('room_managers')
      .select('id')
      .eq('room_id', roomId)
      .eq('user_id', actorId)
      .single();

    if (!manager) {
      throw new AuthorizationError('No permission to pin messages');
    }
  }

  await supabaseAdmin
    .from('room_messages')
    .update({ is_pinned: pinned })
    .eq('id', messageId)
    .eq('room_id', roomId);
}

/**
 * Delete room message
 */
export async function deleteRoomMessage(
  roomId: string,
  messageId: string,
  actorId: string
): Promise<void> {
  // Get message
  const { data: message } = await supabaseAdmin
    .from('room_messages')
    .select('sender_id')
    .eq('id', messageId)
    .eq('room_id', roomId)
    .single();

  if (!message) throw new NotFoundError('Message');

  // Check if actor is sender, room owner, or manager
  if (message.sender_id !== actorId) {
    const { data: room } = await supabaseAdmin
      .from('rooms')
      .select('owner_id')
      .eq('id', roomId)
      .single();

    if (room?.owner_id !== actorId) {
      const { data: manager } = await supabaseAdmin
        .from('room_managers')
        .select('id')
        .eq('room_id', roomId)
        .eq('user_id', actorId)
        .single();

      if (!manager) {
        throw new AuthorizationError('No permission to delete this message');
      }
    }
  }

  await supabaseAdmin
    .from('room_messages')
    .update({ is_deleted: true })
    .eq('id', messageId);
}
