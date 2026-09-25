/** m:ss.s, the clock the transport and the act fields read in. */
export function formatPostClock(seconds: number): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const tenths = Math.round(safe * 10);
  const minutes = Math.floor(tenths / 600);
  const rest = (tenths % 600) / 10;
  return `${minutes}:${rest.toFixed(1).padStart(4, "0")}`;
}

/** m:ss.ss for the take-side fields where a frame matters. */
export function formatTakeClock(seconds: number): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const hundredths = Math.round(safe * 100);
  const minutes = Math.floor(hundredths / 6000);
  const rest = (hundredths % 6000) / 100;
  return `${minutes}:${rest.toFixed(2).padStart(5, "0")}`;
}

/**
 * Reads "1:23.45", "83.45" or "83" as seconds. Null when it is not a time.
 */
export function parseClock(text: string): number | null {
  const trimmed = text.trim();
  const match = /^(?:(\d+):)?(\d+(?:\.\d*)?)$/.exec(trimmed);
  if (!match) return null;
  const minutes = match[1] ? Number(match[1]) : 0;
  const seconds = Number(match[2]);
  if (match[1] && seconds >= 60) return null;
  const total = minutes * 60 + seconds;
  return Number.isFinite(total) ? total : null;
}
