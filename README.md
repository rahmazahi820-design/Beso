# 🎉 BESO Platform - Enterprise Social Entertainment & Live Voice Streaming

> Production-grade platform for real-time audio streaming with gender-based monetization pipelines

## 📋 Overview

**Beso** is an advanced social entertainment platform featuring:

- 🎤 **Live Voice Streaming** - Multi-seat audio rooms (8-10 participants)
- 💎 **Dual Monetization Pipelines** - Spender (Diamond) vs. Earner (Charm) economics
- 👥 **Love Tree / CP System** - Bilateral relationship tracking with gram-based growth
- 🎁 **Virtual Gift Engine** - Atomic commission splits, real-time animations
- 📊 **SVIP Hierarchy** - 9-tier wealth status with immunity-based actions
- 🏠 **Host Performance Dashboard** - Real-time metrics, cash-out pipeline
- 🎯 **Quest & Achievement System** - Gender-targeted daily missions
- 💰 **Financial Compliance** - ACID transactions, audit logging, withdrawal approval

## 🏗️ Architecture

### Core Technologies
- **Backend**: Node.js + Express.js + TypeScript
- **Database**: PostgreSQL (23 tables, triggers, views)
- **Cache**: Redis (session, leaderboards, rate limiting)
- **Real-Time**: Socket.IO WebSocket cluster
- **Authentication**: JWT (HS256) with refresh tokens

### Key Features

#### Gender-Based Bifurcation
```typescript
if (gender === 'male') {
  // Spender Pipeline
  - Diamond wallet for premium consumption
  - SVIP tier progression (1-9 levels)
  - Wealth leaderboard ranking
  - Quest system targets consumption milestones
} else if (gender === 'female') {
  // Earner Pipeline
  - Charm wallet for received gifts
  - Host performance dashboard
  - Cash-out withdrawal pipeline
  - Quest system targets engagement metrics
}
```

#### Financial Compliance
- ✅ Atomic ACID transactions
- ✅ Commission split auto-calculation (30% platform, 70% host)
- ✅ Withdrawal approval workflow
- ✅ Audit logs for all financial operations
- ✅ KYC verification requirements

## 🚀 Quick Start

### Prerequisites
```bash
- Node.js >= 18.0.0
- PostgreSQL >= 14
- Redis >= 6.0
- npm >= 9.0.0
```

### Installation

```bash
# 1. Clone repository
git clone https://github.com/rahmazahi820-design/Beso.git
cd Beso

# 2. Install dependencies
npm install

# 3. Setup environment
cp .env.example .env
# Edit .env with your credentials

# 4. Create database
creatdb beso_production

# 5. Run migrations
npm run db:migrate

# 6. Seed initial data (optional)
npm run db:seed

# 7. Start development server
npm run dev
```

Server will run on `http://localhost:3000`

## 📚 API Documentation

### Authentication

```bash
# Register
POST /api/v1/auth/register
{
  "username": "username",
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "gender": "male"  // or "female"
}

# Login
POST /api/v1/auth/login
{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}

# Refresh Token
POST /api/v1/auth/refresh
{
  "refresh_token": "eyJhbGc..."
}

# Logout
POST /api/v1/auth/logout
```

### Wallet

```bash
# Get Balance
GET /api/v1/wallet/balance
Authorization: Bearer {accessToken}

# Top-Up Diamonds (Spenders)
POST /api/v1/wallet/diamond/topup
{
  "amount": 100.00,
  "payment_method": "credit_card"
}

# Request Withdrawal (Earners)
POST /api/v1/wallet/charm/withdrawal
{
  "amount": 50.00,
  "payout_method": "bank_transfer",
  "payout_details": { "account_number": "..." }
}

# Transaction History
GET /api/v1/wallet/transactions?limit=50&offset=0
```

### Gifts

```bash
# Get Gift Catalog
GET /api/v1/gifts/catalog?category=rose&min_price=1&max_price=100

# Send Gift
POST /api/v1/gifts/send
{
  "recipient_id": "uuid",
  "gift_id": "uuid",
  "quantity": 1,
  "room_id": "uuid (optional)",
  "message": "Love this! 💕"
}

# Get Gift Orders
GET /api/v1/gifts/orders?direction=sent&limit=50
```

### Rooms

```bash
# Create Room
POST /api/v1/rooms/create
{
  "room_name": "Chill Vibes",
  "visibility": "public",
  "max_participants": 8
}

# Join Room
POST /api/v1/rooms/:roomId/join
{
  "preferred_seat_index": 0
}

# Mute User (Host Action)
POST /api/v1/rooms/:roomId/seats/:seatId/mute
{
  "is_mute": true
}

# Kick User (Host Action - with SVIP immunity check)
POST /api/v1/rooms/:roomId/seats/:seatId/kick
{
  "reason": "Inappropriate behavior"
}
```

### Love Tree

```bash
# Create Couple Link
POST /api/v1/love-tree/couples/create
{
  "user_id_2": "uuid",
  "message": "Let's grow together!"
}

# Get Couple Details
GET /api/v1/love-tree/couples/:coupleId

# Get Blessings History
GET /api/v1/love-tree/couples/:coupleId/blessings
```

