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

/**
 * Which recovery fired: `soft` is the cache-busted navigation, `hard` the
 * second try that also unregisters the service worker and clears its caches.
 */
export type ChunkRecoveryStage = "soft" | "hard";

export interface ReloadMarkerResult {
  occurred: boolean;
  ageMs: number | null;
  stage: ChunkRecoveryStage | null;
}

const NONE: ReloadMarkerResult = { occurred: false, ageMs: null, stage: null };

function defaultStorage(): Storage | null {
  return typeof sessionStorage === "undefined" ? null : sessionStorage;
}

export function markChunkRecoveryReload(
  stage: ChunkRecoveryStage = "soft",
  storage: Storage | null = defaultStorage()
): void {
  try {
    storage?.setItem(
      CHUNK_RECOVERY_RELOAD_MARKER_KEY,
      `${Date.now()}:${stage}`
    );
  } catch {
    // A denied sessionStorage write must never block the recovery navigation.
  }
}

// The recovery ladder hooks.client.ts climbs when a lazy chunk will not load.
// Each step is stamped in sessionStorage, which survives the reload, and the
// stamps expire after a minute so a tab that stays healthy can recover again
// later. Within one minute: one soft reload, one hard reload, then give up and
// ask the person. That ceiling is what keeps the old 74-reload loop away.
export const CHUNK_SOFT_RELOAD_KEY = "tka-chunk-reload";
export const CHUNK_HARD_RELOAD_KEY = "tka-chunk-hard-reload";
export const CHUNK_RECOVERY_WINDOW_MS = 60_000;

export type ChunkRecoveryStep = ChunkRecoveryStage | "give-up";

export function claimChunkRecoveryStep(
  storage: Storage | null = defaultStorage(),
  now = Date.now()
): ChunkRecoveryStep {
  // Without storage the steps cannot be counted, and an uncounted reload is
  // exactly how a loop starts, so stop at the notice.
  if (!storage) return "give-up";
  try {
    const recent = (key: string) => {
      const raw = storage.getItem(key);
      if (raw === null) return false;
      const at = Number(raw);
      return Number.isFinite(at) && now - at < CHUNK_RECOVERY_WINDOW_MS;
    };
    if (!recent(CHUNK_SOFT_RELOAD_KEY)) {
      storage.setItem(CHUNK_SOFT_RELOAD_KEY, String(now));
      // A new window starts here; a hard reload from an earlier one must not
      // count against it.
      storage.removeItem(CHUNK_HARD_RELOAD_KEY);
      return "soft";
    }
    if (!recent(CHUNK_HARD_RELOAD_KEY)) {
      storage.setItem(CHUNK_HARD_RELOAD_KEY, String(now));
      return "hard";
    }
    return "give-up";
  } catch {
    return "give-up";
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
    const [time, stage] = raw.split(":");
    const recordedAt = Number(time);
    return {
      occurred: true,
      ageMs: Number.isFinite(recordedAt) ? Math.max(0, now - recordedAt) : null,
      // A bare timestamp predates the stages, when the soft reload was the
      // only recovery there was.
      stage: stage === "hard" ? "hard" : "soft",
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
  const how =
    result.stage === "hard"
      ? "; the first reload did not fix it, so this one also cleared the service worker and its caches"
      : "";
  console.info(
    `%c why did it reload? %c stale chunk after a deploy: this tab was still on an old HTML shell and a lazy-loaded chunk no longer existed on the server (recorded ${age}${how})`,
    "background:#7c5cff;color:#fff;padding:1px 6px;border-radius:3px;font-weight:600",
    ""
  );
}
