// ============================================================
// BESO PLATFORM: API & WEBSOCKET TYPE DEFINITIONS
// Request/Response types and WebSocket event contracts
// ============================================================

import type {
  User,
  UserProfile,
  Wallet,
  Room,
  RoomSeat,
  GiftCatalog,
  AssetCatalog,
  DmConversation,
  DmMessage,
  LoveTreePair,
  QuestDefinition,
  UserQuestProgress,
  LeaderboardEntry,
  WithdrawalRequest,
  Notification,
  GenderType,
  WalletType,
  AssetState,
  AssetCategory,
  RoomType,
  SeatStatus,
  MessageType,
  QuestTrack,
  PaymentProvider,
  WithdrawalStatus,
  LoveTreeLevel,
  ManagerLevel,
} from './database.types';

// ============================================================
// API RESPONSE WRAPPERS
// ============================================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    hasMore?: boolean;
  };
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  cursor?: string;
}

// ============================================================
// AUTHENTICATION
// ============================================================

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  display_name: string;
  gender: GenderType;
  date_of_birth?: string;
  country_code?: string;
  referral_code?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
  device_type?: string;
  device_id?: string;
}

export interface AuthResponse {
  user: UserWithProfile;
  wallets: Wallet[];
  access_token: string;
  refresh_token: string;
  expires_at: string;
}

export interface UserWithProfile extends User {
  profile: UserProfile;
}

// ============================================================
// USER & PROFILE
// ============================================================

export interface UpdateProfileRequest {
  display_name?: string;
  avatar_url?: string;
  bio?: string;
  country_code?: string;
}

export interface UserPublicProfile {
  id: string;
  username: string;
  display_name: string;
  gender: GenderType;
  avatar_url: string | null;
  bio: string | null;
  is_verified: boolean;
  is_official: boolean;
  user_level: number;
  svip_level: number;
  aristocracy_tier: number;
  is_host: boolean;
  host_rating: number;
  is_online: boolean;
  current_room_id: string | null;
  profile: {
    equipped_chat_bubble_id: string | null;
    equipped_nickname_color: string | null;
    equipped_entrance_effect_id: string | null;
    equipped_profile_frame_id: string | null;
    followers_count: number;
    following_count: number;
    friends_count: number;
    total_gifts_received: number;
    total_charm_earned: number;
  };
}

// ============================================================
// WALLET & TRANSACTIONS
// ============================================================

export interface WalletBalance {
  wallet_type: WalletType;
  balance: number;
  pending_withdrawal: number;
}

export interface RechargeRequest {
  package_id: string;
  payment_method: string;
  payment_token?: string;
}

export interface RechargeResponse {
  order_id: string;
  order_number: string;
  diamonds_added: number;
  bonus_diamonds: number;
  new_balance: number;
}

export interface TransactionHistoryItem {
  id: string;
  order_number: string;
  transaction_type: string;
  amount: number;
  balance_after: number;
  description: string | null;
  created_at: string;
  related_user?: {
    id: string;
    display_name: string;
    avatar_url: string | null;
  };
}

// ============================================================
// ROOMS
// ============================================================

export interface CreateRoomRequest {
  name: string;
  description?: string;
  room_type: RoomType;
  max_seats?: number;
  is_private?: boolean;
  password?: string;
  category_id?: string;
  welcome_message?: string;
}

export interface UpdateRoomRequest {
  name?: string;
  description?: string;
  cover_image_url?: string;
  background_image_url?: string;
  is_private?: boolean;
  password?: string;
  min_user_level?: number;
  min_svip_level?: number;
  welcome_message?: string;
  announcement?: string;
  is_mic_free?: boolean;
  auto_welcome?: boolean;
  gift_sound_enabled?: boolean;
}

export interface RoomWithDetails extends Room {
  owner: UserPublicProfile;
  category: {
    id: string;
    name: string;
    icon_url: string | null;
  } | null;
  seats: RoomSeatWithUser[];
  managers: RoomManagerInfo[];
  is_favorited: boolean;
  is_banned: boolean;
}

export interface RoomSeatWithUser extends RoomSeat {
  occupant: UserPublicProfile | null;
}

export interface RoomManagerInfo {
  user_id: string;
  user: UserPublicProfile;
  manager_level: ManagerLevel;
  permissions: {
    can_mute: boolean;
    can_kick: boolean;
    can_ban: boolean;
    can_lock_seats: boolean;
  };
}

export interface RoomListItem {
  id: string;
  room_code: string;
  name: string;
  cover_image_url: string | null;
  owner: {
    id: string;
    display_name: string;
    avatar_url: string | null;
    svip_level: number;
  };
  room_type: RoomType;
  status: string;
  current_viewers: number;
  is_private: boolean;
  room_tags: string[];
}

// ============================================================
// SEAT ACTIONS
// ============================================================

