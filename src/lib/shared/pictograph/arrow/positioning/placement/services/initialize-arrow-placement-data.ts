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

// A drawn picture keeps its arrows forever (blob caches, the shared cloud
// store), so it must not be drawn while the placement stores are still
// downloading. Each store already swallows its own load failure, so this only
// waits for the first attempt to settle; the ceiling keeps a hung connection
// from holding every picture back indefinitely.
const READY_CEILING_MS = 20_000;
let readyPromise: Promise<void> | null = null;

/**
 * Resolves once every placement store has finished its first load (or failed
 * it). Starts the load if nothing has yet. Settled once per session, so later
 * callers pay nothing.
 */
export function whenArrowPlacementDataReady(): Promise<void> {
  if (readyPromise) return readyPromise;
  readyPromise = new Promise<void>((resolve) => {
    const ceiling = setTimeout(() => {
      console.warn(
        `[arrow placement] stores still loading after ${READY_CEILING_MS} ms; drawing without them`
      );
      resolve();
    }, READY_CEILING_MS);
    initializeArrowPlacementData()
      .catch((error) =>
        console.warn("[arrow placement] store load failed:", error)
      )
      .finally(() => {
        clearTimeout(ceiling);
        resolve();
      });
  });
  return readyPromise;
}
