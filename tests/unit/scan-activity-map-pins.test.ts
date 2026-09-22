import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// The watcher imports Firebase at module load. Stub the network boundary so
// these tests exercise transforms and query batching without a browser SDK.
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  collectionGroup: vi.fn(),
  doc: vi.fn(),
  documentId: vi.fn(() => "__name__"),
  getDoc: vi.fn(),
  getDocs: vi.fn(async () => ({ docs: [] })),
  limit: vi.fn(),
  onSnapshot: vi.fn(() => vi.fn()),
  orderBy: vi.fn(),
  query: vi.fn(),
  startAfter: vi.fn(),
  where: vi.fn(),
}));
vi.mock("$lib/shared/auth/firebase", () => ({
  getFirestoreInstance: vi.fn(async () => ({})),
}));

import {
  buildScanMapPins,
  createScanActivityState,
  filterScanEvents,
  scanPropConfigForPreview,
  sequenceForScanPreview,
  summarizeScanActivity,
  type ScanEventRow,
  type CodeEntry,
} from "$lib/features/choreo-card/state/scan-activity-state.svelte";
import { ScanActivityWatcher } from "$lib/features/choreo-card/services/implementations/ScanActivityWatcher";
import type {
  IScanActivityWatcher,
  ScanActivityCardDocument,
} from "$lib/features/choreo-card/services/contracts/IScanActivityWatcher";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { getDocs, onSnapshot, where } from "firebase/firestore";

function ev(partial: Partial<ScanEventRow>): ScanEventRow {
  return {
    id: "shortcodes/AAAA/scanEvents/event-default",
    code: "AAAA",
    timestamp: "2026-06-22T00:00:00.000Z",
    city: null,
    country: null,
    lat: null,
    lng: null,
    deviceId: null,
    userId: null,
    leftPropType: null,
    rightPropType: null,
    catDogMode: null,
    ...partial,
  };
}

describe("scan preview prop configuration", () => {
  const entry = {
    code: "PROP",
    leftPropType: PropType.FAN,
    rightPropType: PropType.FAN,
    catDogMode: false,
    decoded: {
      intendedProp: {
        leftPropType: PropType.STAFF,
        rightPropType: PropType.STAFF,
        catDogMode: false,
      },
    } as SequenceData,
    previewSource: "encoded",
  } as CodeEntry;

  it("uses the physical scan event ahead of card and sequence defaults", () => {
    const event = ev({
      leftPropType: PropType.POI,
      rightPropType: PropType.CLUB,
      catDogMode: true,
    });

    expect(scanPropConfigForPreview(entry, event)).toEqual({
      leftPropType: PropType.POI,
      rightPropType: PropType.CLUB,
      catDogMode: true,
    });
  });

  it("uses stored card props for events recorded before prop telemetry", () => {
    expect(scanPropConfigForPreview(entry, ev({}))).toEqual({
      leftPropType: PropType.FAN,
      rightPropType: PropType.FAN,
      catDogMode: false,
    });
  });
});

function decoder() {
  return vi.fn(async () => ({ steps: [] }) as unknown as SequenceData);
}

describe("buildScanMapPins", () => {
  it("includes only events with a city and finite coordinates", () => {
    const pins = buildScanMapPins([
      ev({ code: "WOYG", lat: 41.85, lng: -87.65, city: "Chicago" }),
      ev({ code: "XHJP", lat: null, lng: null }),
      ev({ code: "QQQQ", lat: 40.7, lng: -74.0 }), // coords but no city — excluded
      ev({ code: "ZXFV", lat: 51.5, lng: -0.12, city: "London" }),
    ]);
    expect(pins.map((p) => p.label.split(" · ")[0])).toEqual(["WOYG", "ZXFV"]);
  });

  it("excludes country-only events — no centroid approximations", () => {
    const pins = buildScanMapPins([ev({ code: "AAAA", country: "US" })]);
    expect(pins).toHaveLength(0);
  });

  it("marks the newest plotted event as pin-new even when newer events were excluded", () => {
    const pins = buildScanMapPins([
      ev({ code: "QQQQ", lat: 40.7, lng: -74.0 }), // newest but city-less
      ev({ code: "WOYG", lat: 41.85, lng: -87.65, city: "Chicago" }),
      ev({ code: "ZXFV", lat: 51.5, lng: -0.12, city: "London" }),
    ]);
    expect(pins[0]!.id).toBe("shortcodes/AAAA/scanEvents/event-default");
    expect(pins[0]!.styleClass).toBe("pin-new");
    expect(pins[1]!.styleClass).toBe("pin");
  });

  it("labels with the resolved word and city, falling back to the code", () => {
    const pins = buildScanMapPins(
      [ev({ code: "WOYG", lat: 41.85, lng: -87.65, city: "Chicago" })],
      (code) => (code === "WOYG" ? "BOOK" : undefined)
    );
    expect(pins[0]!.label).toBe("BOOK · Chicago");

    const noWord = buildScanMapPins([
      ev({ code: "ZXFV", lat: 51.5, lng: -0.12, city: "London" }),
    ]);
    expect(noWord[0]!.label).toBe("ZXFV · London");
  });

  it("excludes everything when no event carries a located city", () => {
    const pins = buildScanMapPins([ev({ code: "XHJP" }), ev({ code: "AAAA" })]);
    expect(pins).toHaveLength(0);
  });

  it("uses the exact Firestore event id when code and timestamp collide", () => {
    const pins = buildScanMapPins([
      ev({
        id: "shortcodes/WOYG/scanEvents/first",
        code: "WOYG",
        lat: 41.85,
        lng: -87.65,
        city: "Chicago",
      }),
      ev({
        id: "shortcodes/WOYG/scanEvents/second",
        code: "WOYG",
        lat: 41.86,
        lng: -87.66,
        city: "Chicago",
      }),
    ]);

    expect(pins.map((pin) => pin.id)).toEqual([
      "shortcodes/WOYG/scanEvents/first",
      "shortcodes/WOYG/scanEvents/second",
    ]);
  });
});