export interface TakeSeatRequest {
  room_id: string;
  seat_index: number;
}

export interface SeatActionRequest {
  room_id: string;
  seat_index: number;
  target_user_id?: string;
}

export interface SeatActionResponse {
  success: boolean;
  seat: RoomSeatWithUser;
  action: string;
}

// ============================================================
// GIFTS
// ============================================================

export interface SendGiftRequest {
  receiver_id: string;
  gift_id: string;
  quantity: number;
  room_id?: string;
  is_private?: boolean;
  message?: string;
}

export interface SendGiftResponse {
  success: boolean;
  order_id: string;
  order_number: string;
  total_cost: number;
  charm_earned: number;
  combo_count: number;
  is_broadcast: boolean;
  sender_new_balance: number;
}

export interface GiftCatalogItem extends GiftCatalog {
  is_affordable: boolean;
  is_available: boolean;
}

// ============================================================
// INVENTORY & ASSETS
// ============================================================

export interface InventoryItem {
  id: string;
  asset: AssetCatalog;
  state: AssetState;
  quantity: number;
  acquired_at: string;
  equipped_at: string | null;
  expires_at: string | null;
  days_remaining: number | null;
}

export interface EquipAssetRequest {
  inventory_id: string;
}

export interface EquipAssetResponse {
  success: boolean;
  inventory_id: string;
  category: AssetCategory;
  expires_at: string | null;
}

export interface DismantleAssetsRequest {
  inventory_ids: string[];
}

export interface DismantleAssetsResponse {
  success: boolean;
  dismantled_count: number;
  gold_received: number;
  shards_received: number;
}

export interface PurchaseAssetRequest {
  asset_id: string;
  currency: 'diamond' | 'gold';
}

// ============================================================
// DIRECT MESSAGES
// ============================================================

export interface ConversationListItem {
  id: string;
  other_user: UserPublicProfile;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  is_blocked: boolean;
}

export interface SendDmRequest {
  receiver_id: string;
  content: string;
  message_type?: MessageType;
  media_url?: string;
  reply_to_message_id?: string;
}

export interface DmMessageWithSender extends DmMessage {
  sender: UserPublicProfile;
}

// ============================================================
// LOVE TREE
// ============================================================

export interface LoveTreePairDetails extends LoveTreePair {
  partner: UserPublicProfile;
  level_progress: {
    current_grams: number;
    next_level_grams: number;
    progress_percent: number;
  };
  shared_album: {
    is_unlocked: boolean;
    photo_count: number;
  } | null;
}

export interface AddBlessingRequest {
  pair_id: string;
  blessing_type: string;
  grams: number;
  reference_type?: string;
  reference_id?: string;
}

export interface BlessingHistoryItem {
  id: string;
  from_user: UserPublicProfile;
  blessing_type: string;
  grams_added: number;
  triggered_level_up: boolean;
  created_at: string;
}

// ============================================================
// QUESTS
// ============================================================

export interface QuestWithProgress extends QuestDefinition {
  progress?: UserQuestProgress;
  is_available: boolean;
  can_claim: boolean;
}

export interface ClaimQuestRewardRequest {
  quest_id: string;
}

export interface ClaimQuestRewardResponse {
  success: boolean;
  reward_type: string;
  reward_amount: number;
  reward_asset?: AssetCatalog;
}

// ============================================================
// LEADERBOARDS
// ============================================================

export interface LeaderboardRequest {
  type: 'wealth' | 'charm' | 'gifters' | 'hosts' | 'cp';
  period: 'daily' | 'weekly' | 'monthly' | 'all_time';
  limit?: number;
}

export interface LeaderboardResponse {
  entries: LeaderboardEntryWithUser[];
  my_rank?: LeaderboardEntryWithUser;
  period_start: string;
  period_end: string;
  last_updated: string;
}

export interface LeaderboardEntryWithUser extends LeaderboardEntry {
  user: UserPublicProfile;
}

// ============================================================
// WITHDRAWALS
// ============================================================

export interface CreateWithdrawalRequest {
  charm_amount: number;
  payment_method_id: string;
  user_notes?: string;
}

export interface WithdrawalResponse {
  request: WithdrawalRequest;
  estimated_local_amount: number;
  platform_fee: number;
  net_amount: number;
}

export interface AddPaymentMethodRequest {
  provider: PaymentProvider;
  account_holder_name: string;
  account_number: string;
  bank_name?: string;
  bank_branch?: string;
  routing_number?: string;
  phone_number?: string;
}

// ============================================================
// WEBSOCKET EVENTS
// ============================================================

// Client -> Server Events
export interface ClientToServerEvents {
  // Connection
  'auth:connect': (data: { token: string }) => void;
  'auth:disconnect': () => void;

