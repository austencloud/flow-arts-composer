/**
 * AUDIT REPRO — `createSequenceData` drops declared fields, and the local
 * persistence round trip hands it JSON that has already lost its Date types.
 *
 * `createSequenceData` copies fields one by one
 * (`sequence-data.ts:254-379`). Four declared `SequenceData` fields have no
 * line: `birthday`, `createdAt`, `syncStatus`, `pendingSyncMetadata`. The last
 * two are local-only sync bookkeeping the persistence layer strips anyway, so
 * dropping them is at worst undocumented.
 *
 * `birthday` is the one clear defect. It is documented as "Original creation
 * date of the sequence … NEVER changes after being set"
 * (`library-sequence.ts:123-129`), so a constructor that drops it contradicts a
 * stated invariant, and `public-index-syncer.ts:233` falls back to `new Date()`
 * when it is absent.
 *
 * `createdAt` is NOT the same case, and this file does not treat it as one.
 * `library-sequence.ts:132-133` defines it as "When added to THIS user's
 * library (may differ from birthday)" — a membership timestamp owned by the
 * receiving library, not a property of the imported content. Carrying an
 * imported source's `createdAt` through unconditionally would assert someone
 * else's membership date as this user's, which is a PRODUCT DECISION nobody has
 * approved. It is recorded below as measured behaviour plus an open question,
 * with deliberately no `it.fails`: quarantining an unapproved contract would
 * dress a policy choice up as a validated fix.
 *
 * Where the constructor sits in the ingress paths (each verified this pass):
 *   - `dexie-persistence-service.ts:441` — restoring the in-progress sequence
 *     from localStorage. The live one for the timestamp case below.
 *   - `deep-link-sequence-handler.ts:104` — inside `loadFromPendingEdit`, which
 *     parses the PENDING_EDIT_KEY localStorage blob. NOT the deep-link branch:
 *     `loadFromDeepLink` (:64-76) calls `setSequence(deepLinkData.sequence)`
 *     directly, so a direct share link bypasses this constructor entirely.
 *   - `short-code-payload-hydrator.ts:99` — an embedded short-code payload.
 *   - `sequence-render-hydrator.ts:67` — choreo-card rendering.
 *
 * The localStorage path adds a TYPE-CONTRACT breach: state is stored with
 * `JSON.stringify` (`dexie-persistence-service.ts:399`) and read with
 * `JSON.parse`, so every `Date` arrives as an ISO string, and
 * `createSequenceData` copies `dateAdded` through untouched. The restored
 * object's `dateAdded` is declared `Date` and is a `string` at runtime.
 *
 * That is a type-contract violation, and this file is careful not to inflate it
 * into user harm. The Browse consumers coerce defensively —
 * `browse-date.ts:12` and `browse-section-manager.ts:203` both do
 * `candidate instanceof Date ? candidate : new Date(candidate)` — and this
 * audit found NO consumer that calls a `Date` method on the restored value
 * unguarded. The lying type is real; a demonstrated failure is not.
 *
 * QUARANTINE: `it.fails` marks assertions that should pass once the constructor
 * covers `birthday` and stops handing out strings behind a `Date` type. This
 * file is green while the defects are live.
 */
import { describe, expect, it } from "vitest";

import { createSequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { resolveBrowseDate } from "$lib/shared/browse/services/browse-date";

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

  it.fails(
    "SHOULD PASS AFTER FIX: birthday survives the ingress constructor",
    () => {
      const out = createSequenceData({
        birthday: BIRTHDAY,
      } as Partial<SequenceData>);
      expect(out.birthday).toEqual(BIRTHDAY);
    }
  );

  it("measured + UNRESOLVED POLICY: createdAt is dropped, and whether it should be is not settled", () => {
    // Deliberately NOT an `it.fails`. See the header: `createdAt` is this
    // user's library-membership timestamp, so "preserve whatever the imported
    // payload carried" is a product decision, not an obvious repair. Three
    // defensible contracts exist and the owner has to pick one:
    //   (a) drop it here and let `createLibrarySequence` stamp the receiving
    //       library's own `createdAt` — today's behaviour, arguably correct;
    //   (b) carry it only when the ingress is a same-user restore (the
    //       localStorage path) and drop it for cross-user imports;
    //   (c) carry it always — which asserts another user's membership date.
    // This test pins (a) as the current behaviour so any deliberate move to
    // (b) or (c) is a visible, reviewed change rather than a silent one.
    const out = createSequenceData({
      createdAt: CREATED_AT,
    } as Partial<SequenceData>);
    expect(out.createdAt).toBeUndefined();
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

  it("measured: the known Browse consumers coerce, so no failing consumer is demonstrated", () => {
    // The counterweight to the assertion above. `resolveBrowseDate` is the
    // owner of "the date that orders and groups a sequence on Browse surfaces",
    // and it handles the string case explicitly. Recorded so the type-contract
    // finding is never read as a live user-visible break.
    const restored = throughLocalStorage(dated());
    expect(resolveBrowseDate(restored)).toEqual(DATE_ADDED);
  });

  it.fails(
    "SHOULD PASS AFTER FIX (type contract, not a demonstrated failure): a restored sequence's timestamps are Dates",
    () => {
      // Quarantined as a TYPE-CONTRACT repair: the declared type says `Date`
      // and the value is a `string`, which makes every consumer's correctness
      // depend on remembering to coerce. No consumer is currently known to get
      // that wrong — this is defence in depth, not an outage.
      const restored = throughLocalStorage(dated());
      expect(restored.dateAdded).toBeInstanceOf(Date);
      expect((restored.dateAdded as Date).getTime()).toBe(DATE_ADDED.getTime());
    }
  );
});
