# British Reverse Auction & RFQ System

Hi, this is the Full Stack intern assignment for GoComet.

This platform is a full-stack, production-grade freight procurement engine. It lets shippers run real-time reverse auctions for freight lanes, complete with **anti-sniping auto-extensions**, a strict **forced close hard cap**, real-time **L1/L2/L3 ranking**, and an **invite-only passwordless supplier authentication** system.

---

## Table of Contents
1. [How to Explore the Live App](#1-how-to-explore-the-live-app)
2. [How the British Auction Works (The Functional Part)](#2-how-the-british-auction-works-the-functional-part)
3. [System Architecture (High-Level Design)](#3-system-architecture-high-level-design)
4. [User Request Lifecycle & Bidding Flow](#4-user-request-lifecycle--bidding-flow)
5. [Database Schema & Data Model](#5-database-schema--data-model)
6. [Production Practices: Redis, Caching & Concurrency](#6-production-practices-redis-caching--concurrency)
7. [API Reference & Access Matrix](#7-api-reference--access-matrix)
8. [Automated Tests & Quality Checks](#8-automated-tests--quality-checks)
9. [Assignment Deliverables Checklist](#9-assignment-deliverables-checklist)

---

## 1. How to Explore the Live App

> **Reviewing this assignment?**  
> You can test everything right on our **live production deployment**! The live URL, Admin credentials, and seeded Supplier accounts were sent directly to your inbox in our submission email.

Here is a quick, guided tour of what to try out on the live site:

### Step 1: Check out the Admin Portal
1. Open the live URL and head to `/login` (or click **Admin** in the top navigation bar).
2. Enter the admin credentials from our email.
3. **Take a look around:**
   - **View Live RFQs:** You'll see active, scheduled, and past auctions with live countdown timers and current L1 leaders.
   - **Create an RFQ:** Click **Create RFQ** (`/auctions/new`). You can pick the origin, destination, pickup date, and configure the auction rules:
     - **Trigger window ($X$ min):** How close to the end a bid has to be to trigger an extension.
     - **Extension time ($Y$ min):** How much time gets added.
     - **Trigger rules:** Extend on *Any Bid*, *Any Rank Shift*, or only when the *L1 Leader changes*.
     - **Forced Close Cap:** The hard stop timestamp that the auction can never exceed.
     - **Authorized Suppliers:** Check off which carriers get invited to bid.
   - **Manage Suppliers:** Go to **Suppliers** (`/admin/suppliers`) to add new carriers, view registered emails, or disable an account (disabling instantly logs that carrier out).
   - **Manage Invitations per RFQ:** Open any auction to invite new carriers or revoke existing ones on the fly.

---

### Step 2: Log in as a Carrier (Supplier Portal)
1. In a new tab (or incognito window), head over to `/supplier/login` (or click **Supplier Portal** in the header).
2. We use a **passwordless magic link flow**:
   - Enter one of the carrier emails provided in our email (for example, `supplier.a@freight.com`).
   - For fast evaluation on the live build, you can also use the handy **one-click quick-fill buttons** (`SUP-A`, `SUP-B`, `SUP-C`).
3. Click **Send Single-Use Sign-in Link**:
   - If Resend email delivery is connected, check that inbox for your link.
   - For evaluator convenience, an **Evaluation Sign-In button** appears right on screen—click it to immediately verify the token and jump straight into your carrier dashboard!
4. You are now logged in as that specific carrier. Notice that you never had to remember a password, and the server stored only a secure SHA-256 hash of the one-time token.

---

### Step 3: Test Real-Time Bidding & Anti-Sniping Extensions
1. Log in as **`SUP-A`** (`supplier.a@freight.com`) and open `RFQ-DEMO-001`.
2. Scroll to the **Submit Bound Bid** card.
3. Enter your quote breakdown:
   - Freight Charge, Origin Handling, Destination Handling, Transit Time, and Validity.
   - The total is calculated automatically.
4. Click **Submit Bound Bid**:
   - The quote is recorded instantly. Notice your new rank (e.g. **L1**)!
   - **Try Anti-Sniping:** When an auction is inside its trigger window ($X$ minutes remaining) and a qualifying quote comes in, the deadline dynamically pushes back by $Y$ minutes. You'll see the countdown timer adjust and an extension banner appear!
   - **Notice the Forced Close:** Keep placing bids—no matter how many extensions occur, the clock will never go past the **Forced Close** deadline.

---

### Step 4: Verify RFQ-Level Authorization & Anti-Spoofing
Let's make sure carriers can't snoop on auctions they aren't invited to:
1. Log out and log back in as **`SUP-C`** (`supplier.c@freight.com`).
2. Look at your dashboard (`/supplier/auctions`). Notice that `SUP-C` only sees `RFQ-DEMO-001`. `RFQ-DEMO-002` isn't listed at all!
3. Now try pasting the direct URL for `RFQ-DEMO-002` into your browser.
4. **Boom: HTTP 403 Forbidden.** The backend checks active invitations in the database on every single request.
5. Even if someone tries editing the request body in Postman to pass someone else's `supplierId`, our API completely ignores it—the bidder identity comes strictly from the verified, cryptographically hashed session cookie.

---

## 2. How the British Auction Works (The Functional Part)

In freight procurement, shippers host **Reverse Auctions (RFQs)** where pre-vetted carriers compete for logistics contracts. Unlike normal auctions where bids go up, here **lower prices win**!

```
Start Time                      Scheduled Close                  Forced Close Cap
   |-----------------------------------|--------------------------------|
                                  [Trigger Window]
                                         ^
                        Bid arrives here: Extends deadline (+Y min)
                                         ------------------------->| (Capped at Forced Close)
```

### 1. Reverse Bidding & Leaderboard (L1, L2, L3)
- **L1** is the lowest total quote (the current winner).
- Carriers can submit multiple quotes over the course of the auction to undercut competitors.
- Each supplier's rank is based on their **single best quote**.
- **Tie-breaker:** If two carriers quote the exact same total, the earlier bid gets the higher rank.

### 2. Anti-Sniping Auto-Extensions
In manual auctions, people often wait until the last 5 seconds to submit a bid so nobody else has time to react ("bid sniping"). To keep things fair and get the best price for the shipper, the British Auction uses **dynamic extensions**:
- **Trigger Window ($X$ minutes):** If the clock has less than $X$ minutes left when a quote arrives, the auction triggers an extension.
- **Extension Time ($Y$ minutes):** The deadline pushes back by $Y$ minutes from the current close time.
- **Configurable Triggers:**
  - `BID_RECEIVED`: Any valid quote inside the window extends the auction.
  - `ANY_RANK_CHANGE`: Any change anywhere on the leaderboard extends the auction.
  - `L1_RANK_CHANGE`: Only a quote that takes over the #1 lead (new L1) extends the auction.

### 3. The Forced Close Hard Cap
In physical freight logistics, trucks have scheduled dispatch windows and warehouses have cutoffs. You can't let an auction run forever in an infinite extension loop!
- Shippers set a strict **Forced Close Cap** (e.g., 6:00 PM).
- If an extension would push the deadline past the cap, the engine automatically clamps the new close time to `forcedCloseAt`.
- The moment the forced close time hits, the auction automatically transitions to `FORCE_CLOSED`, immediately stopping any further bids.

### 4. Bulletproof Money Math
No JavaScript floating-point errors here (`0.1 + 0.2 != 0.30000000000000004`). Every quote is parsed into integer cents before calculations and comparisons, and stored in PostgreSQL as `DECIMAL(12, 2)`.

---

## 3. System Architecture (High-Level Design)

Here is the high-level architecture diagram showing how the whole system connects:

<!-- Diagram 1: High-Level Architecture -->
![High-Level System Architecture](./docs/architecture-hld.png)

### Simple Breakdown of the Architecture:
- **Admin & Bidders:** Separate interfaces tailored to their roles. Admins manage RFQs, view audit logs, and control access. Bidders only see their invited auctions and submit quotes.
- **Next.js API Layer:** Acts as our API gateway. It validates all incoming requests using Zod schemas, checks origin headers for CSRF protection, and verifies session cookies.
- **Domain Modules:**
  - *Auth & Access Control:* Checks database-backed sessions and ensures a carrier has an active invitation to that specific RFQ before letting them through.
  - *Auction Engine:* The core brain. It evaluates bid prices, checks if the bid landed in trigger window $X$, recalculates ranks, and calculates the new deadline.
- **PostgreSQL Database:** The single source of truth (hosted on Neon Serverless Postgres). It holds auctions, bids, supplier invitations, and audit trails.
- **Managed Redis & Outbox Worker:**
  - *Rate Limiting:* Protects sensitive endpoints (like magic link requests and bids) from bot spam.
  - *Short-Lived Caching:* Stores quick snapshots of hot auctions so thousands of viewers don't overload Postgres.
  - *Transactional Outbox:* When a bid happens, an event is saved directly inside the database transaction. A background worker picks it up and publishes it to Redis.
- **SSE Streaming (Server-Sent Events):** Pushes live countdown and ranking updates directly to bidders' browsers in real time without annoying page reloads or aggressive polling.

---

## 4. User Request Lifecycle & Bidding Flow

Here is the sequence diagram showing what happens under the hood from the moment a carrier clicks "Submit Bound Bid":

<!-- Diagram 2: User Request Lifecycle -->
![User Request Lifecycle Sequence Diagram](./docs/user-request-cycle.png)

### Step-by-Step Flow:
1. **Quote Submission:** The carrier submits their quote breakdown from the UI to `POST /api/auctions/{id}/bids`.
2. **Session Verification & Auth Gate:**
   - The API inspects the `auction_supplier_session` cookie.
   - It hashes the cookie token and looks up the active session in PostgreSQL.
   - It verifies that the carrier is active and has an active invitation to this RFQ (`revokedAt IS NULL`).
   - The server assigns the authenticated `supplierId` directly—any `supplierId` passed in the body is completely ignored.
3. **Pessimistic Row Lock (`SELECT ... FOR UPDATE`):**
   - The database transaction locks that specific auction row.
   - If two carriers bid at the exact same millisecond, the second bid patiently waits for the first to finish. This ensures extensions and rank calculations are always evaluated against accurate, up-to-date data.
4. **Auction Engine Evaluation:**
   - Checks that the auction is currently active (`startAt <= now < currentCloseAt`).
   - Recalculates the leaderboard to see if the bid triggers an anti-sniping rule.
   - If triggered inside window $X$, sets the new deadline to `MIN(currentCloseAt + Y, forcedCloseAt)`.
5. **Atomic Transaction Commit:**
   - All written together in one atomic database commit:
     - The new `Bid` record.
     - The updated `Auction` deadline.
     - An immutable `AuctionEvent` audit entry.
     - An outbox event record.
6. **Real-time Live Fan-Out:**
   - The submitting carrier immediately gets a `201 Created` response.
   - The outbox worker reads the committed event and publishes it to Redis.
   - Connected browser clients listening to the SSE stream receive the updated ranking and new countdown timer instantly.

---

## 5. Database Schema & Data Model

Here is the Entity Relationship Diagram (ERD) of our database:

<!-- Diagram 3: Database Schema Design -->
![Database Schema Design](./docs/database-schema.png)

### Key Tables & Why They Exist:

| Table | What it does | Important Fields & Constraints |
| :--- | :--- | :--- |
| **`Auction`** | Stores the RFQ details and anti-sniping rules | `id`, `referenceId` (unique), `startAt`, `initialCloseAt`, `currentCloseAt`, `forcedCloseAt`, `triggerWindowMinutes`, `extensionMinutes`, `extensionTriggers[]`, `status`. Indexed for fast queries. |
| **`Supplier`** | Registered logistics carrier profile | `id`, `code` (unique, e.g. `SUP-A`), `name`, `email` (unique), `isActive`. |
| **`AuctionSupplier`** | **The Invite-Only Junction Table** | Links an auction to an invited supplier. Contains `auctionId`, `supplierId`, `invitedAt`, and `revokedAt`. Enforces unique `(auctionId, supplierId)`. |
| **`Bid`** | Immutable carrier quotes | `auctionId`, `supplierId`, `freightCharge`, `originCharge`, `destinationCharge`, `totalAmount`, `transitTimeHours`, `validUntil`, `submittedAt`. |
| **`AuctionEvent`** | Audit trail of every action | Records every bid, extension decision, previous deadline, new deadline, and reason. |
| **`SupplierSession`** | Active carrier sessions | Stores SHA-256 hash of session token (`tokenHash`), `supplierId`, and `expiresAt`. Never stores raw tokens! |
| **`SupplierMagicLinkToken`** | Single-use magic links | Stores SHA-256 hash of magic link token, expiry, and `consumedAt` timestamp to prevent replay attacks. |
| **`AdminSession`** | Administrative sessions | Separate session table and separate cookie path for administrators to guarantee strict privilege separation. |

---

## 6. Production Practices: Redis, Caching & Concurrency

Building an auction engine isn't just about saving rows—it's about handling concurrency, speed, and reliability when multiple suppliers are fighting for a deal in the final seconds.

### 1. Eliminating Race Conditions (`SELECT FOR UPDATE`)
Imagine two carriers submit bids at 5:59:58 PM for an auction ending at 6:00:00 PM:
- **Without locking:** Both requests read the close time as 6:00 PM, both calculate "+5 minutes", and both try to update it. One overwrites the other, and ranking triggers get corrupted.
- **With our row-level lock:** PostgreSQL locks the auction row for the first bid. The second bid waits a couple of milliseconds until the first commits, reads the newly extended deadline, and evaluates ranking triggers properly. Zero race conditions!

### 2. Redis Caching & Short-Lived TTLs
- **Auction Detail Caching:** When an auction is closing, hundreds of users might be watching the page. We cache auction snapshots with a short 2–5 second TTL in Redis to take load off PostgreSQL.
- **Leaderboard Sorted Sets:** We can keep supplier ranks in a Redis `ZSET` scored by total price, giving us lightning-fast $O(\log N)$ rank lookups.
- **Instant Invalidation:** Whenever a bid commits, the cache is instantly refreshed so viewers never see stale data.

### 3. Redis Rate Limiting
- **Magic Link Protection:** Limited to 5 requests per 15 minutes per email/IP to prevent spamming carrier inboxes or overwhelming the mail server.
- **Bid Rate Limiting:** Carriers are rate-limited to 1 bid every 2 seconds per session. This blocks rogue micro-bidding bots from spamming the database while letting humans bid comfortably.

### 4. Transactional Outbox Pattern
Ever had a database update succeed, but sending the notification email or webhook fail? Or worse, the email sent, but the database rolled back?  
- With the **Transactional Outbox**, the event is written directly to an `outbox` table *inside the same database transaction* as the bid.
- A background worker reads unread outbox events and dispatches them to Redis and email providers. This guarantees **at-least-once delivery** and 100% data consistency.

### 5. Server-Sent Events (SSE) Streaming
Instead of having hundreds of browsers spamming `GET /api/auctions/123` every second, browsers open a single lightweight SSE connection. When the outbox worker pushes an event to Redis Pub/Sub, the SSE server broadcasts the updated leaderboard and timer to everyone at once.



## 8. Automated Tests & Quality Checks

The codebase includes an extensive automated test suite with **51 passing tests** covering domain calculations, extension rules, concurrency, security, and authorization:

```bash
# Run the complete test suite
pnpm test
```

### What's Tested:
- **Authentication & Security (`tests/auth/supplier.auth.test.ts`):**
  - Cryptographic token generation and SHA-256 verification.
  - Replay prevention: single-use tokens cannot be redeemed a second time.
  - Expired tokens and disabled supplier accounts are rejected.
  - Logout cleans up database sessions and clears cookies.
  - Rate limiting on link generation and CSRF origin verification.
- **RFQ Authorization & Bidding (`tests/auctions/auction.service.test.ts`):**
  - Invited suppliers can bid successfully.
  - Uninvited suppliers receive `403 SupplierNotAuthorizedError`.
  - Revoked invitations receive `403 SupplierNotAuthorizedError`.
  - Inactive/disabled carriers receive `403 SupplierInactiveError`.
- **API Anti-Spoofing (`tests/api/bids.route.test.ts`):**
  - Unauthenticated requests are blocked with HTTP 401.
  - CSRF / invalid origin requests are blocked with HTTP 403.
  - Body tampering (sending someone else's `supplierId`) is rejected: quote identity is bound strictly to the verified session cookie.
- **Admin Privilege Separation (`tests/api/admin.authorization.test.ts`):**
  - Suppliers cannot access admin endpoints.
  - Admins can invite suppliers, revoke invitations, and toggle accounts.
- **Auction Engine Logic (`tests/auctions/auction.engine.test.ts`):**
  - Extensions fire accurately for `BID_RECEIVED`, `ANY_RANK_CHANGE`, and `L1_RANK_CHANGE`.
  - Bids outside the trigger window do not trigger an extension.
  - Extensions never exceed the `forcedCloseAt` cap.
  - Deterministic tie-breaking on identical prices.

Built with Next.js App Router, TypeScript, Prisma ORM, PostgreSQL, and Tailwind CSS.
