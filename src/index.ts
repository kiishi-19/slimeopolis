import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import { secureHeaders } from "hono/secure-headers";

import type { Env, HonoVariables } from "./types";
import { errorResponse } from "./lib/response";
import { apiRequestTracker } from "./middleware/analytics";

import authRoutes from "./routes/auth";
import productRoutes from "./routes/products";
import cartRoutes from "./routes/cart";
import orderRoutes from "./routes/orders";
import recommendationRoutes from "./routes/recommendations";
import userRoutes from "./routes/user";
import wholesaleRoutes from "./routes/wholesale";

const app = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

// ─── Global Middleware ────────────────────────────────────────────────────────

app.use("*", logger());

app.use("*", async (c, next) => {
  const origin = c.env.CORS_ORIGIN ?? "*";
  return cors({
    origin,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    exposeHeaders: ["X-Client-Cert-Verified"],
    maxAge: 86400,
    credentials: true,
  })(c, next);
});

app.use("*", secureHeaders());
app.use("*", prettyJSON({ space: 2 }));

// Analytics Engine: track every API request (non-blocking, runs after response)
app.use("/api/*", apiRequestTracker() as never);

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get("/health", (c) =>
  c.json({
    status: "ok",
    service: "slimeopolis-api",
    timestamp: new Date().toISOString(),
    environment: c.env.ENVIRONMENT,
  })
);

// ─── API Routes ───────────────────────────────────────────────────────────────

app.route("/api/auth", authRoutes);
app.route("/api/products", productRoutes);
app.route("/api/cart", cartRoutes);
app.route("/api/orders", orderRoutes);
app.route("/api/recommendations", recommendationRoutes);
app.route("/api/user", userRoutes);
app.route("/api/wholesale", wholesaleRoutes);

// ─── API 404 ──────────────────────────────────────────────────────────────────

app.notFound((c) => {
  // Only apply JSON 404 to /api/* paths
  if (c.req.path.startsWith("/api/")) {
    return errorResponse(c, 404, "NOT_FOUND", `API route '${c.req.path}' not found`);
  }
  // For non-API paths, fall through to static asset handler
  return c.env.ASSETS.fetch(c.req.raw);
});

// ─── Global Error Handler ─────────────────────────────────────────────────────

app.onError((err, c) => {
  console.error(`[ERROR] ${c.req.method} ${c.req.path}:`, err);
  return errorResponse(c, 500, "INTERNAL_ERROR", "An unexpected error occurred");
});

export default app;
