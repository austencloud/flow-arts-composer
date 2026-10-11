/**
 * Admin endpoint to manage PostHog feature flags.
 * Proxies requests to PostHog's Feature Flags API.
 *
 * Endpoints:
 * - GET: List all feature flags
 * - POST: Migrate deactivated flags (reactivate with 0% rollout)
 * - PATCH: Create or update a feature flag
 *
 * IMPORTANT: Flags are never deactivated (active=false). PostHog's client SDK
 * returns undefined for deactivated flags, which causes the client to fall through
 * to role-based defaults and show features that should be hidden. Instead, we keep
 * flags active and control visibility via rollout percentage (0% = disabled, 100% = enabled).
 *
 * Requires admin role and POSTHOG_PERSONAL_API_KEY env var.
 */
import type { RequestHandler } from "@sveltejs/kit";
import { error } from "@sveltejs/kit";
import { requireAdmin } from "#lib/server/auth/requireAdmin.js";
import * as env from "$app/env/private";
import { RATE_LIMITS } from "#lib/server/security/rate-limiter.js";
import { withRateLimit } from "#lib/server/security/withRateLimit.js";
import { logAdminAction } from "#lib/server/security/audit-logger.js";

const POSTHOG_API_BASE = "https://us.i.posthog.com/api";

function getPostHogHeaders() {
  if (!env.POSTHOG_PERSONAL_API_KEY) {
    throw error(500, "POSTHOG_PERSONAL_API_KEY not configured");
  }
  return {
    Authorization: `Bearer ${env.POSTHOG_PERSONAL_API_KEY}`,
    "Content-Type": "application/json",
  };
}

function getProjectId(): string {
  if (!env.POSTHOG_PROJECT_ID) {
    throw error(500, "POSTHOG_PROJECT_ID not configured");
  }
  return env.POSTHOG_PROJECT_ID;
}

/**
 * GET /api/admin/feature-flags
 * List all feature flags from PostHog
 */
export const GET: RequestHandler = async (event) => {
  try {
    const caller = await requireAdmin(event);

    const blocked = await withRateLimit(event, RATE_LIMITS.ADMIN, "user", caller.uid);
    if (blocked) return blocked;

    const projectId = getProjectId();
    const response = await fetch(
      `${POSTHOG_API_BASE}/projects/${projectId}/feature_flags/`,
      { headers: getPostHogHeaders() }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[feature-flags] PostHog API error:", errorText);
      throw error(response.status, `PostHog API error: ${response.statusText}`);
    }

    const data = await response.json();
    return Response.json(data);
  } catch (err: unknown) {
    if (typeof err === "object" && err && "status" in err) {
      throw err;
    }
    console.error("[feature-flags] Error:", err);
    throw error(500, "Failed to fetch feature flags");
  }
};

/**
 * POST /api/admin/feature-flags
 * Migrate deactivated flags: reactivate with 0% rollout so PostHog evaluates them.
 * Deactivated flags (active=false) return undefined from the client SDK,
 * causing tabs to appear visible when they should be hidden.
 */
export const POST: RequestHandler = async (event) => {
  try {
    const caller = await requireAdmin(event);

    const blocked = await withRateLimit(event, RATE_LIMITS.ADMIN, "user", caller.uid);
    if (blocked) return blocked;

    const projectId = getProjectId();

    // Fetch all flags (paginated - PostHog defaults to 100 per page)
    const response = await fetch(
      `${POSTHOG_API_BASE}/projects/${projectId}/feature_flags/?limit=200`,
      { headers: getPostHogHeaders() }
    );

    if (!response.ok) {
      throw error(response.status, "Failed to fetch feature flags");
    }

    const data = await response.json();
    const allFlags = data.results || [];

    // Find TKA flags that are deactivated (active=false)
    const deactivatedFlags = allFlags.filter(
      (f: { key: string; active: boolean }) =>
        !f.active && (f.key.startsWith("module-") || f.key.startsWith("tab-") || f.key.startsWith("capability-"))
    );

    if (deactivatedFlags.length === 0) {
      return Response.json({ success: true, migrated: 0, message: "No deactivated flags found" });
    }

    // Reactivate each with 0% rollout
    const results = [];
    for (const flag of deactivatedFlags) {
      const patchResponse = await fetch(
        `${POSTHOG_API_BASE}/projects/${projectId}/feature_flags/${flag.id}/`,
        {
          method: "PATCH",
          headers: getPostHogHeaders(),
          body: JSON.stringify({
            active: true,
            filters: { groups: [{ properties: [], rollout_percentage: 0 }] },
          }),
        }
      );

      results.push({
        key: flag.key,
        id: flag.id,
        success: patchResponse.ok,
        status: patchResponse.status,
      });
    }

    const migrated = results.filter((r) => r.success).length;
    console.log(`[feature-flags] Migration: reactivated ${migrated}/${deactivatedFlags.length} flags with 0% rollout`);

    logAdminAction({
      uid: caller.uid,
      action: "feature_flag_migration",
      metadata: { migrated, total: deactivatedFlags.length },
      ip: event.getClientAddress(),
    });

    return Response.json({ success: true, migrated, total: deactivatedFlags.length, results });
  } catch (err: unknown) {
    if (typeof err === "object" && err && "status" in err) {
      throw err;
    }
    console.error("[feature-flags] Migration error:", err);
    throw error(500, "Migration failed");
  }
};

/**
 * PATCH /api/admin/feature-flags
 * Update a feature flag in PostHog
 *
 * Body: { flagKey: string, enabled?: boolean, filters?: object }
 */
