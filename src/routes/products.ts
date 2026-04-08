import { Hono } from "hono";
import type { Env, HonoVariables, CreateReviewPayload } from "../types";
import { requireAuth, optionalAuth } from "../middleware/auth";
import { trackEvent } from "../middleware/analytics";
import { successResponse, errorResponse } from "../lib/response";
import { generateId } from "../lib/crypto";

const products = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

// ─── GET /api/products ────────────────────────────────────────────────────────
// API Shield targets:
//   • Schema Validation: validates query params (page, per_page, country, category)
//   • Sequence Analytics: first step in the browse → cart → checkout sequence

products.get("/", optionalAuth, async (c) => {
  const page = Math.max(1, Number(c.req.query("page") ?? "1"));
  const perPage = Math.min(50, Math.max(1, Number(c.req.query("per_page") ?? "12")));
  const country = c.req.query("country");
  const category = c.req.query("category");
  const featured = c.req.query("featured");
  const offset = (page - 1) * perPage;

  let where = "1=1";
  const bindings: unknown[] = [];

  if (country) {
    where += " AND country_code = ?";
    bindings.push(country.toUpperCase());
  }
  if (category) {
    where += " AND category = ?";
    bindings.push(category.toLowerCase());
  }
  if (featured === "true") {
    where += " AND is_featured = 1";
  }

  const countResult = await c.env.DB.prepare(
    `SELECT COUNT(*) as total FROM products WHERE ${where}`
  ).bind(...bindings).first<{ total: number }>();

  const total = countResult?.total ?? 0;

  const rows = await c.env.DB.prepare(
    `SELECT id, name, slug, description, price_cents, country_code, country_name,
            category, texture, scent, color_hex, stock_quantity, image_key, is_featured
     FROM products WHERE ${where}
     ORDER BY is_featured DESC, created_at DESC
     LIMIT ? OFFSET ?`
  ).bind(...bindings, perPage, offset).all();

  const user = c.get("user");
  trackEvent(c, "api_request", {
    userId: user?.sub,
    country: country ?? undefined,
    endpoint: "/api/products",
  });

  return successResponse(c, rows.results, {
    page, per_page: perPage, total, total_pages: Math.ceil(total / perPage),
  });
});

// ─── GET /api/products/search ─────────────────────────────────────────────────
// API Shield targets:
//   • Schema Validation: validates 'q' query param (required string, min 1 char)
//   • Volumetric Abuse Detection: primary target — bots scrape via search
//   • Rate Limiting: 30 reqs/min per session to prevent catalog harvesting

products.get("/search", optionalAuth, async (c) => {
  const q = c.req.query("q");
  const page = Math.max(1, Number(c.req.query("page") ?? "1"));
  const perPage = Math.min(20, Math.max(1, Number(c.req.query("per_page") ?? "10")));
  const offset = (page - 1) * perPage;

  if (!q || q.trim().length === 0) {
    return errorResponse(c, 422, "VALIDATION_ERROR", "Query parameter 'q' is required");
  }

  const user = c.get("user");

  // Use FTS5 full-text search
  const rows = await c.env.DB.prepare(
    `SELECT p.id, p.name, p.slug, p.description, p.price_cents, p.country_code,
            p.country_name, p.category, p.texture, p.scent, p.color_hex,
            p.stock_quantity, p.image_key, p.is_featured
     FROM products p
     JOIN products_fts fts ON p.rowid = fts.rowid
     WHERE products_fts MATCH ?
     ORDER BY rank
     LIMIT ? OFFSET ?`
  ).bind(q.trim(), perPage, offset).all();

  const countRow = await c.env.DB.prepare(
    `SELECT COUNT(*) as total
     FROM products p JOIN products_fts fts ON p.rowid = fts.rowid
     WHERE products_fts MATCH ?`
  ).bind(q.trim()).first<{ total: number }>();

  trackEvent(c, "search", {
    userId: user?.sub,
    searchQuery: q.trim(),
    endpoint: "/api/products/search",
  });

  return successResponse(c, rows.results, {
    query: q.trim(),
    page,
    per_page: perPage,
    total: countRow?.total ?? 0,
    total_pages: Math.ceil((countRow?.total ?? 0) / perPage),
  });
});

