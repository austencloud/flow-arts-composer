import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BOTTOM_NOTE_DAY_KEY,
  hasBottomNoteShownToday,
  localDay,
  markBottomNoteShownToday,
} from "#lib/shared/components/bottom-note-day.js";
import {
  canShowGuestNote,
  emptyGuestNoteMemory,
  GUEST_NOTE_STORAGE_KEY,
  isReturnVisit,
  readGuestNoteMemory,
  recordVisit,
  RETURN_GAP_MS,
} from "./guest-note-memory";

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  showOnRequest: vi.fn(),
  recordNotNow: vi.fn(),
  auth: { initialized: true, full: false },
  install: { open: false },
  drawer: { open: false, quiet: false },
  lastMethod: null as string | null,
}));

vi.mock("#lib/shared/analytics/services/posthog.js", () => ({
  captureEvent: mocks.capture,
}));
vi.mock("#lib/shared/auth/state/auth-state.svelte.js", () => ({
  authState: {
    isInitialized: () => mocks.auth.initialized,
    get isFullAccount() {
      return mocks.auth.full;
    },
  },
}));
vi.mock("#lib/shared/auth/state/auth-drawer-state.svelte.js", () => ({
  authDrawerState: {
    showOnRequest: mocks.showOnRequest,
    recordNotNow: mocks.recordNotNow,
    get open() {
      return mocks.drawer.open;
    },
    get quietDayRunning() {
      return mocks.drawer.quiet;
    },
  },
}));
vi.mock("#lib/shared/auth/services/last-auth-method.svelte.js", () => ({
  getLastAuthMethod: () => mocks.lastMethod,
}));
vi.mock("#lib/shared/pwa/install-nudge-state.svelte.js", () => ({
  installNudge: {
    get open() {
      return mocks.install.open;
    },
  },
}));

function memoryStore(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, value),
  };
}

const HOUR = 60 * 60 * 1000;

describe("guest note memory", () => {
  const base = {
    firstDay: "2026-11-14",
    shownAt: null,
    lastSeenAt: new Date(2026, 10, 14, 20, 0).getTime(),
  };

  it("never counts the first day as a return", () => {
    const first = recordVisit(emptyGuestNoteMemory(), "2026-11-14");
    expect(isReturnVisit(first, "2026-11-14", Date.now())).toBe(false);
    // A second load on the same day leaves the first day alone.
    expect(recordVisit(first, "2026-11-14")).toBe(first);
  });

  it("counts a next day after a long gap as a return", () => {
    const now = new Date(2026, 10, 15, 9, 0).getTime();
    expect(isReturnVisit(base, "2026-11-15", now)).toBe(true);
  });

  it("does not count a tab left open past midnight", () => {
    // Last seen 23:50, page loads again 00:10 the next day.
    const memory = {
      ...base,
      lastSeenAt: new Date(2026, 10, 14, 23, 50).getTime(),
    };
    const now = new Date(2026, 10, 15, 0, 10).getTime();
    expect(isReturnVisit(memory, "2026-11-15", now)).toBe(false);
  });

  it("does not count a reload a few minutes later", () => {
    const soon = base.lastSeenAt + 5 * 60 * 1000;
    expect(isReturnVisit(base, "2026-11-15", soon)).toBe(false);
    const later = base.lastSeenAt + RETURN_GAP_MS;
    expect(isReturnVisit(base, "2026-11-15", later)).toBe(true);
  });

  it("does not count a load with no last-seen time", () => {
    const memory = { ...base, lastSeenAt: null };
    expect(isReturnVisit(memory, "2026-11-20", Date.now())).toBe(false);
  });

  it("counts a later day across month and year ends", () => {
    const seen = { shownAt: null, lastSeenAt: 0 };
    expect(
      isReturnVisit({ ...seen, firstDay: "2026-11-30" }, "2026-12-01", 7 * HOUR)
    ).toBe(true);
    expect(
      isReturnVisit({ ...seen, firstDay: "2026-12-31" }, "2027-01-01", 7 * HOUR)
    ).toBe(true);
  });

  it("shows once, ever", () => {
    expect(canShowGuestNote({ ...base, shownAt: 1 }, true)).toBe(false);
    expect(canShowGuestNote(base, true)).toBe(true);
    expect(canShowGuestNote(base, false)).toBe(false);
  });

  it("uses the person's own calendar day", () => {
    expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });

  it("starts over on a damaged or blocked store", () => {
    const damaged = memoryStore({
      [GUEST_NOTE_STORAGE_KEY]: '{"firstDay":"yesterday"}',
    });
    expect(readGuestNoteMemory(damaged)).toEqual(emptyGuestNoteMemory());
    const garbage = memoryStore({ [GUEST_NOTE_STORAGE_KEY]: "{not json" });
    expect(readGuestNoteMemory(garbage)).toEqual(emptyGuestNoteMemory());
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
    } as unknown as Storage;
    expect(readGuestNoteMemory(blocked)).toEqual(emptyGuestNoteMemory());
  });
});

describe("bottom note day", () => {
  it("remembers the day an automatic card showed", () => {
    const store = memoryStore();
    const now = new Date(2026, 10, 15, 12, 0);
    expect(hasBottomNoteShownToday(store, now)).toBe(false);
    markBottomNoteShownToday(store, now);
    expect(hasBottomNoteShownToday(store, now)).toBe(true);
    expect(hasBottomNoteShownToday(store, new Date(2026, 10, 16, 0, 5))).toBe(
      false
    );
  });

  it("is safe when storage throws", () => {
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    } as unknown as Storage;
    expect(hasBottomNoteShownToday(blocked)).toBe(false);
    expect(() => markBottomNoteShownToday(blocked)).not.toThrow();
    expect(hasBottomNoteShownToday(undefined)).toBe(false);
  });
});

