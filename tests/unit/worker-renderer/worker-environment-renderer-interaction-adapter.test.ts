import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const environmentRenderer = source(
  "src/lib/shared/3d/worker-renderer/components/WorkerEnvironmentRenderer.svelte"
);
const interactionAdapter = source(
  "src/lib/shared/3d/worker-renderer/components/WorkerPerformerInteractionAdapter.svelte"
);

describe("worker environment performer interaction adapter", () => {
  it("keeps input on one stable host across worker canvas handoffs", () => {
    expect(environmentRenderer).toContain(
      'class="worker-environment-renderer__interaction-surface"'
    );
    expect(environmentRenderer).toContain(
      "container: mountedInteractionSurface"
    );
    expect(environmentRenderer).toContain("{interactionSurface}");
    expect(environmentRenderer).toContain("projectionContainer={container}");
    expect(interactionAdapter).toContain(
      "createWorkerPerformerInteractionBridge({"
    );
    expect(interactionAdapter).toContain("interactionSurface,");
    expect(interactionAdapter).not.toMatch(
      /querySelector\([^)]*canvas|getElementsByTagName\([^)]*canvas/
    );
  });

  it("updates clone-safe interaction frames from live camera snapshots", () => {
    expect(interactionAdapter).toContain(
      "function currentFrame(): WorkerPerformerInteractionFrame"
    );
    expect(interactionAdapter).toContain(
      "position: [...cameraSnapshot.position]"
    );
    expect(interactionAdapter).toContain("position: { ...performer.position }");
    expect(interactionAdapter).toContain(
      "stageBounds: { ...frame.stageBounds }"
    );
    expect(interactionAdapter).toContain("bridge.update(currentFrame())");
    expect(environmentRenderer).toContain("cameraSnapshot = snapshot");
    expect(environmentRenderer).toContain("onChange: applyCameraSnapshot");
  });

  it("publishes hover and drag state for app-owned worker snapshots", () => {
    expect(interactionAdapter).toContain(
      "hoveredIndex: bridge?.hoveredIndex ?? null"
    );
    expect(interactionAdapter).toContain(
      "draggingIndex: bridge?.draggingIndex ?? null"
    );
    expect(interactionAdapter).toContain("requestAnimationFrame(() => {");
    expect(interactionAdapter).toContain('"lostpointercapture"');
    expect(environmentRenderer).toContain("onPerformerInteractionChange");
    expect(environmentRenderer).toContain(
      "onInteractionChange={handlePerformerInteractionChange}"
    );
    expect(environmentRenderer).toContain(
      "performerInteractionState.draggingIndex !== null"
    );
  });

  it("does not make the incoming-frame effect depend on state it writes", () => {
    expect(interactionAdapter).toContain(
      'import { onMount, untrack } from "svelte"'
    );
    expect(interactionAdapter).toContain("untrack(updateBridge)");
    expect(interactionAdapter).toContain("updateInteractionState();");
    expect(interactionAdapter).not.toContain(
      "updateInteractionState(true);\n    if (!("
    );
  });

  it("mirrors production camera-drag arbitration and adaptive DPR", () => {
    expect(environmentRenderer).toContain(
      "onControlStart: handleCameraInteractionStart"
    );
    expect(environmentRenderer).toContain(
      "onControlEnd: handleCameraInteractionEnd"
    );
    expect(environmentRenderer).toContain(
      "onCameraInteractionStart?.(snapshot)"
    );
    expect(environmentRenderer).toContain("onCameraInteractionEnd?.(snapshot)");
    expect(environmentRenderer).toContain(
      "cameraController?.setEnabled(value)"
    );
    expect(environmentRenderer).toContain("pixelRatio?: number");
    expect(environmentRenderer).toContain("?.setPixelRatio?.(value)");
    expect(environmentRenderer).toMatch(
      /\$effect\(\(\) => \{\s+applyPixelRatio\(pixelRatio\);/
    );
  });

  it("reports unsupported and exceptional interaction failures", () => {
    expect(interactionAdapter).toContain('reason: "unsupported"');
    expect(interactionAdapter).toContain("blockers: [...capability.blockers]");
    expect(interactionAdapter).toContain('fail("update-failed", error)');
    expect(interactionAdapter).toContain(
      'fail("initialization-failed", error)'
    );
    expect(environmentRenderer).toContain(
      "onFailure={onPerformerInteractionFailure}"
    );
  });
});