// ─── GET /api/products/:id ────────────────────────────────────────────────────
// API Shield targets:
//   • Schema Validation: validates :id path parameter format (UUID)
//   • Sequence Analytics: second step — product detail view after browse

products.get("/:id", optionalAuth, async (c) => {
  const id = c.req.param("id");

  // Fetch product — try by ID first, fall back to slug
  const product = await c.env.DB.prepare(
    "SELECT * FROM products WHERE id = ? OR slug = ? LIMIT 1"
  ).bind(id, id).first();

  if (!product) {
    return errorResponse(c, 404, "NOT_FOUND", `Product '${id}' not found`);
  }

  // Fetch reviews for this product
  const reviews = await c.env.DB.prepare(
    `SELECT r.id, r.rating, r.title, r.body, r.created_at, u.name as reviewer_name
     FROM reviews r JOIN users u ON r.user_id = u.id
     WHERE r.product_id = ?
     ORDER BY r.created_at DESC
     LIMIT 10`
  ).bind((product as { id: string }).id).all();

  // Average rating
  const ratingRow = await c.env.DB.prepare(
    "SELECT AVG(rating) as avg_rating, COUNT(*) as review_count FROM reviews WHERE product_id = ?"
  ).bind((product as { id: string }).id).first<{ avg_rating: number; review_count: number }>();

  const user = c.get("user");
  trackEvent(c, "product_view", {
    userId: user?.sub,
    productId: (product as { id: string }).id,
    country: (product as { country_code: string }).country_code,
  });

  return successResponse(c, {
    ...product,
    reviews: reviews.results,
    avg_rating: ratingRow?.avg_rating ? Math.round(ratingRow.avg_rating * 10) / 10 : null,
    review_count: ratingRow?.review_count ?? 0,
  });
});

// ─── POST /api/products/:id/reviews ──────────────────────────────────────────
// API Shield targets:
//   • Schema Validation: validates rating (integer 1–5), title (string), body (string)
//   • Rate Limiting: 1 review per user per product (enforced in DB + logic)

products.post("/:id/reviews", requireAuth, async (c) => {
  const productId = c.req.param("id");
  const user = c.get("user");

  let body: CreateReviewPayload;
  try {
    body = await c.req.json<CreateReviewPayload>();
  } catch {
    return errorResponse(c, 400, "INVALID_JSON", "Request body must be valid JSON");
  }

  const { rating, title, body: reviewBody } = body;

  if (!rating || !title || !reviewBody) {
    return errorResponse(c, 422, "VALIDATION_ERROR", "rating, title, and body are required");
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return errorResponse(c, 422, "VALIDATION_ERROR", "rating must be an integer between 1 and 5");
  }
  if (title.trim().length < 3 || title.trim().length > 120) {
    return errorResponse(c, 422, "VALIDATION_ERROR", "title must be between 3 and 120 characters");
  }
  if (reviewBody.trim().length < 10 || reviewBody.trim().length > 2000) {
    return errorResponse(c, 422, "VALIDATION_ERROR", "body must be between 10 and 2000 characters");
  }

  const product = await c.env.DB.prepare(
    "SELECT id FROM products WHERE id = ? OR slug = ? LIMIT 1"
  ).bind(productId, productId).first<{ id: string }>();

  if (!product) {
    return errorResponse(c, 404, "NOT_FOUND", `Product '${productId}' not found`);
  }

  // Check for existing review
  const existing = await c.env.DB.prepare(
    "SELECT id FROM reviews WHERE product_id = ? AND user_id = ? LIMIT 1"
  ).bind(product.id, user.sub).first();

  if (existing) {
    return errorResponse(c, 409, "ALREADY_REVIEWED", "You have already reviewed this product");
  }

  const id = generateId();
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    `INSERT INTO reviews (id, product_id, user_id, rating, title, body, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, product.id, user.sub, rating, title.trim(), reviewBody.trim(), now).run();

  return successResponse(c, {
    id, product_id: product.id, user_id: user.sub,
    rating, title: title.trim(), body: reviewBody.trim(), created_at: now,
  }, undefined, 201);
});

export default products;
