import { describe, it, expect } from "vitest";
import {
  isGallerySyncStale,
  GALLERY_SYNC_TTL_MS,
} from "#lib/features/browse/shared/services/gallery-sync-staleness.js";

describe("isGallerySyncStale", () => {
  const now = 1_700_000_000_000;

  it("is stale when never synced (null)", () => {
    expect(isGallerySyncStale(null, now)).toBe(true);
  });

  it("is fresh when synced within the TTL", () => {
    expect(isGallerySyncStale(now - 60_000, now)).toBe(false); // 1 min ago
  });

  it("is stale when synced past the TTL", () => {
    expect(isGallerySyncStale(now - (GALLERY_SYNC_TTL_MS + 1), now)).toBe(true);
  });

  it("is stale exactly at the TTL boundary (>=)", () => {
    expect(isGallerySyncStale(now - GALLERY_SYNC_TTL_MS, now)).toBe(true);
  });

  it("honors a custom ttl argument", () => {
    expect(isGallerySyncStale(now - 5_000, now, 10_000)).toBe(false);
    expect(isGallerySyncStale(now - 5_000, now, 4_000)).toBe(true);
  });

  it("exposes a 15-minute default TTL", () => {
    expect(GALLERY_SYNC_TTL_MS).toBe(15 * 60 * 1000);
  });
});
