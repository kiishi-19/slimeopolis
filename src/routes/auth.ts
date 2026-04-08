import { Hono } from "hono";
import type { Env, HonoVariables, LoginPayload, RegisterPayload } from "../types";
import { hashPassword, verifyPassword, generateId } from "../lib/crypto";
import { signJWT } from "../middleware/auth";
import { requireAuth } from "../middleware/auth";
import { trackEvent } from "../middleware/analytics";
import { successResponse, errorResponse } from "../lib/response";

const auth = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

// ─── POST /api/auth/register ──────────────────────────────────────────────────
// API Shield targets:
//   • Schema Validation: validates email format, password length, name presence
//   • Rate Limiting: prevent account creation abuse (5 reqs/min per IP)

auth.post("/register", async (c) => {
  let body: RegisterPayload;
  try {
    body = await c.req.json<RegisterPayload>();
  } catch {
    return errorResponse(c, 400, "INVALID_JSON", "Request body must be valid JSON");
  }

  const { email, password, name } = body;

  if (!email || !password || !name) {
    return errorResponse(c, 422, "VALIDATION_ERROR", "email, password, and name are required");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return errorResponse(c, 422, "VALIDATION_ERROR", "Invalid email format");
  }
  if (password.length < 8) {
    return errorResponse(c, 422, "VALIDATION_ERROR", "Password must be at least 8 characters");
  }
  if (name.trim().length < 2) {
    return errorResponse(c, 422, "VALIDATION_ERROR", "Name must be at least 2 characters");
  }

  const existing = await c.env.DB.prepare(
    "SELECT id FROM users WHERE email = ? LIMIT 1"
  ).bind(email.toLowerCase()).first();

  if (existing) {
    return errorResponse(c, 409, "EMAIL_TAKEN", "An account with this email already exists");
  }

  const id = generateId();
  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    `INSERT INTO users (id, email, name, password_hash, role, is_wholesale, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'customer', 0, ?, ?)`
  ).bind(id, email.toLowerCase(), name.trim(), passwordHash, now, now).run();

  const token = await signJWT(
    { sub: id, email: email.toLowerCase(), role: "customer", is_wholesale: false },
    c.env.JWT_SECRET,
    Number(c.env.JWT_EXPIRY_SECONDS)
  );

  trackEvent(c, "register", { userId: id });

  return successResponse(c, {
    token,
    user: { id, email: email.toLowerCase(), name: name.trim(), role: "customer" },
  }, undefined, 201);
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
// API Shield targets:
//   • Schema Validation: validates email + password fields
//   • Rate Limiting: primary target — 5 reqs/min per IP to prevent brute force
//   • Volumetric Abuse Detection: per-session adaptive threshold monitoring

auth.post("/login", async (c) => {
  let body: LoginPayload;
  try {
    body = await c.req.json<LoginPayload>();
  } catch {
    return errorResponse(c, 400, "INVALID_JSON", "Request body must be valid JSON");
  }

  const { email, password } = body;

  if (!email || !password) {
    return errorResponse(c, 422, "VALIDATION_ERROR", "email and password are required");
  }

  const user = await c.env.DB.prepare(
    "SELECT * FROM users WHERE email = ? LIMIT 1"
  ).bind(email.toLowerCase()).first<{
    id: string; email: string; name: string; password_hash: string;
    role: string; is_wholesale: number;
  }>();

  // Constant-time failure — don't reveal whether email exists
  if (!user) {
    await hashPassword("dummy-constant-time"); // prevent timing attacks
    return errorResponse(c, 401, "INVALID_CREDENTIALS", "Invalid email or password");
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return errorResponse(c, 401, "INVALID_CREDENTIALS", "Invalid email or password");
  }

  const isWholesale = user.is_wholesale === 1;
  const token = await signJWT(
    { sub: user.id, email: user.email, role: user.role as "customer" | "admin", is_wholesale: isWholesale },
    c.env.JWT_SECRET,
    Number(c.env.JWT_EXPIRY_SECONDS)
  );

  trackEvent(c, "login", { userId: user.id });

  return successResponse(c, {
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role, is_wholesale: isWholesale },
  });
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────────
// Revokes the current token by storing a blocklist entry in KV.
// TTL is set to the token's remaining validity window.

auth.post("/logout", requireAuth, async (c) => {
  const authHeader = c.req.header("Authorization")!;
  const token = authHeader.slice(7);
  // Use last 16 chars as an opaque key (avoids storing full token in KV)
  const tokenKey = `revoked:${token.slice(-16)}`;

  await c.env.SESSIONS.put(tokenKey, "1", {
    expirationTtl: Number(c.env.JWT_EXPIRY_SECONDS),
  });

  return successResponse(c, { message: "Logged out successfully" });
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
// Returns the current user's profile from the JWT payload.

auth.get("/me", requireAuth, async (c) => {
  const user = c.get("user");
  const dbUser = await c.env.DB.prepare(
    "SELECT id, email, name, role, is_wholesale, created_at FROM users WHERE id = ? LIMIT 1"
  ).bind(user.sub).first();

  if (!dbUser) return errorResponse(c, 404, "NOT_FOUND", "User not found");

  return successResponse(c, dbUser);
});

export default auth;
