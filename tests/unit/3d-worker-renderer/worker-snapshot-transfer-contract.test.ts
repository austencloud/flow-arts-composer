import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const viewerSource = readFileSync(
  "src/lib/shared/3d/components/WorkerViewer3DScene.svelte",
  "utf8"
);
const rendererSource = readFileSync(
  "src/lib/shared/3d/worker-renderer/components/WorkerEnvironmentRenderer.svelte",
  "utf8"
);
const canvasSource = readFileSync(
  "src/lib/shared/3d/components/Viewer3DCanvas.svelte",
  "utf8"
);

describe("worker snapshot transfer boundary", () => {
  it("keeps frame snapshots raw and lets postMessage own the single clone", () => {
    expect(viewerSource).toMatch(
      /let performers = \$state\.raw<readonly WorkerPerformerSnapshot\[\]>/
    );
    expect(viewerSource).toMatch(
      /let effects = \$state\.raw<WorkerSceneEffectsSnapshot>/
    );
    expect(viewerSource).toMatch(
      /let interactionFrame = \$state\.raw<WorkerPerformerInteractionFrame \| null>/
    );
    expect(rendererSource).not.toContain("$state.snapshot(performers)");
    expect(rendererSource).not.toContain("$state.snapshot(effects)");
  });

  it("uses each performer's resolved prop when a viewer-wide override is absent", () => {
    expect(viewerSource).toContain("leftPropType?: string | null;");
    expect(viewerSource).toContain("rightPropType?: string | null;");
    expect(viewerSource).toMatch(
      /resolvePerformerProp\([\s\S]*PropType\.STAFF/
    );
    expect(canvasSource).not.toContain("leftPropType !== null");
    expect(canvasSource).not.toContain("rightPropType !== null");
    expect(canvasSource).toContain(
      "workerHostExact && workerEnvironment && sequenceData"
    );
  });
});
