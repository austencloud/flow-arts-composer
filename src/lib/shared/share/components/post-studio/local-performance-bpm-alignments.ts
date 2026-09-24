export interface BpmAlignment {
  bpm: number;
  firstBeatSeconds: number | null;
}

const PREFIX = "tka:post-studio-bpm-alignment:";

function isAlignment(value: unknown): value is BpmAlignment {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.bpm === "number" &&
    Number.isFinite(record.bpm) &&
    record.bpm >= 20 &&
    record.bpm <= 300 &&
    (record.firstBeatSeconds === null ||
      (typeof record.firstBeatSeconds === "number" &&
        Number.isFinite(record.firstBeatSeconds) &&
        record.firstBeatSeconds >= 0))
  );
}

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadBpmAlignment(key: string): BpmAlignment | null {
  if (!key) return null;
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const record = parsed as Record<string, unknown>;
    if (record.key !== key || !isAlignment(record)) return null;
    return { bpm: record.bpm, firstBeatSeconds: record.firstBeatSeconds };
  } catch {
    return null;
  }
}

export function saveBpmAlignment(
  key: string,
  value: BpmAlignment | null
): void {
  if (!key || (value !== null && !isAlignment(value))) return;
  const store = storage();
  if (!store) return;
  try {
    if (value === null) {
      store.removeItem(PREFIX + key);
    } else {
      store.setItem(PREFIX + key, JSON.stringify({ key, ...value }));
    }
  } catch {
    // Private browsing or a full store must not interrupt playback.
  }
}
