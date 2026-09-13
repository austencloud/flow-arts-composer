/**
 * AUDIT REPRO — `createSequenceData` drops declared fields, and the local
 * persistence round trip hands it JSON that has already lost its Date types.
 *
 * `createSequenceData` copies fields one by one
 * (`sequence-data.ts:254-379`). Four declared `SequenceData` fields have no
 * line: `birthday`, `createdAt`, `syncStatus`, `pendingSyncMetadata`. The last
 * two are local-only sync bookkeeping the persistence layer strips anyway, so
 * dropping them is at worst undocumented. `birthday` is not — it is documented
 * as "Original creation date of the sequence (never changes after being set)"
 * and `public-index-syncer.ts:233` falls back to `new Date()` when it is absent.
 *
 * The function is the ingress constructor for persisted and imported data:
 *   - `dexie-persistence-service.ts:441` — restoring the in-progress sequence
 *     from localStorage;
 *   - `deep-link-sequence-handler.ts:104` — an imported share link;
 *   - `short-code-payload-hydrator.ts:99` — an embedded short-code payload;
 *   - `sequence-render-hydrator.ts:67` — choreo-card rendering.
 *
 * The localStorage path adds a second problem it cannot see: the state is
 * stored with `JSON.stringify` (`dexie-persistence-service.ts:400`) and read
 * back with `JSON.parse`, so every `Date` arrives as an ISO string.
 * `createSequenceData` copies `dateAdded` through untouched, so the restored
 * object's `dateAdded` is typed `Date` and is a `string` at runtime.
 *
 * QUARANTINE: `it.fails` marks the assertions that should pass once the
 * constructor covers the declared fields and revives timestamps. This file is
 * green while the defect is live.
 */
import { describe, expect, it } from "vitest";

import { createSequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

import { buildSequence, makeStep } from "./fixtures";

const BIRTHDAY = new Date("2024-01-02T03:04:05.000Z");
const CREATED_AT = new Date("2024-02-03T04:05:06.000Z");
const DATE_ADDED = new Date("2024-03-04T05:06:07.000Z");

const dated = () =>
  buildSequence([makeStep(0, "A"), makeStep(1, "B")], {
    birthday: BIRTHDAY,
    createdAt: CREATED_AT,
    dateAdded: DATE_ADDED,
  } as Partial<SequenceData>);

/** The localStorage round trip performed by `saveCurrentSequenceState` / `loadCurrentSequenceState`. */
function throughLocalStorage(sequence: SequenceData): SequenceData {
  return createSequenceData(JSON.parse(JSON.stringify(sequence)));
}

describe("createSequenceData field coverage", () => {
  it("measured: dateAdded is copied, birthday and createdAt are not", () => {
    const out = createSequenceData({
      birthday: BIRTHDAY,
      createdAt: CREATED_AT,
      dateAdded: DATE_ADDED,
    } as Partial<SequenceData>);

    expect(out.dateAdded).toEqual(DATE_ADDED);
    expect(out.birthday).toBeUndefined();
    expect(out.createdAt).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(out, "birthday")).toBe(false);
  });

  it.fails("SHOULD PASS AFTER FIX: birthday survives the ingress constructor", () => {
    const out = createSequenceData({ birthday: BIRTHDAY } as Partial<SequenceData>);
    expect(out.birthday).toEqual(BIRTHDAY);
  });

  it.fails("SHOULD PASS AFTER FIX: createdAt survives the ingress constructor", () => {
    const out = createSequenceData({ createdAt: CREATED_AT } as Partial<SequenceData>);
    expect(out.createdAt).toEqual(CREATED_AT);
  });
});

describe("localStorage sequence-state round trip", () => {
  it("measured: motion content survives the JSON round trip intact", () => {
    const restored = throughLocalStorage(dated());
    expect(restored.steps).toHaveLength(2);
    expect(restored.steps.map((s) => s.letter)).toEqual(["A", "B"]);
    expect(restored.steps[0]!.motions.left.startLocation).toBe(
      dated().steps[0]!.motions.left.startLocation
    );
  });

  it("measured: timestamps come back as strings behind a Date-typed field", () => {
    const restored = throughLocalStorage(dated());
    expect(restored.dateAdded).not.toBeInstanceOf(Date);
    expect(typeof (restored.dateAdded as unknown)).toBe("string");
    expect(restored.birthday).toBeUndefined();
  });

  it.fails(
    "SHOULD PASS AFTER FIX: a restored sequence's timestamps are usable as Dates",
    () => {
      const restored = throughLocalStorage(dated());
      expect(restored.dateAdded).toBeInstanceOf(Date);
      expect((restored.dateAdded as Date).getTime()).toBe(DATE_ADDED.getTime());
    }
  );
});