describe("scan activity view transforms", () => {
  const cards = new Map<string, Pick<CodeEntry, "ownerId" | "word">>([
    ["MINE", { ownerId: "owner-1", word: "BOOK" }],
    ["THEIRS", { ownerId: "owner-2", word: "CAKE" }],
  ]);

  const events = [
    ev({
      id: "shortcodes/MINE/scanEvents/no-city",
      code: "MINE",
      city: null,
      country: "US",
    }),
    ev({
      id: "shortcodes/MINE/scanEvents/chicago",
      code: "MINE",
      city: "Chicago",
      country: "US",
      lat: 41.85,
      lng: -87.65,
    }),
    ev({
      id: "shortcodes/THEIRS/scanEvents/london",
      code: "THEIRS",
      city: "London",
      country: "GB",
      lat: 51.5,
      lng: -0.12,
    }),
  ];

  it("keeps city-less events in the feed while map pins stay real", () => {
    const visible = filterScanEvents(events, cards, {
      scope: "all",
      currentUserId: "owner-1",
      search: "",
      city: null,
    });

    expect(visible.map((event) => event.id)).toContain(
      "shortcodes/MINE/scanEvents/no-city"
    );
    expect(buildScanMapPins(visible)).toHaveLength(2);
  });

  it("applies ownership, search, and exact-city filters to visible events", () => {
    const mine = filterScanEvents(events, cards, {
      scope: "mine",
      currentUserId: "owner-1",
      search: "book",
      city: null,
    });
    expect(mine.map((event) => event.code)).toEqual(["MINE", "MINE"]);

    const chicago = filterScanEvents(events, cards, {
      scope: "all",
      currentUserId: "owner-1",
      search: "",
      city: "CHICAGO",
    });
    expect(chicago.map((event) => event.id)).toEqual([
      "shortcodes/MINE/scanEvents/chicago",
    ]);
  });

  it("summarizes the visible slice without presenting it as a lifetime total", () => {
    const visible = events.slice(0, 2);
    expect(summarizeScanActivity(events, visible)).toEqual({
      windowCount: 3,
      visibleCount: 2,
      locatedCount: 1,
      unlocatedCount: 1,
      cityCount: 1,
      cardCount: 1,
      isFullWindow: false,
    });
  });

  it("labels a complete 100-event query window as capped", () => {
    const window = Array.from({ length: 100 }, (_, index) =>
      ev({ id: `shortcodes/MINE/scanEvents/${index}`, code: "MINE" })
    );
    expect(summarizeScanActivity(window, window).isFullWindow).toBe(true);
  });
});

