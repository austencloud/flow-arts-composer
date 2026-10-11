import { describe, expect, it } from "vitest";
import { dealByOwner } from "#lib/features/browse/gallery-home/pick-representatives.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

function sequence(
  id: string,
  ownerId: string | undefined,
  word: string,
  patch: Partial<SequenceData> = {},
): SequenceData {
  return {
    id,
    name: word,
    word,
    steps: [],
    thumbnails: [],
    isFavorite: false,
    isCircular: false,
    tags: [],
    metadata: {},
    ownerId,
    ...patch,
  };
}

/** Builds `count` sequences for one owner, newest first by index (index 0 is
 * newest - `dateAdded` descends by one day per index) so tests can assert on
 * simple index-based expectations. */
function ownerPieces(
  ownerId: string,
  count: number,
  { wordPrefix = ownerId, startDay = 0 }: { wordPrefix?: string; startDay?: number } = {},
): SequenceData[] {
  return Array.from({ length: count }, (_, i) =>
    sequence(`${ownerId}-${i}`, ownerId, `${wordPrefix}${i}`, {
      dateAdded: new Date(2026, 0, startDay - i + 1),
    }),
  );
}

describe("dealByOwner", () => {
  it("caps every owner at perOwner and returns exactly limit for the real production distribution", () => {
    // Verified production shape: publicSequences has 8 owners with per-owner
    // counts 431, 11, 8, 6, 6, 3, 1, 1 (467 docs total).
    const counts = [431, 11, 8, 6, 6, 3, 1, 1];
    const pool = counts.flatMap((count, i) =>
      ownerPieces(`owner-${i}`, count, { wordPrefix: `A${i}_` }),
    );

    const dealt = dealByOwner(pool, { perOwner: 4, limit: 25 });

    expect(dealt).toHaveLength(25);

    const perOwnerCounts = new Map<string, number>();
    for (const seq of dealt) {
      const ownerId = seq.ownerId!;
      perOwnerCounts.set(ownerId, (perOwnerCounts.get(ownerId) ?? 0) + 1);
    }

    // The 431-piece owner ("owner-0") contributes exactly perOwner (4).
    expect(perOwnerCounts.get("owner-0")).toBe(4);

    // No owner exceeds perOwner.
    for (const count of perOwnerCounts.values()) {
      expect(count).toBeLessThanOrEqual(4);
    }

    // 4+4+4+4+4+3+1+1 = 25, matching the capped real distribution exactly.
    expect([...perOwnerCounts.values()].sort((a, b) => b - a)).toEqual([
      4, 4, 4, 4, 4, 3, 1, 1,
    ]);
  });

  it("takes each owner's most recent pieces, not an arbitrary slice", () => {
    const pool = ownerPieces("owner-a", 6); // owner-a-0 is newest, owner-a-5 oldest.

    const dealt = dealByOwner(pool, { perOwner: 4, limit: 25 });

    expect(dealt.map((s) => s.id)).toEqual([
      "owner-a-0",
      "owner-a-1",
      "owner-a-2",
      "owner-a-3",
    ]);
  });

  it("returns everything when the pool is smaller than the limit", () => {
    const pool = [
      ...ownerPieces("owner-a", 2),
      ...ownerPieces("owner-b", 1),
    ];

    const dealt = dealByOwner(pool, { perOwner: 4, limit: 25 });

    expect(dealt).toHaveLength(3);
    expect(new Set(dealt.map((s) => s.id))).toEqual(
      new Set(["owner-a-0", "owner-a-1", "owner-b-0"]),
    );
  });

  it("is deterministic - the same input twice yields identical output", () => {
    const pool = [
      ...ownerPieces("owner-a", 8),
      ...ownerPieces("owner-b", 5),
      ...ownerPieces("owner-c", 1),
    ];

    const first = dealByOwner(pool, { perOwner: 4, limit: 25 });
    const second = dealByOwner(pool, { perOwner: 4, limit: 25 });

    expect(second.map((s) => s.id)).toEqual(first.map((s) => s.id));
  });

  it("breaks ties deterministically when publish dates collide", () => {
    // Same owner, same exact publish timestamp for every piece - the
    // kinetic-alphabet tiebreak must still produce a stable, repeatable order.
    const sameDate = new Date("2026-07-01T00:00:00Z");
    const pool = [
      sequence("s-3", "owner-a", "C", { dateAdded: sameDate }),
      sequence("s-1", "owner-a", "A", { dateAdded: sameDate }),
      sequence("s-2", "owner-a", "B", { dateAdded: sameDate }),
    ];

    const first = dealByOwner(pool, { perOwner: 4, limit: 25 });
    const second = dealByOwner([...pool], { perOwner: 4, limit: 25 });

    expect(first.map((s) => s.word)).toEqual(["A", "B", "C"]);
    expect(second.map((s) => s.word)).toEqual(first.map((s) => s.word));
  });

  it("does not crash on missing publishedAt (dateAdded) and still sorts deterministically", () => {
    const pool: SequenceData[] = [
      sequence("no-date-1", "owner-a", "Z"),
      sequence("no-date-2", "owner-a", "A"),
      sequence("has-date", "owner-a", "M", { dateAdded: new Date("2026-01-01") }),
      sequence("has-created-only", "owner-a", "N", {
        createdAt: new Date("2026-02-01"),
      }),
    ];

    const first = dealByOwner(pool, { perOwner: 4, limit: 25 });
    const second = dealByOwner(pool, { perOwner: 4, limit: 25 });

    expect(() => dealByOwner(pool)).not.toThrow();
    // A known publish time (dateAdded or createdAt fallback) always ranks
    // above pieces with no date evidence at all.
    expect(first.map((s) => s.id)).toEqual([
      "has-created-only",
      "has-date",
      "no-date-2",
      "no-date-1",
    ]);
    expect(second.map((s) => s.id)).toEqual(first.map((s) => s.id));
  });

  it("skips pieces with no ownerId rather than crashing", () => {
    const pool = [
      sequence("orphan", undefined, "A"),
      sequence("owned", "owner-a", "B"),
    ];

    const dealt = dealByOwner(pool, { perOwner: 4, limit: 25 });

    expect(dealt.map((s) => s.id)).toEqual(["owned"]);
  });

  it("defaults to perOwner=4 and limit=25 when opts is omitted", () => {
    const pool = ownerPieces("owner-a", 30);

    const dealt = dealByOwner(pool);

    expect(dealt).toHaveLength(4);
  });
});
