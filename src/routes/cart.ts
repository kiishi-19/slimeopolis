import { Hono } from "hono";
import type { AddCartItemPayload, Env, HonoVariables, UpdateCartItemPayload } from "../types";
import { requireAuth } from "../middleware/auth";
import { trackEvent } from "../middleware/analytics";
import { successResponse, errorResponse } from "../lib/response";
import { generateId } from "../lib/crypto";

const cart = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

// All cart routes require authentication
cart.use("/*", requireAuth);

// ─── GET /api/cart ────────────────────────────────────────────────────────────
// API Shield targets:
//   • Sequence Analytics: step 3 — cart view after product browse

cart.get("/", async (c) => {
  const user = c.get("user");

  const items = await c.env.DB.prepare(
    `SELECT ci.id, ci.quantity, ci.created_at, ci.updated_at,
            p.id as product_id, p.name, p.slug, p.price_cents,
            p.country_code, p.country_name, p.color_hex, p.image_key,
            p.stock_quantity
     FROM cart_items ci
     JOIN products p ON ci.product_id = p.id
     WHERE ci.user_id = ?
     ORDER BY ci.created_at ASC`
  ).bind(user.sub).all();

  const subtotal = items.results.reduce((sum, item) => {
    const i = item as { quantity: number; price_cents: number };
    return sum + i.quantity * i.price_cents;
  }, 0);

  return successResponse(c, {
    items: items.results,
    item_count: items.results.length,
    subtotal_cents: subtotal,
  });
});

// ─── POST /api/cart/items ─────────────────────────────────────────────────────
// API Shield targets:
//   • Schema Validation: validates product_id (UUID string) + quantity (integer ≥ 1)
//   • Sequence Analytics: step 4 — add to cart after viewing product detail

cart.post("/items", async (c) => {
  const user = c.get("user");
  let body: AddCartItemPayload;

  try {
    body = await c.req.json<AddCartItemPayload>();
  } catch {
    return errorResponse(c, 400, "INVALID_JSON", "Request body must be valid JSON");
  }

  const { product_id, quantity } = body;

  if (!product_id || !quantity) {
    return errorResponse(c, 422, "VALIDATION_ERROR", "product_id and quantity are required");
  }
  if (!Number.isInteger(quantity) || quantity < 1) {
    return errorResponse(c, 422, "VALIDATION_ERROR", "quantity must be a positive integer");
  }
  if (quantity > 99) {
    return errorResponse(c, 422, "VALIDATION_ERROR", "quantity cannot exceed 99");
  }

  const product = await c.env.DB.prepare(
    "SELECT id, name, price_cents, stock_quantity, country_code FROM products WHERE id = ? LIMIT 1"
  ).bind(product_id).first<{ id: string; name: string; price_cents: number; stock_quantity: number; country_code: string }>();

  if (!product) {
    return errorResponse(c, 404, "NOT_FOUND", `Product '${product_id}' not found`);
  }
  if (product.stock_quantity < quantity) {
    return errorResponse(c, 422, "INSUFFICIENT_STOCK",
      `Only ${product.stock_quantity} units available`);
  }

  const existing = await c.env.DB.prepare(
    "SELECT id, quantity FROM cart_items WHERE user_id = ? AND product_id = ? LIMIT 1"
  ).bind(user.sub, product.id).first<{ id: string; quantity: number }>();

  const now = new Date().toISOString();

  if (existing) {
    const newQty = existing.quantity + quantity;
    if (newQty > product.stock_quantity) {
      return errorResponse(c, 422, "INSUFFICIENT_STOCK",
        `Cannot add ${quantity} more — only ${product.stock_quantity - existing.quantity} additional units available`);
    }
    await c.env.DB.prepare(
      "UPDATE cart_items SET quantity = ?, updated_at = ? WHERE id = ?"
    ).bind(newQty, now, existing.id).run();

    trackEvent(c, "add_to_cart", {
      userId: user.sub, productId: product.id,
      quantity, priceCents: product.price_cents, country: product.country_code,
    });

    return successResponse(c, { id: existing.id, product_id: product.id, quantity: newQty });
  }

  const id = generateId();
  await c.env.DB.prepare(
    `INSERT INTO cart_items (id, user_id, product_id, quantity, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(id, user.sub, product.id, quantity, now, now).run();

  trackEvent(c, "add_to_cart", {
    userId: user.sub, productId: product.id,
    quantity, priceCents: product.price_cents, country: product.country_code,
  });

  return successResponse(c, { id, product_id: product.id, quantity }, undefined, 201);
});

// ─── PUT /api/cart/items/:itemId ──────────────────────────────────────────────
// API Shield targets:
//   • Schema Validation: validates quantity field (integer 1–99)
//   • Sequence Analytics: cart modification step

cart.put("/items/:itemId", async (c) => {
  const user = c.get("user");
  const itemId = c.req.param("itemId");

  let body: UpdateCartItemPayload;
  try {
    body = await c.req.json<UpdateCartItemPayload>();
  } catch {
    return errorResponse(c, 400, "INVALID_JSON", "Request body must be valid JSON");
  }

  const { quantity } = body;

  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
    return errorResponse(c, 422, "VALIDATION_ERROR", "quantity must be an integer between 1 and 99");
  }

  const item = await c.env.DB.prepare(
    `SELECT ci.id, ci.product_id, p.stock_quantity
     FROM cart_items ci JOIN products p ON ci.product_id = p.id
     WHERE ci.id = ? AND ci.user_id = ? LIMIT 1`
  ).bind(itemId, user.sub).first<{ id: string; product_id: string; stock_quantity: number }>();

  if (!item) {
    return errorResponse(c, 404, "NOT_FOUND", "Cart item not found");
  }
  if (quantity > item.stock_quantity) {
    return errorResponse(c, 422, "INSUFFICIENT_STOCK",
      `Only ${item.stock_quantity} units available`);
  }

  await c.env.DB.prepare(
    "UPDATE cart_items SET quantity = ?, updated_at = ? WHERE id = ?"
  ).bind(quantity, new Date().toISOString(), item.id).run();

  return successResponse(c, { id: item.id, product_id: item.product_id, quantity });
});

// ─── DELETE /api/cart/items/:itemId ──────────────────────────────────────────

cart.delete("/items/:itemId", async (c) => {
  const user = c.get("user");
  const itemId = c.req.param("itemId");

  const item = await c.env.DB.prepare(
    "SELECT id, product_id FROM cart_items WHERE id = ? AND user_id = ? LIMIT 1"
  ).bind(itemId, user.sub).first<{ id: string; product_id: string }>();

  if (!item) {
    return errorResponse(c, 404, "NOT_FOUND", "Cart item not found");
  }

  await c.env.DB.prepare("DELETE FROM cart_items WHERE id = ?").bind(item.id).run();

  trackEvent(c, "remove_from_cart", { userId: user.sub, productId: item.product_id });

  return successResponse(c, { message: "Item removed from cart" });
});

// ─── DELETE /api/cart ─────────────────────────────────────────────────────────
// Clear entire cart

cart.delete("/", async (c) => {
  const user = c.get("user");
  await c.env.DB.prepare("DELETE FROM cart_items WHERE user_id = ?").bind(user.sub).run();
  return successResponse(c, { message: "Cart cleared" });
});

export default cart;
