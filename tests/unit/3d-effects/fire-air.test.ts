import { InstancedBufferAttribute, InstancedMesh, Object3D } from "three";
import { describe, expect, it } from "vitest";
import {
  FireRenderer3D,
  fireAirDraft,
} from "#lib/shared/3d/effects/fire/fire-renderer-3d.js";
import {
  BlendedCurlGrid2D,
  SampledCurlGrid2D,
  curl2D,
} from "#lib/shared/3d/effects/smoke/smoke-curl-field.js";
import { QualityTier } from "#lib/shared/3d/effects/types.js";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
import { resolveFire3D } from "#lib/shared/effects/translators/webgl3d-translator.js";

/** Largest change in the field at one point between samples 1 ms apart. */
function largestStep(
  sample: (time: number) => { vx: number; vy: number }
): number {
  let largest = 0;
  let previous = { ...sample(0) };
  for (let time = 0.001; time < 3; time += 0.001) {
    const next = { ...sample(time) };
    largest = Math.max(
      largest,
      Math.hypot(next.vx - previous.vx, next.vy - previous.vy)
    );
    previous = next;
  }
  return largest;
}

describe("3D fire air", () => {
  it("blends between bakes so the air never jumps", () => {
    const stepped = new SampledCurlGrid2D(32, 8, 1 / 4);
    const blended = new BlendedCurlGrid2D(32, 8, 0.3);
    const scratch = { vx: 0, vy: 0 };

    expect(largestStep((t) => stepped.sample(4.2, 3.7, t))).toBeGreaterThan(
      0.3
    );
    expect(
      largestStep((t) => blended.sampleInto(4.2, 3.7, t, scratch))
    ).toBeLessThan(0.05);
  });

  it("scales the draft from the raw field's typical speed", () => {
    const speeds: number[] = [];
    for (let i = 0; i < 4000; i++) {
      const field = curl2D((i * 0.37) % 8, (i * 0.61) % 8, i * 0.013);
      speeds.push(Math.hypot(field.vx, field.vy));
    }
    speeds.sort((a, b) => a - b);
    const median = speeds[speeds.length >> 1]!;
    expect(median).toBeGreaterThan(3.75 * 0.85);
    expect(median).toBeLessThan(3.75 * 1.15);

    expect(fireAirDraft(0)).toBeCloseTo(0.04, 5);
    expect(fireAirDraft(0.5)).toBeCloseTo(0.24, 5);
    expect(fireAirDraft(1)).toBeCloseTo(0.84, 5);
  });

  it("keeps a still flame standing at the default setting", () => {
    const parent = new Object3D();
    const renderer = new FireRenderer3D(QualityTier.HIGH, {
      maxDynamicLights: 0,
    });
    renderer.initialize(parent);
    renderer.updateConfig(resolveFire3D(DEFAULT_EFFECTS_CONFIG.fire));
    const mesh = parent.children.find(
      (child): child is InstancedMesh => child instanceof InstancedMesh
    )!;
    const centers = mesh.geometry.getAttribute(
      "aCenter"
    ) as InstancedBufferAttribute;

    const wick = { x: 0.3, y: 1.4, z: 0 };
    const leans: number[] = [];
    for (let frame = 0; frame < 360; frame++) {
      renderer.update(
        [
          {
            sourceId: 1,
            position: wick,
            velocityX: 0,
            velocityY: 0,
            velocityZ: 0,
            speed: 0,
          },
        ],
        1 / 60
      );
      if (frame < 30) continue;
      let sum = 0;
      for (let i = 0; i < mesh.count; i++) sum += centers.getX(i) - wick.x;
      leans.push(sum / mesh.count);
    }

    const mean = leans.reduce((a, b) => a + b, 0) / leans.length;
    const sway = Math.sqrt(
      leans.reduce((a, b) => a + (b - mean) ** 2, 0) / leans.length
    );
    let largestStepOff = 0;
    for (let i = 1; i < leans.length; i++) {
      largestStepOff = Math.max(
        largestStepOff,
        Math.abs(leans[i]! - leans[i - 1]!)
      );
    }
    // The gas leaves the wick 2 cm ragged; the air may lean the flame
    // gently but must not throw it about.
    expect(Math.abs(mean)).toBeLessThan(0.03);
    expect(sway).toBeLessThan(0.025);
    expect(largestStepOff).toBeLessThan(0.006);

    renderer.dispose();
  });
});
