import type { Context } from "hono";
import type { ApiError, ApiSuccess, Env, HonoVariables } from "../types";

type C = Context<{ Bindings: Env; Variables: HonoVariables }>;

export function successResponse<T>(c: C, data: T, meta?: Record<string, unknown>, status = 200) {
  const body: ApiSuccess<T> = { success: true, data, ...(meta ? { meta } : {}) };
  return c.json(body, status as 200 | 201);
}

export function createdResponse<T>(c: C, data: T) {
  return successResponse(c, data, undefined, 201);
}

export function errorResponse(
  c: C,
  status: number,
  code: string,
  message: string,
  details?: unknown
) {
  const body: ApiError = {
    success: false,
    error: { code, message, ...(details !== undefined ? { details } : {}) },
  };
  return c.json(body, status as 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500);
}
