# 🫧 Slimeopolis — Global Slime Emporium

A full-stack e-commerce application built on **Cloudflare Workers**, purpose-designed to demonstrate and test all five **Cloudflare API Shield** capabilities. The store sells slimes inspired by 8 countries, with each API route group engineered to exercise a specific protection feature.

**Live demo:** `https://slimeopolis.kiishiogunbiyi.workers.dev`

---

## API Shield Coverage

| Feature | Endpoints Targeted |
|---|---|
| 🔎 **Schema Validation** | All POST/PUT endpoints + query param validation on GET routes |
| 🔐 **Mutual TLS (mTLS)** | `/api/wholesale/inventory`, `/api/wholesale/bulk-order` |
| 🔗 **Sequence Analytics** | `GET /products` → `GET /products/:id` → `GET /recommendations` → `POST /cart/items` → `POST /orders` |
| ⚡ **Rate Limiting** | `POST /auth/login`, `POST /auth/register`, `GET /products/search` |
| 📊 **Volumetric Abuse Detection** | `GET /products/search` (per-session adaptive thresholds) |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Cloudflare Workers |
| Framework | [Hono v4](https://hono.dev) |
| Database | Cloudflare D1 (SQLite) |
| Sessions / Cache | Cloudflare KV |
| Images | Cloudflare R2 |
| Custom Metrics | Cloudflare Analytics Engine |
| Frontend | Tailwind CSS (served via Workers Static Assets) |
| Auth | JWT (HS256, signed with Web Crypto — no library) |
| Passwords | PBKDF2 (100k iterations, Web Crypto) |

---

## Project Structure

```
slimeopolis/
├── src/
│   ├── index.ts                  # Hono app entry — routes, global middleware
│   ├── types.ts                  # All TypeScript types and interfaces
│   ├── routes/
│   │   ├── auth.ts               # Register, login, logout, /me
│   │   ├── products.ts           # List, search (FTS), detail, reviews
│   │   ├── cart.ts               # Cart CRUD
│   │   ├── orders.ts             # Order placement and history
│   │   ├── recommendations.ts    # Product recommendations
│   │   ├── user.ts               # Profile and preferences
│   │   └── wholesale.ts          # mTLS-protected B2B endpoints
│   ├── middleware/
│   │   ├── auth.ts               # JWT sign/verify, requireAuth, optionalAuth
│   │   ├── mtls.ts               # mTLS header verification
│   │   └── analytics.ts          # Analytics Engine event writes
│   └── lib/
│       ├── crypto.ts             # PBKDF2 password hashing
│       └── response.ts           # Typed API response builders
├── migrations/
│   └── 0001_schema.sql           # D1 schema (tables + indexes)
├── scripts/
│   ├── setup-mtls.ts             # Creates CA, issues test cert, wires CF mTLS rule
│   └── sql/
│       ├── seed.sql              # 24 products across 8 countries
│       └── reset.sql             # Drops all tables (dev use only)
├── schema/
│   └── openapi.yaml              # OpenAPI v3 spec — upload to API Shield
├── public/                       # Static frontend (Tailwind CSS)
│   ├── index.html                # Homepage with hero + country explorer
│   ├── products.html             # Product grid with filters + search
│   ├── cart.html                 # Cart + checkout
│   ├── login.html                # Sign in / register
│   ├── wholesale.html            # mTLS-gated B2B wholesale portal
│   └── assets/
│       ├── css/main.css          # Animations, cards, toasts
│       └── js/
│           ├── app.js            # Auth state, API client, shared helpers
│           ├── home.js           # Featured products loader
│           └── products.js       # Filter, search, pagination
├── wrangler.jsonc                # Worker config — bindings, vars
├── tsconfig.json                 # TypeScript config for Worker source
└── tsconfig.scripts.json         # TypeScript config for Node scripts
```

---

## Product Catalog

24 handcrafted slimes, 3 per country:

| 🇯🇵 Japan | 🇧🇷 Brazil | 🇫🇷 France | 🇰🇷 South Korea |
|---|---|---|---|
| Sakura Cloud Slime | Tropical Floam | Lavande Butter Slime | K-Pop Glitter Clear |
| Matcha Butter Slime | Carnival Glitter Slime | Parisian Glossy Slime | Boba Tea Chunky Slime |
| Raindrop Clear Slime | Amazon Green Crunchy | Crème Brûlée Slime | Seoul Neon Slime |

| 🇮🇳 India | 🇦🇺 Australia | 🇲🇽 Mexico | 🇮🇹 Italy |
|---|---|---|---|
| Festival Color Slime | Outback Glow Slime | Fiesta Confetti Slime | Venetian Marble Slime |
| Turmeric Gold Metallic | Coral Reef Metallic | Oaxacan Clay Mix | Gelato Swirl Slime |
| Monsoon Blue Slime | Eucalyptus Butter Slime | Talavera Tile Glitter | Tuscan Sunset Metallic |

---

## Setup & Deployment

### Prerequisites

- [Cloudflare account](https://dash.cloudflare.com/sign-up) (Enterprise plan for Sequence Analytics + Volumetric Abuse Detection)
- [Node.js 18+](https://nodejs.org)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) v4+

### 1. Clone and install

```bash
git clone https://github.com/kiishi-19/slimeopolis.git
cd slimeopolis
npm install
```

### 2. Create Cloudflare resources

```bash
# D1 database
wrangler d1 create slimeopolis-db

# KV namespaces
wrangler kv namespace create SESSIONS
wrangler kv namespace create PRODUCT_CACHE

# R2 bucket
wrangler r2 bucket create slimeopolis-images
```

### 3. Update wrangler.jsonc

Replace the placeholder values with the IDs output by the commands above:

```jsonc
{
  "account_id": "<your-account-id>",
  "d1_databases": [{ "binding": "DB", "database_name": "slimeopolis-db", "database_id": "<your-d1-id>" }],
  "kv_namespaces": [
    { "binding": "SESSIONS",      "id": "<your-sessions-kv-id>" },
    { "binding": "PRODUCT_CACHE", "id": "<your-cache-kv-id>" }
  ]
}
```

> **Important:** Never put the same binding name twice. If wrangler auto-appends a resource after creation, remove the placeholder entry manually.

### 4. Apply database migrations and seed

```bash
# Create tables
npm run db:migrate:remote

# Seed 24 products
npm run db:seed:remote
```

> **If you're behind a corporate VPN**, the `--file` upload may fail. Use `--command` batches instead — see the `scripts/sql/seed.sql` file for the individual INSERT statements.

### 5. Set secrets

```bash
# Required — signs and verifies all auth tokens
wrangler secret put JWT_SECRET
# Enter a long random string (min 32 chars), e.g.:
# openssl rand -base64 48
```

### 6. Deploy

```bash
npm run deploy
```

---

## Local Development

```bash
# Copy the example env file and fill in your values
cp .dev.vars.example .dev.vars   # (create this manually — see below)

npm run dev
```

Create `.dev.vars` (this file is gitignored — never commit it):

```bash
JWT_SECRET=local-dev-secret-at-least-32-characters-long
ENVIRONMENT=development
```

---

## API Reference

Base URL: `https://slimeopolis.kiishiogunbiyi.workers.dev/api`

All responses follow this shape:
```json
{ "success": true, "data": { ... }, "meta": { ... } }
{ "success": false, "error": { "code": "ERROR_CODE", "message": "..." } }
```

### Auth

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/auth/register` | — | Create account. Returns JWT. |
| `POST` | `/auth/login` | — | Sign in. Returns JWT. |
| `POST` | `/auth/logout` | Bearer | Revoke current token. |
| `GET` | `/auth/me` | Bearer | Current user info. |

### Products

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/products` | Optional | List products. Query: `country`, `category`, `featured`, `page`, `per_page`. |
| `GET` | `/products/search` | Optional | Full-text search. Query: `q` (required). |
| `GET` | `/products/:id` | Optional | Product detail + reviews. Accepts ID or slug. |
| `POST` | `/products/:id/reviews` | Bearer | Post a review. One per user per product. |

### Cart

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/cart` | Bearer | View cart with subtotal. |
| `POST` | `/cart/items` | Bearer | Add item. Body: `{ product_id, quantity }`. |
| `PUT` | `/cart/items/:id` | Bearer | Update quantity. Body: `{ quantity }`. |
| `DELETE` | `/cart/items/:id` | Bearer | Remove item. |
| `DELETE` | `/cart` | Bearer | Clear entire cart. |

### Orders

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/orders` | Bearer | Place order from cart. Decrements stock atomically. |
| `GET` | `/orders` | Bearer | Order history (paginated). |
| `GET` | `/orders/:id` | Bearer | Order detail with line items. |

### Recommendations

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/recommendations` | Optional | Query: `product_id`, `country`, or neither (returns featured). |

### User

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/user/profile` | Bearer | Get profile. |
| `PUT` | `/user/profile` | Bearer | Update name/email. |
| `GET` | `/user/preferences` | Bearer | Saved country/category preferences. |
| `PUT` | `/user/preferences` | Bearer | Update preferences. |

### Wholesale (mTLS Required)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/wholesale/inventory` | Bearer + mTLS cert | Full inventory with stock levels. 30% wholesale pricing shown. |
| `POST` | `/wholesale/bulk-order` | Bearer + mTLS cert | Place bulk order. Min 10 units per product. 30% discount applied. |

---

## Configuring API Shield

### Schema Validation

1. Go to **Security → API Shield → Schema Validation → Add Validation**
2. Upload `schema/openapi.yaml`
3. Set action to **Log**, verify no false positives in Security → Events
4. Switch to **Block**

### Rate Limiting

Go to **Security → WAF → Rate Limiting Rules → Create Rule**:

```
# Auth brute-force protection
Expression:  http.request.uri.path in {"/api/auth/login" "/api/auth/register"}
Rate:         5 requests per 60 seconds per IP
Action:       Block

# Search scraping protection
Expression:  http.request.uri.path eq "/api/products/search"
Rate:         30 requests per 60 seconds per session (Authorization header)
Action:       Block

# Order flooding protection
Expression:  http.request.uri.path eq "/api/orders" and http.request.method eq "POST"
Rate:         10 requests per 60 seconds per session
Action:       Block
```

### Sequence Analytics

1. Go to **Security → API Shield → Sequence Analytics**
2. Allow 24–48 hours of real traffic to build baseline
3. The expected sequence Cloudflare will learn:
   ```
   GET /api/products → GET /api/products/:id → GET /api/recommendations
   → POST /api/cart/items → POST /api/orders
   ```
4. Sessions that skip directly to `POST /api/orders` without the browse steps are flagged

### Volumetric Abuse Detection

1. **Security → API Shield → Settings → Session Identifiers → Add**
   - Header: `Authorization`
2. Allow 24 hours and 50+ distinct sessions hitting `/api/products/search`
3. Cloudflare surfaces per-endpoint adaptive rate limit recommendations
4. Click **Deploy** to activate

### mTLS (Wholesale Endpoints)

Run the included setup script — it creates a Cloudflare-managed CA, issues a test client certificate, and creates the edge block rule:

```bash
CF_API_TOKEN=<your-token> \
CF_ACCOUNT_ID=<your-account-id> \
CF_ZONE_ID=<your-zone-id> \
HOSTNAME=<your-hostname> \
npm run setup-mtls
```

Test without cert (expect 403):
```bash
curl https://<your-hostname>/api/wholesale/inventory \
  -H "Authorization: Bearer <jwt>"
```

Test with cert (expect 200):
```bash
curl https://<your-hostname>/api/wholesale/inventory \
  -H "Authorization: Bearer <jwt>" \
  --cert ./certs/client-cert.pem \
  --key ./certs/client-key.pem
```

---

## Testing the API Shield Features

### Quick smoke tests with curl

```bash
BASE=https://slimeopolis.kiishiogunbiyi.workers.dev

# Health check
curl $BASE/health

# Browse products (Sequence Analytics: step 1)
curl "$BASE/api/products?country=JP&per_page=3"

# Search — Volumetric Abuse Detection target
curl "$BASE/api/products/search?q=sakura"

# Register and capture token
TOKEN=$(curl -s -X POST $BASE/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"you@test.com","password":"testpass123","name":"Test User"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")

# View product (Sequence Analytics: step 2)
curl "$BASE/api/products/prod_jp_001"

# Get recommendations (Sequence Analytics: step 3)
curl "$BASE/api/recommendations?product_id=prod_jp_001"

# Add to cart (Sequence Analytics: step 4)
curl -X POST $BASE/api/cart/items \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"product_id":"prod_jp_001","quantity":1}'

# Place order (Sequence Analytics: step 5 — final step)
curl -X POST $BASE/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "shipping_name": "Test User",
    "shipping_address": "123 Main St",
    "shipping_city": "New York",
    "shipping_country": "US",
    "shipping_postal_code": "10001"
  }'
```

### Test Schema Validation violations

```bash
# Missing required field — expect 422
curl -X POST $BASE/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"password":"only-password-no-email"}'

# Wrong type — expect 422
curl -X POST "$BASE/api/products/prod_jp_001/reviews" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"rating":"five","title":"Great","body":"Really loved this slime!"}'

# Invalid country code (not 2 chars) — expect 422
curl -X POST $BASE/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"shipping_name":"Test","shipping_address":"123 St","shipping_city":"NYC","shipping_country":"USA","shipping_postal_code":"10001"}'
```

### Test Rate Limiting (once rules are deployed)

```bash
# Trigger the login rate limit — run 6+ times quickly
for i in {1..7}; do
  curl -s -o /dev/null -w "attempt $i: %{http_code}\n" \
    -X POST $BASE/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"x@x.com","password":"wrong"}'
done
# Expected: first 5 return 401, attempts 6+ return 429
```

### Where to find events in the dashboard

| What you're looking for | Where to find it |
|---|---|
| Schema validation violations | Security → Events → filter by "Schema Validation" |
| Rate limiting blocks | Security → Events → filter by "Rate Limiting" |
| mTLS failures | Security → Events → filter by "mTLS" |
| Sequence anomalies | Security → API Shield → Sequence Analytics |
| Volumetric recommendations | Security → API Shield → Endpoint Management |
| Worker errors | Workers & Pages → slimeopolis → Metrics |
| Custom business events | Analytics Engine SQL API or Grafana |

---

## Analytics Engine Queries

Query custom business events via the [Analytics Engine SQL API](https://developers.cloudflare.com/analytics/analytics-engine/sql-api/):

```sql
-- Top searched queries (last 24h)
SELECT blob4 as query, count() as searches
FROM slimeopolis_events
WHERE blob1 = 'search'
AND timestamp > NOW() - INTERVAL '1' DAY
GROUP BY query
ORDER BY searches DESC
LIMIT 10;

-- Order volume by hour
SELECT toStartOfInterval(timestamp, INTERVAL '1' HOUR) as hour,
       count() as orders,
       sum(double3) as total_revenue_cents
FROM slimeopolis_events
WHERE blob1 = 'order_placed'
AND timestamp > NOW() - INTERVAL '7' DAY
GROUP BY hour
ORDER BY hour;

-- Most viewed products
SELECT blob3 as product_id, count() as views
FROM slimeopolis_events
WHERE blob1 = 'product_view'
GROUP BY product_id
ORDER BY views DESC
LIMIT 10;

-- API error rate by endpoint
SELECT blob6 as endpoint,
       countIf(blob7 = '500') as errors,
       count() as total,
       round(countIf(blob7 = '500') / count() * 100, 2) as error_pct
FROM slimeopolis_events
WHERE blob1 = 'api_request'
AND timestamp > NOW() - INTERVAL '1' HOUR
GROUP BY endpoint
ORDER BY errors DESC;
```

---

## Available Scripts

```bash
npm run dev                # Local dev server (wrangler dev)
npm run deploy             # Deploy to Cloudflare Workers
npm run type-check         # TypeScript check (no emit)
npm run db:migrate         # Apply D1 migrations (local)
npm run db:migrate:remote  # Apply D1 migrations (remote)
npm run db:seed            # Seed product data (local)
npm run db:seed:remote     # Seed product data (remote)
npm run db:reset           # Drop all tables (local dev only)
npm run setup-mtls         # Run mTLS certificate setup script
```

---

## Security Notes

- **Secrets** are managed via `wrangler secret put` and never stored in source control
- **`.dev.vars`** is gitignored — create it locally from the example in this README
- **mTLS certificates** in `certs/` are gitignored — generated at runtime by `setup-mtls.ts`
- **Resource IDs** (D1, KV) in `wrangler.jsonc` are infrastructure identifiers, not credentials — this is standard practice for Workers projects
- **Passwords** are hashed with PBKDF2 (100,000 iterations, SHA-256) using the Web Crypto API
- **JWT tokens** are signed with HMAC-SHA256, verified on every authenticated request, and revocable via KV blocklist

---

## Architecture Notes

### Why not `workers.dev` for API Shield?

API Shield operates at the **zone level** — it intercepts traffic before it reaches your Worker. Resources deployed only to `*.workers.dev` have no zone to attach rules to. For full API Shield coverage, deploy to a **custom domain** via Cloudflare Custom Domains or Routes.

### Analytics gap with Workers

Workers metrics (in the dashboard) only count requests your Worker actually executes. Requests **blocked by API Shield at the edge** never reach your Worker and won't appear in Worker metrics. Always check **Security → Events** for the complete picture.

---

## License

MIT
