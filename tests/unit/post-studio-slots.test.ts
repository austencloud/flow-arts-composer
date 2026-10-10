import { describe, expect, it } from "vitest";
import {
  POST_STUDIO_PRESETS,
  POST_STUDIO_ROLE,
} from "#lib/shared/media-composition/domain/post-studio-presets.js";
import {
  DEFAULT_SLOT_SPLIT,
  normalizePresetToSlots,
  slotIsOccupied,
  slotOccupancy,
  slotSplit,
  withClearedSlot,
  withSlotSource,
  withSlotSplit,
  withSwappedSlots,
} from "#lib/shared/media-composition/domain/post-studio-slots.js";
import type { MediaCompositionPreset } from "#lib/shared/media-composition/domain/media-composition-preset-schema.js";

function builtIn(id: string): MediaCompositionPreset {
  const preset = POST_STUDIO_PRESETS.find((candidate) => candidate.id === id);
  if (!preset) throw new Error(`No built-in preset ${id}`);
  return normalizePresetToSlots(preset);
}

function visualClips(preset: MediaCompositionPreset) {
  return preset.clips.filter((clip) => clip.kind === "visual");
}

describe("normalizePresetToSlots", () => {
  it("renames both regions by vertical order and rewrites clip references", () => {
    const preset = builtIn("sequence-breakdown");

    expect(preset.regions.map((region) => region.id)).toEqual([
      "top",
      "bottom",
    ]);
    expect(slotOccupancy(preset)).toEqual({
      top: [POST_STUDIO_ROLE.animation],
      bottom: [POST_STUDIO_ROLE.card],
    });
    // No clip may be left pointing at a region id that no longer exists —
    // the schema's own superRefine would reject that, so reaching this line
    // at all is the real assertion.
    expect(visualClips(preset)).toHaveLength(2);
  });

  it("keeps a time-sliced slot as one track of two clips with its crossfade", () => {
    const preset = builtIn("performance-breakdown");

    expect(slotOccupancy(preset).top).toEqual([
      POST_STUDIO_ROLE.performance,
      POST_STUDIO_ROLE.animation,
    ]);
    expect(preset.transitions).toHaveLength(1);
    expect(preset.transitions[0]?.kind).toBe("crossfade");
  });

  it("puts a single full-frame region in the top slot", () => {
    for (const id of ["motion-focus", "card-focus"]) {
      const preset = builtIn(id);
      expect(preset.regions.map((region) => region.id)).toEqual(["top"]);
      expect(preset.regions[0]).toMatchObject({
        x: 0,
        y: 0,
        width: 1,
        height: 1,
      });
      expect(slotIsOccupied(preset, "bottom")).toBe(false);
    }
  });

  it("carries each region's fit through the rename", () => {
    const preset = builtIn("sequence-breakdown");
    expect(preset.regions.find((r) => r.id === "top")?.fit).toBe("cover");
    expect(preset.regions.find((r) => r.id === "bottom")?.fit).toBe("contain");
  });

  it("names each region for what it holds, not for where it sits", () => {
    // The id carries the position. If the label did too, the preview's only
    // accessible name for a slot would be "Top" — where it is, never what it
    // edits.
    const preset = builtIn("sequence-breakdown");
    expect(preset.regions.map((region) => region.label)).toEqual([
      "Animation",
      "Choreo card",
    ]);
  });

  it("names a time-sliced slot for the clip it opens on", () => {
    const preset = builtIn("performance-breakdown");
    expect(preset.regions.find((r) => r.id === "top")?.label).toBe(
      "Performance"
    );
  });

  it("is idempotent", () => {
    const once = builtIn("performance-breakdown");
    const twice = normalizePresetToSlots(once);
    expect({ ...twice, updatedAt: 0 }).toEqual({ ...once, updatedAt: 0 });
  });
});

