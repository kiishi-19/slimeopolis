import { Hono } from "hono";
import type { CreateOrderPayload, Env, HonoVariables } from "../types";
import { requireAuth } from "../middleware/auth";
import { trackEvent } from "../middleware/analytics";
import { successResponse, errorResponse } from "../lib/response";
import { generateId } from "../lib/crypto";

const orders = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

orders.use("/*", requireAuth);

// ─── GET /api/orders ──────────────────────────────────────────────────────────
// Returns paginated list of the current user's orders.

orders.get("/", async (c) => {
  const user = c.get("user");
  const page = Math.max(1, Number(c.req.query("page") ?? "1"));
  const perPage = Math.min(20, Math.max(1, Number(c.req.query("per_page") ?? "10")));
  const offset = (page - 1) * perPage;

  const rows = await c.env.DB.prepare(
    `SELECT id, status, total_cents, shipping_name, shipping_city,
            shipping_country, created_at, updated_at
     FROM orders WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`
  ).bind(user.sub, perPage, offset).all();

  const countRow = await c.env.DB.prepare(
    "SELECT COUNT(*) as total FROM orders WHERE user_id = ?"
  ).bind(user.sub).first<{ total: number }>();

  return successResponse(c, rows.results, {
    page, per_page: perPage,
    total: countRow?.total ?? 0,
    total_pages: Math.ceil((countRow?.total ?? 0) / perPage),
  });
});

// ─── GET /api/orders/:id ──────────────────────────────────────────────────────

orders.get("/:id", async (c) => {
  const user = c.get("user");
  const orderId = c.req.param("id");

  const order = await c.env.DB.prepare(
    "SELECT * FROM orders WHERE id = ? AND user_id = ? LIMIT 1"
  ).bind(orderId, user.sub).first();

  if (!order) {
    return errorResponse(c, 404, "NOT_FOUND", "Order not found");
  }

  const items = await c.env.DB.prepare(
    `SELECT oi.id, oi.quantity, oi.unit_price_cents,
            p.id as product_id, p.name, p.slug, p.country_code, p.country_name,
            p.color_hex, p.image_key
     FROM order_items oi JOIN products p ON oi.product_id = p.id
     WHERE oi.order_id = ?`
  ).bind(orderId).all();

  return successResponse(c, { ...order, items: items.results });
});

// ─── POST /api/orders ─────────────────────────────────────────────────────────
// API Shield targets:
//   • Schema Validation: validates all shipping fields, required types
//   • Sequence Analytics: FINAL step — only reached after browse → product → cart
//     Bots that skip the sequence and POST here directly are flagged
//   • Rate Limiting: 10 orders/min per session — prevents order flooding

orders.post("/", async (c) => {
  const user = c.get("user");

  let body: CreateOrderPayload;
  try {
    body = await c.req.json<CreateOrderPayload>();
  } catch {
    return errorResponse(c, 400, "INVALID_JSON", "Request body must be valid JSON");
  }

  const {
    shipping_name,
    shipping_address,
    shipping_city,
    shipping_country,
    shipping_postal_code,
    notes,
  } = body;

  if (!shipping_name || !shipping_address || !shipping_city || !shipping_country || !shipping_postal_code) {
    return errorResponse(c, 422, "VALIDATION_ERROR",
      "shipping_name, shipping_address, shipping_city, shipping_country, and shipping_postal_code are required"
    );
  }
  if (shipping_country.length !== 2) {
    return errorResponse(c, 422, "VALIDATION_ERROR",
      "shipping_country must be a 2-letter ISO 3166-1 alpha-2 country code"
    );
  }

  // Fetch cart items with product details
  const cartItems = await c.env.DB.prepare(
    `SELECT ci.quantity, p.id as product_id, p.name, p.price_cents, p.stock_quantity
     FROM cart_items ci JOIN products p ON ci.product_id = p.id
     WHERE ci.user_id = ?`
  ).bind(user.sub).all<{
    quantity: number; product_id: string; name: string;
    price_cents: number; stock_quantity: number;
  }>();

  if (!cartItems.results.length) {
    return errorResponse(c, 422, "EMPTY_CART", "Your cart is empty");
  }

  // Validate stock for all items
  for (const item of cartItems.results) {
    if (item.quantity > item.stock_quantity) {
      return errorResponse(c, 422, "INSUFFICIENT_STOCK",
        `Product '${item.name}' only has ${item.stock_quantity} units available`);
    }
  }

  const totalCents = cartItems.results.reduce(
    (sum, item) => sum + item.quantity * item.price_cents, 0
  );

  const orderId = generateId();
  const now = new Date().toISOString();

  // Use D1 batch for atomicity
  const statements = [
    // Create order
    c.env.DB.prepare(
      `INSERT INTO orders (id, user_id, status, total_cents, shipping_name, shipping_address,
                           shipping_city, shipping_country, shipping_postal_code, notes, created_at, updated_at)
       VALUES (?, ?, 'confirmed', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      orderId, user.sub, totalCents,
      shipping_name.trim(), shipping_address.trim(), shipping_city.trim(),
      shipping_country.toUpperCase(), shipping_postal_code.trim(),
      notes?.trim() ?? null, now, now
    ),

    // Create order items + decrement stock
    ...cartItems.results.flatMap((item) => [
      c.env.DB.prepare(
        `INSERT INTO order_items (id, order_id, product_id, quantity, unit_price_cents, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(generateId(), orderId, item.product_id, item.quantity, item.price_cents, now),

      c.env.DB.prepare(
        "UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?"
      ).bind(item.quantity, item.product_id),
    ]),

    // Clear the cart
    c.env.DB.prepare("DELETE FROM cart_items WHERE user_id = ?").bind(user.sub),
  ];

  await c.env.DB.batch(statements);

  trackEvent(c, "order_placed", {
    userId: user.sub,
    totalCents,
    quantity: cartItems.results.reduce((s, i) => s + i.quantity, 0),
  });

  return successResponse(c, {
    id: orderId,
    status: "confirmed",
    total_cents: totalCents,
    item_count: cartItems.results.length,
    created_at: now,
  }, undefined, 201);
});

export default orders;
