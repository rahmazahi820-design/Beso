/**
 * Common Utilities and Helper Functions
 */

import { nanoid } from 'nanoid';
import { format, formatDistanceToNow, isAfter, isBefore, addDays, addHours } from 'date-fns';

// =============================================================================
// ID GENERATION
// =============================================================================

/**
 * Generate a unique order number with prefix
 */
export function generateOrderNumber(prefix: string = 'TXN'): string {
  const timestamp = format(new Date(), 'yyyyMMddHHmmss');
  const random = nanoid(6).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * Generate a unique room code
 */
export function generateRoomCode(): string {
  return nanoid(8).toUpperCase();
}

/**
 * Generate a short invite code
 */
export function generateInviteCode(): string {
  return nanoid(6).toUpperCase();
}

// =============================================================================
// FINANCIAL CALCULATIONS
// =============================================================================

/**
 * Platform commission rate (30%)
 */
export const PLATFORM_COMMISSION_RATE = 0.30;

/**
 * Calculate platform commission from charm value
 */
export function calculatePlatformCommission(charmValue: number): number {
  return Math.floor(charmValue * PLATFORM_COMMISSION_RATE);
}

/**
 * Calculate net amount after commission
 */
export function calculateNetAmount(grossAmount: number, commissionRate: number = PLATFORM_COMMISSION_RATE): number {
  return Math.floor(grossAmount * (1 - commissionRate));
}

/**
 * Charm to EGP conversion rate (100 charm = 1 EGP)
 */
export const CHARM_TO_EGP_RATE = 0.01;

/**
 * Convert charm to local currency
 */
export function charmToLocalCurrency(charmAmount: number, rate: number = CHARM_TO_EGP_RATE): number {
  return Math.floor(charmAmount * rate * 100) / 100; // Round to 2 decimal places
}

// =============================================================================
// SVIP & LEVEL CALCULATIONS
// =============================================================================

/**
 * SVIP tier thresholds (in diamond points spent)
 */
export const SVIP_THRESHOLDS = [
  { level: 0, points: 0 },
  { level: 1, points: 1000 },
  { level: 2, points: 5000 },
  { level: 3, points: 20000 },
  { level: 4, points: 50000 },
  { level: 5, points: 100000 },
  { level: 6, points: 300000 },
  { level: 7, points: 600000 },
  { level: 8, points: 1500000 },
  { level: 9, points: 5000000 },
] as const;

/**
 * Calculate SVIP level from points
 */
export function calculateSVIPLevel(points: number): number {
  for (let i = SVIP_THRESHOLDS.length - 1; i >= 0; i--) {
    if (points >= SVIP_THRESHOLDS[i].points) {
      return SVIP_THRESHOLDS[i].level;
    }
  }
  return 0;
}

/**
 * Get points needed for next SVIP level
 */
export function getPointsToNextSVIPLevel(currentPoints: number): { nextLevel: number; pointsNeeded: number } | null {
  const currentLevel = calculateSVIPLevel(currentPoints);
  if (currentLevel >= 9) return null;
  
  const nextThreshold = SVIP_THRESHOLDS[currentLevel + 1];
  return {
    nextLevel: nextThreshold.level,
    pointsNeeded: nextThreshold.points - currentPoints,
  };
}

/**
 * Love Tree level thresholds (in grams)
 */
export const LOVE_TREE_THRESHOLDS = [
  { level: 1, grams: 0, name: 'Seedling' },
  { level: 2, grams: 300, name: 'Sprout' },
  { level: 3, grams: 500, name: 'Sapling' },
  { level: 4, grams: 1500, name: 'Young Tree' },
  { level: 5, grams: 8000, name: 'Mature Tree' },
  { level: 6, grams: 20000, name: 'Ancient Tree' },
] as const;

/**
 * Calculate Love Tree level from grams
 */
export function calculateLoveTreeLevel(grams: number): number {
  for (let i = LOVE_TREE_THRESHOLDS.length - 1; i >= 0; i--) {
    if (grams >= LOVE_TREE_THRESHOLDS[i].grams) {
      return LOVE_TREE_THRESHOLDS[i].level;
    }
  }
  return 1;
}

/**
 * User level XP thresholds
 */
export function calculateUserLevel(xp: number): number {
  // Exponential leveling: Level N requires N^2 * 100 XP
  return Math.floor(Math.sqrt(xp / 100)) + 1;
}

// =============================================================================
// TIME UTILITIES
// =============================================================================

/**
 * Check if a timestamp has expired
 */
export function isExpired(expiresAt: Date | string | null): boolean {
  if (!expiresAt) return false;
  return isBefore(new Date(expiresAt), new Date());
}

/**
 * Check if within a time window
 */
export function isWithinWindow(timestamp: Date | string, windowMinutes: number): boolean {
  const now = new Date();
  const target = new Date(timestamp);
  const windowEnd = addHours(target, windowMinutes / 60);
  return isAfter(windowEnd, now);
}

/**
 * Get relative time string
 */
export function getRelativeTime(date: Date | string): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

/**
 * Format date for display
 */
export function formatDate(date: Date | string, formatStr: string = 'yyyy-MM-dd HH:mm'): string {
  return format(new Date(date), formatStr);
}

/**
 * Get start of current day (UTC)
 */
export function getStartOfDay(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Get start of current week (Monday, UTC)
 */
export function getStartOfWeek(): Date {
  const now = new Date();
  const dayOfWeek = now.getUTCDay();
  const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Adjust for Monday start
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diff));
}