describe("scan activity state", () => {
  it("restores literal blue/red prop metadata from historical cards", async () => {
    let pushEvents: (events: ScanEventRow[]) => void = () => {};
    const state = createScanActivityState({
      data: {
        watchRecentEvents: vi.fn(async (onEvents) => {
          pushEvents = onEvents;
          return vi.fn();
        }),
        loadCards: vi.fn(async () => [
          {
            code: "LEGACY-PROPS",
            data: {
              encoded: "encoded",
              bluePropType: "poi",
              redPropType: "fan",
            },
          },
        ]),
        loadAuthor: vi.fn(async () => ({ displayName: "Unknown" })),
      },
      decodeSequence: decoder(),
    });

    await state.connect("owner-1", true);
    pushEvents([ev({ code: "LEGACY-PROPS" })]);
    await vi.waitFor(() => expect(state.codes).toHaveLength(1));

    expect(state.codes[0]).toMatchObject({
      leftPropType: PropType.POI,
      rightPropType: PropType.FAN,
    });
    state.disconnect();
  });

  it("builds previews from embedded sequence data when legacy cards have no encoded blob", async () => {
    let pushEvents: (events: ScanEventRow[]) => void = () => {};
    const decodeSequence = decoder();
    const state = createScanActivityState({
      data: {
        watchRecentEvents: vi.fn(async (onEvents) => {
          pushEvents = onEvents;
          return vi.fn();
        }),
        loadCards: vi.fn(async () => [
          {
            code: "LEGACY",
            data: {
              ownerId: "owner-1",
              sequence: "BOOK",
              scanCount: 4,
              sequenceData: {
                startPlacement: {
                  id: "embedded-start",
                  gridPlacement: "alpha1",
                  isStartPlacement: true,
                  motions: {
                    left: {
                      color: "blue",
                      motionType: "static",
                      rotationDirection: "noRotation",
                      startLocation: "s",
                      endLocation: "s",
                      turns: 0,
                      startOrientation: "in",
                      endOrientation: "in",
                    },
                    right: {
                      color: "red",
                      motionType: "static",
                      rotationDirection: "noRotation",
                      startLocation: "n",
                      endLocation: "n",
                      turns: 0,
                      startOrientation: "in",
                      endOrientation: "in",
                    },
                  },
                },
                steps: [
                  {
                    id: "embedded-step",
                    beat: 0,
                    letter: "A",
                    startPlacement: "alpha1",
                    endPlacement: "beta1",
                    motions: {
                      left: {
                        color: "blue",
                        motionType: "pro",
                        rotationDirection: "cw",
                        startLocation: "s",
                        endLocation: "e",
                        turns: 1,
                        startOrientation: "in",
                        endOrientation: "out",
                      },
                      right: {
                        color: "red",
                        motionType: "dash",
                        rotationDirection: "noRotation",
                        startLocation: "s",
                        endLocation: "n",
                        turns: 0,
                        startOrientation: "in",
                        endOrientation: "in",
                      },
                    },
                  },
                ],
              },
            },
          },
        ]),
        loadAuthor: vi.fn(async () => ({ displayName: "Austen" })),
      },
      decodeSequence,
    });
    const event = ev({
      id: "shortcodes/LEGACY/scanEvents/event",
      code: "LEGACY",
    });

    await state.connect("owner-1", true);
    pushEvents([event]);
    await vi.waitFor(() => expect(state.codes).toHaveLength(1));

    expect(state.codes[0]).toMatchObject({
      code: "LEGACY",
      word: "A",
      metadataAvailable: true,
      integrityOk: true,
      decoded: {
        id: "LEGACY",
        name: "A",
        word: "A",
        ownerId: "owner-1",
        startPlacement: {
          id: "embedded-start",
          gridPlacement: "alpha1",
        },
        steps: [{ id: "embedded-step", stepNumber: 1 }],
      },
    });

    const decoded = state.codes[0]?.decoded;
    expect(decoded?.steps[0]?.motions.left).toMatchObject({
      propType: "staff",
      hand: "left",
    });
    expect(decoded?.steps[0]?.motions.left.arrowPlacementData).toBeDefined();
    expect(decoded?.steps[0]?.motions.left.propPlacementData).toBeDefined();
    expect(decoded?.steps[0]?.motions.right.arrowPlacementData).toBeDefined();
    expect(decoded?.steps[0]?.motions.right.propPlacementData).toBeDefined();
    expect(
      decoded?.startPlacement?.motions.left.propPlacementData
    ).toBeDefined();
    expect(
      decoded?.startPlacement?.motions.right.propPlacementData
    ).toBeDefined();
    expect(sequenceForScanPreview(state.codes[0] ?? null)?.id).toBe(
      "scan-activity-embedded-v1-LEGACY"
    );

    state.selectEvent(event.id);
    expect(decodeSequence).not.toHaveBeenCalled();
    state.disconnect();
  });

  it("does not claim an empty embedded payload can render a preview", async () => {
    let pushEvents: (events: ScanEventRow[]) => void = () => {};
    const state = createScanActivityState({
      data: {
        watchRecentEvents: vi.fn(async (onEvents) => {
          pushEvents = onEvents;
          return vi.fn();
        }),
        loadCards: vi.fn(async () => [
          {
            code: "EMPTY",
            data: {
              sequence: "EMPTY",
              sequenceData: { steps: [] },
            },
          },
        ]),
        loadAuthor: vi.fn(async () => ({ displayName: "Unknown" })),
      },
      decodeSequence: decoder(),
    });

    await state.connect("owner-1", true);
    pushEvents([
      ev({ id: "shortcodes/EMPTY/scanEvents/event", code: "EMPTY" }),
    ]);
    await vi.waitFor(() => expect(state.codes).toHaveLength(1));

    expect(state.codes[0]).toMatchObject({
      metadataAvailable: true,
      integrityOk: false,
      decoded: null,
    });
    state.disconnect();
  });

  it("publishes the first event window before card metadata finishes", async () => {
    let pushEvents: (events: ScanEventRow[]) => void = () => {};
    let resolveCards: (cards: ScanActivityCardDocument[]) => void = () => {};
    const loadCards = vi.fn(
      () =>
        new Promise<ScanActivityCardDocument[]>((resolve) => {
          resolveCards = resolve;
        })
    );
    const watcher: IScanActivityWatcher = {
      watchRecentEvents: vi.fn(async (onEvents) => {
        pushEvents = onEvents;
        return vi.fn();
      }),
      loadCards,
      loadAuthor: vi.fn(async () => ({ displayName: "Austen" })),
    };
    const state = createScanActivityState({
      data: watcher,
      decodeSequence: decoder(),
    });

    await state.connect("owner-1", true);
    pushEvents([
      ev({
        id: "shortcodes/WOYG/scanEvents/live",
        code: "WOYG",
        city: "Chicago",
        lat: 41.85,
        lng: -87.65,
      }),
    ]);

    expect(state.status).toBe("live");
    expect(state.loading).toBe(false);
    expect(state.recentEvents).toHaveLength(1);
    expect(loadCards).toHaveBeenCalledWith(["WOYG"]);

    resolveCards([]);
    await Promise.resolve();
    state.disconnect();
  });

  it("selects an exact repeated-code event and keeps filters local", async () => {
    let pushEvents: (events: ScanEventRow[]) => void = () => {};
    const watchRecentEvents = vi.fn(async (onEvents) => {
      pushEvents = onEvents;
      return vi.fn();
    });
    const loadCards = vi.fn(async () => [
      {
        code: "WOYG",
        data: {
          ownerId: "owner-1",
          sequenceName: "BOOK",
          scanCount: 2,
        },
      },
    ]);
    const watcher: IScanActivityWatcher = {
      watchRecentEvents,
      loadCards,
      loadAuthor: vi.fn(async () => ({ displayName: "Austen" })),
    };
    const state = createScanActivityState({
      data: watcher,
      decodeSequence: decoder(),
    });
    const first = ev({
      id: "shortcodes/WOYG/scanEvents/first",
      code: "WOYG",
      city: "London",
      lat: 51.5,
      lng: -0.12,
    });
    const second = ev({
      id: "shortcodes/WOYG/scanEvents/second",
      code: "WOYG",
      city: "Chicago",
      lat: 41.85,
      lng: -87.65,
    });

    await state.connect("owner-1", true);
    pushEvents([first, second]);
    await vi.waitFor(() => expect(state.codes).toHaveLength(1));

    state.selectEvent(second.id);
    state.setScope("mine");
    state.setSearch("book");
    state.filterToCity("Chicago");

    expect(state.selectedEvent).toEqual(second);
    expect(state.visibleEvents.map((event) => event.id)).toEqual([second.id]);
    expect(watchRecentEvents).toHaveBeenCalledTimes(1);
    expect(loadCards).toHaveBeenCalledTimes(1);
    state.disconnect();
  });

  it("loads a pre-connect selection outside the event window after the listener is installed", async () => {
    let pushEvents: (events: ScanEventRow[]) => void = () => {};
    let finishSubscription: () => void = () => {};
    const callOrder: string[] = [];
    const watchRecentEvents = vi.fn(
      (onEvents: (events: ScanEventRow[]) => void) => {
        pushEvents = onEvents;
        callOrder.push("watch");
        return new Promise<() => void>((resolve) => {
          finishSubscription = () => resolve(vi.fn());
        });
      }
    );
    const loadCards = vi.fn(async (codes: string[]) => {
      callOrder.push(`cards:${codes.join(",")}`);
      if (codes.includes("OUTSIDE")) return [];
      return codes.map((code) => ({
        code,
        data: { sequenceName: code, scanCount: 100 },
      }));
    });
    const state = createScanActivityState({
      data: {
        watchRecentEvents,
        loadCards,
        loadAuthor: vi.fn(async () => ({ displayName: "Unknown" })),
      },
      decodeSequence: decoder(),
    });

    state.selectCode("OUTSIDE");
    const connection = state.connect("owner-1", true);
    expect(watchRecentEvents).toHaveBeenCalledTimes(1);
    expect(loadCards).not.toHaveBeenCalled();

    finishSubscription();
    await connection;
    await vi.waitFor(() => expect(state.selectedCard).not.toBeNull());

    const eventWindow = Array.from({ length: 100 }, (_, index) =>
      ev({
        id: `shortcodes/INSIDE/scanEvents/${index}`,
        code: "INSIDE",
      })
    );
    pushEvents(eventWindow);
    await vi.waitFor(() => expect(state.summary.windowCount).toBe(100));

    const selectedLoads = loadCards.mock.calls.filter(([codes]) =>
      codes.includes("OUTSIDE")
    );
    expect(selectedLoads).toHaveLength(1);
    expect(selectedLoads[0]![0]).toEqual(["OUTSIDE"]);
    expect(callOrder[0]).toBe("watch");
    expect(state.selectedCard).toMatchObject({
      code: "OUTSIDE",
      metadataAvailable: false,
    });
    state.disconnect();
  });

  it("keeps an outside-window selected-card failure available to retry", async () => {
    let pushEvents: (events: ScanEventRow[]) => void = () => {};
    let selectedAttempts = 0;
    const loadCards = vi.fn(
      async (codes: string[]): Promise<ScanActivityCardDocument[]> => {
        if (codes.includes("OUTSIDE")) {
          selectedAttempts += 1;
          if (selectedAttempts === 1) throw new Error("selected card offline");
        }
        return codes.map((code) => ({
          code,
          data: { sequenceName: code, scanCount: 7 },
        }));
      }
    );
    const state = createScanActivityState({
      data: {
        watchRecentEvents: vi.fn(async (onEvents) => {
          pushEvents = onEvents;
          return vi.fn();
        }),
        loadCards,
        loadAuthor: vi.fn(async () => ({ displayName: "Unknown" })),
      },
      decodeSequence: decoder(),
    });

    state.selectCode("OUTSIDE");
    await state.connect("owner-1", true);
    await vi.waitFor(() =>
      expect(state.detailsError).toBe("selected card offline")
    );

    pushEvents([
      ev({ id: "shortcodes/INSIDE/scanEvents/inside", code: "INSIDE" }),
    ]);
    await vi.waitFor(() =>
      expect(state.codes.some((entry) => entry.code === "INSIDE")).toBe(true)
    );
    expect(state.detailsError).toBe("selected card offline");

    state.retryDetails();
    await vi.waitFor(() =>
      expect(state.selectedCard).toMatchObject({
        code: "OUTSIDE",
        metadataAvailable: true,
        scanCount: 7,
      })
    );
    expect(state.detailsError).toBeNull();
    expect(
      loadCards.mock.calls.filter(([codes]) => codes.includes("OUTSIDE"))
    ).toHaveLength(2);
    state.disconnect();
  });

  it("does not re-read card metadata for an identical follow-up snapshot", async () => {
    let pushEvents: (events: ScanEventRow[]) => void = () => {};
    const loadCards = vi.fn(async (codes: string[]) =>
      codes.map((code) => ({
        code,
        data: { sequenceName: code, scanCount: 1 },
      }))
    );
    const state = createScanActivityState({
      data: {
        watchRecentEvents: vi.fn(async (onEvents) => {
          pushEvents = onEvents;
          return vi.fn();
        }),
        loadCards,
        loadAuthor: vi.fn(async () => ({ displayName: "Unknown" })),
      },
      decodeSequence: decoder(),
    });
    const window = [
      ev({ id: "shortcodes/AAAA/scanEvents/a1", code: "AAAA" }),
      ev({ id: "shortcodes/BBBB/scanEvents/b1", code: "BBBB" }),
    ];

    await state.connect("owner-1", true);
    pushEvents(window);
    await vi.waitFor(() => expect(state.codes).toHaveLength(2));
    pushEvents(window);
    await Promise.resolve();

    expect(loadCards).toHaveBeenCalledTimes(1);
    expect(loadCards).toHaveBeenCalledWith(["AAAA", "BBBB"]);
    state.disconnect();
  });

  it("refreshes only the code attached to a newly observed event", async () => {
    let pushEvents: (events: ScanEventRow[]) => void = () => {};
    let request = 0;
    const loadCards = vi.fn(async (codes: string[]) => {
      request += 1;
      return codes.map((code) => ({
        code,
        data: {
          sequenceName: code,
          scanCount: code === "AAAA" ? request : 1,
        },
      }));
    });
    const state = createScanActivityState({
      data: {
        watchRecentEvents: vi.fn(async (onEvents) => {
          pushEvents = onEvents;
          return vi.fn();
        }),
        loadCards,
        loadAuthor: vi.fn(async () => ({ displayName: "Unknown" })),
      },
      decodeSequence: decoder(),
    });
    const firstWindow = [
      ev({ id: "shortcodes/AAAA/scanEvents/a1", code: "AAAA" }),
      ev({ id: "shortcodes/BBBB/scanEvents/b1", code: "BBBB" }),
    ];

    await state.connect("owner-1", true);
    pushEvents(firstWindow);
    await vi.waitFor(() => expect(state.codes).toHaveLength(2));
    pushEvents([
      ev({ id: "shortcodes/AAAA/scanEvents/a2", code: "AAAA" }),
      ...firstWindow,
    ]);
    await vi.waitFor(() => expect(loadCards).toHaveBeenCalledTimes(2));

    expect(loadCards.mock.calls[1]![0]).toEqual(["AAAA"]);
    await vi.waitFor(() =>
      expect(
        state.codes.find((entry) => entry.code === "AAAA")?.scanCount
      ).toBe(2)
    );
    state.disconnect();
  });

  it("queues one metadata refresh when a new scan lands during the initial read", async () => {
    let pushEvents: (events: ScanEventRow[]) => void = () => {};
    let resolveInitial: (cards: ScanActivityCardDocument[]) => void = () => {};
    let requestCount = 0;
    const loadCards = vi.fn((codes: string[]) => {
      requestCount += 1;
      if (requestCount === 1) {
        return new Promise<ScanActivityCardDocument[]>((resolve) => {
          resolveInitial = resolve;
        });
      }
      return Promise.resolve(
        codes.map((code) => ({
          code,
          data: { sequenceName: code, scanCount: 2 },
        }))
      );
    });
    const state = createScanActivityState({
      data: {
        watchRecentEvents: vi.fn(async (onEvents) => {
          pushEvents = onEvents;
          return vi.fn();
        }),
        loadCards,
        loadAuthor: vi.fn(async () => ({ displayName: "Unknown" })),
      },
      decodeSequence: decoder(),
    });
    const initialEvent = ev({
      id: "shortcodes/AAAA/scanEvents/a1",
      code: "AAAA",
    });

    await state.connect("owner-1", true);
    pushEvents([initialEvent]);
    expect(loadCards).toHaveBeenCalledTimes(1);

    pushEvents([
      ev({ id: "shortcodes/AAAA/scanEvents/a2", code: "AAAA" }),
      initialEvent,
    ]);
    await Promise.resolve();
    expect(loadCards).toHaveBeenCalledTimes(1);

    resolveInitial([
      {
        code: "AAAA",
        data: { sequenceName: "AAAA", scanCount: 1 },
      },
    ]);
    await vi.waitFor(() => expect(loadCards).toHaveBeenCalledTimes(2));
    expect(loadCards.mock.calls[1]![0]).toEqual(["AAAA"]);
    await vi.waitFor(() =>
      expect(
        state.codes.find((entry) => entry.code === "AAAA")?.scanCount
      ).toBe(2)
    );
    expect(loadCards).toHaveBeenCalledTimes(2);
    state.disconnect();
  });

  it("publishes a terminal unavailable entry when a shortcode document is absent", async () => {
    let pushEvents: (events: ScanEventRow[]) => void = () => {};
    const loadCards = vi.fn(async () => []);
    const state = createScanActivityState({
      data: {
        watchRecentEvents: vi.fn(async (onEvents) => {
          pushEvents = onEvents;
          return vi.fn();
        }),
        loadCards,
        loadAuthor: vi.fn(async () => ({ displayName: "Unknown" })),
      },
      decodeSequence: decoder(),
    });
    const event = ev({
      id: "shortcodes/MISSING/scanEvents/event",
      code: "MISSING",
    });

    await state.connect("owner-1", true);
    pushEvents([event]);
    await vi.waitFor(() => expect(state.codes).toHaveLength(1));

    expect(state.codes[0]).toMatchObject({
      code: "MISSING",
      metadataAvailable: false,
      integrityOk: false,
    });
    pushEvents([event]);
    await Promise.resolve();
    expect(loadCards).toHaveBeenCalledTimes(1);
    state.disconnect();
  });

  it("retries rejected metadata without restarting the activity listener", async () => {
    let pushEvents: (events: ScanEventRow[]) => void = () => {};
    let attempt = 0;
    const watchRecentEvents = vi.fn(async (onEvents) => {
      pushEvents = onEvents;
      return vi.fn();
    });
    const loadCards = vi.fn(
      async (codes: string[]): Promise<ScanActivityCardDocument[]> => {
        attempt += 1;
        if (attempt === 1) throw new Error("metadata offline");
        return codes.map((code) => ({
          code,
          data: { sequenceName: "BOOK", scanCount: 4 },
        }));
      }
    );
    const state = createScanActivityState({
      data: {
        watchRecentEvents,
        loadCards,
        loadAuthor: vi.fn(async () => ({ displayName: "Unknown" })),
      },
      decodeSequence: decoder(),
    });

    await state.connect("owner-1", true);
    pushEvents([ev({ id: "shortcodes/WOYG/scanEvents/event", code: "WOYG" })]);
    await vi.waitFor(() => expect(state.detailsError).toBe("metadata offline"));
    state.retryDetails();
    await vi.waitFor(() => expect(state.detailsError).toBeNull());

    expect(loadCards).toHaveBeenCalledTimes(2);
    expect(watchRecentEvents).toHaveBeenCalledTimes(1);
    expect(state.codes[0]).toMatchObject({
      code: "WOYG",
      metadataAvailable: true,
      scanCount: 4,
    });
    state.disconnect();
  });

  it("does not decode a card until its event is selected", async () => {
    let pushEvents: (events: ScanEventRow[]) => void = () => {};
    const decodeSequence = decoder();
    const state = createScanActivityState({
      data: {
        watchRecentEvents: vi.fn(async (onEvents) => {
          pushEvents = onEvents;
          return vi.fn();
        }),
        loadCards: vi.fn(async () => [
          {
            code: "WOYG",
            data: {
              encoded: "encoded-card",
              sequenceName: "BOOK",
              scanCount: 1,
              sequenceData: { steps: [{ id: "embedded-fallback" }] },
            },
          },
        ]),
        loadAuthor: vi.fn(async () => ({ displayName: "Unknown" })),
      },
      decodeSequence,
    });
    const event = ev({
      id: "shortcodes/WOYG/scanEvents/event",
      code: "WOYG",
    });

    await state.connect("owner-1", true);
    pushEvents([event]);
    await vi.waitFor(() => expect(state.codes).toHaveLength(1));
    expect(decodeSequence).not.toHaveBeenCalled();
    expect(state.codes[0]?.decoded).toBeNull();

    state.selectEvent(event.id);
    await vi.waitFor(() => expect(decodeSequence).toHaveBeenCalledTimes(1));
    expect(decodeSequence).toHaveBeenCalledWith("encoded-card");
    expect(sequenceForScanPreview(state.codes[0] ?? null)).toBe(
      state.codes[0]?.decoded
    );
    state.disconnect();
  });

  it("hydrates decoded shortcode motions before rendering their scanned props", async () => {
    let pushEvents: (events: ScanEventRow[]) => void = () => {};
    const decodeSequence = vi.fn(
      async () =>
        ({
          id: "decoded-prop-card",
          word: "PROP",
          steps: [
            {
              id: "decoded-step",
              stepNumber: 1,
              duration: 1,
              motions: {
                left: {
                  color: "blue",
                  motionType: "static",
                  rotationDirection: "noRotation",
                  startLocation: "s",
                  endLocation: "s",
                  turns: 0,
                  startOrientation: "in",
                  endOrientation: "in",
                  propType: PropType.POI,
                },
                right: {
                  color: "red",
                  motionType: "static",
                  rotationDirection: "noRotation",
                  startLocation: "n",
                  endLocation: "n",
                  turns: 0,
                  startOrientation: "in",
                  endOrientation: "in",
                  propType: PropType.FAN,
                },
              },
            },
          ],
        }) as unknown as SequenceData
    );
    const state = createScanActivityState({
      data: {
        watchRecentEvents: vi.fn(async (onEvents) => {
          pushEvents = onEvents;
          return vi.fn();
        }),
        loadCards: vi.fn(async () => [
          { code: "PROP", data: { encoded: "encoded-prop-card" } },
        ]),
        loadAuthor: vi.fn(async () => ({ displayName: "Unknown" })),
      },
      decodeSequence,
    });
    const event = ev({
      id: "shortcodes/PROP/scanEvents/event",
      code: "PROP",
    });

    await state.connect("owner-1", true);
    pushEvents([event]);
    await vi.waitFor(() => expect(state.codes).toHaveLength(1));
    state.selectEvent(event.id);
    await vi.waitFor(() => expect(state.codes[0]?.decoding).toBe(false));

    const decoded = state.codes[0]?.decoded;
    expect(decoded?.steps[0]?.motions.left.propType).toBe(PropType.POI);
    expect(decoded?.steps[0]?.motions.right.propType).toBe(PropType.FAN);
    expect(decoded?.steps[0]?.motions.left.propPlacementData).toBeDefined();
    expect(decoded?.steps[0]?.motions.right.propPlacementData).toBeDefined();
    expect(scanPropConfigForPreview(state.codes[0] ?? null, event)).toEqual({
      leftPropType: PropType.POI,
      rightPropType: PropType.FAN,
      catDogMode: true,
    });
    state.disconnect();
  });

  it("uses embedded sequence data when the preferred encoded payload cannot decode", async () => {
    let pushEvents: (events: ScanEventRow[]) => void = () => {};
    const decodeSequence = vi.fn(async () => {
      throw new Error("Invalid motion encoding: soweiou0aS");
    });
    const state = createScanActivityState({
      data: {
        watchRecentEvents: vi.fn(async (onEvents) => {
          pushEvents = onEvents;
          return vi.fn();
        }),
        loadCards: vi.fn(async () => [
          {
            code: "0017",
            data: {
              encoded: "s~q1:broken-legacy-payload",
              sequenceName: "UΛZ-Δ-",
              sequenceData: {
                word: "UΛZ-Δ-",
                steps: [{ id: "embedded-fallback-step" }],
              },
            },
          },
        ]),
        loadAuthor: vi.fn(async () => ({ displayName: "Unknown" })),
      },
      decodeSequence,
    });
    const event = ev({
      id: "shortcodes/0017/scanEvents/event",
      code: "0017",
    });

    await state.connect("owner-1", true);
    pushEvents([event]);
    await vi.waitFor(() => expect(state.codes).toHaveLength(1));
    expect(state.codes[0]?.decoded).toBeNull();

    state.selectEvent(event.id);
    await vi.waitFor(() => expect(state.codes[0]?.decoding).toBe(false));

    expect(decodeSequence).toHaveBeenCalledWith("s~q1:broken-legacy-payload");
    expect(state.codes[0]).toMatchObject({
      code: "0017",
      integrityOk: true,
      integrityReason: undefined,
      previewSource: "embedded",
      decoded: {
        id: "0017",
        word: "UΛZ-Δ-",
        steps: [{ id: "embedded-fallback-step" }],
      },
    });
    expect(sequenceForScanPreview(state.codes[0] ?? null)?.id).toBe(
      "scan-activity-embedded-v1-0017"
    );
    state.disconnect();
  });

  it("ignores metadata that resolves after disconnect", async () => {
    let pushEvents: (events: ScanEventRow[]) => void = () => {};
    let resolveCards: (cards: ScanActivityCardDocument[]) => void = () => {};
    const state = createScanActivityState({
      data: {
        watchRecentEvents: vi.fn(async (onEvents) => {
          pushEvents = onEvents;
          return vi.fn();
        }),
        loadCards: vi.fn(
          () =>
            new Promise<ScanActivityCardDocument[]>((resolve) => {
              resolveCards = resolve;
            })
        ),
        loadAuthor: vi.fn(async () => ({ displayName: "Unknown" })),
      },
      decodeSequence: decoder(),
    });

    await state.connect("owner-1", true);
    pushEvents([ev({ id: "shortcodes/WOYG/scanEvents/event", code: "WOYG" })]);
    state.disconnect();
    resolveCards([
      {
        code: "WOYG",
        data: { sequenceName: "BOOK", scanCount: 1 },
      },
    ]);
    await Promise.resolve();
    await Promise.resolve();

    expect(state.codes).toHaveLength(0);
  });
});

