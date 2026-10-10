/**
 * Rate limiter for API endpoints.
 *
 * Two backends:
 * - **Native Cloudflare ratelimit binding** (cross-isolate, memcached-backed,
 *   GA 2025-09). Used for the short-window presets that carry a `binding` field
 *   (all 60s). `withRateLimit` calls
 *   `env[binding].limit({ key })`. This is the durable enforcement that fixes
 *   the per-isolate-reset bypass (security-hardening F6).
 * - **In-memory sliding window** (this file). Used as the fallback when the
 *   native binding is absent (local `vite dev`, or any preset without a
 *   `binding`), and as the only backend for the 15-minute auth presets
 *   (ACCOUNT_SENSITIVE/AUTH_ATTEMPTS/FEEDBACK_INGEST) — the native binding only
 *   supports 10s/60s periods. Resets on isolate restart.
 *
 * Follow-up (tracked in 2026-05-23-security-hardening-design.md F6): migrate the
 * 15-minute auth presets to a Durable Object for strong cross-isolate
 * consistency. The native binding can't express their window.
 */

/** Minimal shape of the Cloudflare Workers native ratelimit binding. */
export interface CfRateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory store (cleared on server restart)
const rateLimitStore = new Map<string, RateLimitEntry>();
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastCleanupAt = 0;

/**
 * Cloudflare only permits timers inside a request context. Clean expired
 * fallback entries lazily instead of starting a module-level interval that
 * prevents the Worker route from loading at all.
 */
function cleanupExpiredEntries(now: number): void {
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return;

  lastCleanupAt = now;
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt < now) rateLimitStore.delete(key);
  }
}

export interface RateLimitConfig {
  /** Maximum requests allowed in the window */
  maxRequests: number;
  /** Window duration in milliseconds */
  windowMs: number;
  /**
   * Name of the native Cloudflare ratelimit binding on the Worker's env that
   * enforces this preset cross-isolate. When present at runtime it takes
   * precedence over the in-memory window; absent (e.g. `vite dev`), the
   * in-memory window is used. Only set for 10s/60s-window presets — the native
   * binding cannot express longer windows.
   */
  binding?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Check if a request should be rate limited
 *
 * @param identifier - Unique identifier (IP address, user ID, etc.)
 * @param config - Rate limit configuration
 * @returns Result with allowed status and remaining requests
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now();
  cleanupExpiredEntries(now);
  const key = identifier;

  const entry = rateLimitStore.get(key);

  // No entry or expired window - create new
  if (!entry || entry.resetAt < now) {
    const newEntry: RateLimitEntry = {
      count: 1,
      resetAt: now + config.windowMs,
    };
    rateLimitStore.set(key, newEntry);
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt: newEntry.resetAt,
    };
  }

  // Within window - check limit
  if (entry.count >= config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
    };
  }

  // Increment and allow
  entry.count++;
  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    resetAt: entry.resetAt,
  };
}

/**
 * Create a rate limit response with appropriate headers
 */
export function rateLimitResponse(resetAt: number): Response {
  const retryAfter = Math.ceil((resetAt - Date.now()) / 1000);
  return new Response(
    JSON.stringify({
      error: "Too many requests. Please try again later.",
      code: "rate_limited",
      retryAfter,
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfter),
      },
    }
  );
}

// Preset configurations for common use cases
export const RATE_LIMITS = {
  /** Sensitive account operations: 5 requests per 15 minutes */
  ACCOUNT_SENSITIVE: {
    maxRequests: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
  },
  /** Authentication attempts: 10 requests per 15 minutes */
  AUTH_ATTEMPTS: {
    maxRequests: 10,
    windowMs: 15 * 60 * 1000, // 15 minutes
  },
  /** General API: 100 requests per minute */
  GENERAL: {
    maxRequests: 100,
    windowMs: 60 * 1000, // 1 minute
    binding: "RL_GENERAL",
  },
  /** AI chat endpoints (tika/ask, tika/voice-command): 30 requests per minute per user */
  AI_CHAT: {
    maxRequests: 30,
    windowMs: 60 * 1000, // 1 minute
    binding: "RL_AI_CHAT",
  },
  /** AI render endpoints (render-pictograph, test-render): 20 requests per minute per IP */
  AI_RENDER: {
    maxRequests: 20,
    windowMs: 60 * 1000, // 1 minute
    binding: "RL_AI_RENDER",
  },
  /** Admin endpoints: 30 requests per minute per user */
  ADMIN: {
    maxRequests: 30,
    windowMs: 60 * 1000, // 1 minute
    binding: "RL_ADMIN",
  },
  /** Serialized card issuance: expensive Firestore fan-out, per signed-in user. */
  CARD_ISSUE: {
    maxRequests: 10,
    windowMs: 60 * 1000,
    binding: "RL_CARD_ISSUE",
  },
  /** Physical scan ingestion: keyed to the browser's stable device identity. */
  CARD_SCAN: {
    maxRequests: 20,
    windowMs: 60 * 1000,
    binding: "RL_CARD_SCAN",
  },
  /** Public software-history submissions: low-volume and keyed by IP. */
  SOFTWARE_SUBMISSION: {
    maxRequests: 4,
    windowMs: 60 * 1000,
    binding: "RL_SOFTWARE_SUBMISSION",
  },
  /** Agent feedback ingest: 20 requests per 15 minutes */
  FEEDBACK_INGEST: {
    maxRequests: 20,
    windowMs: 15 * 60 * 1000, // 15 minutes
  },
} as const;
