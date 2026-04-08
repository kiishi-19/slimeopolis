// ─── Cloudflare Bindings ──────────────────────────────────────────────────────

export interface Env {
  // D1 — relational database
  DB: D1Database;

  // KV — session tokens & product cache
  SESSIONS: KVNamespace;
  PRODUCT_CACHE: KVNamespace;

  // R2 — product images
  IMAGES: R2Bucket;

  // Analytics Engine — custom business events
  ANALYTICS: AnalyticsEngineDataset;

  // Static assets
  ASSETS: Fetcher;

  // Environment vars
  ENVIRONMENT: string;
  JWT_EXPIRY_SECONDS: string;
  CORS_ORIGIN: string;

  // Secrets (set via wrangler secret put)
  JWT_SECRET: string;
  CF_API_TOKEN: string;
  CF_ACCOUNT_ID: string;
  CF_ZONE_ID: string;
}

// ─── Domain Models ────────────────────────────────────────────────────────────

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  price_cents: number; // stored as cents to avoid float precision issues
  country_code: string;
  country_name: string;
  category: SlimeCategory;
  texture: SlimeTexture;
  scent: string | null;
  color_hex: string;
  stock_quantity: number;
  image_key: string | null; // R2 object key
  is_featured: boolean;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: UserRole;
  is_wholesale: boolean; // eligible for /api/wholesale/* (mTLS endpoints)
  created_at: string;
  updated_at: string;
}

export interface CartItem {
  id: string;
  user_id: string;
  product_id: string;
  quantity: number;
  created_at: string;
  updated_at: string;
  // Joined fields
  product?: Product;
}

export interface Order {
  id: string;
  user_id: string;
  status: OrderStatus;
  total_cents: number;
  shipping_name: string;
  shipping_address: string;
  shipping_city: string;
  shipping_country: string;
  shipping_postal_code: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  unit_price_cents: number;
  product?: Product;
}

export interface Review {
  id: string;
  product_id: string;
  user_id: string;
  rating: number; // 1–5
  title: string;
  body: string;
  created_at: string;
  user?: Pick<User, "id" | "name">;
}

export interface WholesaleOrder {
  id: string;
  user_id: string;
  status: OrderStatus;
  total_cents: number;
  company_name: string;
  tax_id: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Enums ────────────────────────────────────────────────────────────────────

export type SlimeCategory =
  | "butter"
  | "cloud"
  | "clear"
  | "floam"
  | "crunchy"
  | "glossy"
  | "metallic"
  | "glitter"
  | "glow"
  | "clay";

export type SlimeTexture =
  | "thick"
  | "fluffy"
  | "stretchy"
  | "crunchy"
  | "jiggly";

export type UserRole = "customer" | "admin";

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled";

// ─── API Payload Types ────────────────────────────────────────────────────────
// These match the OpenAPI schema in schema/openapi.yaml

export interface RegisterPayload {
  email: string;
  password: string;
  name: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface AddCartItemPayload {
  product_id: string;
  quantity: number;
}

export interface UpdateCartItemPayload {
  quantity: number;
}

export interface CreateOrderPayload {
  shipping_name: string;
  shipping_address: string;
  shipping_city: string;
  shipping_country: string;
  shipping_postal_code: string;
  notes?: string;
}

export interface CreateReviewPayload {
  rating: number;
  title: string;
  body: string;
}

export interface UpdateProfilePayload {
  name?: string;
  email?: string;
}

export interface BulkOrderItem {
  product_id: string;
  quantity: number;
}

export interface CreateWholesaleOrderPayload {
  company_name: string;
  tax_id: string;
  items: BulkOrderItem[];
  notes?: string;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface JWTPayload {
  sub: string;        // user id
  email: string;
  role: UserRole;
  is_wholesale: boolean;
  iat: number;
  exp: number;
}

// ─── Hono Context Variables ───────────────────────────────────────────────────

export interface HonoVariables {
  user: JWTPayload;
}

// ─── Analytics Engine Event Types ────────────────────────────────────────────

export type AnalyticsEvent =
  | "product_view"
  | "search"
  | "add_to_cart"
  | "remove_from_cart"
  | "checkout_started"
  | "order_placed"
  | "login"
  | "register"
  | "wholesale_inventory_view"
  | "wholesale_order_placed"
  | "api_request";

// ─── API Responses ────────────────────────────────────────────────────────────

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface PaginationMeta {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}