### SVIP & Leaderboard

```bash
# Get My SVIP Tier
GET /api/v1/svip/my-tier

# Check Action Immunity
POST /api/v1/svip/action-immunity-check
{
  "target_id": "uuid",
  "action_type": "mute"  // or "kick", "remove_manager"
}

# Get Wealth Leaderboard
GET /api/v1/leaderboard/wealth?period=daily&limit=100
```

## 🔌 WebSocket Events

### Room Updates
```javascript
// User joined room
socket.on('USER_JOINED_ROOM', {
  user_id: UUID,
  seat_index: number,
  current_participants: number
})

// User left room
socket.on('USER_LEFT_ROOM', {
  user_id: UUID,
  seat_index: number
})

// Seat state updated
socket.on('SEAT_UPDATED', {
  seat_id: UUID,
  is_muted: boolean,
  is_locked: boolean
})

// Audio amplitude (voice activity)
socket.on('AUDIO_AMPLITUDE_UPDATE', {
  seat_id: UUID,
  amplitude: 0.0-1.0,
  is_speaking: boolean
})
```

### Gift Events
```javascript
// Gift received
socket.on('GIFT_ANIMATION', {
  gift_id: UUID,
  sender_id: UUID,
  recipient_id: UUID,
  animation_code: string,
  amount: number
})

// Global marquee ticker
socket.on('GLOBAL_MARQUEE_TICKER', {
  type: 'high_value_gift',
  sender: string,
  recipient: string,
  gift_name: string,
  amount: number
})
```

### Financial Events
```javascript
// Wallet updated
socket.on('WALLET_UPDATED', {
  diamond_balance: number,
  charm_balance: number
})

// SVIP tier upgraded
socket.on('SVIP_TIER_UPGRADED', {
  previous_tier: string,
  new_tier: string,
  privilege_level: number
})
```

## 🗄️ Database Schema

### Core Tables (23 Total)

| Table | Purpose |
|-------|----------|
| `users` | Master user profiles |
| `wallets` | Diamond/Charm balance tracking |
| `wallet_transactions` | Financial audit log |
| `orders` | Gift orders with commission splits |
| `gifts` | Virtual gift catalog |
| `svip_tiers` | SVIP tier progression |
| `wealth_leaderboard` | Materialized leaderboard view |
| `host_performance` | Real-time host metrics |
| `host_daily_earnings` | Daily earnings aggregation |
| `withdrawal_requests` | Earner cash-out pipeline |
| `agencies` | Creator contracts |
| `user_inventory` | 3-state asset bag |
| `asset_catalog` | Cosmetic item catalog |
| `love_tree_couples` | CP relationship registry |
| `love_tree_blessings` | Gram growth history |
| `rooms` | Live audio rooms |
| `room_seats` | Stateful seat matrix |
| `room_participant_sessions` | Participant engagement log |
| `dm_threads` | 1v1 messaging threads |
| `dm_messages` | Direct messages |
| `room_text_chat` | In-room public chat |
| `quest_catalog` | System-defined quests |
| `user_quest_progress` | User quest enrollment |

## 🔐 Security Features

✅ **Authentication**
- JWT tokens with configurable expiry
- Secure bcryptjs password hashing (12 rounds)
- Refresh token rotation
- Device tracking & session management

✅ **Authorization**
- Role-based access control (gender-based)
- SVIP hierarchical immunity checks
- Rate limiting (100 req/min global)
- IP-based session verification

✅ **Data Protection**
- SQL injection prevention (parameterized queries)
- XSS protection via Helmet headers
- CORS whitelisting
- Encrypted sensitive data (payout details)

✅ **Compliance**
- ACID transactions for financial operations
- Audit logs for all sensitive operations
- KYC verification for withdrawals
- PCI compliance ready (payment processing)

## 🧪 Testing

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run specific test suite
npm test -- src/modules/auth/__tests__

# Watch mode
npm test -- --watch
```

## 📊 Monitoring & Logging

Logs are written to:
- **Console**: `info` level during development
- **File**: `./logs/beso.log` (rotated daily, max 14 files)

To view logs:
```bash
tail -f logs/beso.log
```

## 🚀 Production Deployment

### Docker

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist ./dist

EXPOSE 3000

CMD ["node", "dist/index.js"]
```

### Environment Setup
1. Set `NODE_ENV=production`
2. Use strong `JWT_SECRET` (min 32 chars)
3. Enable HTTPS/TLS
4. Configure database replication
5. Setup Redis sentinel for HA
6. Enable monitoring & alerting

## 📝 Contributing

1. Create feature branch (`git checkout -b feature/AmazingFeature`)
2. Commit changes (`git commit -m 'Add AmazingFeature'`)
3. Push to branch (`git push origin feature/AmazingFeature`)
4. Open Pull Request

## 📄 License

This project is proprietary and confidential.

## 📞 Support

For issues and questions, contact: support@beso.app

---

**Built with ❤️ by Beso Team**
