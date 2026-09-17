/**
 * Production reload breadcrumb for the stale-chunk recovery in hooks.client.ts.
 *
 * After a deploy, a tab still running the old HTML shell can request a chunk
 * hash the server no longer has. The `vite:preloadError` handler recovers with
 * a cache-busted navigation, and the root layout strips the `?fresh=` marker
 * during boot, so nothing visible explains the reload. This records the
 * recovery in sessionStorage (which survives the navigation) so the next boot
 * can print it and report it on the PostHog session_start event, mirroring the
 * service-worker update marker in sw-update-manager.ts.
 */

export const CHUNK_RECOVERY_RELOAD_MARKER_KEY = "tka-chunk-recovery-reload";

export interface ReloadMarkerResult {
  occurred: boolean;
  ageMs: number | null;
}

const NONE: ReloadMarkerResult = { occurred: false, ageMs: null };

function defaultStorage(): Storage | null {
  return typeof sessionStorage === "undefined" ? null : sessionStorage;
}

export function markChunkRecoveryReload(
  storage: Storage | null = defaultStorage()
): void {
  try {
    storage?.setItem(CHUNK_RECOVERY_RELOAD_MARKER_KEY, String(Date.now()));
  } catch {
    // A denied sessionStorage write must never block the recovery navigation.
  }
}

export function consumeChunkRecoveryReloadMarker(
  storage: Storage | null = defaultStorage(),
  now = Date.now()
): ReloadMarkerResult {
  try {
    const raw = storage?.getItem(CHUNK_RECOVERY_RELOAD_MARKER_KEY) ?? null;
    storage?.removeItem(CHUNK_RECOVERY_RELOAD_MARKER_KEY);
    if (raw === null) return NONE;
    const recordedAt = Number(raw);
    return {
      occurred: true,
      ageMs: Number.isFinite(recordedAt) ? Math.max(0, now - recordedAt) : null,
    };
  } catch {
    return NONE;
  }
}

// The marker is consumed once at boot (hooks.client.ts) so the console line
// prints before the boot noise. The session_start event fires later from the
// auth boot orchestrator, so the consumed value is parked here for it.
let rememberedForSession: ReloadMarkerResult = NONE;

export function rememberChunkRecoveryReload(result: ReloadMarkerResult): void {
  rememberedForSession = result;
}

/** Hand the boot-time result to session_start exactly once. */
export function takeChunkRecoveryReloadForSession(): ReloadMarkerResult {
  const result = rememberedForSession;
  rememberedForSession = NONE;
  return result;
}

/**
 * Consume the marker and, when a recovery reload happened, print the same
 * "why did it reload?" line the dev breadcrumb uses. Safe in production.
 */
export function printChunkRecoveryReloadBreadcrumb(): void {
  const result = consumeChunkRecoveryReloadMarker();
  rememberChunkRecoveryReload(result);
  if (!result.occurred) return;
  const age =
    result.ageMs === null
      ? "unknown age"
      : `${(result.ageMs / 1000).toFixed(1)}s before this boot`;
  console.info(
    `%c why did it reload? %c stale chunk after a deploy: this tab was still on an old HTML shell and a lazy-loaded chunk no longer existed on the server (recorded ${age})`,
    "background:#7c5cff;color:#fff;padding:1px 6px;border-radius:3px;font-weight:600",
    ""
  );
}
