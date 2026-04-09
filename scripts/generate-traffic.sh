#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Slimeopolis Traffic Generator
# Simulates realistic user journeys to populate Sequence Analytics,
# Volumetric Abuse Detection, and Rate Limiting data.
#
# Usage:
#   chmod +x scripts/generate-traffic.sh
#   BASE_URL=https://slimeopolis.kiishiogunbiyi.workers.dev ./scripts/generate-traffic.sh
#
# What this generates:
#   • Legitimate users: full browse → product → recommendations → cart → checkout
#   • Bots: skip directly to /api/orders (sequence anomaly)
#   • Search scrapers: rapid /api/products/search (volumetric abuse)
#   • Brute force: repeated /api/auth/login with bad creds (rate limiting)
# ─────────────────────────────────────────────────────────────────────────────

BASE_URL="${BASE_URL:-https://slimeopolis.kiishiogunbiyi.workers.dev}"
DELAY="${DELAY:-0.5}"  # seconds between requests within a session

echo "🫧 Slimeopolis Traffic Generator"
echo "   Target: $BASE_URL"
echo "   Delay:  ${DELAY}s between requests"
echo ""

# ─── Helpers ─────────────────────────────────────────────────────────────────

api() {
  local method="$1" path="$2" token="$3" body="$4"
  local args=(-s -X "$method" "$BASE_URL$path" -H "Content-Type: application/json")
  [ -n "$token" ] && args+=(-H "Authorization: Bearer $token")
  [ -n "$body"  ] && args+=(-d "$body")
  curl "${args[@]}"
}

sleep_step() { sleep "$DELAY"; }

register_user() {
  local email="$1" name="$2"
  local result
  result=$(api POST /api/auth/register "" \
    "{\"email\":\"$email\",\"password\":\"slimetest123\",\"name\":\"$name\"}")
  echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('token',''))" 2>/dev/null
}

login_user() {
  local email="$1"
  local result
  result=$(api POST /api/auth/login "" \
    "{\"email\":\"$email\",\"password\":\"slimetest123\"}")
  echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('token',''))" 2>/dev/null
}

# ─── Journey 1: Legitimate user — full sequence ───────────────────────────────
# GET /api/products → GET /api/products/:id → GET /api/recommendations
# → POST /api/cart/items → POST /api/orders
# This is the CORRECT sequence Cloudflare should learn and protect.

legitimate_user_journey() {
  local user_num="$1"
  local email="legit_user_${user_num}_$$@slimeopolis.com"
  echo "  👤 Legitimate user $user_num ($email)"

  # Register
  local token
  token=$(register_user "$email" "Legit User $user_num")
  [ -z "$token" ] && token=$(login_user "$email")
  [ -z "$token" ] && echo "     ⚠ Could not get token" && return

  # Step 1: Browse products (sequence step 1)
  echo "     → GET /api/products (browse)"
  api GET "/api/products?per_page=12" "$token" > /dev/null
  sleep_step

  # Step 2: View a specific product (sequence step 2)
  local products=("prod_jp_001" "prod_fr_001" "prod_kr_001" "prod_br_001" "prod_in_001" "prod_au_001" "prod_mx_001" "prod_it_001")
  local product_id="${products[$((user_num % ${#products[@]}))]}"
  echo "     → GET /api/products/$product_id (product detail)"
  api GET "/api/products/$product_id" "$token" > /dev/null
  sleep_step

  # Step 3: Get recommendations (sequence step 3 — often skipped by bots)
  echo "     → GET /api/recommendations (recommendations)"
  api GET "/api/recommendations?product_id=$product_id" "$token" > /dev/null
  sleep_step

  # Step 4: View cart (sequence step 4)
  echo "     → GET /api/cart"
  api GET "/api/cart" "$token" > /dev/null
  sleep_step

  # Step 5: Add to cart (sequence step 5)
  echo "     → POST /api/cart/items (add to cart)"
  api POST "/api/cart/items" "$token" \
    "{\"product_id\":\"$product_id\",\"quantity\":1}" > /dev/null
  sleep_step

  # Step 6: Checkout (sequence final step)
  echo "     → POST /api/orders (checkout)"
  api POST "/api/orders" "$token" \
    '{"shipping_name":"Test User","shipping_address":"123 Slime St","shipping_city":"San Francisco","shipping_country":"US","shipping_postal_code":"94105"}' > /dev/null

  echo "     ✓ Full journey complete"
}

