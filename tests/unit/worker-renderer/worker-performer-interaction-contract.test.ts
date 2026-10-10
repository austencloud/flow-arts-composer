import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  WORKER_PERFORMER_BADGE_PICK_SCALE,
  WORKER_PERFORMER_PICK_PROXY,
} from "#lib/shared/3d/worker-renderer/services/worker-performer-interaction.js";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("worker performer interaction source contract", () => {
  it("pins the math-only pick volume to PerformerPickProxy", () => {
    const component = source(
      "src/lib/shared/3d/components/performer-interaction/PerformerPickProxy.svelte"
    );
    expect(component).toContain(
      `groundY + ${WORKER_PERFORMER_PICK_PROXY.centerHeight}`
    );
    expect(component).toContain(
      `<T.CapsuleGeometry args={[${WORKER_PERFORMER_PICK_PROXY.radius}, ${WORKER_PERFORMER_PICK_PROXY.length}, ${WORKER_PERFORMER_PICK_PROXY.capSegments}, ${WORKER_PERFORMER_PICK_PROXY.radialSegments}]} />`
    );
  });

  it("pins badge acquisition to the visible badge size", () => {
    const component = source(
      "src/lib/shared/3d/components/PerformerBadge3D.svelte"
    );
    expect(component).toContain(
      `scale={[${WORKER_PERFORMER_BADGE_PICK_SCALE}, ${WORKER_PERFORMER_BADGE_PICK_SCALE}, 1]}`
    );
  });

  it("does not create a renderer or request a graphics context", () => {
    const bridge = source(
      "src/lib/shared/3d/worker-renderer/services/worker-performer-interaction.ts"
    );
    expect(bridge).not.toMatch(/WebGLRenderer|WebGPURenderer|getContext\s*\(/);
  });
});
