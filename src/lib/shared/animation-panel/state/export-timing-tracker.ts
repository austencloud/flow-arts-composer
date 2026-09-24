/**
 * Export Timing Tracker
 *
 * Records actual encoding throughput (frames/second) from completed exports
 * and provides time estimates for future exports based on device performance.
 *
 * Throughput is stored per resolution tier in localStorage.
 * First-time users get conservative fallback estimates.
 */

const STORAGE_KEY = "tka_export_throughput";

/** Resolution tiers for throughput bucketing */
type ResolutionTier = "720" | "1080" | "2160" | "4320";

interface ThroughputRecord {
  /** Average frames per second the device achieved */
  fps: number;
  /** Number of samples averaged into this value */
  samples: number;
  /** Timestamp of last update */
  lastUpdated: number;
}

type ThroughputData = Partial<Record<ResolutionTier, ThroughputRecord>>;

/**
 * Conservative fallback throughput estimates (frames/sec) for devices
 * with no history. Deliberately pessimistic to avoid overpromising.
 */
const FALLBACK_THROUGHPUT: Record<ResolutionTier, number> = {
  "720": 45,
  "1080": 25,
  "2160": 8,
  "4320": 2,
};

function loadThroughput(): ThroughputData {
  if (typeof localStorage === "undefined") return {};
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function saveThroughput(data: ThroughputData): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Silently ignore storage errors
  }
}

/**
 * Record a completed export's throughput.
 * Uses exponential moving average to smooth out variance
 * while adapting to the device's actual capability.
 */
export function recordExportThroughput(
  resolution: number,
  totalFrames: number,
  durationMs: number
): void {
  if (totalFrames <= 0 || durationMs <= 0) return;

  const tier = String(resolution) as ResolutionTier;
  const throughput = (totalFrames / durationMs) * 1000; // frames per second
  const data = loadThroughput();
  const existing = data[tier];

  if (existing && existing.samples > 0) {
    // Exponential moving average: weight recent exports more heavily
    const alpha = 0.4;
    data[tier] = {
      fps: existing.fps * (1 - alpha) + throughput * alpha,
      samples: Math.min(existing.samples + 1, 20), // cap at 20
      lastUpdated: Date.now(),
    };
  } else {
    data[tier] = {
      fps: throughput,
      samples: 1,
      lastUpdated: Date.now(),
    };
  }

  saveThroughput(data);
}

/**
 * Estimate export time in seconds for given parameters.
 * Returns null if no estimate can be made (shouldn't happen with fallbacks).
 */
export function estimateExportTime(
  resolution: number,
  fps: number,
  singlePlayDurationSeconds: number,
  loopCount: number
): number | null {
  if (singlePlayDurationSeconds <= 0) return null;

  const tier = String(resolution) as ResolutionTier;
  const totalFrames = Math.ceil(singlePlayDurationSeconds * fps) * loopCount;

  const data = loadThroughput();
  const record = data[tier];
  const throughput =
    record?.fps ?? FALLBACK_THROUGHPUT[tier] ?? FALLBACK_THROUGHPUT["1080"];

  // Add ~1s overhead for encoder initialization and finalization
  const encodingTime = totalFrames / throughput;
  return encodingTime + 1;
}

/**
 * Check whether we have real device metrics or are using fallback estimates.
 */
export function hasDeviceMetrics(resolution: number): boolean {
  const tier = String(resolution) as ResolutionTier;
  const data = loadThroughput();
  return (data[tier]?.samples ?? 0) > 0;
}

/** "40.5s", "1m 12s", "2m". Empty for a non-positive duration. */
export function formatExportDuration(seconds: number): string {
  if (seconds <= 0) return "";
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

/**
 * How long a render should take, as the Export page and Share show it:
 * "~1m 12s", or "~1m 12s est." while this device has no measured throughput
 * for the resolution. Empty when there is nothing to estimate from.
 */
export function formatExportTimeEstimate(
  resolution: number,
  fps: number,
  singlePlayDurationSeconds: number,
  loopCount: number
): string {
  const seconds = estimateExportTime(
    resolution,
    fps,
    singlePlayDurationSeconds,
    loopCount
  );
  if (seconds === null) return "";
  const label = formatExportDuration(seconds);
  if (!label) return "";
  return hasDeviceMetrics(resolution) ? `~${label}` : `~${label} est.`;
}
