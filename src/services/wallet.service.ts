/**
 * Wallet Service
 * Handles all wallet operations including balance checks, transactions, and withdrawals
 */

import { supabaseAdmin } from '../lib/supabase';
import { 
  generateOrderNumber, 
  calculatePlatformCommission, 
  calculateNetAmount,
  charmToLocalCurrency,
  CHARM_TO_EGP_RATE,
  AppError,
  InsufficientBalanceError,
  NotFoundError 
} from '../lib/utils';
import type { 
  WalletType, 
  TransactionType, 
  TransactionStatus,
  WithdrawalStatus,
  PaymentProvider 
} from '../types/database.types';

// =============================================================================
// TYPES
// =============================================================================

export interface WalletBalance {
  wallet_id: string;
  wallet_type: WalletType;
  balance: number;
  lifetime_earned: number;
  lifetime_spent: number;
  pending_withdrawal: number;
}

export interface TransactionResult {
  success: boolean;
  order_id?: string;
  order_number?: string;
  amount?: number;
  new_balance?: number;
  error?: string;
}

export interface WithdrawalResult {
  success: boolean;
  request_id?: string;
  request_number?: string;
  charm_amount?: number;
  local_amount?: number;
  currency?: string;
  error?: string;
}

// =============================================================================
// WALLET BALANCE OPERATIONS
// =============================================================================

/**
 * Get all wallets for a user
 */
export async function getUserWallets(userId: string): Promise<WalletBalance[]> {
  const { data, error } = await supabaseAdmin
    .from('wallets')
    .select('id, wallet_type, balance, lifetime_earned, lifetime_spent, pending_withdrawal')
    .eq('user_id', userId);

  if (error) throw new AppError('Failed to fetch wallets', 'WALLET_FETCH_ERROR', 500);
  
  return (data || []).map(w => ({
    wallet_id: w.id,
    wallet_type: w.wallet_type as WalletType,
    balance: w.balance,
    lifetime_earned: w.lifetime_earned,
    lifetime_spent: w.lifetime_spent,
    pending_withdrawal: w.pending_withdrawal || 0,
  }));
}

/**
 * Get specific wallet balance
 */
export async function getWalletBalance(userId: string, walletType: WalletType): Promise<WalletBalance | null> {
  const { data, error } = await supabaseAdmin
    .from('wallets')
    .select('id, wallet_type, balance, lifetime_earned, lifetime_spent, pending_withdrawal')
    .eq('user_id', userId)
    .eq('wallet_type', walletType)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new AppError('Failed to fetch wallet', 'WALLET_FETCH_ERROR', 500);
  }

  if (!data) return null;

  return {
    wallet_id: data.id,
    wallet_type: data.wallet_type as WalletType,
    balance: data.balance,
    lifetime_earned: data.lifetime_earned,
    lifetime_spent: data.lifetime_spent,
    pending_withdrawal: data.pending_withdrawal || 0,
  };
}

/**
 * Ensure wallet exists for user, create if not
 */
export async function ensureWallet(userId: string, walletType: WalletType): Promise<string> {
  // Try to get existing wallet
  const existing = await getWalletBalance(userId, walletType);
  if (existing) return existing.wallet_id;

  // Create new wallet
  const { data, error } = await supabaseAdmin
    .from('wallets')
    .insert({ user_id: userId, wallet_type: walletType })
    .select('id')
    .single();

  if (error) throw new AppError('Failed to create wallet', 'WALLET_CREATE_ERROR', 500);
  return data.id;
}

// =============================================================================
// ATOMIC TRANSACTION OPERATIONS
// =============================================================================

/**
 * Credit wallet (add funds)
 */
export async function creditWallet(
  userId: string,
  walletType: WalletType,
  amount: number,
  transactionType: TransactionType,
  description: string,
  referenceType?: string,
  referenceId?: string,
  metadata?: Record<string, unknown>
): Promise<TransactionResult> {
  if (amount <= 0) {
    return { success: false, error: 'Amount must be positive' };
  }

  const walletId = await ensureWallet(userId, walletType);
  const orderNumber = generateOrderNumber(transactionType === 'recharge' ? 'RCH' : 'CRD');

  // Start transaction using RPC for atomicity
  const { data, error } = await supabaseAdmin.rpc('credit_wallet_atomic', {
    p_wallet_id: walletId,
    p_amount: amount,
    p_transaction_type: transactionType,
    p_order_number: orderNumber,
    p_description: description,
    p_reference_type: referenceType || null,
    p_reference_id: referenceId || null,
    p_metadata: metadata || {},
  });

  if (error) {
    console.error('[v0] Credit wallet error:', error);
    return { success: false, error: error.message };
  }

  return {
    success: true,
    order_id: data.order_id,
    order_number: orderNumber,
    amount,
    new_balance: data.new_balance,
  };
}