export const PATCH: RequestHandler = async (event) => {
  try {
    const caller = await requireAdmin(event);

    const blocked = await withRateLimit(event, RATE_LIMITS.ADMIN, "user", caller.uid);
    if (blocked) return blocked;

    const body = await event.request.json();
    const { flagKey, enabled, filters } = body;

    if (!flagKey) {
      throw error(400, "flagKey is required");
    }

    const projectId = getProjectId();

    // First, get the flag ID by key
    const listResponse = await fetch(
      `${POSTHOG_API_BASE}/projects/${projectId}/feature_flags/?search=${encodeURIComponent(flagKey)}`,
      { headers: getPostHogHeaders() }
    );

    if (!listResponse.ok) {
      const errorText = await listResponse.text();
      console.error("[feature-flags] List error:", errorText);
      return Response.json(
        { success: false, message: `PostHog API error: ${listResponse.statusText}`, detail: errorText, code: "POSTHOG_LIST_FAILED" },
        { status: listResponse.status }
      );
    }

    const listData = await listResponse.json();
    const flag = listData.results?.find((f: { key: string }) => f.key === flagKey);

    if (!flag) {
      // Flag doesn't exist - create it
      // Always create as active, control visibility via rollout percentage
      const isEnabled = enabled ?? true;
      const createResponse = await fetch(
        `${POSTHOG_API_BASE}/projects/${projectId}/feature_flags/`,
        {
          method: "POST",
          headers: getPostHogHeaders(),
          body: JSON.stringify({
            key: flagKey,
            name: flagKey.replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
            active: true,
            filters: filters ?? {
              groups: [{ properties: [], rollout_percentage: isEnabled ? 100 : 0 }],
            },
          }),
        }
      );

      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        console.error("[feature-flags] Create error:", errorText);
        return Response.json(
          { success: false, message: `Failed to create flag "${flagKey}"`, detail: errorText, code: "POSTHOG_CREATE_FAILED" },
          { status: createResponse.status }
        );
      }

      const created = await createResponse.json();

      logAdminAction({
        uid: caller.uid,
        action: "feature_flag_create",
        target: flagKey,
        metadata: { enabled: isEnabled },
        ip: event.getClientAddress(),
      });

      return Response.json({
        success: true,
        flag: created,
        action: "created",
        projectId: projectId,
        note: `Flag "${flagKey}" created with 100% rollout. Configure targeting in PostHog dashboard.`,
      });
    }

    // Update existing flag
    // IMPORTANT: Never set active=false. Deactivated PostHog flags return undefined
    // from getFeatureFlag(), which causes the client to fall through to role-based
    // defaults and show tabs that should be hidden.
    // Instead, keep flags active and toggle rollout between 100% (enabled) and 0% (disabled).
    const updates: Record<string, unknown> = {};
    if (typeof enabled === "boolean") {
      updates.active = true; // Always keep flag active so PostHog evaluates it
      updates.filters = enabled
        ? { groups: [{ properties: [], rollout_percentage: 100 }] }
        : { groups: [{ properties: [], rollout_percentage: 0 }] };
    }
    if (filters) {
      updates.filters = filters;
    }

    const updateResponse = await fetch(
      `${POSTHOG_API_BASE}/projects/${projectId}/feature_flags/${flag.id}/`,
      {
        method: "PATCH",
        headers: getPostHogHeaders(),
        body: JSON.stringify(updates),
      }
    );

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.error("[feature-flags] Update error:", errorText);
      return Response.json(
        { success: false, message: `Failed to update flag "${flagKey}"`, detail: errorText, code: "POSTHOG_UPDATE_FAILED" },
        { status: updateResponse.status }
      );
    }

    const updated = await updateResponse.json();

    logAdminAction({
      uid: caller.uid,
      action: "feature_flag_update",
      target: flagKey,
      metadata: { enabled, hasFilters: !!filters },
      ip: event.getClientAddress(),
    });

    return Response.json({ success: true, flag: updated, action: "updated", projectId });
  } catch (err: unknown) {
    console.error("[feature-flags] PATCH Error:", err);

    // SvelteKit HttpError (from throw error(status, message))
    // Return as JSON directly - SvelteKit strips 5xx messages if we re-throw
    if (typeof err === "object" && err !== null && "status" in err && "body" in err) {
      const httpErr = err as { status: number; body: { message: string } };
      return Response.json(
        { success: false, message: httpErr.body.message, code: "HTTP_ERROR" },
        { status: httpErr.status }
      );
    }

    // Plain status-bearing errors (requireAdmin / requireFirebaseUser throw
    // Object.assign(new Error, {status, code}) — these carry `status` but no
    // `body`). Without this branch a genuine 401/403 falls through to the
    // generic 500 below, so the browser reports "500 Internal Server Error"
    // for what is really an auth failure.
    if (typeof err === "object" && err !== null && "status" in err) {
      const statusErr = err as { status: number; code?: string; firebaseCode?: string };
      return Response.json(
        {
          success: false,
          message: err instanceof Error ? err.message : "Request failed",
          code: statusErr.code ?? "AUTH_ERROR",
          firebaseCode: statusErr.firebaseCode,
        },
        { status: statusErr.status }
      );
    }

    // Regular JS errors (network failures, JSON parse errors, etc.)
    return Response.json(
      {
        success: false,
        message: err instanceof Error ? err.message : String(err),
        code: "INTERNAL_ERROR",
      },
      { status: 500 }
    );
  }
};
