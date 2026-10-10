import { describe, it, expect, vi } from "vitest";
import { Vector3, type InstancedMesh } from "three";
import {
  PovStripRenderer3D,
  shutterToPovPersistence,
} from "#lib/shared/3d/effects/poi/pov-strip-renderer-3d.js";
import { DEFAULT_LED_SHUTTER } from "#lib/shared/animation-engine/domain/led-photometry.js";
import { QualityTier } from "#lib/shared/3d/effects/types.js";
import { createEmptyPattern } from "#lib/shared/poi/domain/strip-pattern.js";
import type { StripPattern } from "#lib/shared/poi/domain/strip-pattern.js";

function createMockParent() {
  const children: unknown[] = [];
  return {
    children,
    add: vi.fn((object: unknown) => children.push(object)),
    remove: vi.fn((object: unknown) => {
      const index = children.indexOf(object);
      if (index >= 0) children.splice(index, 1);
    }),
  };
}

function createMockCamera(): any {
  return { quaternion: { x: 0, y: 0, z: 0, w: 1 } };
}

/** A pattern where every LED of every frame is lit, so no ghost is skipped. */
function createLitPattern(ledCount: number, frameCount = 8): StripPattern {
  const pattern = createEmptyPattern(ledCount, frameCount, "test");
  for (let f = 0; f < frameCount; f++) {
    pattern.frames[f]!.colors.fill(200);
  }
  return pattern;
}

function meshOf(parent: ReturnType<typeof createMockParent>): InstancedMesh {
  return parent.children[0] as InstancedMesh;
}

const AXIS = new Vector3(1, 0, 0);
const CENTER = new Vector3(0, 1, 0);

describe("PovStripRenderer3D LED count", () => {
  it("fills the tier ceiling when no device count is given", () => {
    expect(new PovStripRenderer3D(QualityTier.HIGH).ledCount).toBe(200);
    expect(new PovStripRenderer3D(QualityTier.MEDIUM).ledCount).toBe(100);
    expect(new PovStripRenderer3D(QualityTier.LOW).ledCount).toBe(50);
  });

  it("renders a shorter device at its own LED count", () => {
    expect(new PovStripRenderer3D(QualityTier.HIGH, 32).ledCount).toBe(32);
    expect(new PovStripRenderer3D(QualityTier.HIGH, 72).ledCount).toBe(72);
    expect(new PovStripRenderer3D(QualityTier.MEDIUM, 32).ledCount).toBe(32);
  });

  it("caps a 200-LED device to what the tier can afford", () => {
    expect(new PovStripRenderer3D(QualityTier.HIGH, 200).ledCount).toBe(200);
    expect(new PovStripRenderer3D(QualityTier.MEDIUM, 200).ledCount).toBe(100);
    expect(new PovStripRenderer3D(QualityTier.LOW, 200).ledCount).toBe(50);
  });

  it("keeps the device count across a tier change", () => {
    const renderer = new PovStripRenderer3D(QualityTier.HIGH, 32);
    renderer.setQualityTier(QualityTier.LOW);
    expect(renderer.ledCount).toBe(32);
    renderer.setQualityTier(QualityTier.HIGH);
    expect(renderer.ledCount).toBe(32);
  });
});

describe("PovStripRenderer3D rendering", () => {
  it("draws one instance per LED on the first frame", () => {
    const parent = createMockParent();
    const renderer = new PovStripRenderer3D(QualityTier.HIGH, 72);
    renderer.initialize(parent as never);
    renderer.update(
      AXIS,
      CENTER,
      0.5,
      0,
      createLitPattern(72),
      createMockCamera(),
      0,
      1
    );
    expect(meshOf(parent).count).toBe(72);
  });

  it("accumulates ghost instances over successive frames", () => {
    const parent = createMockParent();
    const renderer = new PovStripRenderer3D(QualityTier.HIGH, 32);
    renderer.initialize(parent as never);
    renderer.setPersistenceDuration(0.5);
    const pattern = createLitPattern(32);
    const camera = createMockCamera();

    for (let frame = 0; frame < 4; frame++) {
      renderer.update(AXIS, CENTER, 0.5, frame, pattern, camera, frame * 0.016, 1);
    }

    // 32 live LEDs plus the ghosts of the three earlier snapshots.
    expect(meshOf(parent).count).toBeGreaterThan(32);
  });

  it("renders bulbs only on LOW, matching the capsule ribbon path", () => {
    const parent = createMockParent();
    const renderer = new PovStripRenderer3D(QualityTier.LOW, 32);
    renderer.initialize(parent as never);
    renderer.setPersistenceDuration(0.5);
    const pattern = createLitPattern(32);
    const camera = createMockCamera();

    for (let frame = 0; frame < 6; frame++) {
      renderer.update(AXIS, CENTER, 0.5, frame, pattern, camera, frame * 0.016, 1);
    }

    expect(meshOf(parent).count).toBe(32);
  });

  it("takes the frame index from the caller's clock, not the staff pose", () => {
    const parent = createMockParent();
    const renderer = new PovStripRenderer3D(QualityTier.HIGH, 2);
    renderer.initialize(parent as never);

    const pattern = createEmptyPattern(2, 4, "frames");
    pattern.frames[2]!.colors.set([255, 0, 0, 255, 0, 0]);
    const camera = createMockCamera();

    renderer.update(AXIS, CENTER, 0.5, 2, pattern, camera, 0, 1);
    const colors = meshOf(parent).geometry.getAttribute("instanceColor");
    expect(colors.getX(0)).toBeCloseTo(1, 5);
    expect(colors.getY(0)).toBeCloseTo(0, 5);
  });

  it("wraps an out-of-range frame index instead of drawing nothing", () => {
    const parent = createMockParent();
    const renderer = new PovStripRenderer3D(QualityTier.HIGH, 8);
    renderer.initialize(parent as never);
    expect(() =>
      renderer.update(
        AXIS,
        CENTER,
        0.5,
        999,
        createLitPattern(8, 4),
        createMockCamera(),
        0,
        1
      )
    ).not.toThrow();
    expect(meshOf(parent).count).toBe(8);
  });
});

