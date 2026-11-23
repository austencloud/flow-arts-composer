import { getGlobalAdjustmentRepository } from "../../global/services/global-adjustment-singleton";
import { getPropGeometryRepository } from "../../prop-geometry/services/prop-geometry-singleton";
import { getSpecialOverrideRepository } from "../../special-override/services/special-override-singleton";
import { getDefaultOverrideRepository } from "../../default-override/services/default-override-singleton";

let initializationPromise: Promise<void> | null = null;

/** Load every persisted placement tier independently of authentication. */
export async function initializeArrowPlacementData(): Promise<void> {
  if (initializationPromise) return initializationPromise;
  initializationPromise = Promise.all([
    import("../../global/services/global-adjustment-singleton").then(
      ({ initializeGlobalAdjustments }) => initializeGlobalAdjustments()
    ),
    import("../../prop-geometry/services/prop-geometry-singleton").then(
      ({ initializePropGeometryAdjustments }) =>
        initializePropGeometryAdjustments()
    ),
    import("../../special-override/services/special-override-singleton").then(
      ({ initializeSpecialOverrides }) => initializeSpecialOverrides()
    ),
    import("../../default-override/services/default-override-singleton").then(
      ({ initializeDefaultOverrides }) => initializeDefaultOverrides()
    ),
  ]).then(() => undefined);

  try {
    await initializationPromise;
  } finally {
    initializationPromise = null;
  }
}

function storesLoaded(): boolean {
  return (
    getGlobalAdjustmentRepository()?.isInitialized === true &&
    getPropGeometryRepository()?.isInitialized === true &&
    getSpecialOverrideRepository()?.isInitialized === true &&
    getDefaultOverrideRepository()?.isInitialized === true
  );
}

/**
 * True only when all four placement stores finished their first load
 * successfully. Each store's own repository owns the answer: `isInitialized`
 * is set by the state's `loadAll`, which runs only after a successful
 * download, so a failed or still-running load reads false. An empty store that
 * loaded counts as loaded. Read from the singletons rather than tracked here,
 * because other callers (CardInspectModal) also start these loads.
 *
 * The first read that sees the loaded state runs the pending
 * onArrowPlacementDataLoaded listeners before it answers true, so nothing can
 * observe "loaded" while the worker pool still holds the old snapshot.
 */
export function isArrowPlacementDataLoaded(): boolean {
  if (!storesLoaded()) return false;
  if (loadedListeners.size > 0) flushLoadedListeners();
  return true;
}

// A drawn picture keeps its arrows forever (blob caches, the shared cloud
// store), so it must not be drawn while the placement stores are still
// downloading. Each store already swallows its own load failure, so this only
// waits for the first attempt to settle; the ceiling keeps a hung connection
// from holding every picture back indefinitely. A picture drawn after a miss
// (ceiling or failed load) is provisional: callers check
// isArrowPlacementDataLoaded() and keep it out of anything that outlives the
// page.
const READY_CEILING_MS = 20_000;
/** Shortest gap between two background load attempts after a miss. */
const RETRY_COOLDOWN_MS = 30_000;
let readyPromise: Promise<void> | null = null;
let lastAttemptAt = 0;
let attemptInFlight = false;
let failureLogged = false;
const loadedListeners = new Set<() => void>();

function logFailureOnce(error: unknown): void {
  if (failureLogged) return;
  failureLogged = true;
  console.warn(
    "[arrow placement] store load failed (further failures are not logged):",
    error
  );
}

function notifyIfLoaded(): void {
  isArrowPlacementDataLoaded();
}

function flushLoadedListeners(): void {
  const listeners = [...loadedListeners];
  loadedListeners.clear();
  for (const listener of listeners) {
    try {
      listener();
    } catch (error) {
      console.warn("[arrow placement] loaded listener failed:", error);
    }
  }
}

/**
 * Run `listener` once, synchronously, the moment a miss turns into a loaded
 * state (a late or retried load). Returns an unsubscribe. Not called for a
 * first load that finished inside the readiness wait; those callers already
 * hold complete data.
 */
export function onArrowPlacementDataLoaded(listener: () => void): () => void {
  loadedListeners.add(listener);
  return () => loadedListeners.delete(listener);
}

/** After a miss, start one background attempt per cooldown, only on a call. */
function retryAfterMiss(): void {
  if (attemptInFlight || storesLoaded()) return;
  const now = Date.now();
  if (now - lastAttemptAt < RETRY_COOLDOWN_MS) return;
  lastAttemptAt = now;
  attemptInFlight = true;
  initializeArrowPlacementData()
    .catch(logFailureOnce)
    .finally(() => {
      attemptInFlight = false;
      notifyIfLoaded();
    });
}

/**
 * Resolves once every placement store has finished its first load (or failed
 * it). Starts the load if nothing has yet. Settled once per session, so later
 * callers pay nothing; a call made after a miss does not wait again but may
 * start a background retry (see retryAfterMiss).
 */
export function whenArrowPlacementDataReady(): Promise<void> {
  if (readyPromise) {
    retryAfterMiss();
    return readyPromise;
  }
  lastAttemptAt = Date.now();
  attemptInFlight = true;
  readyPromise = new Promise<void>((resolve) => {
    const ceiling = setTimeout(() => {
      console.warn(
        `[arrow placement] stores still loading after ${READY_CEILING_MS} ms; drawing without them`
      );
      resolve();
    }, READY_CEILING_MS);
    initializeArrowPlacementData()
      .catch(logFailureOnce)
      .finally(() => {
        clearTimeout(ceiling);
        attemptInFlight = false;
        resolve();
        notifyIfLoaded();
      });
  });
  return readyPromise;
}