describe("ScanActivityWatcher", () => {
  it("publishes the prop configuration stored on each scan event", async () => {
    const receiveEvents = vi.fn();
    vi.mocked(onSnapshot).mockImplementationOnce(((...args: unknown[]) => {
      const onNext = args[1] as (snapshot: unknown) => void;
      onNext({
        docs: [
          {
            ref: { path: "shortcodes/PROP/scanEvents/event-1" },
            data: () => ({
              timestamp: "2026-07-20T12:00:00.000Z",
              leftPropType: "P",
              rightPropType: "fan",
              catDogMode: true,
            }),
          },
        ],
      });
      return vi.fn();
    }) as never);

    const watcher = new ScanActivityWatcher();
    await watcher.watchRecentEvents(receiveEvents, vi.fn());

    expect(receiveEvents).toHaveBeenCalledWith([
      expect.objectContaining({
        code: "PROP",
        leftPropType: PropType.POI,
        rightPropType: PropType.FAN,
        catDogMode: true,
      }),
    ]);
  });

  it("loads shortcode documents in document-id batches of at most 30", async () => {
    vi.mocked(getDocs).mockResolvedValue({ docs: [] } as never);
    const watcher = new ScanActivityWatcher();
    const codes = Array.from({ length: 61 }, (_, index) => `CODE${index}`);

    await watcher.loadCards(codes);

    const batches = vi
      .mocked(where)
      .mock.calls.map((call) => call[2] as string[]);
    expect(batches.map((batch) => batch.length)).toEqual([30, 30, 1]);
    expect(batches.flat()).toEqual(codes);
  });
});

