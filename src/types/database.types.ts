// ============================================================
// BESO PLATFORM: DATABASE TYPE DEFINITIONS
// Auto-generated types matching PostgreSQL schema
// ============================================================

// ============================================================
// ENUMS
// ============================================================

export type GenderType = 'male' | 'female';

export type AccountStatus = 'active' | 'suspended' | 'banned' | 'pending_verification';

export type WalletType = 'diamond' | 'charm' | 'gold';

export type TransactionType =
  | 'recharge'
  | 'gift_sent'
  | 'gift_received'
  | 'withdrawal'
  | 'svip_purchase'
  | 'aristocracy_purchase'
  | 'asset_purchase'
  | 'asset_dismantle'
  | 'quest_reward'
  | 'love_tree_blessing'
  | 'transfer'
  | 'refund'
  | 'commission';

export type TransactionStatus = 'pending' | 'completed' | 'failed' | 'cancelled' | 'refunded';

export type AssetState = 'unused' | 'equipped' | 'expired';

export type AssetCategory =
  | 'chat_bubble'
  | 'nickname_color'
  | 'entrance_effect'
  | 'room_background'
  | 'profile_frame'
  | 'gift_animation'
  | 'voice_effect'
  | 'seat_skin'
  | 'mic_ring'
  | 'badge';

export type RoomType = 'voice' | 'video' | 'party' | 'pk_battle' | 'radio';

export type RoomStatus = 'live' | 'offline' | 'suspended' | 'scheduled';

export type SeatStatus = 'open' | 'occupied' | 'locked' | 'reserved';

export type MessageType = 'text' | 'image' | 'audio' | 'gift' | 'system' | 'sticker';

export type QuestTrack = 'spender' | 'earner' | 'universal';

export type QuestStatus = 'available' | 'in_progress' | 'completed' | 'claimed' | 'expired';

export type WithdrawalStatus = 'pending_review' | 'approved' | 'processing' | 'completed' | 'rejected';

export type PaymentProvider = 'vodafone_cash' | 'fawry' | 'bank_transfer' | 'orange_money' | 'etisalat_cash' | 'instapay';

export type LoveTreeLevel = 'level_1' | 'level_2' | 'level_3' | 'level_4' | 'level_5';

export type ManagerLevel = 'admin' | 'super_manager' | 'manager' | 'moderator';

export type BanType = 'room' | 'platform' | 'chat' | 'voice';

export type GiftRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';

export type LeaderboardPeriod = 'daily' | 'weekly' | 'monthly' | 'all_time';

// ============================================================
// TABLE TYPES
// ============================================================

