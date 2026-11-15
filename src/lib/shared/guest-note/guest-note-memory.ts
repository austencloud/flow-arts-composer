import { localDay } from "#lib/shared/components/bottom-note-day.js";

/**
 * What this browser remembers for the returning-guest note: the first day it
 * opened the app, when it was last open, and whether the note has shown.
 * Nothing leaves the device.
 *
 * "Came back" is decided once at page load (state module): a later calendar
 * day than the first one, in the person's own time zone, AND at least
 * RETURN_GAP_MS since the page was last seen. A tab left open past midnight,
 * or a reload a few minutes later, is not a return. The note shows once,
 * ever, and only to someone without an account (the state module checks that).
 */

export const GUEST_NOTE_STORAGE_KEY = "tka-guest-note";
/** A real gap between two visits: long enough to be a different sitting. */
export const RETURN_GAP_MS = 6 * 60 * 60 * 1000;

export interface GuestNoteMemory {
  /** Local calendar day of the first visit, as YYYY-MM-DD. */
  firstDay: string | null;
  shownAt: number | null;
  /** When the page was last open or hidden. Missing means not a return. */
  lastSeenAt: number | null;
}

export function emptyGuestNoteMemory(): GuestNoteMemory {
  return { firstDay: null, shownAt: null, lastSeenAt: null };
}

export { localDay };

/** First visit sets the day; later visits leave it alone. */
export function recordVisit(
  memory: GuestNoteMemory,
  today: string
): GuestNoteMemory {
  return memory.firstDay === null ? { ...memory, firstDay: today } : memory;
}

/**
 * Whether this page load is a return visit. Pass the memory as it was BEFORE
 * this load wrote its own `lastSeenAt`.
 */
export function isReturnVisit(
  memory: GuestNoteMemory,
  today: string,
  now: number
): boolean {
  return (
    memory.firstDay !== null &&
    today > memory.firstDay &&
    memory.lastSeenAt !== null &&
    now - memory.lastSeenAt >= RETURN_GAP_MS
  );
}

export function canShowGuestNote(
  memory: GuestNoteMemory,
  returnVisit: boolean
): boolean {
  return memory.shownAt === null && returnVisit;
}

function parse(raw: string | null): GuestNoteMemory {
  if (!raw) return emptyGuestNoteMemory();
  try {
    const parsed = JSON.parse(raw) as Partial<GuestNoteMemory>;
    return {
      firstDay:
        typeof parsed.firstDay === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(parsed.firstDay)
          ? parsed.firstDay
          : null,
      shownAt: typeof parsed.shownAt === "number" ? parsed.shownAt : null,
      lastSeenAt:
        typeof parsed.lastSeenAt === "number" ? parsed.lastSeenAt : null,
    };
  } catch {
    return emptyGuestNoteMemory();
  }
}

export function readGuestNoteMemory(
  storage: Storage | undefined
): GuestNoteMemory {
  try {
    return parse(storage?.getItem(GUEST_NOTE_STORAGE_KEY) ?? null);
  } catch {
    return emptyGuestNoteMemory();
  }
}

export function writeGuestNoteMemory(
  storage: Storage | undefined,
  memory: GuestNoteMemory
): void {
  try {
    storage?.setItem(GUEST_NOTE_STORAGE_KEY, JSON.stringify(memory));
  } catch {
    // Storage blocked: the note simply never finds a second day.
  }
}
