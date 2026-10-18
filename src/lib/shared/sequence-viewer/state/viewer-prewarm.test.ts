import { describe, expect, it } from "vitest";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
  canAdoptPrewarm,
  clearSequenceViewerPrewarm,
  getSequenceViewerPrewarm,
  prewarmSequenceViewer,
  type PrewarmOpenOptions,
  type SequenceViewerPrewarm,
} from "./viewer-prewarm.svelte";

const sequence = { id: "seq-1", steps: [] } as unknown as SequenceData;
const prewarm: SequenceViewerPrewarm = {
  sequence,
  analyticsSource: "create_workspace",
  initialViewMode: "animation",
  playOnOpen: true,
};
const plainOpen: PrewarmOpenOptions = {
  sequence,
  analyticsSource: "create_workspace",
  initialViewMode: "animation",
  initialViewerMode: undefined,
  playOnOpen: true,
  handPathMode: false,
  collectionPropType: null,
  initialPlaybackMode: "continuous",
  shareOnOpen: false,
  saveOnOpen: false,
  tunnelComposition: null,
  activeShortCode: null,
};

describe("canAdoptPrewarm", () => {
  it("takes over for the open the viewer was built for", () => {
    expect(canAdoptPrewarm(prewarm, plainOpen)).toBe(true);
  });

  it("takes over for an edited copy of the same saved sequence", () => {
    const edited = { ...sequence } as SequenceData;
    expect(canAdoptPrewarm(prewarm, { ...plainOpen, sequence: edited })).toBe(
      true
    );
  });

  it("matches an unsaved sequence by what it draws", () => {
    const a = { word: "AB", steps: [] } as unknown as SequenceData;
    const same = { word: "AB", steps: [] } as unknown as SequenceData;
    const other = { word: "AC", steps: [] } as unknown as SequenceData;
    const built = { ...prewarm, sequence: a };
    expect(canAdoptPrewarm(built, { ...plainOpen, sequence: same })).toBe(true);
    expect(canAdoptPrewarm(built, { ...plainOpen, sequence: other })).toBe(
      false
    );
  });

  it.each<[string, Partial<PrewarmOpenOptions>]>([
    ["another sequence", { sequence: { id: "seq-2" } as SequenceData }],
    ["no sequence", { sequence: null }],
    ["another source", { analyticsSource: "gallery" as never }],
    ["another pane", { initialViewMode: "card" as never }],
    ["paused open", { playOnOpen: false }],
    ["a viewer mode", { initialViewerMode: "tunnel" }],
    ["hand paths", { handPathMode: true }],
    ["a collection prop", { collectionPropType: "staff" }],
    ["step playback", { initialPlaybackMode: "step" }],
    ["share on open", { shareOnOpen: true }],
    ["save on open", { saveOnOpen: true }],
    ["a tunnel", { tunnelComposition: {} }],
    ["a short code", { activeShortCode: "ABC" }],
  ])("builds fresh for %s", (_label, change) => {
    expect(canAdoptPrewarm(prewarm, { ...plainOpen, ...change })).toBe(false);
  });
});

describe("prewarm prediction", () => {
  it("only the caller's own sequence clears it", () => {
    prewarmSequenceViewer(prewarm);
    clearSequenceViewerPrewarm({ id: "other" } as SequenceData);
    expect(getSequenceViewerPrewarm()).toBe(prewarm);
    clearSequenceViewerPrewarm(sequence);
    expect(getSequenceViewerPrewarm()).toBeNull();
  });
});
