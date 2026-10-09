import { describe, expect, it } from "vitest";
import { chainTo, importGraph, repoPath } from "../helpers/import-graph";

describe("Create startup import boundaries", () => {
  it("can load the method chooser without the workspace editor", () => {
    const graph = importGraph([
      repoPath("src/lib/features/create/shared/components/CreateModule.svelte"),
    ]);
    const editor = repoPath(
      "src/lib/features/create/shared/components/StandardWorkspaceLayout.svelte"
    );
    expect(graph.files.has(editor), chainTo(graph, editor)).toBe(false);
    expect(
      graph.files.has(
        repoPath(
          "src/lib/features/create/shared/components/CreateFrontDoor.svelte"
        )
      )
    ).toBe(true);
  });

  it("can resolve the application shell without unopened dialogs", () => {
    const graph = importGraph([
      repoPath("src/lib/shared/application/components/MainApplication.svelte"),
    ]);
    for (const relative of [
      "src/lib/shared/navigation/components/AuthSheet.svelte",
      "src/lib/shared/support/components/SupportModal.svelte",
      "src/lib/shared/legal/components/LegalSheet.svelte",
      "src/lib/features/feedback/components/quick/QuickFeedbackPanel.svelte",
      "src/lib/features/feedback/components/my-feedback/MyFeedbackDetail.svelte",
    ]) {
      const dialog = repoPath(relative);
      expect(graph.files.has(dialog), chainTo(graph, dialog)).toBe(false);
    }
  });

  it("can host collection requests without downloading the picker UI", () => {
    const graph = importGraph([
      repoPath(
        "src/lib/features/library/components/collection-picker/CollectionPickerHost.svelte"
      ),
    ]);
    const picker = repoPath(
      "src/lib/features/library/components/collection-picker/CollectionPickerSheet.svelte"
    );
    expect(graph.files.has(picker), chainTo(graph, picker)).toBe(false);
  });
});
