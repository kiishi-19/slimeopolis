import type { Context } from "hono";
import type { AnalyticsEvent, Env, HonoVariables } from "../types";

type C = Context<{ Bindings: Env; Variables: HonoVariables }>;

/**
 * Writes a custom event to Workers Analytics Engine.
 *
 * Analytics Engine uses a columnar structure:
 *   - blobs[0..7]  → string dimensions (up to 8, max 1024 bytes each)
 *   - doubles[0..7] → numeric metrics (up to 8)
 *   - indexes[0]   → high-cardinality partition key (e.g. user_id or session)
 *
 * These are queryable via the Analytics Engine SQL API or Grafana.
 */
export function trackEvent(
  c: C,
  event: AnalyticsEvent,
  options: {
    // String dimensions
    userId?: string;
    productId?: string;
    country?: string;
    searchQuery?: string;
    endpoint?: string;
    method?: string;
    statusCode?: string;
    extra?: string;
    // Numeric metrics
    quantity?: number;
    priceCents?: number;
    totalCents?: number;
    responseTimeMs?: number;
  } = {}
) {
  try {
    const {
      userId,
      productId,
      country,
      searchQuery,
      endpoint,
      method,
      statusCode,
      extra,
      quantity = 0,
      priceCents = 0,
      totalCents = 0,
      responseTimeMs = 0,
    } = options;

    c.env.ANALYTICS.writeDataPoint({
      // blobs: string dimensions (max 8)
      blobs: [
        event,                       // [0] event type
        userId ?? "",                // [1] user id
        productId ?? "",             // [2] product id
        country ?? "",               // [3] country code
        searchQuery ?? "",           // [4] search query
        endpoint ?? c.req.path,      // [5] API endpoint path
        method ?? c.req.method,      // [6] HTTP method
        statusCode ?? extra ?? "",   // [7] status code or extra context
      ],
      // doubles: numeric metrics (max 8)
      doubles: [
        quantity,                    // [0] item quantity
        priceCents,                  // [1] unit price in cents
        totalCents,                  // [2] total order value in cents
        responseTimeMs,              // [3] response time ms
      ],
      // indexes: high-cardinality partition key
      indexes: [userId ?? c.req.header("cf-connecting-ip") ?? "anonymous"],
    });
  } catch {
    // Analytics writes must never throw — they are non-blocking and
    // should not affect the API response.
  }
}

/**
 * Middleware that tracks every API request to Analytics Engine.
 * Attach on the Hono app level for full API coverage.
 */
export function apiRequestTracker() {
  return async (c: C, next: () => Promise<void>) => {
    const start = Date.now();
    await next();
    const ms = Date.now() - start;

    const user = c.get("user");
    trackEvent(c, "api_request", {
      userId: user?.sub,
      endpoint: c.req.path,
      method: c.req.method,
      statusCode: String(c.res.status),
      responseTimeMs: ms,
    });
  };
}
