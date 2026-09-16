import { describe, it, expect, vi, afterEach } from "vitest";

const { capturePsSlice, seedFromPsSlice, persistedPsSlice } =
  await import("./ps-slice");
const { PropType } =
  await import("$lib/shared/pictograph/prop/domain/enums/prop-type");

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ps slice", () => {
  it("returns null at post-normalize defaults", () => {
    expect(
      capturePsSlice({
        propType: PropType.STAFF,
        defaultPropType: PropType.STAFF,
        audioMode: "original",
        audioModeTouched: false,
        notationMirrored: false,
      })
    ).toBeNull();
  });

  it("diffs propType against the LIVE session default, not a fixed constant", () => {
    // A sender whose settingsService.leftPropType is already FAN (their own
    // preference, never touched inside Post Studio) must not be captured as
    // an override -- the default passed in is what THIS session would have
    // resolved to on its own.
    expect(
      capturePsSlice({
        propType: PropType.FAN,
        defaultPropType: PropType.FAN,
        audioMode: "original",
        audioModeTouched: false,
        notationMirrored: false,
      })
    ).toBeNull();

    // The same propType value IS captured when it diverges from THAT
    // session's own default -- an explicit setPropType call happened.
    expect(
      capturePsSlice({
        propType: PropType.FAN,
        defaultPropType: PropType.STAFF,
        audioMode: "original",
        audioModeTouched: false,
        notationMirrored: false,
      })
    ).toEqual({ propType: PropType.FAN });
  });

  it("captures audioMode only when audioModeTouched -- never by value diff", () => {
    // Untouched: the async canKeepOriginalAudio default is in play. Even
    // though the value here happens to differ from a naive "original"
    // baseline, an untouched flag must never emit a payload field.
    expect(
      capturePsSlice({
        propType: PropType.STAFF,
        defaultPropType: PropType.STAFF,
        audioMode: "instagram",
        audioModeTouched: false,
        notationMirrored: false,
      })
    ).toBeNull();

    // Touched: an explicit setAudioMode call happened, even if the chosen
    // value matches what auto-detection would also have picked.
    expect(
      capturePsSlice({
        propType: PropType.STAFF,
        defaultPropType: PropType.STAFF,
        audioMode: "original",
        audioModeTouched: true,
        notationMirrored: false,
      })
    ).toEqual({ audioMode: "original" });
  });

  it("captures notationMirrored as `true` only, never a false", () => {
    expect(
      capturePsSlice({
        propType: PropType.STAFF,
        defaultPropType: PropType.STAFF,
        audioMode: "original",
        audioModeTouched: false,
        notationMirrored: true,
      })
    ).toEqual({ notationMirrored: true });
  });

  it("captures a combination of fields together", () => {
    expect(
      capturePsSlice({
        propType: PropType.CLUB,
        defaultPropType: PropType.STAFF,
        audioMode: "instagram",
        audioModeTouched: true,
        notationMirrored: true,
      })
    ).toEqual({
      propType: PropType.CLUB,
      audioMode: "instagram",
      notationMirrored: true,
    });
  });

  it("round-trips: capture -> seed -> apply -> capture is identity", () => {
    const slice = capturePsSlice({
      propType: PropType.BUUGENG,
      defaultPropType: PropType.STAFF,
      audioMode: "instagram",
      audioModeTouched: true,
      notationMirrored: true,
    });
    const seed = seedFromPsSlice(slice!);

    // What PostStudio.svelte's own initializers would apply the seed onto.
    // `notationMirrored` is the exception: the studio derives it from the
    // performance's hand labeling and never reads the seed, so the identity
    // here is the pure round-trip, not the studio's seeding behavior.
    expect(
      capturePsSlice({
        propType: seed.propType ?? PropType.STAFF,
        defaultPropType: PropType.STAFF,
        audioMode: seed.audioMode ?? "original",
        audioModeTouched: seed.audioMode !== undefined,
        notationMirrored: seed.notationMirrored ?? false,
      })
    ).toEqual(slice);
  });

  it("seedFromPsSlice does NOT merge onto a full default object -- absent stays absent", () => {
    // Unlike fx/t3/tn/cd, there is no complete-object contract here: each
    // field independently falls through to PostStudio's own default
    // computation when the seed omits it. See the module doc comment,
    // "No merge step on seed".
    expect(seedFromPsSlice({})).toEqual({});
    expect(seedFromPsSlice({ propType: PropType.FAN })).toEqual({
      propType: PropType.FAN,
    });
  });

  it("seedFromPsSlice drops an unrecognized propType/audioMode from a hand-edited URL", () => {
    const seed = seedFromPsSlice({
      // @ts-expect-error -- deliberately invalid, simulating a tampered URL
      propType: "not-a-real-prop",
      // @ts-expect-error -- deliberately invalid
      audioMode: "surround-sound",
      notationMirrored: true,
    });
    expect(seed).toEqual({ notationMirrored: true });
  });

  it("seedFromPsSlice drops notationMirrored: false (only `true` is meaningful)", () => {
    expect(
      seedFromPsSlice({ notationMirrored: false as unknown as true })
    ).toEqual({});
  });

  it("persistedPsSlice always returns null -- no encoded field has a disk-backed form", () => {
    expect(persistedPsSlice()).toBeNull();
  });

  it("seeding and tweaking never write to Storage -- zero-write guard", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    // Simulate a seeded mount: capture, seed, and re-derive local $state as
    // PostStudio.svelte's initializers would (`notationMirrored` is modeled as
    // a plain local here; the studio itself derives it from hand labeling).
    const slice = capturePsSlice({
      propType: PropType.TRIAD,
      defaultPropType: PropType.STAFF,
      audioMode: "instagram",
      audioModeTouched: true,
      notationMirrored: true,
    });
    const seed = seedFromPsSlice(slice!);
    let selectedPropType = seed.propType ?? PropType.STAFF;
    let audioMode = seed.audioMode ?? "original";
    let audioModeTouched = seed.audioMode !== undefined;
    let notationMirrored = seed.notationMirrored ?? false;

    // A recipient tweaking during the session stays session-local too --
    // none of ps-slice's own functions has a storage sink to exercise, so
    // this also covers re-capturing after a local mutation.
    selectedPropType = PropType.QUIAD;
    audioMode = "original";
    audioModeTouched = true;
    notationMirrored = false;
    expect(
      capturePsSlice({
        propType: selectedPropType,
        defaultPropType: PropType.STAFF,
        audioMode,
        audioModeTouched,
        notationMirrored,
      })
    ).toEqual({ propType: PropType.QUIAD, audioMode: "original" });

    expect(persistedPsSlice()).toBeNull();
    expect(setItem).not.toHaveBeenCalled();

    // ps-slice.ts imports nothing from settingsService and never calls
    // updateSetting -- verified by inspection (no such import exists in the
    // module) rather than a second spy here, per this repo's
    // component-test-discipline: a slice-module test exercises the module's
    // own exported functions, not a live settingsService write path that
    // only PostStudio.svelte's wiring (not this module) could ever reach.
  });

  it("guards the spy: the same call DOES write without going through ps-slice", () => {
    // Anti-vacuity companion for the zero-write test above: proves the spy
    // mechanism itself catches a real write, since none of ps-slice's own
    // functions has a storage sink to exercise directly.
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    localStorage.setItem("ps-slice-anti-vacuity-probe", "1");
    expect(setItem).toHaveBeenCalledWith("ps-slice-anti-vacuity-probe", "1");
    localStorage.removeItem("ps-slice-anti-vacuity-probe");
  });

  describe("full snapshot", () => {
    it("always emits propType; audioMode stays touched-gated; mirror stays true-only", () => {
      const full = capturePsSlice(
        {
          propType: PropType.FAN,
          defaultPropType: PropType.FAN,
          audioMode: "original",
          audioModeTouched: false,
          notationMirrored: false,
        },
        { full: true }
      );
      expect(full).toEqual({ propType: PropType.FAN });
      expect(seedFromPsSlice(full!)).toEqual({ propType: PropType.FAN });
    });
  });
});
