import { afterEach, describe, expect, it, vi } from "vitest";
import { effect_root } from "svelte/internal/client";
import type { GridJoin } from "@tka/tka-types";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { MandalaFrameSpec } from "#lib/shared/mandala/services/mandala-frame-renderer.js";
import { mandalaGridJoinOffsets } from "#lib/shared/mandala/services/mandala-grid-join.js";
import { MandalaViewerController } from "#lib/shared/sequence-viewer/state/mandala-viewer-controller.svelte.js";
import { AnimationVisibilityStateManager } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";

const exporter = vi.hoisted(() => ({
  specs: [] as unknown[],
}));

vi.mock("#lib/shared/mandala/services/mandala-video-exporter.js", () => ({
  mandalaBitrateFor: () => 1_000_000,
  exportMandalaVideo: (spec: unknown) => {
    exporter.specs.push(spec);
    return { done: new Promise<Blob>(() => {}), cancel: () => {} };
  },
}));

const EAST_ONE: GridJoin = { toward: "e", steps: 1 };

afterEach(() => {
  exporter.specs.length = 0;
  vi.unstubAllGlobals();
});

function exportSpecFor(sequence: Partial<SequenceData>): MandalaFrameSpec {
  vi.stubGlobal("localStorage", {
    getItem: () => null,
    setItem: () => {},
  });
  const pathPolicy = new AnimationVisibilityStateManager({ ephemeral: true });
  let controller!: MandalaViewerController;
  const cleanup = effect_root(() => {
    controller = new MandalaViewerController(
      {
        getSequence: () => ({ steps: [], ...sequence }) as SequenceData,
        getLeftPropType: () => "staff",
        getRightPropType: () => "staff",
        pathPolicy,
      },
      { persistViewState: false }
    );
  });
  expect(controller.startExport({ deliver: false })).toBe(true);
  cleanup();
  return exporter.specs[0] as MandalaFrameSpec;
}

describe("mandala MP4 export worker payload", () => {
  it("carries each hand's offset for a joined sequence", () => {
    const spec = exportSpecFor({ conjoined: EAST_ONE, gridMode: "diamond" });
    expect(spec.handOffsets).toEqual(mandalaGridJoinOffsets(EAST_ONE, "diamond"));
    expect(spec.handOffsets).not.toBeNull();
  });

  it("carries no offsets for one grid", () => {
    expect(exportSpecFor({}).handOffsets ?? null).toBeNull();
  });
});