  // Room events
  'room:join': (data: { room_id: string; password?: string }) => void;
  'room:leave': (data: { room_id: string }) => void;
  'room:chat': (data: { room_id: string; content: string; message_type?: MessageType }) => void;

  // Seat events
  'seat:take': (data: { room_id: string; seat_index: number }) => void;
  'seat:leave': (data: { room_id: string }) => void;
  'seat:mute': (data: { room_id: string; seat_index: number }) => void;
  'seat:unmute': (data: { room_id: string; seat_index: number }) => void;
  'seat:lock': (data: { room_id: string; seat_index: number }) => void;
  'seat:unlock': (data: { room_id: string; seat_index: number }) => void;
  'seat:kick': (data: { room_id: string; target_user_id: string }) => void;

  // Gift events
  'gift:send': (data: SendGiftRequest) => void;

  // Voice events
  'voice:speaking': (data: { room_id: string; amplitude: number }) => void;

  // DM events
  'dm:send': (data: SendDmRequest) => void;
  'dm:typing': (data: { conversation_id: string }) => void;
  'dm:read': (data: { conversation_id: string; message_id: string }) => void;
}

// Server -> Client Events
export interface ServerToClientEvents {
  // Connection
  'auth:success': (data: { user_id: string }) => void;
  'auth:error': (data: { code: string; message: string }) => void;

  // Room events
  'room:joined': (data: { room: RoomWithDetails }) => void;
  'room:left': (data: { room_id: string }) => void;
  'room:user_joined': (data: { room_id: string; user: UserPublicProfile }) => void;
  'room:user_left': (data: { room_id: string; user_id: string }) => void;
  'room:chat_message': (data: RoomChatMessagePayload) => void;
  'room:updated': (data: { room_id: string; updates: Partial<Room> }) => void;
  'room:viewer_count': (data: { room_id: string; count: number }) => void;

  // Seat events
  'seat:updated': (data: { room_id: string; seat: RoomSeatWithUser }) => void;
  'seat:taken': (data: { room_id: string; seat_index: number; user: UserPublicProfile }) => void;
  'seat:vacated': (data: { room_id: string; seat_index: number; user_id: string }) => void;
  'seat:muted': (data: { room_id: string; seat_index: number; by_user_id: string }) => void;
  'seat:unmuted': (data: { room_id: string; seat_index: number }) => void;
  'seat:locked': (data: { room_id: string; seat_index: number }) => void;
  'seat:unlocked': (data: { room_id: string; seat_index: number }) => void;
  'seat:kicked': (data: { room_id: string; user_id: string; reason?: string }) => void;

  // Gift events
  'gift:received': (data: GiftReceivedPayload) => void;
  'gift:combo': (data: GiftComboPayload) => void;

  // Global announcements
  'announcement:global': (data: GlobalAnnouncementPayload) => void;
  'announcement:vip_entry': (data: VipEntryPayload) => void;

  // Voice events
  'voice:user_speaking': (data: { room_id: string; user_id: string; amplitude: number }) => void;

  // DM events
  'dm:new_message': (data: DmMessageWithSender) => void;
  'dm:typing': (data: { conversation_id: string; user_id: string }) => void;
  'dm:read': (data: { conversation_id: string; user_id: string; last_read_message_id: string }) => void;

  // Notification events
  'notification:new': (data: Notification) => void;

  // User events
  'user:level_up': (data: { user_id: string; new_level: number; rewards?: unknown[] }) => void;
  'user:svip_upgrade': (data: { user_id: string; new_level: number }) => void;
  'user:balance_updated': (data: { wallet_type: WalletType; new_balance: number }) => void;

  // Quest events
  'quest:progress': (data: { quest_id: string; current_value: number; target_value: number }) => void;
  'quest:completed': (data: { quest_id: string; quest_name: string }) => void;

  // Love tree events
  'love_tree:blessing': (data: { pair_id: string; grams_added: number; new_total: number }) => void;
  'love_tree:level_up': (data: { pair_id: string; new_level: LoveTreeLevel }) => void;

  // Error events
  'error': (data: { code: string; message: string }) => void;
}

// ============================================================
// WEBSOCKET PAYLOADS
// ============================================================

export interface RoomChatMessagePayload {
  id: string;
  room_id: string;
  user: {
    id: string;
    display_name: string;
    avatar_url: string | null;
    svip_level: number;
    aristocracy_tier: number;
  };
  content: string;
  message_type: MessageType;
  // Injected assets from user's equipped items
  chat_bubble: {
    id: string;
    animation_url: string | null;
    icon_url: string;
  } | null;
  nickname_color: string | null;
  reply_to: {
    id: string;
    content: string;
    user_display_name: string;
  } | null;
  created_at: string;
}

