import { describe, expect, it } from "vitest";
import {
  createWorkerMoveHandleOwner,
  type WorkerMoveHandleSnapshot,
} from "#lib/shared/3d/worker-renderer/worlds/selection-markers/worker-performer-move-handle.js";

function snapshot(
  overrides: Partial<WorkerMoveHandleSnapshot> = {}
): WorkerMoveHandleSnapshot {
  return {
    position: { x: 2, z: -3 },
    groundY: -1.5,
    selectedCount: 1,
    dragging: false,
    hovered: false,
    focusVisible: false,
    visible: true,
    reducedMotion: false,
    entranceProgress: 1,
    ...overrides,
  };
}

describe("worker performer move-handle parity", () => {
  it("pins the exact world anchor, constant-pixel geometry, icon, and labels", () => {
    const owner = createWorkerMoveHandleOwner(snapshot());

    expect(owner.current).toMatchObject({
      visible: true,
      label: "",
      accessibleLabel:
        "Move selected character: drag or press to choose a floor position",
      title:
        "Move selected character: drag or press to choose a floor position",
      icon: {
        classes: ["fas", "fa-arrows-up-down-left-right"],
        glyph: "\uf047",
        ariaHidden: true,
      },
      geometry: {
        projection: "screen-space-html",
        centered: true,
        sprite: true,
        minWidthPx: 48,
        minHeightPx: 48,
        paddingBlockRem: 0,
        paddingInlineRem: 0,
        borderWidthPx: 0,
        borderRadiusPx: 999,
        gapRem: 0.5,
        iconWidthRem: 1,
      },
      typography: {
        font: "inherit",
        fontSize: "max(14px, var(--font-size-min, 0.875rem))",
        fontWeight: 700,
        lineHeight: 1,
        whiteSpace: "nowrap",
      },
    });

    expect(owner.current?.geometry.worldPosition[0]).toBeCloseTo(2);
    expect(owner.current?.geometry.worldPosition.slice(1)).toEqual([-1.42, -3]);

    owner.update(snapshot({ selectedCount: 4 }));
    expect(owner.current?.label).toBe("");
    expect(owner.current?.accessibleLabel).toContain(
      "Move 4 selected characters"
    );
    owner.update(snapshot({ placing: true }));
    expect(owner.current?.label).toBe("");
    expect(owner.current?.accessibleLabel).toBe("Cancel move");
    owner.dispose();
  });

  it("reproduces idle, hover, focus-visible, and dragging appearances", () => {
    const owner = createWorkerMoveHandleOwner(snapshot());
    expect(owner.current?.material).toEqual({
      borderColor: "transparent",
      background: "transparent",
      color: "var(--theme-text, #fff)",
      boxShadow: "none",
      outline: null,
      outlineOffsetPx: null,
      cursor: "grab",
      transition:
        "border-color var(--transition-fast), background-color var(--transition-fast), color var(--transition-fast)",
    });

    owner.update(snapshot({ hovered: true }));
    expect(owner.current?.material).toMatchObject({
      borderColor: "transparent",
      background: "transparent",
      color: "var(--theme-accent-text, #a78bfa)",
      outline: null,
    });

    owner.update(snapshot({ focusVisible: true, dragging: true }));
    expect(owner.current?.material).toMatchObject({
      borderColor: "transparent",
      background: "transparent",
      color: "var(--theme-accent-text, #a78bfa)",
      outline: "2px solid var(--theme-accent-text, #a78bfa)",
      outlineOffsetPx: 3,
      cursor: "grabbing",
    });
    owner.dispose();
  });

  it("uses the exact popIn curve and collapses motion when requested", () => {
    const owner = createWorkerMoveHandleOwner(
      snapshot({ entranceProgress: 0 })
    );
    expect(owner.current?.motion).toEqual({
      durationMs: 150,
      opacity: 0,
      scale: 0.8,
    });

    owner.update(snapshot({ entranceProgress: 0.5 }));
    expect(owner.current?.motion.opacity).toBeCloseTo(0.875, 12);
    expect(owner.current?.motion.scale).toBeCloseTo(0.975, 12);

    owner.update(
      snapshot({
        entranceProgress: 0,
        reducedMotion: true,
        focusVisible: true,
      })
    );
    expect(owner.current?.motion).toEqual({
      durationMs: 0,
      opacity: 1,
      scale: 1,
    });
    expect(owner.current?.material.transition).toBe("none");
    owner.dispose();
  });

  it("keeps the DOM interaction contract clone-safe", () => {
    const owner = createWorkerMoveHandleOwner(
      structuredClone(snapshot({ selectedCount: 3 }))
    );

    expect(structuredClone(owner.current)).toEqual(owner.current);
    expect(owner.current?.interaction).toEqual({
      buttonType: "button",
      pointerEvents: "auto",
      touchAction: "none",
      userSelect: "none",
      lostPointerCaptureCancels: true,
      preventContextMenu: true,
      preventNativeDrag: true,
    });
    owner.dispose();
  });

  it("updates visibility and position, then disposes idempotently", () => {
    const owner = createWorkerMoveHandleOwner(snapshot());
    const updated = owner.update(
      snapshot({
        position: { x: -4, z: 7 },
        groundY: -0.75,
        visible: false,
      })
    );
    expect(updated?.visible).toBe(false);
    expect(updated?.geometry.worldPosition[0]).toBeCloseTo(-4);
    expect(updated?.geometry.worldPosition.slice(1)).toEqual([-0.67, 7]);

    owner.dispose();
    owner.dispose();
    expect(owner.current).toBeNull();
    expect(owner.update(snapshot())).toBeNull();
  });
});