# ─── Journey 2: Bot — skips directly to checkout ──────────────────────────────
# Skips browse, product view, recommendations. Goes straight to POST /api/orders.
# This is the ANOMALOUS sequence Cloudflare should flag.

bot_direct_checkout() {
  local bot_num="$1"
  local email="bot_${bot_num}_$$@malicious.com"
  echo "  🤖 Bot $bot_num — skipping sequence, going direct to checkout"

  local token
  token=$(register_user "$email" "Bot $bot_num")
  [ -z "$token" ] && return

  # Bot skips straight to cart + checkout — no browse, no product view
  api POST "/api/cart/items" "$token" \
    '{"product_id":"prod_jp_002","quantity":5}' > /dev/null
  sleep "$DELAY"

  api POST "/api/orders" "$token" \
    '{"shipping_name":"Bot User","shipping_address":"1 Bot Lane","shipping_city":"Nowhere","shipping_country":"US","shipping_postal_code":"00000"}' > /dev/null

  echo "     ✓ Bot journey complete (no browse/product view in sequence)"
}

# ─── Journey 3: Search scraper — rapid volumetric abuse ──────────────────────
# Hammers /api/products/search rapidly. Target for Volumetric Abuse Detection.

search_scraper() {
  local scraper_num="$1"
  local email="scraper_${scraper_num}_$$@scraper.io"
  echo "  🕷  Scraper $scraper_num — rapid search requests"

  local token
  token=$(register_user "$email" "Scraper $scraper_num")
  [ -z "$token" ] && return

  local queries=("slime" "butter" "clear" "Japan" "glow" "metallic" "cloud" "glitter" "crunchy" "floam")
  for q in "${queries[@]}"; do
    api GET "/api/products/search?q=$q" "$token" > /dev/null
    sleep 0.1  # very rapid — no natural human pacing
  done
  echo "     ✓ Scraped ${#queries[@]} search queries rapidly"
}

# ─── Journey 4: Brute force login ────────────────────────────────────────────
# Rapid failed login attempts. Target for Rate Limiting on /api/auth/login.

brute_force_login() {
  echo "  💥 Brute force — rapid login attempts with bad credentials"
  for i in $(seq 1 8); do
    api POST "/api/auth/login" "" \
      "{\"email\":\"victim@example.com\",\"password\":\"wrongpassword$i\"}" > /dev/null
    sleep 0.1
  done
  echo "     ✓ 8 failed login attempts sent"
}

# ─── Journey 5: Normal browser — partial sequence (window shopper) ────────────
# Browses and views products but never checks out. Legit but incomplete sequence.

window_shopper() {
  local user_num="$1"
  local email="shopper_${user_num}_$$@slimeopolis.com"
  echo "  🛍  Window shopper $user_num"

  local token
  token=$(register_user "$email" "Shopper $user_num")
  [ -z "$token" ] && return

  api GET "/api/products?country=JP" "$token" > /dev/null; sleep_step
  api GET "/api/products/prod_jp_001" "$token" > /dev/null; sleep_step
  api GET "/api/products?country=FR" "$token" > /dev/null; sleep_step
  api GET "/api/products/prod_fr_001" "$token" > /dev/null; sleep_step
  api GET "/api/recommendations?country=FR" "$token" > /dev/null

  echo "     ✓ Browsed without purchasing"
}

# ─── Main ─────────────────────────────────────────────────────────────────────

echo "━━━ Phase 1: Legitimate Users (full sequence) ━━━"
for i in $(seq 1 5); do
  legitimate_user_journey "$i"
  echo ""
done

echo "━━━ Phase 2: Bots (skipping sequence) ━━━"
for i in $(seq 1 3); do
  bot_direct_checkout "$i"
  echo ""
done

echo "━━━ Phase 3: Search Scrapers (volumetric abuse) ━━━"
for i in $(seq 1 3); do
  search_scraper "$i"
  echo ""
done

echo "━━━ Phase 4: Brute Force Login (rate limiting) ━━━"
brute_force_login
echo ""

echo "━━━ Phase 5: Window Shoppers (partial sequences) ━━━"
for i in $(seq 1 4); do
  window_shopper "$i"
  echo ""
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Traffic generation complete!"
echo ""
echo "What to check now:"
echo "  • Security → Events           — see validation errors, auth failures"
echo "  • API Shield → Sequence       — wait ~1hr, sequences will appear"
echo "  • API Shield → Endpoint Mgmt  — request counts per endpoint"
echo "  • API Shield → Volumetric     — wait 24h for rate recommendations"
echo "  • Workers Analytics           — request counts, CPU time"
