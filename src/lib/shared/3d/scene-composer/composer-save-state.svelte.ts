import { getErrorHandler } from "#lib/shared/application/get-error-handler.js";
import type { ComposerPlacement, SceneComposerPlugin } from "./types";
import { FilePersistence } from "./persistence/file-persistence";

interface ComposerSaveStateOptions {
  getPlugin(): SceneComposerPlugin | undefined;
  getPlacements(): ComposerPlacement[];
  onSaved(): void;
  context: {
    module: string;
    tab: string;
  };
}

export function createComposerSaveState(options: ComposerSaveStateOptions) {
  const defaultPersistence = new FilePersistence();
  let status = $state<"idle" | "saving" | "saved" | "error">("idle");

  async function save(): Promise<void> {
    const plugin = options.getPlugin();
    if (!plugin || status === "saving") return;

    status = "saving";
    try {
      await (plugin.persistence ?? defaultPersistence).save(
        plugin.sceneId,
        options.getPlacements()
      );
      options.onSaved();
      status = "saved";
      setTimeout(() => (status = "idle"), 1500);
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      status = "error";
      getErrorHandler().showUserError({
        message: "Scene changes could not be saved.",
        technicalDetails: failure.message,
        error: failure,
        context: {
          ...options.context,
          action: "save-composer-placements",
          additionalData: { sceneId: plugin.sceneId },
        },
      });
      setTimeout(() => (status = "idle"), 2500);
    }
  }

  return {
    get status() {
      return status;
    },
    save,
  };
}

export type ComposerSaveState = ReturnType<typeof createComposerSaveState>;