describe("withSlotSource", () => {
  it("reaches a pairing no built-in preset offers", () => {
    // Performance over Animation is one of the three posts Austen named and is
    // not among the four presets, which is the whole reason this layer exists.
    let preset = builtIn("motion-focus");
    preset = withSlotSource(preset, "top", POST_STUDIO_ROLE.performance);
    preset = withSlotSource(preset, "bottom", POST_STUDIO_ROLE.animation);

    expect(slotOccupancy(preset)).toEqual({
      top: [POST_STUDIO_ROLE.performance],
      bottom: [POST_STUDIO_ROLE.animation],
    });
    expect(preset.regions.find((r) => r.id === "top")).toMatchObject({
      y: 0,
      height: DEFAULT_SLOT_SPLIT,
    });
  });

  it("replaces a whole track rather than appending to it", () => {
    const preset = withSlotSource(
      builtIn("performance-breakdown"),
      "top",
      POST_STUDIO_ROLE.mandala
    );

    expect(slotOccupancy(preset).top).toEqual([POST_STUDIO_ROLE.mandala]);
    // The crossfade's two endpoints are gone, so the transition must go too.
    expect(preset.transitions).toHaveLength(0);
  });

  it("drops a duration policy that followed a role no longer present", () => {
    const preset = withSlotSource(
      builtIn("performance-breakdown"),
      "top",
      POST_STUDIO_ROLE.tunnel
    );

    expect(preset.duration.mode).toBe("sequence-tempo");
  });

  it("applies the source's own fit", () => {
    const preset = withSlotSource(
      builtIn("sequence-breakdown"),
      "top",
      POST_STUDIO_ROLE.card
    );
    expect(preset.regions.find((r) => r.id === "top")?.fit).toBe("contain");
  });
});

describe("withClearedSlot", () => {
  it("collapses the survivor to full frame", () => {
    const preset = withClearedSlot(builtIn("sequence-breakdown"), "bottom");

    expect(preset.regions).toHaveLength(1);
    expect(preset.regions[0]).toMatchObject({
      id: "top",
      y: 0,
      height: 1,
    });
    expect(slotOccupancy(preset).bottom).toEqual([]);
  });

  it("clears the top slot and promotes the bottom one into it", () => {
    const preset = withClearedSlot(builtIn("sequence-breakdown"), "top");

    expect(preset.regions.map((r) => r.id)).toEqual(["bottom"]);
    expect(preset.regions[0]).toMatchObject({ y: 0, height: 1 });
    expect(slotOccupancy(preset).bottom).toEqual([POST_STUDIO_ROLE.card]);
  });

  it("refuses to empty the last remaining slot", () => {
    const preset = builtIn("motion-focus");
    expect(withClearedSlot(preset, "top")).toBe(preset);
  });

  it("removes every clip in a time-sliced track at once", () => {
    const preset = withClearedSlot(builtIn("performance-breakdown"), "top");

    expect(slotOccupancy(preset).top).toEqual([]);
    expect(preset.transitions).toHaveLength(0);
    expect(visualClips(preset)).toHaveLength(1);
  });
});

describe("withSwappedSlots", () => {
  it("trades contents while leaving the split ratio alone", () => {
    const before = builtIn("sequence-breakdown");
    const after = withSwappedSlots(before);

    expect(slotOccupancy(after)).toEqual({
      top: [POST_STUDIO_ROLE.card],
      bottom: [POST_STUDIO_ROLE.animation],
    });
    expect(slotSplit(after)).toBe(slotSplit(before));
  });

  it("carries each source's fit and name with it", () => {
    const after = withSwappedSlots(builtIn("sequence-breakdown"));
    expect(after.regions.find((r) => r.id === "top")?.fit).toBe("contain");
    expect(after.regions.find((r) => r.id === "bottom")?.fit).toBe("cover");
    expect(after.regions.find((r) => r.id === "top")?.label).toBe(
      "Choreo card"
    );
  });

  it("round-trips", () => {
    const before = builtIn("sequence-breakdown");
    const after = withSwappedSlots(withSwappedSlots(before));
    expect({ ...after, updatedAt: 0 }).toEqual({ ...before, updatedAt: 0 });
  });
});

describe("withSlotSplit", () => {
  it("moves the divider and keeps the two rects flush", () => {
    const preset = withSlotSplit(builtIn("sequence-breakdown"), 0.7);
    const top = preset.regions.find((r) => r.id === "top")!;
    const bottom = preset.regions.find((r) => r.id === "bottom")!;

    expect(top.height).toBeCloseTo(0.7);
    expect(bottom.y).toBeCloseTo(0.7);
    expect(top.height + bottom.height).toBeCloseTo(1);
  });

  it("clamps rather than letting a slot vanish", () => {
    expect(slotSplit(withSlotSplit(builtIn("sequence-breakdown"), 0))).toBe(
      0.2
    );
    expect(slotSplit(withSlotSplit(builtIn("sequence-breakdown"), 5))).toBe(0.8);
  });

  it("is a no-op while a slot is empty", () => {
    const preset = builtIn("motion-focus");
    expect(withSlotSplit(preset, 0.3)).toBe(preset);
  });
});
