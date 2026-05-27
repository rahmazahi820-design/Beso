/**
 * Validation Schemas using Zod
 * Centralized validation for all API inputs
 */

import { z } from 'zod';

// =============================================================================
// COMMON SCHEMAS
// =============================================================================

export const uuidSchema = z.string().uuid();
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// =============================================================================
// AUTH SCHEMAS
// =============================================================================

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_]+$/),
  display_name: z.string().min(2).max(100),
  gender: z.enum(['male', 'female']),
  date_of_birth: z.string().datetime().optional(),
  country_code: z.string().length(2).default('EG'),
  phone_number: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const refreshTokenSchema = z.object({
  refresh_token: z.string(),
});

// =============================================================================
// USER SCHEMAS
// =============================================================================

export const updateProfileSchema = z.object({
  display_name: z.string().min(2).max(100).optional(),
  bio: z.string().max(500).optional(),
  avatar_url: z.string().url().optional(),
});

export const updateSettingsSchema = z.object({
  allow_dm_from: z.enum(['everyone', 'friends', 'nobody']).optional(),
  show_online_status: z.boolean().optional(),
  show_wealth_level: z.boolean().optional(),
  show_charm_level: z.boolean().optional(),
  push_notifications: z.boolean().optional(),
  dm_notifications: z.boolean().optional(),
  gift_notifications: z.boolean().optional(),
  room_notifications: z.boolean().optional(),
  language: z.string().max(5).optional(),
  theme: z.enum(['light', 'dark']).optional(),
});

// =============================================================================
// WALLET SCHEMAS
// =============================================================================

export const rechargeSchema = z.object({
  package_id: z.string().uuid(),
  payment_method: z.string(),
  payment_reference: z.string().optional(),
});

export const withdrawalRequestSchema = z.object({
  amount: z.number().int().positive().min(1000), // Minimum 1000 charm
  payment_method_id: z.string().uuid(),
  notes: z.string().max(500).optional(),
});

export const addPaymentMethodSchema = z.object({
  provider: z.enum(['vodafone_cash', 'fawry', 'bank_transfer', 'orange_money', 'etisalat_cash', 'instapay']),
  account_holder_name: z.string().min(2).max(200),
  account_number: z.string().min(5).max(100),
  bank_name: z.string().max(100).optional(),
  bank_branch: z.string().max(100).optional(),
  routing_number: z.string().max(50).optional(),
  phone_number: z.string().max(20).optional(),
  is_default: z.boolean().default(false),
});

// =============================================================================
// ROOM SCHEMAS
// =============================================================================

export const createRoomSchema = z.object({
  name: z.string().min(3).max(100),
  description: z.string().max(500).optional(),
  room_type: z.enum(['voice', 'video', 'party', 'pk_battle', 'radio']).default('voice'),
  category_id: z.string().uuid().optional(),
  max_seats: z.number().int().min(2).max(12).default(8),
  is_private: z.boolean().default(false),
  password: z.string().min(4).max(20).optional(),
  min_user_level: z.number().int().min(0).default(0),
  min_svip_level: z.number().int().min(0).max(9).default(0),
  welcome_message: z.string().max(200).optional(),
});

export const updateRoomSchema = createRoomSchema.partial();

export const joinRoomSchema = z.object({
  room_id: z.string().uuid(),
  password: z.string().optional(),
});

export const seatActionSchema = z.object({
  room_id: z.string().uuid(),
  seat_index: z.number().int().min(0).max(11),
  action: z.enum(['take', 'leave', 'lock', 'unlock', 'mute', 'unmute', 'kick']),
  target_user_id: z.string().uuid().optional(), // For kick action
});

export const roomManagerActionSchema = z.object({
  room_id: z.string().uuid(),
  user_id: z.string().uuid(),
  action: z.enum(['add', 'remove', 'update']),
  manager_level: z.enum(['admin', 'super_manager', 'manager', 'moderator']).optional(),
  permissions: z.object({
    can_mute: z.boolean().optional(),
    can_kick: z.boolean().optional(),
    can_ban: z.boolean().optional(),
    can_lock_seats: z.boolean().optional(),
    can_manage_queue: z.boolean().optional(),
    can_edit_room: z.boolean().optional(),
    can_grant_manager: z.boolean().optional(),
  }).optional(),
});

export const banUserSchema = z.object({
  room_id: z.string().uuid(),
  user_id: z.string().uuid(),
  ban_type: z.enum(['room', 'platform', 'chat', 'voice']).default('room'),
  reason: z.string().max(500).optional(),
  duration_hours: z.number().int().positive().optional(), // null = permanent
});

// =============================================================================
// GIFT SCHEMAS
// =============================================================================

