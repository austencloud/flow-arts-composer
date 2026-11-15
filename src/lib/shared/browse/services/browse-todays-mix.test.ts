import { describe, expect, it } from "vitest";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { BrowseSortMethod } from "#lib/shared/browse/domain/enums/browse-enums.js";
import { sortByTodaysMix, utcDayKey } from "./browse-todays-mix";
import { sortSequences } from "./browse-sorter";

const seq = (id: string) => ({ id, word: id }) as unknown as SequenceData;
const ids = (list: readonly SequenceData[]) => list.map((s) => s.id);
const pool = Array.from({ length: 60 }, (_, i) =>
  seq(`${String.fromCharCode(65 + (i % 26))}${i}`)
);

const monday = new Date("2026-11-16T03:00:00Z");
const mondayNight = new Date("2026-11-16T23:59:59Z");
const tuesday = new Date("2026-11-17T00:00:01Z");

describe("Today's mix", () => {
  it("is the same order all day, whoever asks and however the pool arrives", () => {
    const first = ids(sortByTodaysMix(pool, monday));
    expect(ids(sortByTodaysMix(pool, mondayNight))).toEqual(first);
    expect(ids(sortByTodaysMix([...pool].reverse(), monday))).toEqual(first);
  });

  it("changes the next UTC day", () => {
    expect(ids(sortByTodaysMix(pool, tuesday))).not.toEqual(
      ids(sortByTodaysMix(pool, monday))
    );
  });

  it("reshuffles most places from one day to the next", () => {
    const a = ids(sortByTodaysMix(pool, monday));
    const b = ids(sortByTodaysMix(pool, tuesday));
    const moved = a.filter((id, i) => b[i] !== id).length;
    expect(moved).toBeGreaterThan(pool.length * 0.8);
  });

  it("is not the alphabet", () => {
    expect(ids(sortByTodaysMix(pool, monday))).not.toEqual(ids(pool));
  });

  it("keeps the order of what was already there when more sequences arrive", () => {
    const early = pool.slice(0, 30);
    const before = ids(sortByTodaysMix(early, monday));
    const after = ids(sortByTodaysMix(pool, monday)).filter((id) =>
      before.includes(id)
    );
    expect(after).toEqual(before);
  });

  it("breaks ties by id and never drops a duplicate id", () => {
    const twins = [seq("b"), seq("a"), seq("a")];
    expect(ids(sortByTodaysMix(twins, monday))).toEqual(
      ids(sortByTodaysMix([...twins].reverse(), monday))
    );
    expect(sortByTodaysMix(twins, monday)).toHaveLength(3);
  });

  it("does not change the list it is given", () => {
    const copy = [...pool];
    sortByTodaysMix(pool, monday);
    expect(pool).toEqual(copy);
  });

  it("names the day in UTC", () => {
    expect(utcDayKey(new Date("2026-11-16T23:30:00-08:00"))).toBe("2026-11-17");
  });

  it("is what the sorter returns for the TODAYS_MIX method", () => {
    const viaSorter = ids(sortSequences(pool, BrowseSortMethod.TODAYS_MIX));
    expect([...viaSorter].sort()).toEqual(ids(pool).sort());
    expect(viaSorter).toEqual(ids(sortByTodaysMix(pool)));
  });
});
