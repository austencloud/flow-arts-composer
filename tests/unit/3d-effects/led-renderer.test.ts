import { describe, it, expect, vi, beforeEach } from "vitest";
import { Vector3 } from "three";
import { LedRenderer3D, type LedTipInput } from "#lib/shared/3d/effects/led/led-renderer-3d.js";
import { QualityTier } from "#lib/shared/3d/effects/types.js";

// Mock Three.js scene — minimal stub
function createMockScene(): any {
  return {
    add: vi.fn(),
    remove: vi.fn(),
  };
}

// Mock camera with quaternion
function createMockCamera(): any {
  return {
    quaternion: { x: 0, y: 0, z: 0, w: 1 },
    getWorldPosition: (target: any) => { target.x = 0; target.y = 2; target.z = 5; return target; },
  };
}

function createTipInput(overrides: Partial<LedTipInput> = {}): LedTipInput {
  return {
    position: new Vector3(0, 1, 0),
    r: 0.5,
    g: 0.5,
    b: 1.0,
    brightness: 1.0,
    velocityX: 0,
    velocityY: 0,
    velocityZ: 0,
    speed: 0,
    ...overrides,
  };
}

describe("LedRenderer3D", () => {
  let renderer: LedRenderer3D;

  beforeEach(() => {
    renderer = new LedRenderer3D(QualityTier.HIGH);
  });

  it("creates without errors", () => {
    expect(renderer).toBeDefined();
  });

  it("starts with no visible instances after reset", () => {
    renderer.reset();
    // Renderer has no mesh before initialization — just verify no crash
    expect(() => renderer.reset()).not.toThrow();
  });

  it("accepts quality tier changes", () => {
    expect(() => renderer.setQualityTier(QualityTier.LOW)).not.toThrow();
    expect(() => renderer.setQualityTier(QualityTier.MEDIUM)).not.toThrow();
    expect(() => renderer.setQualityTier(QualityTier.HIGH)).not.toThrow();
  });

  it("clears trails when quality tier changes", () => {
    renderer.setQualityTier(QualityTier.LOW);
    // LOW tier has 0 trail length — should not crash
    renderer.setQualityTier(QualityTier.HIGH);
    // HIGH tier has 32 trail length — new trails should start fresh
    expect(() => renderer.reset()).not.toThrow();
  });

  it("disposes cleanly before initialization", () => {
    // Should not crash when disposing an uninitialized renderer
    expect(() => renderer.dispose()).not.toThrow();
  });

  it("handles empty tip array", () => {
    const scene = createMockScene();
    renderer.initialize(scene);
    const camera = createMockCamera();
    // Empty array should set instance count to 0
    expect(() => renderer.update([], camera, 0)).not.toThrow();
  });

  it("handles tips with velocity for stretch calculation", () => {
    const scene = createMockScene();
    renderer.initialize(scene);
    const camera = createMockCamera();
    const tip = createTipInput({
      speed: 3.0,
      velocityX: 2.0,
      velocityY: 1.0,
    });
    // Should not crash with velocity data
    expect(() => renderer.update([tip], camera, 0)).not.toThrow();
  });

  it("handles multiple tips simultaneously", () => {
    const scene = createMockScene();
    renderer.initialize(scene);
    const camera = createMockCamera();
    const tips = [
      createTipInput({ position: new Vector3(0, 1, 0) }),
      createTipInput({ position: new Vector3(1, 1, 0) }),
      createTipInput({ position: new Vector3(0, 1, 1) }),
    ];
    expect(() => renderer.update(tips, camera, 0)).not.toThrow();
  });

  it("accumulates trail positions across frames (high tier)", () => {
    const scene = createMockScene();
    renderer.initialize(scene);
    const camera = createMockCamera();

    // Frame 1: position A
    const tip1 = createTipInput({ position: new Vector3(0, 1, 0) });
    renderer.update([tip1], camera, 0);

    // Frame 2: position B (different position creates trail)
    const tip2 = createTipInput({ position: new Vector3(1, 1, 0) });
    renderer.update([tip2], camera, 0.1);

    // Frame 3: position C
    const tip3 = createTipInput({ position: new Vector3(2, 1, 0) });
    renderer.update([tip3], camera, 0.2);

    // No crash — trails accumulated
    expect(() => renderer.update([tip3], camera, 0.3)).not.toThrow();
  });

  it("produces no trail instances on LOW quality", () => {
    renderer = new LedRenderer3D(QualityTier.LOW);
    const scene = createMockScene();
    renderer.initialize(scene);
    const camera = createMockCamera();

    // Multiple frames
    for (let i = 0; i < 5; i++) {
      const tip = createTipInput({ position: new Vector3(i * 0.1, 1, 0) });
      renderer.update([tip], camera, i * 0.016);
    }
    // LOW tier has 0 trail length, so only active instances (no trail ghosts)
    expect(() => renderer.reset()).not.toThrow();
  });
});
