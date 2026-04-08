import { Hono } from "hono";
import type { Env, HonoVariables } from "../types";
import { optionalAuth } from "../middleware/auth";
import { successResponse } from "../lib/response";

const recommendations = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

// ─── GET /api/recommendations ─────────────────────────────────────────────────
// API Shield targets:
//   • Sequence Analytics: step between product view and add-to-cart.
//     Legitimate users browse → view product → check recommendations → add to cart.
//     Bots typically skip this step. API Shield sequence analysis flags sessions
//     that never hit this endpoint before POSTing to /api/cart/items.
//
// Query params:
//   product_id  — base recommendations on a specific product (after viewing it)
//   country     — filter by country (for country-explorer UX flow)
//   limit       — max results (1–8, default 4)

recommendations.get("/", optionalAuth, async (c) => {
  const productId = c.req.query("product_id");
  const country = c.req.query("country");
  const limit = Math.min(8, Math.max(1, Number(c.req.query("limit") ?? "4")));

  let recs: unknown[];

  if (productId) {
    // Strategy 1: products from the same country (thematic affinity)
    // + products in the same category (texture/type affinity)
    const baseProduct = await c.env.DB.prepare(
      "SELECT country_code, category FROM products WHERE id = ? OR slug = ? LIMIT 1"
    ).bind(productId, productId).first<{ country_code: string; category: string }>();

    if (baseProduct) {
      const rows = await c.env.DB.prepare(
        `SELECT id, name, slug, price_cents, country_code, country_name,
                category, color_hex, image_key, is_featured
         FROM products
         WHERE (country_code = ? OR category = ?)
           AND id != ?
           AND stock_quantity > 0
         ORDER BY
           CASE WHEN country_code = ? AND category = ? THEN 0
                WHEN country_code = ? THEN 1
                ELSE 2
           END,
           is_featured DESC,
           RANDOM()
         LIMIT ?`
      ).bind(
        baseProduct.country_code, baseProduct.category, productId,
        baseProduct.country_code, baseProduct.category,
        baseProduct.country_code,
        limit
      ).all();
      recs = rows.results;
    } else {
      recs = [];
    }
  } else if (country) {
    // Strategy 2: featured products from a given country
    const rows = await c.env.DB.prepare(
      `SELECT id, name, slug, price_cents, country_code, country_name,
              category, color_hex, image_key, is_featured
       FROM products
       WHERE country_code = ? AND stock_quantity > 0
       ORDER BY is_featured DESC, RANDOM()
       LIMIT ?`
    ).bind(country.toUpperCase(), limit).all();
    recs = rows.results;
  } else {
    // Strategy 3: global featured products
    const rows = await c.env.DB.prepare(
      `SELECT id, name, slug, price_cents, country_code, country_name,
              category, color_hex, image_key, is_featured
       FROM products
       WHERE is_featured = 1 AND stock_quantity > 0
       ORDER BY RANDOM()
       LIMIT ?`
    ).bind(limit).all();
    recs = rows.results;
  }

  return successResponse(c, recs, {
    strategy: productId ? "product_affinity" : country ? "country_featured" : "global_featured",
    count: recs.length,
  });
});

export default recommendations;
