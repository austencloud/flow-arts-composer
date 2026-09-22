<!--
  CanvasContextMenuHost - Orchestrator for the canvas right-click context menu.
  Quick-access submenus for Effects, Efforts, Path Shape.
-->
<script lang="ts">
  import VisualSavePrompt from "$lib/shared/library/components/VisualSavePrompt.svelte";
  let savePrompt: VisualSavePrompt | undefined = $state();
  import { onDestroy } from "svelte";
  import ContextMenu from "$lib/shared/components/context-menu/ContextMenu.svelte";
  import type {
    ContextMenuState,
    ContextMenuEntry,
  } from "$lib/shared/components/context-menu/context-menu-types";
  import { composeMenu } from "$lib/shared/components/context-menu/compose-menu";
  import { buildVisualSequenceSaveMenuItem } from "$lib/shared/library/services/visual-sequence-save-menu-item";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import { buildCanvasContextMenuItems } from "./canvas-context-menu-builder";
  import {
    getAnimationVisibilityManager,
    type AnimationVisibilityStateManager,
  } from "../../state/animation-visibility-state.svelte";
  import { getViewer3DContext } from "$lib/shared/3d/context/viewer-3d-context";
  import { getEffectsConfigContext } from "$lib/shared/effects/state/effects-config-context";
  interface Props {
    sequence?: SequenceData | null;
    leftPropType?: string | null;
    rightPropType?: string | null;
    showSettings?: boolean;
    onSaveToLibrary?: () => void | Promise<void>;
    disassembled?: boolean;
    onToggleDisassemble?: () => void;
    captureEffectDiagnostics?: () => Record<string, unknown>;
    onToggle3DView?: () => void;
    /** Extra entries a consumer injects (e.g. "Save tunnel"). Prepended before
     *  the built-in items. Defaults to [] so existing consumers are unaffected. */
    extraItems?: ContextMenuEntry[];
    /** Canvas-scoped manager when this animator does not use the global state. */
    visibilityManager?: AnimationVisibilityStateManager;
  }

  const {
    sequence,
    leftPropType,
    rightPropType,
    showSettings = true,
    onSaveToLibrary,
    disassembled = false,
    onToggleDisassemble,
    captureEffectDiagnostics,
    onToggle3DView,
    extraItems = [],
    visibilityManager: visibilityManagerOverride,
  }: Props = $props();

  // Try to read the viewer-3d context. When this component is rendered inside
  // a sequence viewer, the orchestrator will have set it. In other contexts
  // (e.g., the compose tab) it won't be present and we gracefully omit the
  // 3D menu item.
  let viewer3DState: ReturnType<typeof getViewer3DContext> | undefined;
  try {
    viewer3DState = getViewer3DContext();
  } catch {
    // Context not available - not in a sequence viewer
  }

  let menuState: ContextMenuState = $state({ open: false });
  let menuItemsVersion: number = $state(0);

  const visibilityManager =
    visibilityManagerOverride ?? getAnimationVisibilityManager();
  let effectsConfigState: ReturnType<typeof getEffectsConfigContext> | null =
    null;
  try {
    effectsConfigState = getEffectsConfigContext();
  } catch {
    // Context not available in some host environments
  }

  function onSettingsChanged(): void {
    menuItemsVersion++;
  }

  visibilityManager.registerObserver(onSettingsChanged);

  onDestroy(() => {
    visibilityManager.unregisterObserver(onSettingsChanged);
  });

  function closeContextMenu(): void {
    menuState = { open: false };
  }

  const menuItems: ContextMenuEntry[] = $derived.by(() => {
    // Touch menuItemsVersion to re-derive when visibility settings change
    void menuItemsVersion;

    return composeMenu([
      {
        entries: [
          ...(sequence
            ? [
                buildVisualSequenceSaveMenuItem(
                  sequence,
                  {
                    leftPropType,
                    rightPropType,
                    pathShape: visibilityManager.getPathShape(),
                  },
                  onSaveToLibrary ??
                    (() =>
                      savePrompt?.request(sequence, {
                        leftPropType,
                        rightPropType,
                        pathShape: visibilityManager.getPathShape(),
                      }))
                ),
              ]
            : []),
          ...extraItems,
        ],
      },
      {
        entries: showSettings
          ? buildCanvasContextMenuItems({
              visibilityManager,
              effectsConfigState,
              disassembled,
              onToggleDisassemble,
              captureEffectDiagnostics,
              viewer3DState,
              onToggle3DView,
            })
          : [],
      },
    ]);
  });

  export function openContextMenu(x: number, y: number): void {
    menuState = { open: true, x, y };
  }
</script>

<VisualSavePrompt bind:this={savePrompt} />

<ContextMenu {menuState} items={menuItems} onClose={closeContextMenu} />
