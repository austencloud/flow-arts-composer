import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const panelPath = resolve(
  process.cwd(),
  "src/lib/features/create/shared/components/sequence-actions/SequenceActionsPanel.svelte"
);

describe("SequenceActionsPanel ownership", () => {
  it("delegates panel lifecycle and action ordering to their canonical owners", () => {
    const source = readFileSync(panelPath, "utf8");

    expect(source).toContain("createSequenceActionsPanelState");
    expect(source).toContain("createSequenceActionsOrchestrator");
    expect(source).not.toContain("function withTransform");
    expect(source.match(/CreateModuleState\.pushUndoSnapshot/g)).toHaveLength(
      1
    );
    expect(source).not.toContain("extensionFlowCoordinator.appendBridge");
    expect(source).not.toContain("extensionFlowCoordinator.applyLoop");
    expect(source).not.toContain("activeSequenceState.shiftStartPlacement");
  });
});