describe("guestNote", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.capture.mockClear();
    mocks.showOnRequest.mockClear();
    mocks.recordNotNow.mockClear();
    mocks.auth.initialized = true;
    mocks.auth.full = false;
    mocks.install.open = false;
    mocks.drawer.open = false;
    mocks.drawer.quiet = false;
    mocks.lastMethod = null;
    vi.stubGlobal("localStorage", memoryStore());
    // The state module listens for the page being hidden; a bare object is
    // enough here.
    vi.stubGlobal("window", { addEventListener: () => {} });
    vi.stubGlobal("document", {
      addEventListener: () => {},
      visibilityState: "visible",
    });
  });

  /** A guest first seen long ago, last seen a day ago: a real return. */
  async function returningGuest() {
    localStorage.setItem(
      GUEST_NOTE_STORAGE_KEY,
      JSON.stringify({
        firstDay: "2020-01-01",
        shownAt: null,
        lastSeenAt: Date.now() - 24 * HOUR,
      })
    );
    return (await import("./guest-note-state.svelte")).guestNote;
  }

  it("shows to a returning guest once and holds the install card back", async () => {
    const note = await returningGuest();
    expect(note.offer()).toBe(true);
    expect(note.open).toBe(true);
    expect(mocks.capture).toHaveBeenCalledWith("guest_note_shown", {
      trigger: "create",
    });

    note.close("not_now");
    expect(note.open).toBe(false);
    expect(mocks.capture).toHaveBeenCalledWith("guest_note_closed", {
      how: "not_now",
    });

    // A later page load never shows it again.
    vi.resetModules();
    const again = (await import("./guest-note-state.svelte")).guestNote;
    expect(again.offer()).toBe(false);
  });

  it("says which trigger showed it", async () => {
    const note = await returningGuest();
    expect(note.offer("browse")).toBe(true);
    expect(mocks.capture).toHaveBeenCalledWith("guest_note_shown", {
      trigger: "browse",
    });
  });

  it("stays away from account holders and while auth is unknown", async () => {
    mocks.auth.full = true;
    const note = await returningGuest();
    expect(note.offer()).toBe(false);
    mocks.auth.full = false;
    mocks.auth.initialized = false;
    expect(note.offer()).toBe(false);
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it("never shows on a device that has had an account", async () => {
    mocks.lastMethod = "google";
    const note = await returningGuest();
    expect(note.offer()).toBe(false);
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it("waits while the install card is open, without spending its one showing", async () => {
    mocks.install.open = true;
    const note = await returningGuest();
    expect(note.offer()).toBe(false);
    mocks.install.open = false;
    expect(note.offer()).toBe(true);
  });

  it("waits through the one-day quiet and the open sign-up sheet without spending its showing", async () => {
    const note = await returningGuest();
    mocks.drawer.quiet = true;
    expect(note.offer()).toBe(false);
    mocks.drawer.quiet = false;
    mocks.drawer.open = true;
    expect(note.offer()).toBe(false);
    mocks.drawer.open = false;
    expect(note.offer()).toBe(true);
  });

  it("starts the one-day quiet however it is closed", async () => {
    for (const how of ["not_now", "close", "escape"] as const) {
      mocks.recordNotNow.mockClear();
      vi.resetModules();
      localStorage.clear();
      const note = await returningGuest();
      expect(note.offer()).toBe(true);
      note.close(how);
      expect(mocks.recordNotNow).toHaveBeenCalledTimes(1);
    }
  });

  it("opens the sign-up sheet under its own origin and starts the quiet day", async () => {
    const note = await returningGuest();
    note.offer();
    note.makeAccount();
    expect(note.open).toBe(false);
    expect(mocks.capture).toHaveBeenCalledWith("guest_note_account");
    expect(mocks.recordNotNow).toHaveBeenCalledTimes(1);
    expect(mocks.showOnRequest).toHaveBeenCalledWith(
      "signup",
      "returning-guest"
    );
  });

  it("is blocked by an automatic card already shown today", async () => {
    const note = await returningGuest();
    localStorage.setItem(BOTTOM_NOTE_DAY_KEY, localDay(new Date()));
    expect(note.offer()).toBe(false);
    localStorage.removeItem(BOTTOM_NOTE_DAY_KEY);
    expect(note.offer()).toBe(true);
    expect(localStorage.getItem(BOTTOM_NOTE_DAY_KEY)).toBe(
      localDay(new Date())
    );
  });

  it("never shows on a guest's first day", async () => {
    const note = (await import("./guest-note-state.svelte")).guestNote;
    expect(note.offer()).toBe(false);
    expect(
      JSON.parse(localStorage.getItem(GUEST_NOTE_STORAGE_KEY)!).firstDay
    ).toBe(localDay(new Date()));
  });

  it("does not treat a reload soon after a visit as a return", async () => {
    localStorage.setItem(
      GUEST_NOTE_STORAGE_KEY,
      JSON.stringify({
        firstDay: "2020-01-01",
        shownAt: null,
        lastSeenAt: Date.now() - 5 * 60 * 1000,
      })
    );
    const note = (await import("./guest-note-state.svelte")).guestNote;
    expect(note.offer()).toBe(false);
  });
});
