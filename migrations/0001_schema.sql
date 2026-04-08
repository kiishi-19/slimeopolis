-- Slimeopolis D1 Schema
-- Migration 0001: Initial schema

-- ─── Users ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id               TEXT PRIMARY KEY,
  email            TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  password_hash    TEXT NOT NULL,
  role             TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
  is_wholesale     INTEGER NOT NULL DEFAULT 0, -- 1 = eligible for mTLS wholesale endpoints
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ─── Products ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS products (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  slug             TEXT NOT NULL UNIQUE,
  description      TEXT NOT NULL,
  price_cents      INTEGER NOT NULL CHECK (price_cents > 0),
  country_code     TEXT NOT NULL, -- ISO 3166-1 alpha-2 (JP, BR, FR, etc.)
  country_name     TEXT NOT NULL,
  category         TEXT NOT NULL CHECK (category IN (
                     'butter','cloud','clear','floam','crunchy',
                     'glossy','metallic','glitter','glow','clay'
                   )),
  texture          TEXT NOT NULL CHECK (texture IN (
                     'thick','fluffy','stretchy','crunchy','jiggly'
                   )),
  scent            TEXT,
  color_hex        TEXT NOT NULL,
  stock_quantity   INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  image_key        TEXT, -- R2 object key
  is_featured      INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_products_country ON products(country_code);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
CREATE INDEX IF NOT EXISTS idx_products_featured ON products(is_featured);

-- Full-text search for product search endpoint (volumetric abuse detection target)
CREATE VIRTUAL TABLE IF NOT EXISTS products_fts USING fts5(
  name,
  description,
  country_name,
  content='products',
  content_rowid='rowid'
);

-- ─── Cart ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cart_items (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id       TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity         INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_cart_user ON cart_items(user_id);

-- ─── Orders ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS orders (
  id                   TEXT PRIMARY KEY,
  user_id              TEXT NOT NULL REFERENCES users(id),
  status               TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
                         'pending','confirmed','processing','shipped','delivered','cancelled'
                       )),
  total_cents          INTEGER NOT NULL,
  shipping_name        TEXT NOT NULL,
  shipping_address     TEXT NOT NULL,
  shipping_city        TEXT NOT NULL,
  shipping_country     TEXT NOT NULL,
  shipping_postal_code TEXT NOT NULL,
  notes                TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

CREATE TABLE IF NOT EXISTS order_items (
  id               TEXT PRIMARY KEY,
  order_id         TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id       TEXT NOT NULL REFERENCES products(id),
  quantity         INTEGER NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- ─── Reviews ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reviews (
  id               TEXT PRIMARY KEY,
  product_id       TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id          TEXT NOT NULL REFERENCES users(id),
  rating           INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title            TEXT NOT NULL,
  body             TEXT NOT NULL,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(product_id, user_id) -- one review per user per product
);

CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);

-- ─── Wholesale Orders (mTLS-protected endpoint data) ─────────────────────────

CREATE TABLE IF NOT EXISTS wholesale_orders (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id),
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
                     'pending','confirmed','processing','shipped','delivered','cancelled'
                   )),
  total_cents      INTEGER NOT NULL,
  company_name     TEXT NOT NULL,
  tax_id           TEXT NOT NULL,
  notes            TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS wholesale_order_items (
  id               TEXT PRIMARY KEY,
  order_id         TEXT NOT NULL REFERENCES wholesale_orders(id) ON DELETE CASCADE,
  product_id       TEXT NOT NULL REFERENCES products(id),
  quantity         INTEGER NOT NULL CHECK (quantity >= 10), -- min 10 units wholesale
  unit_price_cents INTEGER NOT NULL,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