/**
 * Debit wallet (remove funds)
 */
export async function debitWallet(
  userId: string,
  walletType: WalletType,
  amount: number,
  transactionType: TransactionType,
  description: string,
  referenceType?: string,
  referenceId?: string,
  metadata?: Record<string, unknown>
): Promise<TransactionResult> {
  if (amount <= 0) {
    return { success: false, error: 'Amount must be positive' };
  }

  // Get wallet and check balance
  const wallet = await getWalletBalance(userId, walletType);
  if (!wallet) {
    return { success: false, error: 'Wallet not found' };
  }

  if (wallet.balance < amount) {
    return { success: false, error: 'Insufficient balance' };
  }

  const orderNumber = generateOrderNumber(transactionType === 'withdrawal' ? 'WTH' : 'DBT');

  // Atomic debit operation
  const { data, error } = await supabaseAdmin.rpc('debit_wallet_atomic', {
    p_wallet_id: wallet.wallet_id,
    p_amount: amount,
    p_transaction_type: transactionType,
    p_order_number: orderNumber,
    p_description: description,
    p_reference_type: referenceType || null,
    p_reference_id: referenceId || null,
    p_metadata: metadata || {},
  });

  if (error) {
    console.error('[v0] Debit wallet error:', error);
    return { success: false, error: error.message };
  }

  return {
    success: true,
    order_id: data.order_id,
    order_number: orderNumber,
    amount,
    new_balance: data.new_balance,
  };
}

/**
 * Transfer between users (gift transaction)
 * This is the core ACID-compliant peer-to-peer transfer
 */
export async function executeGiftTransfer(
  senderId: string,
  receiverId: string,
  giftId: string,
  quantity: number,
  roomId?: string,
  message?: string
): Promise<TransactionResult & { charm_earned?: number; combo_count?: number }> {
  // Use the database function for atomic gift transaction
  const { data, error } = await supabaseAdmin.rpc('execute_gift_transaction', {
    p_sender_id: senderId,
    p_receiver_id: receiverId,
    p_gift_id: giftId,
    p_quantity: quantity,
    p_room_id: roomId || null,
    p_is_private: !roomId,
    p_message: message || null,
  });

  if (error) {
    console.error('[v0] Gift transaction error:', error);
    return { success: false, error: error.message };
  }

  if (!data.success) {
    return { success: false, error: data.error };
  }

  return {
    success: true,
    order_id: data.order_id,
    order_number: data.order_number,
    amount: data.total_cost,
    charm_earned: data.charm_earned,
    combo_count: data.combo_count,
  };
}

// =============================================================================
// RECHARGE OPERATIONS
// =============================================================================

/**
 * Get available recharge packages
 */
export async function getRechargePackages() {
  const { data, error } = await supabaseAdmin
    .from('recharge_packages')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');

  if (error) throw new AppError('Failed to fetch recharge packages', 'FETCH_ERROR', 500);
  return data;
}

/**
 * Process recharge (after payment verification)
 */
export async function processRecharge(
  userId: string,
  packageId: string,
  paymentReference: string,
  paymentMethod: string
): Promise<TransactionResult> {
  // Get package details
  const { data: pkg, error: pkgError } = await supabaseAdmin
    .from('recharge_packages')
    .select('*')
    .eq('id', packageId)
    .eq('is_active', true)
    .single();

  if (pkgError || !pkg) {
    return { success: false, error: 'Invalid recharge package' };
  }

  const totalDiamonds = pkg.diamonds + (pkg.bonus_diamonds || 0);

  // Credit diamonds to user
  const result = await creditWallet(
    userId,
    'diamond',
    totalDiamonds,
    'recharge',
    `Recharged ${pkg.name} package (${pkg.diamonds} + ${pkg.bonus_diamonds || 0} bonus diamonds)`,
    'recharge_package',
    packageId,
    {
      package_name: pkg.name,
      base_diamonds: pkg.diamonds,
      bonus_diamonds: pkg.bonus_diamonds,
      payment_reference: paymentReference,
      payment_method: paymentMethod,
      price_egp: pkg.price_egp,
    }
  );

  return result;
}

