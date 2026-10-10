import { describe, it, expect } from "vitest";
import { PovTrailRing, type PovTrailSnapshot } from "#lib/shared/3d/effects/poi/pov-trail-ring.js";

describe("PovTrailRing", () => {
  it("starts empty", () => {
    const ring = new PovTrailRing(200, 4);
    expect(ring.count).toBe(0);
    expect(ring.getSnapshots()).toEqual([]);
  });

  it("stores snapshots up to capacity", () => {
    const ring = new PovTrailRing(3, 4); // 3 LEDs, 4 snapshots
    ring.push(makeSnapshot(3, 1.0));
    ring.push(makeSnapshot(3, 2.0));
    ring.push(makeSnapshot(3, 3.0));
    ring.push(makeSnapshot(3, 4.0));

    expect(ring.count).toBe(4);
  });

  it("overwrites oldest when exceeding capacity", () => {
    const ring = new PovTrailRing(2, 3); // 2 LEDs, max 3 snapshots
    ring.push(makeSnapshot(2, 1.0));
    ring.push(makeSnapshot(2, 2.0));
    ring.push(makeSnapshot(2, 3.0));
    ring.push(makeSnapshot(2, 4.0)); // overwrites t=1.0

    expect(ring.count).toBe(3);
    const snaps = ring.getSnapshots();
    // Oldest surviving is t=2.0
    expect(snaps[0]!.timestamp).toBe(2.0);
    expect(snaps[2]!.timestamp).toBe(4.0);
  });

  it("clears all data", () => {
    const ring = new PovTrailRing(2, 3);
    ring.push(makeSnapshot(2, 1.0));
    ring.push(makeSnapshot(2, 2.0));
    ring.clear();
    expect(ring.count).toBe(0);
    expect(ring.getSnapshots()).toEqual([]);
  });

  it("getSnapshotsNewerThan filters by age", () => {
    const ring = new PovTrailRing(2, 10);
    ring.push(makeSnapshot(2, 1.0));
    ring.push(makeSnapshot(2, 2.0));
    ring.push(makeSnapshot(2, 3.0));
    ring.push(makeSnapshot(2, 4.0));

    const recent = ring.getSnapshotsNewerThan(2.5);
    expect(recent).toHaveLength(2);
    expect(recent[0]!.timestamp).toBe(3.0);
    expect(recent[1]!.timestamp).toBe(4.0);
  });
});

function makeSnapshot(ledCount: number, timestamp: number): PovTrailSnapshot {
  const positions = new Float32Array(ledCount * 3);
  const colors = new Uint8Array(ledCount * 3);
  // Fill positions with timestamp-based values for identification
  for (let i = 0; i < ledCount; i++) {
    positions[i * 3] = timestamp;
    colors[i * 3] = Math.round(timestamp * 10);
  }
  return { positions, colors, timestamp };
}
