/**
 * resolveLoopCopy — modal copy matrix.
 *
 * Each test locks a specific (period, components) → (title, body) mapping
 * that the LOOP explanation modal relies on.
 */

import { describe, it, expect } from "vitest";
import { resolveLoopCopy } from "#lib/features/loop-labeler/services/loop-modal-copy.js";
import { LOOPComponent } from "#lib/shared/foundation/domain/models/generation/generate-models.js";

describe("resolveLoopCopy", () => {
  it("empty components → freeform copy", () => {
    const result = resolveLoopCopy({ period: 1, components: [] });
    expect(result.title).toBe("Freeform LOOP");
    expect(result.body).toContain("loops");
  });

  it("rotated location period 2 → '180° rotation' copy", () => {
    const result = resolveLoopCopy({
      period: 2,
      components: [{ component: LOOPComponent.ROTATED, domain: "location" }],
    });
    expect(result.title).toBe("Rotated LOOP");
    expect(result.body).toContain("180°");
  });

  it("rotated location period 4 → 'quartered' copy", () => {
    const result = resolveLoopCopy({
      period: 4,
      components: [{ component: LOOPComponent.ROTATED, domain: "location" }],
    });
    expect(result.title).toBe("Rotated LOOP (quartered)");
    expect(result.body).toContain("90°");
  });

  it("rotated orientation period 4 → 'positions pinned' copy", () => {
    const result = resolveLoopCopy({
      period: 4,
      components: [
        { component: LOOPComponent.ROTATED, domain: "orientation" },
      ],
    });
    expect(result.title).toBe("Rotated LOOP (orientation)");
    expect(result.body).toContain("pinned");
  });

  it("mirrored period 2 → mirror copy", () => {
    const result = resolveLoopCopy({
      period: 2,
      components: [{ component: LOOPComponent.MIRRORED, domain: "location" }],
    });
    expect(result.title).toBe("Mirrored LOOP");
    expect(result.body).toContain("mirror");
  });

  it("swapped period 2 → role-swap copy", () => {
    const result = resolveLoopCopy({
      period: 2,
      components: [{ component: LOOPComponent.SWAPPED, domain: "location" }],
    });
    expect(result.title).toBe("Swapped LOOP");
    expect(result.body).toContain("swaps");
  });

  it("rewound → time reversal copy", () => {
    const result = resolveLoopCopy({
      period: 2,
      components: [{ component: LOOPComponent.REWOUND }],
    });
    expect(result.title).toBe("Rewound LOOP");
    expect(result.body).toContain("reverse");
  });

  it("multi-component combines names", () => {
    const result = resolveLoopCopy({
      period: 2,
      components: [
        { component: LOOPComponent.ROTATED, domain: "location" },
        { component: LOOPComponent.SWAPPED, domain: "location" },
      ],
    });
    expect(result.title).toBe("Rotated + Swapped LOOP");
  });
});
