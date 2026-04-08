import type { Context, Next } from "hono";
import type { Env, HonoVariables } from "../types";
import { errorResponse } from "../lib/response";

type C = Context<{ Bindings: Env; Variables: HonoVariables }>;

/**
 * mTLS Middleware — protects the /api/wholesale/* routes.
 *
 * When Cloudflare mTLS is configured for a hostname, it adds the following
 * headers to every request that reaches your Worker:
 *
 *   Cf-Client-Cert-Verified   → "SUCCESS" | "FAILED" | "NONE"
 *   Cf-Client-Cert-Sha256-Fingerprint → SHA-256 fingerprint of the cert
 *   Cf-Client-Cert-Serial     → Serial number of the cert
 *   Cf-Client-Cert-Issuer-Dn  → Issuer DN
 *   Cf-Client-Cert-Subject-Dn → Subject DN
 *
 * API Shield Setup (in Cloudflare dashboard):
 *   Security > API Shield > mTLS > Add mTLS Rule
 *   Host: your-domain.com
 *   Path: /api/wholesale/*
 *   Action: Block (non-compliant clients are blocked at the edge)
 *
 * IMPORTANT: This middleware is a defence-in-depth check in the Worker.
 * The primary mTLS enforcement happens at the Cloudflare edge via the mTLS rule.
 * This middleware verifies the headers Cloudflare sets after cert verification.
 *
 * In local dev (wrangler dev), these headers won't be present — the middleware
 * checks ENVIRONMENT and skips strict enforcement in development.
 */
export async function requireMtls(c: C, next: Next) {
  // Skip in local development
  if (c.env.ENVIRONMENT === "development") {
    console.warn("[mTLS] Skipping mTLS check in development environment");
    await next();
    return;
  }

  const verified = c.req.header("Cf-Client-Cert-Verified");
  const fingerprint = c.req.header("Cf-Client-Cert-Sha256-Fingerprint");
  const subjectDn = c.req.header("Cf-Client-Cert-Subject-Dn");

  if (verified !== "SUCCESS" || !fingerprint) {
    return errorResponse(
      c,
      403,
      "MTLS_REQUIRED",
      "This endpoint requires a valid client certificate. " +
        "Contact wholesale@slimeopolis.com to obtain credentials."
    );
  }

  // Attach cert info to response headers for observability
  c.header("X-Client-Cert-Verified", "true");
  c.header("X-Client-Subject", subjectDn ?? "unknown");

  await next();
}

/**
 * Returns the parsed mTLS certificate metadata from request headers.
 * Safe to call after requireMtls has passed.
 */
export function getMtlsCertInfo(c: C) {
  return {
    verified: c.req.header("Cf-Client-Cert-Verified") === "SUCCESS",
    fingerprint: c.req.header("Cf-Client-Cert-Sha256-Fingerprint") ?? null,
    serialNumber: c.req.header("Cf-Client-Cert-Serial") ?? null,
    issuerDn: c.req.header("Cf-Client-Cert-Issuer-Dn") ?? null,
    subjectDn: c.req.header("Cf-Client-Cert-Subject-Dn") ?? null,
  };
}
