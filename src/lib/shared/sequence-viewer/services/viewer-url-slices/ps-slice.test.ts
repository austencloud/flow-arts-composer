import { describe, it, expect, vi, afterEach } from "vitest";

const { capturePsSlice, seedFromPsSlice, persistedPsSlice } =
  await import("./ps-slice");
const { PropType } =
  await import("$lib/shared/pictograph/prop/domain/enums/prop-type");

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ps slice", () => {
  it("returns null when nothing was touched", () => {
    expect(
      capturePsSlice({
        propType: PropType.STAFF,
        propTypeTouched: false,
        audioMode: "original",
        audioModeTouched: false,
      })
    ).toBeNull();
  });

  it("captures propType only when propTypeTouched -- never by value diff", () => {
    // Untouched: the studio is showing the live settings prop, whatever it
    // is. Shift+P or another tab or device may have set it while the studio
    // was open; neither is a choice made in Post Studio, so neither may be
    // captured as an override.
    expect(
      capturePsSlice({
        propType: PropType.FAN,
        propTypeTouched: false,
        audioMode: "original",
        audioModeTouched: false,
      })
    ).toBeNull();

    // Touched: an explicit setPropType call (or a URL seed) happened, even if
    // the pick matches the settings prop at this moment.
    expect(
      capturePsSlice({
        propType: PropType.STAFF,
        propTypeTouched: true,
        audioMode: "original",
        audioModeTouched: false,
      })
    ).toEqual({ propType: PropType.STAFF });
  });

  it("captures audioMode only when audioModeTouched -- never by value diff", () => {
    // Untouched: the async canKeepOriginalAudio default is in play. Even
    // though the value here happens to differ from a naive "original"
    // baseline, an untouched flag must never emit a payload field.
    expect(
      capturePsSlice({
        propType: PropType.STAFF,
        propTypeTouched: false,
        audioMode: "instagram",
        audioModeTouched: false,
      })
    ).toBeNull();

    // Touched: an explicit setAudioMode call happened, even if the chosen
    // value matches what auto-detection would also have picked.
    expect(
      capturePsSlice({
        propType: PropType.STAFF,
        propTypeTouched: false,
        audioMode: "original",
        audioModeTouched: true,
      })
    ).toEqual({ audioMode: "original" });
  });

  it("captures a combination of fields together", () => {
    expect(
      capturePsSlice({
        propType: PropType.CLUB,
        propTypeTouched: true,
        audioMode: "instagram",
        audioModeTouched: true,
      })
    ).toEqual({
      propType: PropType.CLUB,
      audioMode: "instagram",
    });
  });

  it("round-trips: capture -> seed -> apply -> capture is identity", () => {
    const slice = capturePsSlice({
      propType: PropType.BUUGENG,
      propTypeTouched: true,
      audioMode: "instagram",
      audioModeTouched: true,
    });
    const seed = seedFromPsSlice(slice!);

    // What PostStudio.svelte's own initializers would apply the seed onto.
    expect(
      capturePsSlice({
        propType: seed.propType ?? PropType.STAFF,
        propTypeTouched: seed.propType !== undefined,
        audioMode: seed.audioMode ?? "original",
        audioModeTouched: seed.audioMode !== undefined,
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
    });
    expect(seed).toEqual({});
  });

  it("persistedPsSlice always returns null -- no encoded field has a disk-backed form", () => {
    expect(persistedPsSlice()).toBeNull();
  });

  it("seeding and tweaking never write to Storage -- zero-write guard", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    // Simulate a seeded mount: capture, seed, and re-derive local $state as
    // PostStudio.svelte's initializers would.
    const slice = capturePsSlice({
      propType: PropType.TRIAD,
      propTypeTouched: true,
      audioMode: "instagram",
      audioModeTouched: true,
    });
    const seed = seedFromPsSlice(slice!);
    let selectedPropType = seed.propType ?? PropType.STAFF;
    let propTypeTouched = seed.propType !== undefined;
    let audioMode = seed.audioMode ?? "original";
    let audioModeTouched = seed.audioMode !== undefined;

    // A recipient tweaking during the session stays session-local too --
    // none of ps-slice's own functions has a storage sink to exercise, so
    // this also covers re-capturing after a local mutation.
    selectedPropType = PropType.QUIAD;
    propTypeTouched = true;
    audioMode = "original";
    audioModeTouched = true;
    expect(
      capturePsSlice({
        propType: selectedPropType,
        propTypeTouched,
        audioMode,
        audioModeTouched,
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
    it("always emits propType; audioMode stays touched-gated", () => {
      const full = capturePsSlice(
        {
          propType: PropType.FAN,
          propTypeTouched: false,
          audioMode: "original",
          audioModeTouched: false,
        },
        { full: true }
      );
      expect(full).toEqual({ propType: PropType.FAN });
      expect(seedFromPsSlice(full!)).toEqual({ propType: PropType.FAN });
    });
  });
});