describe("PovStripRenderer3D disposal", () => {
  it("removes its mesh and frees geometry and material", () => {
    const parent = createMockParent();
    const renderer = new PovStripRenderer3D(QualityTier.HIGH, 32);
    renderer.initialize(parent as never);
    const mesh = meshOf(parent);
    const geometryDispose = vi.spyOn(mesh.geometry, "dispose");
    const materialDispose = vi.spyOn(mesh.material as never, "dispose");

    renderer.dispose();

    expect(parent.remove).toHaveBeenCalledWith(mesh);
    expect(parent.children).toHaveLength(0);
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
  });

  it("survives a dispose before initialization and a double dispose", () => {
    const renderer = new PovStripRenderer3D(QualityTier.HIGH, 32);
    expect(() => renderer.dispose()).not.toThrow();
    expect(() => renderer.dispose()).not.toThrow();
  });

  it("rebuilds cleanly after a device change tears it down", () => {
    const parent = createMockParent();
    const first = new PovStripRenderer3D(QualityTier.HIGH, 32);
    first.initialize(parent as never);
    first.dispose();

    const second = new PovStripRenderer3D(QualityTier.HIGH, 200);
    second.initialize(parent as never);
    expect(parent.children).toHaveLength(1);
    expect(second.ledCount).toBe(200);
  });
});

describe("shutterToPovPersistence", () => {
  it("takes the eye shutter's cutoff, five time constants", () => {
    expect(shutterToPovPersistence({ mode: "eye", timeConstantSeconds: 0.02 })).toBeCloseTo(
      0.1,
      5,
    );
    expect(shutterToPovPersistence({ mode: "eye", timeConstantSeconds: 0.05 })).toBeCloseTo(
      0.25,
      5,
    );
  });

  it("takes the camera shutter's exposure directly", () => {
    expect(shutterToPovPersistence({ mode: "camera", exposureSeconds: 0.25 })).toBeCloseTo(
      0.25,
      5,
    );
  });

  it("clamps to the ring's own capacity", () => {
    expect(shutterToPovPersistence(DEFAULT_LED_SHUTTER)).toBeCloseTo(0.5, 5);
    expect(shutterToPovPersistence({ mode: "camera", exposureSeconds: 4 })).toBeCloseTo(0.5, 5);
    expect(shutterToPovPersistence({ mode: "eye", timeConstantSeconds: 0.001 })).toBeCloseTo(
      0.05,
      5,
    );
  });

  it("floors non-finite inputs", () => {
    expect(
      shutterToPovPersistence({ mode: "eye", timeConstantSeconds: Number.NaN }),
    ).toBeCloseTo(0.05, 5);
    expect(
      shutterToPovPersistence({ mode: "camera", exposureSeconds: Number.POSITIVE_INFINITY }),
    ).toBeCloseTo(0.05, 5);
  });

  it("rises monotonically with the time constant", () => {
    const taus = [0.011, 0.02, 0.04, 0.06, 0.08, 0.099];
    const mapped = taus.map((timeConstantSeconds) =>
      shutterToPovPersistence({ mode: "eye", timeConstantSeconds }),
    );
    for (let i = 1; i < mapped.length; i++) {
      expect(mapped[i]!).toBeGreaterThan(mapped[i - 1]!);
    }
  });
});