describe("GlobalUserMap scan marker contract", () => {
  const source = readFileSync(
    resolve(
      process.cwd(),
      "src/lib/features/community/components/GlobalUserMap.svelte"
    ),
    "utf8"
  );

  it("uses gmp-click listeners on clickable markers", () => {
    // The weekly channel logs a deprecation warning for every addListener
    // call on an AdvancedMarkerElement. gmp-click only fires when the marker
    // is gmpClickable, so both flags below are load-bearing.
    expect(source.match(/marker\.addEventListener\("gmp-click"/g)).toHaveLength(
      2
    );
    expect(source).not.toContain('marker.addListener("click"');
    expect(source).toContain("gmpClickable: true");
    expect(source).toContain("gmpClickable: Boolean(onScanMarkerClick)");
  });

  it("reconciles stable marker handles outside effect tracking", () => {
    expect(source).toContain('import { onMount, untrack } from "svelte"');
    expect(source).toContain("const userMarkerHandles = new Map");
    expect(source).toContain("const scanMarkerHandles = new Map");
    expect(source).toMatch(
      /untrack\(\(\) => \{\s*try \{\s*createMarkers\(incoming\)/s
    );
    expect(source).toMatch(
      /untrack\(\(\) => \{\s*try \{\s*createScanMarkers\(incoming\)/s
    );
  });

  it("clusters both map layers without replacing marker objects", () => {
    expect(source).toContain(
      'import { MarkerClusterer } from "@googlemaps/markerclusterer"'
    );
    expect(source).toContain("current.clearMarkers(true)");
    expect(source).toContain("current.addMarkers(currentMarkers)");
    expect(source).not.toContain("injectedScanMarkers = []");
  });

  it("gives scan marker interactions a full touch target", () => {
    expect(source).toContain("width: var(--min-touch-target, 44px)");
    expect(source).toContain("height: var(--min-touch-target, 44px)");
  });

  it("announces the selected scan through the marker title", () => {
    expect(source).toContain("Selected scan: ${label}");
    expect(source).toContain("scanMarkerTitle(scan)");
  });
});
