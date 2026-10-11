/**
 * Reusable rate limit guard for API endpoints.
 *
 * Call at the top of a request handler. Returns null if allowed,
 * or a 429 Response if the caller has exceeded the limit.
 *
 * Async because the durable backend (Cloudflare's native ratelimit binding) is
 * async. When the preset names a `binding` and that binding is present on
 * the Worker's env, it enforces the limit cross-isolate; otherwise the call falls
 * back to the in-memory sliding window (see rate-limiter.ts).
 *
 * Usage:
 *   const blocked = await withRateLimit(event, RATE_LIMITS.AI_CHAT, 'user', uid);
 *   if (blocked) return blocked;
 */

import type { RequestEvent } from "@sveltejs/kit";
import {
  checkRateLimit,
  rateLimitResponse,
  type RateLimitConfig,
  type CfRateLimiter,
} from "./rate-limiter";
import { workerEnv } from "../cloudflare/worker-env";

/**
 * Apply rate limiting to a request.
 *
 * @param event - SvelteKit request event
 * @param config - Rate limit preset (from RATE_LIMITS)
 * @param keyType - 'ip' uses client IP; 'user' and 'key' use a supplied identifier
 * @param keyValue - Required when keyType is 'user' or 'key'
 * @returns null if allowed, 429 Response if blocked
 */
export function withRateLimit(
  event: RequestEvent,
  config: RateLimitConfig,
  keyType: "ip",
): Promise<Response | null>;
export function withRateLimit(
  event: RequestEvent,
  config: RateLimitConfig,
  keyType: "user",
  uid: string,
): Promise<Response | null>;
export function withRateLimit(
  event: RequestEvent,
  config: RateLimitConfig,
  keyType: "key",
  key: string,
): Promise<Response | null>;
export async function withRateLimit(
  event: RequestEvent,
  config: RateLimitConfig,
  keyType: "ip" | "user" | "key",
  keyValue?: string,
): Promise<Response | null> {
  const prefix = event.url.pathname;
  const identifier =
    keyType === "ip"
      ? `${prefix}:ip:${event.getClientAddress()}`
      : `${prefix}:${keyType}:${keyValue ?? "missing"}`;

  // Prefer the native Cloudflare ratelimit binding (cross-isolate) when this
  // preset declares one and it's wired on the Worker's env at runtime.
  const env = workerEnv() as Record<string, unknown> | undefined;
  const limiter =
    config.binding && env
      ? (env[config.binding] as CfRateLimiter | undefined)
      : undefined;
  if (limiter?.limit) {
    const { success } = await limiter.limit({ key: identifier });
    // The binding doesn't expose resetAt; approximate Retry-After from the window.
    return success ? null : rateLimitResponse(Date.now() + config.windowMs);
  }

  // Fallback: in-memory window (dev, or presets without a binding).
  const result = checkRateLimit(identifier, config);
  if (!result.allowed) {
    return rateLimitResponse(result.resetAt);
  }
  return null;
}
