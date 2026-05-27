/**
 * Redis Client Configuration
 * Used for real-time caching, session management, and pub/sub
 */

import Redis from 'ioredis';

// Redis configuration
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0'),
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: true,
};

// Main Redis client for general operations
export const redis = new Redis(redisConfig);

// Separate client for pub/sub (subscriber)
export const redisSub = new Redis(redisConfig);

// Separate client for pub/sub (publisher)
export const redisPub = new Redis(redisConfig);

// Redis key prefixes for organization
export const REDIS_KEYS = {
  // User presence
  USER_ONLINE: (userId: string) => `presence:online:${userId}`,
  USER_SOCKET: (userId: string) => `presence:socket:${userId}`,
  USER_ROOM: (userId: string) => `presence:room:${userId}`,
  
  // Room state
  ROOM_VIEWERS: (roomId: string) => `room:viewers:${roomId}`,
  ROOM_SEATS: (roomId: string) => `room:seats:${roomId}`,
  ROOM_CHAT: (roomId: string) => `room:chat:${roomId}`,
  ROOM_BANNED: (roomId: string) => `room:banned:${roomId}`,
  
  // Gift combos (TTL-based)
  GIFT_COMBO: (senderId: string, receiverId: string, giftId: string) => 
    `combo:${senderId}:${receiverId}:${giftId}`,
  
  // Leaderboards (sorted sets)
  LEADERBOARD_WEALTH_DAILY: 'lb:wealth:daily',
  LEADERBOARD_WEALTH_WEEKLY: 'lb:wealth:weekly',
  LEADERBOARD_CHARM_DAILY: 'lb:charm:daily',
  LEADERBOARD_CHARM_WEEKLY: 'lb:charm:weekly',
  
  // Rate limiting
  RATE_LIMIT: (key: string) => `ratelimit:${key}`,
  
  // Session/Auth
  SESSION: (sessionId: string) => `session:${sessionId}`,
  REFRESH_TOKEN: (userId: string) => `refresh:${userId}`,
  
  // Caching
  CACHE_USER_PROFILE: (userId: string) => `cache:profile:${userId}`,
  CACHE_USER_ASSETS: (userId: string) => `cache:assets:${userId}`,
  CACHE_ROOM: (roomId: string) => `cache:room:${roomId}`,
} as const;

// TTL values in seconds
export const REDIS_TTL = {
  USER_PRESENCE: 60, // 1 minute, refreshed on activity
  ROOM_CACHE: 300, // 5 minutes
  USER_PROFILE_CACHE: 600, // 10 minutes
  GIFT_COMBO: 3, // 3 seconds for combo window
  SESSION: 86400, // 24 hours
  RATE_LIMIT_WINDOW: 60, // 1 minute
} as const;

// Pub/Sub channels
export const REDIS_CHANNELS = {
  ROOM_EVENTS: (roomId: string) => `events:room:${roomId}`,
  USER_EVENTS: (userId: string) => `events:user:${userId}`,
  GLOBAL_ANNOUNCEMENTS: 'events:global:announcements',
  GIFT_BROADCASTS: 'events:global:gifts',
} as const;

/**
 * Helper to set a value with TTL
 */
export async function setWithTTL(key: string, value: string | object, ttlSeconds: number): Promise<void> {
  const stringValue = typeof value === 'object' ? JSON.stringify(value) : value;
  await redis.setex(key, ttlSeconds, stringValue);
}

/**
 * Helper to get and parse JSON value
 */
export async function getJSON<T>(key: string): Promise<T | null> {
  const value = await redis.get(key);
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

/**
 * Helper for rate limiting
 */
export async function checkRateLimit(
  key: string, 
  maxRequests: number, 
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
  const redisKey = REDIS_KEYS.RATE_LIMIT(key);
  const current = await redis.incr(redisKey);
  
  if (current === 1) {
    await redis.expire(redisKey, windowSeconds);
  }
  
  const ttl = await redis.ttl(redisKey);
  
  return {
    allowed: current <= maxRequests,
    remaining: Math.max(0, maxRequests - current),
    resetIn: ttl > 0 ? ttl : windowSeconds,
  };
}

/**
 * Graceful shutdown
 */
export async function closeRedisConnections(): Promise<void> {
  await Promise.all([
    redis.quit(),
    redisSub.quit(),
    redisPub.quit(),
  ]);
}