/**
 * Get start of current month (UTC)
 */
export function getStartOfMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

// =============================================================================
// STRING UTILITIES
// =============================================================================

/**
 * Sanitize user input for display
 */
export function sanitizeInput(input: string): string {
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .slice(0, 10000); // Max length safety
}

/**
 * Mask sensitive data (for logs)
 */
export function maskSensitiveData(str: string, visibleChars: number = 4): string {
  if (str.length <= visibleChars) return '*'.repeat(str.length);
  return str.slice(0, visibleChars) + '*'.repeat(str.length - visibleChars);
}

/**
 * Parse JSON safely
 */
export function safeParseJSON<T>(str: string, fallback: T): T {
  try {
    return JSON.parse(str) as T;
  } catch {
    return fallback;
  }
}

// =============================================================================
// RESPONSE HELPERS
// =============================================================================

/**
 * Standard API response structure
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  timestamp: string;
}

/**
 * Create success response
 */
export function successResponse<T>(data: T): ApiResponse<T> {
  return {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create error response
 */
export function errorResponse(error: string, code?: string): ApiResponse {
  return {
    success: false,
    error,
    code,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Paginated response structure
 */
export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

/**
 * Create paginated response
 */
export function paginatedResponse<T>(
  items: T[],
  page: number,
  limit: number,
  total: number
): PaginatedResponse<T> {
  const totalPages = Math.ceil(total / limit);
  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasMore: page < totalPages,
    },
  };
}

// =============================================================================
// ERROR CLASSES
// =============================================================================

export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 400,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 'AUTH_REQUIRED', 401);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Permission denied') {
    super(message, 'FORBIDDEN', 403);
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

export class InsufficientBalanceError extends AppError {
  constructor(walletType: string) {
    super(`Insufficient ${walletType} balance`, 'INSUFFICIENT_BALANCE', 400);
    this.name = 'InsufficientBalanceError';
  }
}

export class SVIPImmunityError extends AppError {
  constructor() {
    super('Operation denied due to SVIP hierarchical immunity', 'SVIP_IMMUNITY', 403);
    this.name = 'SVIPImmunityError';
  }
}

export class RateLimitError extends AppError {
  constructor(retryAfter: number) {
    super(`Rate limit exceeded. Retry after ${retryAfter} seconds`, 'RATE_LIMITED', 429, { retryAfter });
    this.name = 'RateLimitError';
  }
}
