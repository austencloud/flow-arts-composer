import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * One bad map record used to break the map for everyone: the profile join was
 * a Promise.all, so a single denied read rejected the whole set and the band
 * showed "Couldn't load the map". Each pin now stands alone, and the people
 * every other list leaves out (hidden, disabled, guests) are off the map too.
 */

const store = vi.hoisted(() => ({
  firestoreGet: vi.fn(),
  firestoreList: vi.fn(),
}));

vi.mock("#lib/shared/firestore/index.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  firestoreGet: store.firestoreGet,
  firestoreList: store.firestoreList,
  firestoreSet: vi.fn(),
  firestoreDelete: vi.fn(),
}));

import { getPublicLocations } from "#lib/features/community/services/user-location-repository.js";
import { createCachedLoad } from "#lib/features/community/services/public-locations-cache.js";

function pin(userId: string) {
  return {
    userId,
    city: "Chicago",
    country: "United States",
    countryCode: "US",
    cityCenterCoordinates: { lat: 41.88, lng: -87.63 },
    visibility: "public",
    updatedAt: new Date(),
  };
}

function profile(name: string, flags: Record<string, unknown> = {}) {
  return { username: name, displayName: name, sequenceCount: 1, ...flags };
}

describe("map pins", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("drops a pin whose profile read fails instead of failing the set", async () => {
    store.firestoreList.mockResolvedValue([pin("ok"), pin("denied"), pin("gone")]);
    store.firestoreGet.mockImplementation(async (_c: string, id: string) => {
      if (id === "denied") throw new Error("permission-denied");
      if (id === "gone") return null;
      return profile(id);
    });

    const pins = await getPublicLocations();

    expect(pins.map((p) => p.userId)).toEqual(["ok"]);
  });

  it("leaves hidden, disabled and guest people off the map", async () => {
    store.firestoreList.mockResolvedValue([
      pin("listed"),
      pin("hidden"),
      pin("disabled"),
      pin("guest"),
      pin("legacy-guest"),
    ]);
    const profiles: Record<string, unknown> = {
      listed: profile("listed"),
      hidden: profile("hidden", { isHidden: true }),
      disabled: profile("disabled", { isDisabled: true }),
      guest: profile("guest", { isAnonymous: true }),
      "legacy-guest": profile("x", { displayName: "Anonymous User" }),
    };
    store.firestoreGet.mockImplementation(
      async (_c: string, id: string) => profiles[id] ?? null
    );

    const pins = await getPublicLocations();

    expect(pins.map((p) => p.userId)).toEqual(["listed"]);
  });

  it("still reports a failed location list, so the retry shows", async () => {
    store.firestoreList.mockRejectedValue(new Error("unavailable"));

    await expect(getPublicLocations()).rejects.toThrow(
      "Failed to load community locations"
    );
  });
});

describe("pins are read once per page load", () => {
  it("returns the same read to a second mount", async () => {
    const load = vi.fn().mockResolvedValue(["pin"]);
    const cache = createCachedLoad(load);

    await cache.get();
    await cache.get();

    expect(load).toHaveBeenCalledTimes(1);
  });

  it("reads again after a city change", async () => {
    const load = vi.fn().mockResolvedValue(["pin"]);
    const cache = createCachedLoad(load);

    await cache.get();
    cache.invalidate();
    await cache.get();

    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does not keep a failed read, so Try again reads again", async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(["pin"]);
    const cache = createCachedLoad(load);

    await expect(cache.get()).rejects.toThrow("offline");
    await expect(cache.get()).resolves.toEqual(["pin"]);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