// =============================================================================
// WITHDRAWAL OPERATIONS
// =============================================================================

/**
 * Get user payment methods
 */
export async function getUserPaymentMethods(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('user_payment_methods')
    .select('*')
    .eq('user_id', userId)
    .order('is_default', { ascending: false });

  if (error) throw new AppError('Failed to fetch payment methods', 'FETCH_ERROR', 500);
  return data;
}

/**
 * Add payment method
 */
export async function addPaymentMethod(
  userId: string,
  provider: PaymentProvider,
  accountHolderName: string,
  accountNumber: string,
  additionalDetails?: {
    bank_name?: string;
    bank_branch?: string;
    routing_number?: string;
    phone_number?: string;
    is_default?: boolean;
  }
) {
  // If setting as default, unset other defaults first
  if (additionalDetails?.is_default) {
    await supabaseAdmin
      .from('user_payment_methods')
      .update({ is_default: false })
      .eq('user_id', userId);
  }

  const { data, error } = await supabaseAdmin
    .from('user_payment_methods')
    .insert({
      user_id: userId,
      provider,
      account_holder_name: accountHolderName,
      account_number: accountNumber,
      ...additionalDetails,
    })
    .select()
    .single();

  if (error) throw new AppError('Failed to add payment method', 'CREATE_ERROR', 500);
  return data;
}

/**
 * Request withdrawal (Earner only)
 */
export async function requestWithdrawal(
  userId: string,
  charmAmount: number,
  paymentMethodId: string,
  notes?: string
): Promise<WithdrawalResult> {
  // Verify user is an earner (female)
  const { data: user, error: userError } = await supabaseAdmin
    .from('users')
    .select('gender')
    .eq('id', userId)
    .single();

  if (userError || !user) {
    return { success: false, error: 'User not found' };
  }

  if (user.gender !== 'female') {
    return { success: false, error: 'Only earner accounts can withdraw' };
  }

  // Verify payment method belongs to user
  const { data: paymentMethod, error: pmError } = await supabaseAdmin
    .from('user_payment_methods')
    .select('*')
    .eq('id', paymentMethodId)
    .eq('user_id', userId)
    .single();

  if (pmError || !paymentMethod) {
    return { success: false, error: 'Invalid payment method' };
  }

  // Check charm balance
  const wallet = await getWalletBalance(userId, 'charm');
  if (!wallet || wallet.balance < charmAmount) {
    return { success: false, error: 'Insufficient charm balance' };
  }

  // Calculate local currency amount
  const localAmount = charmToLocalCurrency(charmAmount);
  const platformFee = localAmount * 0.02; // 2% withdrawal fee
  const netAmount = localAmount - platformFee;

  // Generate request number
  const requestNumber = generateOrderNumber('WDR');

  // Create withdrawal request
  const { data: request, error: requestError } = await supabaseAdmin
    .from('withdrawal_requests')
    .insert({
      request_number: requestNumber,
      user_id: userId,
      payment_method_id: paymentMethodId,
      charm_amount: charmAmount,
      conversion_rate: CHARM_TO_EGP_RATE,
      local_amount: localAmount,
      platform_fee: platformFee,
      net_amount: netAmount,
      currency_code: 'EGP',
      status: 'pending_review' as WithdrawalStatus,
      user_notes: notes,
    })
    .select()
    .single();

  if (requestError) {
    console.error('[v0] Withdrawal request error:', requestError);
    return { success: false, error: 'Failed to create withdrawal request' };
  }

  // Update wallet pending withdrawal amount
  await supabaseAdmin
    .from('wallets')
    .update({ 
      pending_withdrawal: wallet.pending_withdrawal + charmAmount,
      updated_at: new Date().toISOString()
    })
    .eq('id', wallet.wallet_id);

  return {
    success: true,
    request_id: request.id,
    request_number: requestNumber,
    charm_amount: charmAmount,
    local_amount: netAmount,
    currency: 'EGP',
  };
}

/**
 * Get withdrawal history
 */
