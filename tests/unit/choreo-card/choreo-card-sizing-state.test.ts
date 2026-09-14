// @vitest-environment jsdom

import { effect_root } from "svelte/internal/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createChoreoCardSizingState,
  fitSquareGridCell,
} from "$lib/shared/choreo-card/state/choreo-card-sizing-state.svelte";

const disposals: Array<() => void> = [];

afterEach(() => {
  while (disposals.length > 0) disposals.pop()?.();
  vi.unstubAllGlobals();
});

describe("ChoreoCard contained sizing motion", () => {
  it.each([false, true])(
    "returns the grid picker to live geometry when the destination is released (collapse first: %s)",
    (collapseFirst) => {
      vi.stubGlobal(
        "ResizeObserver",
        class {
          observe(): void {}
          disconnect(): void {}
        }
      );
      const container = document.createElement("div");
      let exposed = false;
      let phase: "restore" | null = "restore";
      let destination: { width: number; height: number } | null = {
        width: 760,
        height: 847,
      };
      let sizing!: ReturnType<typeof createChoreoCardSizingState>;
      disposals.push(
        effect_root(() => {
          sizing = createChoreoCardSizingState(() => ({
            containerElement: exposed ? container : undefined,
            previewStackElement: undefined,
            previewAspectRatio: 1.3,
            forceContain: true,
            needsScroll: false,
            fitWidth: true,
            containSizeMotion: phase,
            containMotionBox: destination,
            containModel: {
              cols: 4,
              gridHeightUnits: 3,
              headerUnits: 0,
              footerUnits: 0,
              headerMinPx: 0,
            },
          }));
        })
      );
      const measure = (width: number, height: number) => {
        exposed = true;
        sizing.captureContainerDimensions({ width, height });
        sizing.updateContainedDimensions({ width, height });
        exposed = false;
      };

      measure(8, 847);
      expect([sizing.containerWidth, sizing.containerHeight]).toEqual([
        760, 847,
      ]);
      destination = null;
      if (collapseFirst) {
        measure(8, 20);
        expect([sizing.containerWidth, sizing.containerHeight]).toEqual([
          760, 847,
        ]);
      }
      phase = null;
      measure(366, 287);
      expect([sizing.containerWidth, sizing.containerHeight]).toEqual([
        366, 287,
      ]);
      measure(420, 280);
      expect([sizing.containerWidth, sizing.containerHeight]).toEqual([
        420, 280,
      ]);

      phase = "restore";
      destination = { width: 760, height: 847 };
      measure(20, 847);
      expect([sizing.containerWidth, sizing.containerHeight]).toEqual([
        760, 847,
      ]);
    }
  );

  it("uses the destination box instead of chasing a moving panel", () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe(): void {}
        disconnect(): void {}
      }
    );
    const container = document.createElement("div");
    let exposeContainer = false;
    let phase: "focus" | "return" | null = null;
    let destination = { width: 322, height: 280 };
    let sizing!: ReturnType<typeof createChoreoCardSizingState>;

    const dispose = effect_root(() => {
      sizing = createChoreoCardSizingState(() => ({
        containerElement: exposeContainer ? container : undefined,
        previewStackElement: undefined,
        previewAspectRatio: 322 / 280,
        forceContain: true,
        needsScroll: false,
        fitWidth: true,
        containSizeMotion: phase,
        containMotionBox: destination,
        containModel: {
          cols: 4,
          gridHeightUnits: 3,
          headerUnits: 0,
          footerUnits: 0,
          headerMinPx: 0,
        },
      }));
    });
    disposals.push(dispose);

    const update = (width: number, height: number) => {
      exposeContainer = true;
      sizing.updateContainedDimensions({ width, height });
      exposeContainer = false;
    };

    update(322, 280);
    expect([sizing.containedWidth, sizing.containedHeight]).toEqual([322, 280]);
    expect(sizing.flipSuppressed).toBe(false);

    phase = "focus";
    destination = { width: 375, height: 561 };
    update(375, 561);
    expect(sizing.containedWidth).toBe(375);
    expect(sizing.flipSuppressed).toBe(true);

    phase = null;
    update(375, 561);
    expect(sizing.flipSuppressed).toBe(false);
    phase = "return";
    destination = { width: 322, height: 280 };
    update(375, 400);

    expect([sizing.containedWidth, sizing.containedHeight]).toEqual([322, 280]);
    expect(sizing.flipSuppressed).toBe(true);

    phase = null;
    update(322, 280);
    phase = "restore";
    update(8, 280);
    expect([sizing.containedWidth, sizing.containedHeight]).toEqual([322, 280]);
    expect(sizing.flipSuppressed).toBe(true);
  });
});

describe("fixed-aspect square grid sizing", () => {
  it("uses height when three square rows cannot fit at full width", () => {
    expect(
      fitSquareGridCell(
        { width: 500, height: 600 },
        {
          cols: 2,
          gridHeightUnits: 3,
          headerUnits: 0,
          footerUnits: 0,
          headerMinPx: 0,
        }
      )
    ).toBe(200);
  });

  it("uses width when a shorter grid already fits the card height", () => {
    expect(
      fitSquareGridCell(
        { width: 500, height: 600 },
        {
          cols: 3,
          gridHeightUnits: 2,
          headerUnits: 0,
          footerUnits: 0,
          headerMinPx: 0,
        }
      )
    ).toBeCloseTo(500 / 3);
  });

  it("reserves the on-screen header floor before fitting the grid", () => {
    expect(
      fitSquareGridCell(
        { width: 400, height: 240 },
        {
          cols: 2,
          gridHeightUnits: 3,
          headerUnits: 0.1,
          footerUnits: 0,
          headerMinPx: 24,
        }
      )
    ).toBe(72);
  });
});