export const sendGiftSchema = z.object({
  receiver_id: z.string().uuid(),
  gift_id: z.string().uuid(),
  quantity: z.number().int().positive().min(1).max(9999).default(1),
  room_id: z.string().uuid().optional(),
  message: z.string().max(200).optional(),
  is_private: z.boolean().default(false),
});

// =============================================================================
// CHAT SCHEMAS
// =============================================================================

export const roomMessageSchema = z.object({
  room_id: z.string().uuid(),
  content: z.string().min(1).max(500),
  message_type: z.enum(['text', 'image', 'sticker']).default('text'),
  media_url: z.string().url().optional(),
  reply_to_message_id: z.string().uuid().optional(),
});

export const dmMessageSchema = z.object({
  recipient_id: z.string().uuid(),
  content: z.string().min(1).max(1000),
  message_type: z.enum(['text', 'image', 'audio', 'sticker']).default('text'),
  media_url: z.string().url().optional(),
  reply_to_message_id: z.string().uuid().optional(),
});

// =============================================================================
// INVENTORY SCHEMAS
// =============================================================================

export const purchaseAssetSchema = z.object({
  asset_id: z.string().uuid(),
  currency: z.enum(['diamond', 'gold']).default('diamond'),
});

export const equipAssetSchema = z.object({
  inventory_id: z.string().uuid(),
});

export const dismantleAssetsSchema = z.object({
  inventory_ids: z.array(z.string().uuid()).min(1).max(50),
});

// =============================================================================
// LOVE TREE SCHEMAS
// =============================================================================

export const createLoveTreeSchema = z.object({
  partner_id: z.string().uuid(),
});

export const loveTreeBlessingSchema = z.object({
  pair_id: z.string().uuid(),
  blessing_type: z.enum(['dm_task', 'gift', 'call', 'daily_login', 'event']),
  grams: z.number().int().positive(),
  reference_id: z.string().uuid().optional(),
});

export const uploadAlbumPhotoSchema = z.object({
  pair_id: z.string().uuid(),
  image_url: z.string().url(),
  caption: z.string().max(200).optional(),
});

// =============================================================================
// QUEST SCHEMAS
// =============================================================================

export const claimQuestRewardSchema = z.object({
  quest_progress_id: z.string().uuid(),
});

export const updateQuestProgressSchema = z.object({
  quest_id: z.string().uuid(),
  increment: z.number().int().positive().default(1),
});

// =============================================================================
// SOCIAL SCHEMAS
// =============================================================================

export const followUserSchema = z.object({
  user_id: z.string().uuid(),
});

export const blockUserSchema = z.object({
  user_id: z.string().uuid(),
  reason: z.string().max(200).optional(),
});

export const reportUserSchema = z.object({
  reported_user_id: z.string().uuid().optional(),
  reported_room_id: z.string().uuid().optional(),
  reported_message_id: z.string().uuid().optional(),
  report_type: z.enum(['harassment', 'spam', 'inappropriate_content', 'fraud', 'other']),
  description: z.string().max(1000),
  evidence_urls: z.array(z.string().url()).max(5).optional(),
});

// =============================================================================
// AGENCY SCHEMAS
// =============================================================================

export const createAgencySchema = z.object({
  name: z.string().min(3).max(200),
  description: z.string().max(1000).optional(),
  logo_url: z.string().url().optional(),
  contact_email: z.string().email().optional(),
  contact_phone: z.string().max(20).optional(),
});

export const agencyContractSchema = z.object({
  agency_id: z.string().uuid(),
  host_id: z.string().uuid(),
  host_commission_rate: z.number().min(0).max(100),
  minimum_hours_monthly: z.number().int().min(0).default(0),
});

// =============================================================================
// EXPORT TYPES
// =============================================================================

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
export type RechargeInput = z.infer<typeof rechargeSchema>;
export type WithdrawalRequestInput = z.infer<typeof withdrawalRequestSchema>;
export type AddPaymentMethodInput = z.infer<typeof addPaymentMethodSchema>;
export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type UpdateRoomInput = z.infer<typeof updateRoomSchema>;
export type JoinRoomInput = z.infer<typeof joinRoomSchema>;
export type SeatActionInput = z.infer<typeof seatActionSchema>;
export type SendGiftInput = z.infer<typeof sendGiftSchema>;
export type RoomMessageInput = z.infer<typeof roomMessageSchema>;
export type DmMessageInput = z.infer<typeof dmMessageSchema>;
export type PurchaseAssetInput = z.infer<typeof purchaseAssetSchema>;
export type EquipAssetInput = z.infer<typeof equipAssetSchema>;
export type DismantleAssetsInput = z.infer<typeof dismantleAssetsSchema>;
export type CreateLoveTreeInput = z.infer<typeof createLoveTreeSchema>;
export type ReportUserInput = z.infer<typeof reportUserSchema>;
export type CreateAgencyInput = z.infer<typeof createAgencySchema>;