export async function getWithdrawalHistory(userId: string, page: number = 1, limit: number = 20) {
  const offset = (page - 1) * limit;

  const { data, error, count } = await supabaseAdmin
    .from('withdrawal_requests')
    .select('*, user_payment_methods(provider, account_number)', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new AppError('Failed to fetch withdrawal history', 'FETCH_ERROR', 500);

  return {
    items: data,
    total: count || 0,
    page,
    limit,
  };
}

/**
 * Process withdrawal (Admin function)
 */
export async function processWithdrawal(
  requestId: string,
  action: 'approve' | 'reject',
  adminId: string,
  providerReference?: string,
  rejectionReason?: string
): Promise<{ success: boolean; error?: string }> {
  // Get withdrawal request
  const { data: request, error: fetchError } = await supabaseAdmin
    .from('withdrawal_requests')
    .select('*, wallets!inner(id, user_id, balance, pending_withdrawal)')
    .eq('id', requestId)
    .single();

  if (fetchError || !request) {
    return { success: false, error: 'Withdrawal request not found' };
  }

  if (request.status !== 'pending_review' && request.status !== 'approved') {
    return { success: false, error: 'Request cannot be processed in current status' };
  }

  if (action === 'approve') {
    // Update request status
    await supabaseAdmin
      .from('withdrawal_requests')
      .update({
        status: 'approved' as WithdrawalStatus,
        reviewed_at: new Date().toISOString(),
        reviewed_by_id: adminId,
        approved_at: new Date().toISOString(),
      })
      .eq('id', requestId);

    return { success: true };
  } else {
    // Reject - refund pending withdrawal
    const wallet = await getWalletBalance(request.user_id, 'charm');
    if (wallet) {
      await supabaseAdmin
        .from('wallets')
        .update({
          pending_withdrawal: Math.max(0, wallet.pending_withdrawal - request.charm_amount),
          updated_at: new Date().toISOString(),
        })
        .eq('id', wallet.wallet_id);
    }

    await supabaseAdmin
      .from('withdrawal_requests')
      .update({
        status: 'rejected' as WithdrawalStatus,
        reviewed_at: new Date().toISOString(),
        reviewed_by_id: adminId,
        rejection_reason: rejectionReason,
      })
      .eq('id', requestId);

    return { success: true };
  }
}

/**
 * Complete withdrawal (after provider confirms transfer)
 */
export async function completeWithdrawal(
  requestId: string,
  providerReference: string,
  providerResponse?: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  // Get withdrawal request
  const { data: request, error: fetchError } = await supabaseAdmin
    .from('withdrawal_requests')
    .select('*')
    .eq('id', requestId)
    .eq('status', 'approved')
    .single();

  if (fetchError || !request) {
    return { success: false, error: 'Approved withdrawal request not found' };
  }

  // Debit the charm from wallet (actual deduction)
  const debitResult = await debitWallet(
    request.user_id,
    'charm',
    request.charm_amount,
    'withdrawal',
    `Withdrawal to ${request.currency_code} - ${request.request_number}`,
    'withdrawal_request',
    requestId,
    { provider_reference: providerReference }
  );

  if (!debitResult.success) {
    return { success: false, error: debitResult.error };
  }

  // Update pending withdrawal amount
  const wallet = await getWalletBalance(request.user_id, 'charm');
  if (wallet) {
    await supabaseAdmin
      .from('wallets')
      .update({
        pending_withdrawal: Math.max(0, wallet.pending_withdrawal - request.charm_amount),
        updated_at: new Date().toISOString(),
      })
      .eq('id', wallet.wallet_id);
  }

  // Update request status
  await supabaseAdmin
    .from('withdrawal_requests')
    .update({
      status: 'completed' as WithdrawalStatus,
      order_id: debitResult.order_id,
      completed_at: new Date().toISOString(),
      provider_reference: providerReference,
      provider_response: providerResponse || {},
    })
    .eq('id', requestId);

  return { success: true };
}

// =============================================================================
// TRANSACTION HISTORY
// =============================================================================

/**
 * Get transaction history for a user
 */
export async function getTransactionHistory(
  userId: string,
  walletType?: WalletType,
  page: number = 1,
  limit: number = 20
) {
  const offset = (page - 1) * limit;

  let query = supabaseAdmin
    .from('wallet_transactions')
    .select(`
      *,
      wallets!inner(user_id, wallet_type),
      transaction_orders(order_number, transaction_type, status, metadata)
    `, { count: 'exact' })
    .eq('wallets.user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (walletType) {
    query = query.eq('wallets.wallet_type', walletType);
  }

  const { data, error, count } = await query;

  if (error) throw new AppError('Failed to fetch transaction history', 'FETCH_ERROR', 500);

  return {
    items: data,
    total: count || 0,
    page,
    limit,
  };
}
