import { describe, expect, it } from "vitest";
import {
  PILL_ORDER,
  animationPillOrder,
  buildPillSpecs,
  resolveActivePill,
  type PillId,
} from "$lib/shared/animation-panel/pill-nav/pill-types";

/**
 * The sidebar merges Effort and Playback into one Motion page; the mobile dock
 * keeps them separate. That makes the rail's membership a runtime value — a
 * shell that flips sidebar/bottom on resize changes it while the panel stays
 * mounted — so a pill that was valid a moment ago can stop existing. These pin
 * the mapping in both directions.
 */
describe("animationPillOrder", () => {
  it("collapses the two motion sections into one page when merged", () => {
    expect(animationPillOrder(true)).toEqual([
      "effects",
      "props",
      "motion",
      "display",
      "export",
    ]);
  });

  it("keeps them as two pages when not merged", () => {
    expect(animationPillOrder(false)).toEqual([
      "effects",
      "props",
      "effort",
      "playback",
      "display",
      "export",
    ]);
  });

  it("keeps Display out of the merge in both modes", () => {
    // What the canvas draws is not motion behavior. Folding it into the Motion
    // page put visibility toggles under a heading that misdescribed them.
    for (const merged of [true, false]) {
      expect(animationPillOrder(merged)).toContain("display");
    }
  });

  it("only names ids that exist in the PILL_ORDER contract", () => {
    for (const merged of [true, false]) {
      for (const id of animationPillOrder(merged)) {
        expect(PILL_ORDER).toContain(id);
      }
    }
  });

  it("never offers Motion and its parts at the same time", () => {
    for (const merged of [true, false]) {
      const ids = animationPillOrder(merged);
      const hasMotion = ids.includes("motion");
      const hasParts = ids.some((id) =>
        (["effort", "playback"] as PillId[]).includes(id)
      );
      expect(hasMotion && hasParts).toBe(false);
    }
  });
});

describe("resolveActivePill", () => {
  const merged = animationPillOrder(true);
  const split = animationPillOrder(false);

  it("leaves a pill the rail offers alone", () => {
    expect(resolveActivePill("props", merged)).toBe("props");
    expect(resolveActivePill("display", split)).toBe("display");
  });

  it("passes null through", () => {
    expect(resolveActivePill(null, merged)).toBeNull();
  });

  it.each(["effort", "playback"] as PillId[])(
    "sends a remembered %s to the Motion page that now contains it",
    (part) => {
      expect(resolveActivePill(part, merged)).toBe("motion");
    }
  );

  it("leaves a remembered Display alone when the rail merges", () => {
    // Display is a member in both modes, so merging must not hop it to Motion
    // the way the genuine motion parts do.
    expect(resolveActivePill("display", merged)).toBe("display");
  });

  it("sends Motion back to a part when the rail unmerges", () => {
    // A rail that crosses below the merge width mid-session, or a shell that
    // flips from sidebar to the mobile dock on resize.
    expect(resolveActivePill("motion", split)).toBe("effort");
  });

  it("sends a remembered Playback to Effort when the host leaves Playback out", () => {
    // A canvas with its own transport owns tempo, so its dock has no Playback
    // tray. The other motion part is the nearer page, not Effects.
    const noPlayback = split.filter((id) => id !== "playback");
    expect(resolveActivePill("playback", noPlayback)).toBe("effort");
  });

  it("falls back to Effects for a pill this host simply lacks", () => {
    // A remembered "props" on a host wired without onPropChange.
    const noProps = merged.filter((id) => id !== "props");
    expect(resolveActivePill("props", noProps)).toBe("effects");
  });

  it("falls back to the first available pill when even Effects is absent", () => {
    expect(resolveActivePill("props", ["export"])).toBe("export");
  });

  it("returns null rather than an invalid id when the rail is empty", () => {
    expect(resolveActivePill("motion", [])).toBeNull();
  });

  it("always lands on a pill the rail actually renders", () => {
    // The invariant the component depends on: whatever is resolved is a member
    // of the rail, so no frame ever renders a section with no matching entry.
    for (const ids of [merged, split]) {
      const specs = buildPillSpecs(
        Object.fromEntries(
          ids.map((id) => [id, { label: id, summary: "" }])
        ) as Parameters<typeof buildPillSpecs>[0],
        ids
      );
      const available = specs.map((p) => p.id);
      for (const candidate of PILL_ORDER) {
        const resolved = resolveActivePill(candidate, available);
        expect(resolved).not.toBeNull();
        expect(available).toContain(resolved);
      }
    }
  });
});
