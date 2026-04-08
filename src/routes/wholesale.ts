import { Hono } from "hono";
import type { CreateWholesaleOrderPayload, Env, HonoVariables } from "../types";
import { requireAuth } from "../middleware/auth";
import { requireMtls, getMtlsCertInfo } from "../middleware/mtls";
import { trackEvent } from "../middleware/analytics";
import { successResponse, errorResponse } from "../lib/response";
import { generateId } from "../lib/crypto";

const wholesale = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

// All wholesale routes require:
//   1. Valid JWT auth (requireAuth) — user must be registered
//   2. Valid mTLS client certificate (requireMtls) — Cloudflare verified cert at edge
//   3. is_wholesale flag on the user account

wholesale.use("/*", requireAuth, requireMtls);

// Additional middleware: check is_wholesale flag on the JWT payload
wholesale.use("/*", async (c, next) => {
  const user = c.get("user");
  if (!user.is_wholesale) {
    return errorResponse(
      c, 403, "WHOLESALE_ACCESS_REQUIRED",
      "Your account is not approved for wholesale access. " +
      "Contact wholesale@slimeopolis.com to apply."
    );
  }
  await next();
});

// ─── GET /api/wholesale/inventory ────────────────────────────────────────────
// API Shield targets:
//   • mTLS: PRIMARY mTLS demonstration endpoint
//   • Schema Validation: validates optional country/category filter params
//   • Volumetric Abuse Detection: inventory scraping target
//
// Returns full inventory with stock levels — data only wholesale partners need.

wholesale.get("/inventory", async (c) => {
  const user = c.get("user");
  const country = c.req.query("country");
  const category = c.req.query("category");
  const minStock = Number(c.req.query("min_stock") ?? "10");

  let where = "stock_quantity >= ?";
  const bindings: unknown[] = [minStock];

  if (country) {
    where += " AND country_code = ?";
    bindings.push(country.toUpperCase());
  }
  if (category) {
    where += " AND category = ?";
    bindings.push(category.toLowerCase());
  }

  const rows = await c.env.DB.prepare(
    `SELECT id, name, slug, price_cents, country_code, country_name,
            category, texture, color_hex, stock_quantity
     FROM products
     WHERE ${where}
     ORDER BY country_code, name`
  ).bind(...bindings).all();

  const certInfo = getMtlsCertInfo(c);

  trackEvent(c, "wholesale_inventory_view", {
    userId: user.sub,
    country: country ?? undefined,
    extra: certInfo.subjectDn ?? undefined,
  });

  return successResponse(c, {
    inventory: rows.results,
    total_products: rows.results.length,
    // Expose cert metadata in response so you can see it during testing
    _cert_info: {
      subject: certInfo.subjectDn,
      issuer: certInfo.issuerDn,
      serial: certInfo.serialNumber,
    },
  });
});

// ─── POST /api/wholesale/bulk-order ──────────────────────────────────────────
// API Shield targets:
//   • mTLS: required — only verified partners can place bulk orders
//   • Schema Validation: validates company_name, tax_id, items array (min 1 item,
//     each with product_id and quantity ≥ 10)
//
// Wholesale pricing: 30% discount on list price

wholesale.post("/bulk-order", async (c) => {
  const user = c.get("user");

  let body: CreateWholesaleOrderPayload;
  try {
    body = await c.req.json<CreateWholesaleOrderPayload>();
  } catch {
    return errorResponse(c, 400, "INVALID_JSON", "Request body must be valid JSON");
  }

  const { company_name, tax_id, items, notes } = body;

  if (!company_name?.trim()) {
    return errorResponse(c, 422, "VALIDATION_ERROR", "company_name is required");
  }
  if (!tax_id?.trim()) {
    return errorResponse(c, 422, "VALIDATION_ERROR", "tax_id is required");
  }
  if (!Array.isArray(items) || items.length === 0) {
    return errorResponse(c, 422, "VALIDATION_ERROR", "items must be a non-empty array");
  }

  for (const item of items) {
    if (!item.product_id || !item.quantity) {
      return errorResponse(c, 422, "VALIDATION_ERROR",
        "Each item must have product_id and quantity");
    }
    if (!Number.isInteger(item.quantity) || item.quantity < 10) {
      return errorResponse(c, 422, "VALIDATION_ERROR",
        `Wholesale minimum order is 10 units per product (got ${item.quantity} for product ${item.product_id})`);
    }
  }

  // Validate all products exist and have stock
  const productIds = items.map((i) => i.product_id);
  const placeholders = productIds.map(() => "?").join(",");
  const products = await c.env.DB.prepare(
    `SELECT id, name, price_cents, stock_quantity FROM products WHERE id IN (${placeholders})`
  ).bind(...productIds).all<{ id: string; name: string; price_cents: number; stock_quantity: number }>();

  const productMap = new Map(products.results.map((p) => [p.id, p]));

  for (const item of items) {
    const product = productMap.get(item.product_id);
    if (!product) {
      return errorResponse(c, 404, "NOT_FOUND", `Product '${item.product_id}' not found`);
    }
    if (product.stock_quantity < item.quantity) {
      return errorResponse(c, 422, "INSUFFICIENT_STOCK",
        `Product '${product.name}' only has ${product.stock_quantity} units (requested ${item.quantity})`);
    }
  }

  // 30% wholesale discount
  const WHOLESALE_DISCOUNT = 0.7;
  const totalCents = items.reduce((sum, item) => {
    const p = productMap.get(item.product_id)!;
    return sum + Math.floor(p.price_cents * WHOLESALE_DISCOUNT) * item.quantity;
  }, 0);

  const orderId = generateId();
  const now = new Date().toISOString();

  const statements = [
    c.env.DB.prepare(
      `INSERT INTO wholesale_orders
         (id, user_id, status, total_cents, company_name, tax_id, notes, created_at, updated_at)
       VALUES (?, ?, 'confirmed', ?, ?, ?, ?, ?, ?)`
    ).bind(orderId, user.sub, totalCents, company_name.trim(), tax_id.trim(), notes?.trim() ?? null, now, now),

    ...items.flatMap((item) => {
      const p = productMap.get(item.product_id)!;
      const unitPrice = Math.floor(p.price_cents * WHOLESALE_DISCOUNT);
      return [
        c.env.DB.prepare(
          `INSERT INTO wholesale_order_items (id, order_id, product_id, quantity, unit_price_cents, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).bind(generateId(), orderId, item.product_id, item.quantity, unitPrice, now),
        c.env.DB.prepare(
          "UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?"
        ).bind(item.quantity, item.product_id),
      ];
    }),
  ];

  await c.env.DB.batch(statements);

  trackEvent(c, "wholesale_order_placed", {
    userId: user.sub, totalCents,
    quantity: items.reduce((s, i) => s + i.quantity, 0),
  });

  return successResponse(c, {
    id: orderId,
    status: "confirmed",
    company_name: company_name.trim(),
    total_cents: totalCents,
    discount_applied: "30%",
    item_count: items.length,
    created_at: now,
  }, undefined, 201);
});

export default wholesale;
