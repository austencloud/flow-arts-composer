import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const bottomSheetSource = readFileSync(
  resolve("src/lib/shared/3d/components/controls/BottomSheet.svelte"),
  "utf8"
);
const mobileControlsSource = readFileSync(
  resolve("src/lib/shared/3d/components/MobileSceneControls.svelte"),
  "utf8"
);
const performerSheetSource = readFileSync(
  resolve("src/lib/shared/3d/components/MobileScenePerformerSheet.svelte"),
  "utf8"
);
const workspaceSource = readFileSync(
  resolve("src/lib/shared/3d/components/controls/SceneControlWorkspace.svelte"),
  "utf8"
);
const stageSource = readFileSync(
  resolve("src/lib/features/stage/StageModule.svelte"),
  "utf8"
);

describe("compact character sheet layout", () => {
  it("uses the host control offset instead of permanently reserving a second toolbar", () => {
    expect(bottomSheetSource).toContain(
      "bottom: var(--scene-controls-bottom, 0);"
    );
    expect(bottomSheetSource).not.toContain("bottom: max(6.875rem");
  });

  it("enters through the reduced-motion-aware canonical transition", () => {
    expect(bottomSheetSource).toContain(
      'import { flyFade } from "#lib/shared/transitions/motion.js"'
    );
    expect(bottomSheetSource).toContain(
      "transition:flyFade={{ y: 24, duration: DURATION.emphasis }}"
    );
    expect(bottomSheetSource).not.toContain('from "svelte/transition"');
  });

  it("makes room by folding the host timeline and restores its prior state", () => {
    expect(mobileControlsSource).toContain("onSheetChange?.(");
    expect(workspaceSource).toContain(
      "onSheetChange={handleCompactSheetChange}"
    );
    expect(stageSource).toContain(
      "onCompactSceneSheetChange={handleCompactSceneSheetChange}"
    );
    expect(stageSource).toContain(
      "if (!timelineExpanded && shouldRestore) timelineExpanded = true;"
    );
  });

  it("fades the redundant launcher while a compact sheet is open", () => {
    expect(mobileControlsSource).toContain(
      'data-sheet-open={openSheet !== null ? "true" : undefined}'
    );
    expect(mobileControlsSource).toContain(
      '.bar-cluster[data-sheet-open="true"]'
    );
    expect(mobileControlsSource).toContain("transition: none;");
  });

  it("uses short landscape width instead of crushing the editor vertically", () => {
    expect(performerSheetSource).toContain(
      "@media (min-width: 48rem) and (max-height: 34rem)"
    );
    expect(performerSheetSource).toContain(
      "grid-template-columns: minmax(17rem, 19rem) minmax(0, 1fr);"
    );
    expect(bottomSheetSource).toContain(
      "@media (min-width: 48rem) and (max-height: 34rem)"
    );
    expect(bottomSheetSource).toContain("position: absolute;");
  });
});
