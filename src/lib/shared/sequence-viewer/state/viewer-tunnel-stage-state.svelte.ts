import type { ContextMenuEntry } from "#lib/shared/components/context-menu/context-menu-types.js";
import type { TunnelViewController } from "../tunnel/tunnel-view-controller.svelte";

export interface TunnelCanvasSaveAction {
  label: string;
  run: () => void;
}

export function createViewerTunnelStageState(controller: TunnelViewController) {
  let canvas = $state<HTMLCanvasElement | null>(null);
  let saveAction = $state.raw<TunnelCanvasSaveAction | null>(null);

  return {
    controller,
    get canvas() {
      return canvas;
    },
    setCanvas(next: HTMLCanvasElement | null): void {
      canvas = next;
    },
    get saveMenuItems(): ContextMenuEntry[] {
      return saveAction
        ? [
            {
              id: "save-tunnel",
              label: saveAction.label,
              icon: "fa-bookmark",
              action: saveAction.run,
            },
            { type: "separator" },
          ]
        : [];
    },
    registerSaveAction(action: TunnelCanvasSaveAction): () => void {
      saveAction = action;
      return () => {
        if (saveAction === action) saveAction = null;
      };
    },
  };
}

export type ViewerTunnelStageState = ReturnType<
  typeof createViewerTunnelStageState
>;
