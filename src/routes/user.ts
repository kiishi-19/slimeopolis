import { Hono } from "hono";
import type { Env, HonoVariables, UpdateProfilePayload } from "../types";
import { requireAuth } from "../middleware/auth";
import { successResponse, errorResponse } from "../lib/response";

const user = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

user.use("/*", requireAuth);

// ─── GET /api/user/profile ────────────────────────────────────────────────────
// API Shield targets:
//   • mTLS: can optionally be configured to require client certs for
//     high-value profile access (e.g., PII endpoints)
//   • Sequence Analytics: accessed before checkout as part of address pre-fill

user.get("/profile", async (c) => {
  const u = c.get("user");

  const dbUser = await c.env.DB.prepare(
    `SELECT id, email, name, role, is_wholesale, created_at, updated_at
     FROM users WHERE id = ? LIMIT 1`
  ).bind(u.sub).first();

  if (!dbUser) return errorResponse(c, 404, "NOT_FOUND", "User not found");

  return successResponse(c, dbUser);
});

// ─── PUT /api/user/profile ────────────────────────────────────────────────────
// API Shield targets:
//   • Schema Validation: validates optional name (string) and email (email format)

user.put("/profile", async (c) => {
  const u = c.get("user");

  let body: UpdateProfilePayload;
  try {
    body = await c.req.json<UpdateProfilePayload>();
  } catch {
    return errorResponse(c, 400, "INVALID_JSON", "Request body must be valid JSON");
  }

  const { name, email } = body;

  if (!name && !email) {
    return errorResponse(c, 422, "VALIDATION_ERROR", "Provide at least one field to update: name or email");
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return errorResponse(c, 422, "VALIDATION_ERROR", "Invalid email format");
  }

  if (name && name.trim().length < 2) {
    return errorResponse(c, 422, "VALIDATION_ERROR", "name must be at least 2 characters");
  }

  // Check email uniqueness if changing
  if (email) {
    const existing = await c.env.DB.prepare(
      "SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1"
    ).bind(email.toLowerCase(), u.sub).first();
    if (existing) {
      return errorResponse(c, 409, "EMAIL_TAKEN", "This email is already in use");
    }
  }

  const now = new Date().toISOString();

  if (name && email) {
    await c.env.DB.prepare(
      "UPDATE users SET name = ?, email = ?, updated_at = ? WHERE id = ?"
    ).bind(name.trim(), email.toLowerCase(), now, u.sub).run();
  } else if (name) {
    await c.env.DB.prepare(
      "UPDATE users SET name = ?, updated_at = ? WHERE id = ?"
    ).bind(name.trim(), now, u.sub).run();
  } else if (email) {
    await c.env.DB.prepare(
      "UPDATE users SET email = ?, updated_at = ? WHERE id = ?"
    ).bind(email.toLowerCase(), now, u.sub).run();
  }

  const updated = await c.env.DB.prepare(
    "SELECT id, email, name, role, is_wholesale, updated_at FROM users WHERE id = ? LIMIT 1"
  ).bind(u.sub).first();

  return successResponse(c, updated);
});

// ─── GET /api/user/preferences ────────────────────────────────────────────────
// Returns saved country/category preferences (stored in KV for speed).
// API Shield: part of the sequence before recommendations.

user.get("/preferences", async (c) => {
  const u = c.get("user");
  const raw = await c.env.SESSIONS.get(`prefs:${u.sub}`);
  const prefs = raw ? JSON.parse(raw) : { favorite_countries: [], favorite_categories: [] };
  return successResponse(c, prefs);
});

// ─── PUT /api/user/preferences ────────────────────────────────────────────────

user.put("/preferences", async (c) => {
  const u = c.get("user");

  let body: { favorite_countries?: string[]; favorite_categories?: string[] };
  try {
    body = await c.req.json();
  } catch {
    return errorResponse(c, 400, "INVALID_JSON", "Request body must be valid JSON");
  }

  const prefs = {
    favorite_countries: (body.favorite_countries ?? []).map((c: string) => c.toUpperCase()),
    favorite_categories: body.favorite_categories ?? [],
  };

  await c.env.SESSIONS.put(`prefs:${u.sub}`, JSON.stringify(prefs), {
    expirationTtl: 60 * 60 * 24 * 90, // 90 days
  });

  return successResponse(c, prefs);
});

export default user;