export interface User {
  id: string;
  username: string;
  display_name: string;
  gender: GenderType;
  avatar_url: string | null;
  bio: string | null;
  country_code: string;
  phone_number: string | null;
  date_of_birth: string | null;
  status: AccountStatus;
  is_verified: boolean;
  is_official: boolean;
  verification_badge_url: string | null;
  user_level: number;
  experience_points: number;
  svip_level: number;
  svip_points: number;
  aristocracy_tier: number;
  aristocracy_expires_at: string | null;
  is_host: boolean;
  host_rating: number;
  total_streaming_minutes: number;
  dm_response_rate: number;
  agency_id: string | null;
  agency_join_date: string | null;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

export interface UserProfile {
  id: string;
  user_id: string;
  equipped_chat_bubble_id: string | null;
  equipped_nickname_color: string | null;
  equipped_entrance_effect_id: string | null;
  equipped_profile_frame_id: string | null;
  equipped_mic_ring_id: string | null;
  followers_count: number;
  following_count: number;
  friends_count: number;
  total_gifts_received: number;
  total_charm_earned: number;
  peak_concurrent_viewers: number;
  total_diamonds_spent: number;
  total_gifts_sent: number;
  created_at: string;
  updated_at: string;
}

export interface UserSettings {
  id: string;
  user_id: string;
  allow_dm_from: string;
  show_online_status: boolean;
  show_wealth_level: boolean;
  show_charm_level: boolean;
  push_notifications: boolean;
  dm_notifications: boolean;
  gift_notifications: boolean;
  room_notifications: boolean;
  language: string;
  theme: string;
  created_at: string;
  updated_at: string;
}

export interface Wallet {
  id: string;
  user_id: string;
  wallet_type: WalletType;
  balance: number;
  lifetime_earned: number;
  lifetime_spent: number;
  pending_withdrawal: number;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface TransactionOrder {
  id: string;
  order_number: string;
  sender_id: string | null;
  receiver_id: string | null;
  transaction_type: TransactionType;
  status: TransactionStatus;
  amount: number;
  platform_commission: number;
  net_amount: number;
  source_wallet_type: WalletType | null;
  target_wallet_type: WalletType | null;
  reference_type: string | null;
  reference_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  processed_at: string | null;
  failed_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface WalletTransaction {
  id: string;
  wallet_id: string;
  order_id: string | null;
  transaction_type: TransactionType;
  amount: number;
  balance_before: number;
  balance_after: number;
  description: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface RechargePackage {
  id: string;
  name: string;
  diamonds: number;
  price_usd: number;
  price_egp: number;
  bonus_diamonds: number;
  is_featured: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface AssetCatalog {
  id: string;
  name: string;
  description: string | null;
  category: AssetCategory;
  rarity: GiftRarity;
  icon_url: string;
  preview_url: string | null;
  animation_url: string | null;
  diamond_price: number;
  gold_price: number;
  is_purchasable: boolean;
  duration_days: number | null;
  min_svip_level: number;
  min_aristocracy_tier: number;
  min_user_level: number;
  gender_restriction: GenderType | null;
  is_dismantlable: boolean;
  dismantle_gold_value: number;
  dismantle_shard_value: number;
  is_active: boolean;
  is_limited_edition: boolean;
  max_supply: number | null;
  current_supply: number;
  tags: string[];
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface UserInventory {
  id: string;
  user_id: string;
  asset_id: string;
  acquired_at: string;
  acquisition_type: string;
  acquisition_order_id: string | null;
  state: AssetState;
  equipped_at: string | null;
  expires_at: string | null;
  quantity: number;
  created_at: string;
  updated_at: string;
}

export interface UserAssetShards {
  id: string;
  user_id: string;
  chat_bubble_shards: number;
  entrance_effect_shards: number;
  profile_frame_shards: number;
  mic_ring_shards: number;
  generic_shards: number;
  created_at: string;
  updated_at: string;
}

export interface DismantleHistory {
  id: string;
  user_id: string;
  inventory_id: string;
  asset_id: string;
  quantity_dismantled: number;
  gold_received: number;
  shards_received: number;
  shard_type: AssetCategory | null;
  dismantled_at: string;
}

export interface RoomCategory {
  id: string;
  name: string;
  icon_url: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface Room {
  id: string;
  room_code: string;
  name: string;
  description: string | null;
  cover_image_url: string | null;
  background_image_url: string | null;
  owner_id: string;
  category_id: string | null;
  room_type: RoomType;
  max_seats: number;
  status: RoomStatus;
  is_private: boolean;
  password_hash: string | null;
  min_user_level: number;
  min_svip_level: number;
  welcome_message: string | null;
  announcement: string | null;
  room_tags: string[];
  current_viewers: number;
  peak_viewers: number;
  total_visitors: number;
  total_gifts_value: number;
  went_live_at: string | null;
  total_live_minutes: number;
  is_mic_free: boolean;
  auto_welcome: boolean;
  gift_sound_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface RoomSeat {
  id: string;
  room_id: string;
  seat_index: number;
  status: SeatStatus;
  occupant_id: string | null;
  is_muted: boolean;
  is_locked: boolean;
  reserved_for_id: string | null;
  reservation_expires_at: string | null;
  last_spoke_at: string | null;
  total_mic_seconds: number;
  seat_skin_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface RoomManager {
  id: string;
  room_id: string;
  user_id: string;
  manager_level: ManagerLevel;
  granted_by_id: string | null;
  can_mute: boolean;
  can_kick: boolean;
  can_ban: boolean;
  can_lock_seats: boolean;
  can_manage_queue: boolean;
  can_edit_room: boolean;
  can_grant_manager: boolean;
  created_at: string;
  updated_at: string;
}

export interface RoomBan {
  id: string;
  room_id: string;
  user_id: string;
  ban_type: BanType;
  reason: string | null;
  banned_by_id: string;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

export interface RoomVisit {
  id: string;
  room_id: string;
  user_id: string;
  joined_at: string;
  left_at: string | null;
  duration_seconds: number | null;
  entry_source: string;
}

export interface GiftCatalog {
  id: string;
  name: string;
  description: string | null;
  icon_url: string;
  animation_url: string | null;
  sound_url: string | null;
  diamond_cost: number;
  charm_value: number;
  category: string;
  rarity: GiftRarity;
  is_global_broadcast: boolean;
  broadcast_message_template: string | null;
  supports_combo: boolean;
  max_combo: number;
  combo_multiplier: number;
  is_active: boolean;
  is_limited_edition: boolean;
  available_from: string | null;
  available_until: string | null;
  min_svip_level: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface GiftTransaction {
  id: string;
  order_id: string;
  sender_id: string;
  receiver_id: string;
  gift_id: string;
  quantity: number;
  room_id: string | null;
  is_private_gift: boolean;
  total_diamond_cost: number;
  total_charm_value: number;
  platform_commission: number;
  combo_count: number;
  combo_multiplier: number;
  was_broadcast: boolean;
  gift_message: string | null;
  created_at: string;
}

export interface ActiveGiftCombo {
  id: string;
  sender_id: string;
  receiver_id: string;
  gift_id: string;
  room_id: string | null;
  current_combo: number;
  last_gift_at: string;
  combo_expires_at: string;
}

export interface RoomChatMessage {
  id: string;
  room_id: string;
  user_id: string;
  message_type: MessageType;
  content: string | null;
  media_url: string | null;
  chat_bubble_id: string | null;
  nickname_color: string | null;
  user_display_name: string;
  user_avatar_url: string | null;
  user_svip_level: number;
  user_aristocracy_tier: number;
  reply_to_message_id: string | null;
  is_deleted: boolean;
  deleted_by_id: string | null;
  created_at: string;
}

export interface GlobalAnnouncement {
  id: string;
  trigger_type: string;
  trigger_user_id: string | null;
  target_user_id: string | null;
  message: string;
  icon_url: string | null;
  room_id: string | null;
  gift_id: string | null;
  duration_ms: number;
  priority: number;
  expires_at: string;
  created_at: string;
}

export interface DmConversation {
  id: string;
  user_one_id: string;
  user_two_id: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  user_one_unread: number;
  user_two_unread: number;
  user_one_last_sent: string | null;
  user_two_last_sent: string | null;
  user_one_messages_sent: number;
  user_two_messages_sent: number;
  user_one_response_count: number;
  user_two_response_count: number;
  blocked_by_user_one: boolean;
  blocked_by_user_two: boolean;
  created_at: string;
  updated_at: string;
}

export interface DmMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  message_type: MessageType;
  content: string | null;
  media_url: string | null;
  chat_bubble_id: string | null;
  nickname_color: string | null;
  reply_to_message_id: string | null;
  is_read: boolean;
  read_at: string | null;
  is_deleted: boolean;
  counts_for_love_tree: boolean;
  created_at: string;
}

export interface LoveTreePair {
  id: string;
  user_one_id: string;
  user_two_id: string;
  total_grams: number;
  current_level: LoveTreeLevel;
  today_grams: number;
  last_daily_reset: string;
  is_active: boolean;
  initiated_by_id: string;
  accepted_at: string | null;
  level_2_reached_at: string | null;
  level_3_reached_at: string | null;
  level_4_reached_at: string | null;
  level_5_reached_at: string | null;
  cp_title: string | null;
  cp_badge_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface LoveTreeBlessing {
  id: string;
  pair_id: string;
  from_user_id: string;
  blessing_type: string;
  grams_added: number;
  reference_type: string | null;
  reference_id: string | null;
  total_grams_after: number;
  level_after: LoveTreeLevel;
  triggered_level_up: boolean;
  created_at: string;
}

export interface SharedAlbum {
  id: string;
  pair_id: string;
  name: string;
  description: string | null;
  cover_image_url: string | null;
  required_level: LoveTreeLevel;
  is_unlocked: boolean;
  unlocked_at: string | null;
  photo_count: number;
  created_at: string;
}

export interface SharedAlbumPhoto {
  id: string;
  album_id: string;
  uploaded_by_id: string;
  image_url: string;
  thumbnail_url: string | null;
  caption: string | null;
  is_encrypted: boolean;
  created_at: string;
}

export interface SvipTier {
  id: string;
  tier_level: number;
  name: string;
  points_required: number;
  badge_url: string | null;
  frame_url: string | null;
  entrance_effect_id: string | null;
  can_bypass_room_level_limit: boolean;
  can_bypass_seat_queue: boolean;
  has_vip_entry_announcement: boolean;
  entry_announcement_template: string | null;
  chat_bubble_id: string | null;
  nickname_color: string | null;
  created_at: string;
}

export interface AristocracyTier {
  id: string;
  tier_level: number;
  name: string;
  monthly_diamond_cost: number;
  yearly_diamond_cost: number;
  badge_url: string | null;
  exclusive_gifts_access: boolean;
  exclusive_assets_access: boolean;
  daily_gold_allowance: number;
  gift_discount_percent: number;
  created_at: string;
}

export interface QuestDefinition {
  id: string;
  name: string;
  description: string;
  icon_url: string | null;
  track: QuestTrack;
  quest_type: string;
  target_metric: string;
  target_value: number;
  reset_period: string | null;
  reward_type: string;
  reward_amount: number | null;
  reward_asset_id: string | null;
  category: string;
  sort_order: number;
  is_active: boolean;
  available_from: string | null;
  available_until: string | null;
  min_user_level: number;
  min_svip_level: number;
  created_at: string;
  updated_at: string;
}

export interface UserQuestProgress {
  id: string;
  user_id: string;
  quest_id: string;
  current_value: number;
  target_value: number;
  status: QuestStatus;
  started_at: string;
  completed_at: string | null;
  claimed_at: string | null;
  expires_at: string | null;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserAchievement {
  id: string;
  user_id: string;
  achievement_code: string;
  achievement_name: string;
  description: string | null;
  icon_url: string | null;
  unlocked_at: string;
  is_featured: boolean;
  rarity: GiftRarity;
}

export interface LeaderboardSnapshot {
  id: string;
  leaderboard_type: string;
  period: LeaderboardPeriod;
  period_start: string;
  period_end: string;
  snapshot_at: string;
  is_final: boolean;
  created_at: string;
}

export interface LeaderboardEntry {
  id: string;
  snapshot_id: string;
  user_id: string;
  rank: number;
  score: number;
  display_name: string | null;
  avatar_url: string | null;
  svip_level: number | null;
  previous_rank: number | null;
  rank_change: number | null;
  created_at: string;
}

export interface RealtimeLeaderboard {
  id: string;
  leaderboard_type: string;
  user_id: string;
  score: number;
  period_start: string;
  updated_at: string;
}

export interface UserPaymentMethod {
  id: string;
  user_id: string;
  provider: PaymentProvider;
  account_holder_name: string;
  account_number: string;
  bank_name: string | null;
  bank_branch: string | null;
  routing_number: string | null;
  phone_number: string | null;
  is_verified: boolean;
  verified_at: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface WithdrawalRequest {
  id: string;
  request_number: string;
  user_id: string;
  payment_method_id: string;
  order_id: string | null;
  charm_amount: number;
  conversion_rate: number;
  local_amount: number;
  platform_fee: number;
  net_amount: number;
  currency_code: string;
  status: WithdrawalStatus;
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by_id: string | null;
  approved_at: string | null;
  processing_started_at: string | null;
  completed_at: string | null;
  rejection_reason: string | null;
  failure_reason: string | null;
  provider_reference: string | null;
  provider_response: Record<string, unknown> | null;
  admin_notes: string | null;
  user_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Agency {
  id: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  owner_id: string;
  contact_email: string | null;
  contact_phone: string | null;
  platform_commission_rate: number;
  agency_commission_rate: number;
  is_active: boolean;
  is_verified: boolean;
  verified_at: string | null;
  total_hosts: number;
  total_earnings: number;
  created_at: string;
  updated_at: string;
}

export interface AgencyManager {
  id: string;
  agency_id: string;
  user_id: string;
  can_add_hosts: boolean;
  can_remove_hosts: boolean;
  can_view_earnings: boolean;
  can_manage_targets: boolean;
  added_at: string;
  added_by_id: string | null;
}

export interface AgencyContract {
  id: string;
  agency_id: string;
  host_id: string;
  host_commission_rate: number;
  minimum_hours_monthly: number;
  status: string;
  started_at: string;
  ends_at: string | null;
  terminated_at: string | null;
  termination_reason: string | null;
  approved_by_id: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface HostDailyStats {
  id: string;
  user_id: string;
  stat_date: string;
  total_mic_minutes: number;
  is_valid_streaming_day: boolean;
  gifts_received_count: number;
  gifts_received_value: number;
  unique_gifters_count: number;
  peak_viewers: number;
  total_viewers: number;
  new_followers: number;
  dms_received: number;
  dms_responded: number;
  response_rate: number;
  calls_received: number;
  calls_accepted: number;
  call_minutes: number;
  created_at: string;
  updated_at: string;
}

export interface HostMonthlyStats {
  id: string;
  user_id: string;
  stat_month: string;
  total_streaming_minutes: number;
  valid_streaming_days: number;
  total_charm_earned: number;
  total_gifts_received: number;
  charm_rank: number | null;
  streaming_rank: number | null;
  agency_id: string | null;
  gross_earnings: number;
  agency_commission: number;
  net_earnings: number;
  created_at: string;
  updated_at: string;
}

export interface UserFollow {
  id: string;
  follower_id: string;
  following_id: string;
  is_mutual: boolean;
  created_at: string;
}

export interface UserBlock {
  id: string;
  blocker_id: string;
  blocked_id: string;
  reason: string | null;
  created_at: string;
}

export interface UserPresence {
  id: string;
  user_id: string;
  is_online: boolean;
  last_seen_at: string;
  current_room_id: string | null;
  current_seat_index: number | null;
  device_type: string | null;
  app_version: string | null;
  socket_id: string | null;
  connected_at: string | null;
  updated_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  notification_type: string;
  title: string;
  body: string | null;
  image_url: string | null;
  action_type: string | null;
  action_data: Record<string, unknown> | null;
  from_user_id: string | null;
  room_id: string | null;
  is_read: boolean;
  read_at: string | null;
  was_pushed: boolean;
  pushed_at: string | null;
  created_at: string;
}

export interface RoomFavorite {
  id: string;
  user_id: string;
  room_id: string;
  created_at: string;
}

export interface UserReport {
  id: string;
  reporter_id: string;
  reported_user_id: string | null;
  reported_room_id: string | null;
  reported_message_id: string | null;
  report_type: string;
  description: string | null;
  evidence_urls: string[] | null;
  status: string;
  resolved_at: string | null;
  resolved_by_id: string | null;
  resolution_notes: string | null;
  action_taken: string | null;
  created_at: string;
  updated_at: string;
}
