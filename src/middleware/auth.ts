import type { Context, Next } from "hono";
import type { Env, HonoVariables, JWTPayload } from "../types";
import { errorResponse } from "../lib/response";

type C = Context<{ Bindings: Env; Variables: HonoVariables }>;

// ─── JWT Helpers ──────────────────────────────────────────────────────────────
// Using the Web Crypto API (available in Workers) — no external JWT library needed.

function base64urlEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64urlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

async function getHmacKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function signJWT(payload: Omit<JWTPayload, "iat" | "exp">, secret: string, expirySeconds: number): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JWTPayload = { ...payload, iat: now, exp: now + expirySeconds };

  const enc = new TextEncoder();
  const headerEncoded = enc.encode(JSON.stringify(header));
  const payloadEncoded = enc.encode(JSON.stringify(fullPayload));
  const headerB64 = base64urlEncode(headerEncoded);
  const payloadB64 = base64urlEncode(payloadEncoded);
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await getHmacKey(secret);
  const signingInputEncoded = enc.encode(signingInput);
  const sig = await crypto.subtle.sign("HMAC", key, signingInputEncoded.buffer as ArrayBuffer);

  return `${signingInput}.${base64urlEncode(sig)}`;
}

export async function verifyJWT(token: string, secret: string): Promise<JWTPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, sigB64] = parts;
  const signingInput = `${headerB64}.${payloadB64}`;

  const enc = new TextEncoder();
  const key = await getHmacKey(secret);
  const expectedSig = base64urlDecode(sigB64);

  const valid = await crypto.subtle.verify("HMAC", key, expectedSig.buffer as ArrayBuffer, enc.encode(signingInput).buffer as ArrayBuffer);
  if (!valid) return null;

  const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(payloadB64))) as JWTPayload;
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;

  return payload;
}

// ─── Auth Middleware ──────────────────────────────────────────────────────────

/**
 * Requires a valid Bearer JWT in the Authorization header.
 * Sets c.var.user on success.
 *
 * API Shield note: this Authorization header is the session identifier
 * configured in API Shield > Session Identifiers. Volumetric Abuse Detection
 * uses this to track per-session request rates.
 */
export async function requireAuth(c: C, next: Next) {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return errorResponse(c, 401, "UNAUTHORIZED", "Missing or invalid Authorization header");
  }

  const token = authHeader.slice(7);
  const payload = await verifyJWT(token, c.env.JWT_SECRET);
  if (!payload) {
    return errorResponse(c, 401, "UNAUTHORIZED", "Invalid or expired token");
  }

  // Also check KV blocklist (for logout/revocation)
  const revoked = await c.env.SESSIONS.get(`revoked:${token.slice(-16)}`);
  if (revoked) {
    return errorResponse(c, 401, "UNAUTHORIZED", "Token has been revoked");
  }

  c.set("user", payload);
  await next();
}

/**
 * Like requireAuth but doesn't reject — sets user if token present and valid.
 * Used on endpoints that work for both guests and logged-in users.
 */
export async function optionalAuth(c: C, next: Next) {
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const payload = await verifyJWT(token, c.env.JWT_SECRET);
    if (payload) {
      const revoked = await c.env.SESSIONS.get(`revoked:${token.slice(-16)}`);
      if (!revoked) c.set("user", payload);
    }
  }
  await next();
}

/**
 * Requires the authenticated user to have the "admin" role.
 * Must be used AFTER requireAuth.
 */
export async function requireAdmin(c: C, next: Next) {
  const user = c.get("user");
  if (!user || user.role !== "admin") {
    return errorResponse(c, 403, "FORBIDDEN", "Admin access required");
  }
  await next();
}