export interface GiftReceivedPayload {
  transaction_id: string;
  room_id: string | null;
  sender: {
    id: string;
    display_name: string;
    avatar_url: string | null;
    svip_level: number;
  };
  receiver: {
    id: string;
    display_name: string;
    avatar_url: string | null;
  };
  gift: {
    id: string;
    name: string;
    icon_url: string;
    animation_url: string | null;
    sound_url: string | null;
    rarity: string;
  };
  quantity: number;
  total_value: number;
  combo_count: number;
  message: string | null;
  is_broadcast: boolean;
}

export interface GiftComboPayload {
  room_id: string;
  sender_id: string;
  receiver_id: string;
  gift_id: string;
  combo_count: number;
  combo_expires_at: string;
}

export interface GlobalAnnouncementPayload {
  id: string;
  message: string;
  icon_url: string | null;
  trigger_type: string;
  trigger_user: UserPublicProfile | null;
  target_user: UserPublicProfile | null;
  room: {
    id: string;
    name: string;
  } | null;
  gift: {
    id: string;
    name: string;
    icon_url: string;
  } | null;
  duration_ms: number;
  priority: number;
}

export interface VipEntryPayload {
  room_id: string;
  user: UserPublicProfile;
  svip_level: number;
  entrance_effect: {
    id: string;
    animation_url: string;
  } | null;
  announcement_message: string | null;
}

// ============================================================
// ASSET INJECTION FOR WEBSOCKET
// ============================================================

export interface UserAssetState {
  user_id: string;
  equipped_chat_bubble: {
    id: string;
    icon_url: string;
    animation_url: string | null;
  } | null;
  equipped_nickname_color: string | null;
  equipped_entrance_effect: {
    id: string;
    animation_url: string;
  } | null;
  equipped_mic_ring: {
    id: string;
    animation_url: string;
  } | null;
  svip_level: number;
  aristocracy_tier: number;
}

// ============================================================
// ERROR CODES
// ============================================================

export const ErrorCodes = {
  // Auth errors
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  AUTH_UNAUTHORIZED: 'AUTH_UNAUTHORIZED',
  AUTH_ACCOUNT_SUSPENDED: 'AUTH_ACCOUNT_SUSPENDED',
  AUTH_ACCOUNT_BANNED: 'AUTH_ACCOUNT_BANNED',

  // Wallet errors
  WALLET_INSUFFICIENT_BALANCE: 'WALLET_INSUFFICIENT_BALANCE',
  WALLET_NOT_FOUND: 'WALLET_NOT_FOUND',
  WALLET_TRANSACTION_FAILED: 'WALLET_TRANSACTION_FAILED',

  // Room errors
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  ROOM_FULL: 'ROOM_FULL',
  ROOM_PRIVATE: 'ROOM_PRIVATE',
  ROOM_WRONG_PASSWORD: 'ROOM_WRONG_PASSWORD',
  ROOM_USER_BANNED: 'ROOM_USER_BANNED',
  ROOM_LEVEL_REQUIRED: 'ROOM_LEVEL_REQUIRED',

  // Seat errors
  SEAT_NOT_AVAILABLE: 'SEAT_NOT_AVAILABLE',
  SEAT_LOCKED: 'SEAT_LOCKED',
  SEAT_ALREADY_OCCUPIED: 'SEAT_ALREADY_OCCUPIED',
  SEAT_NOT_OCCUPIED: 'SEAT_NOT_OCCUPIED',

  // Permission errors
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  SVIP_IMMUNITY: 'SVIP_IMMUNITY', // Target has higher SVIP level
  MANAGER_REQUIRED: 'MANAGER_REQUIRED',

  // Gift errors
  GIFT_NOT_FOUND: 'GIFT_NOT_FOUND',
  GIFT_NOT_AVAILABLE: 'GIFT_NOT_AVAILABLE',
  GIFT_SELF_SEND: 'GIFT_SELF_SEND',

  // Asset errors
  ASSET_NOT_FOUND: 'ASSET_NOT_FOUND',
  ASSET_NOT_OWNED: 'ASSET_NOT_OWNED',
  ASSET_EXPIRED: 'ASSET_EXPIRED',
  ASSET_ALREADY_EQUIPPED: 'ASSET_ALREADY_EQUIPPED',

  // DM errors
  DM_USER_BLOCKED: 'DM_USER_BLOCKED',
  DM_BLOCKED_BY_USER: 'DM_BLOCKED_BY_USER',
  DM_PRIVACY_SETTING: 'DM_PRIVACY_SETTING',

  // Withdrawal errors
  WITHDRAWAL_MINIMUM_NOT_MET: 'WITHDRAWAL_MINIMUM_NOT_MET',
  WITHDRAWAL_PENDING_EXISTS: 'WITHDRAWAL_PENDING_EXISTS',
  WITHDRAWAL_PAYMENT_METHOD_INVALID: 'WITHDRAWAL_PAYMENT_METHOD_INVALID',

  // General errors
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
