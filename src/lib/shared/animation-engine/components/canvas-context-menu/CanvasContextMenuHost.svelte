<!--
  CanvasContextMenuHost - Orchestrator for the canvas right-click context menu.
  Quick-access submenus for Effects, Efforts, Path Shape.
-->
<script lang="ts">
  import VisualSavePrompt from "$lib/shared/library/components/VisualSavePrompt.svelte";
  let savePrompt: VisualSavePrompt | undefined = $state();
  import { onDestroy, tick } from "svelte";
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
  import { isSeamlesslyLoopable } from "$lib/shared/foundation/services/sequence-loopability-checker";
  import {
    downloadGif,
    exportLiveCanvasAsGif,
    waitForAnimationFrame,
  } from "../../services/live-canvas-gif-exporter";
  import {
    removeToast,
    showToast,
    toast,
  } from "$lib/shared/toast/state/toast-state.svelte";
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
    /** The rendered canvas is the GIF source so export matches the live animator. */
    canvas?: HTMLCanvasElement | null;
    currentStep?: number;
    isPlaying?: boolean;
    bpm?: number;
    onPlaybackToggle?: () => void;
    onProgressBarSeek?: (step: number) => void;
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
    canvas = null,
    currentStep = 0,
    isPlaying = false,
    bpm = 60,
    onPlaybackToggle,
    onProgressBarSeek,
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

  let gifExportAbortController: AbortController | null = null;
  let isGifExporting = $state(false);
  // Only full playback controllers can reset and restore a deterministic loop.
  // Other AnimatorCanvas embeds keep their existing context menu unchanged.
  const canDownloadAnimationGif = $derived(
    !disassembled &&
      !!canvas &&
      !!sequence &&
      !!onPlaybackToggle &&
      !!onProgressBarSeek
  );

  async function settlePlayback(): Promise<void> {
    await tick();
    await waitForAnimationFrame();
  }

  async function stopGifPlayback(): Promise<void> {
    // A sequence can naturally stop while GIF encoding is still finishing, so
    // one blind toggle is not enough: it would restart a completed sequence.
    // Toggle once, then use the refreshed prop to undo that restart when needed.
    onPlaybackToggle?.();
    await tick();
    if (isPlaying) {
      onPlaybackToggle?.();
      await tick();
    }
  }

  function getGifDurationMs(): number {
    const motionBeats =
      sequence?.steps.reduce(
        (total, step) => total + (step.duration ?? 1),
        0
      ) ?? 0;
    const includesEndHold = sequence ? !isSeamlesslyLoopable(sequence) : false;
    const totalBeats = 1 + motionBeats + (includesEndHold ? 1 : 0);
    return Math.max(200, (totalBeats * 60_000) / Math.max(bpm, 1));
  }

  function gifFilename(): string {
    const word = sequence?.word?.trim() || "animation";
    return `${word.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")}.gif`;
  }

  async function downloadAnimationGif(): Promise<void> {
    if (isGifExporting || !canvas || !sequence || !onPlaybackToggle) return;

    const wasPlaying = isPlaying;
    const previousStep = currentStep;
    const abortController = new AbortController();
    gifExportAbortController = abortController;
    isGifExporting = true;
    let progressToastId: string | null = null;

    try {
      // Start at a known point so a paused canvas cannot turn into a GIF of
      // repeated still frames. The live render remains the only source of
      // pixels, keeping the export faithful to the current settings.
      if (isPlaying) {
        onPlaybackToggle();
        await settlePlayback();
      }
      onProgressBarSeek?.(0);
      await settlePlayback();
      onPlaybackToggle();
      await settlePlayback();

      progressToastId = showToast({
        message: "Building GIF from this animation…",
        type: "info",
        duration: 0,
      });
      const blob = await exportLiveCanvasAsGif(canvas, {
        durationMs: getGifDurationMs(),
        signal: abortController.signal,
      });
      downloadGif(blob, gifFilename());
      toast.success("GIF downloaded.");
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        toast.error(
          error instanceof Error
            ? error.message
            : "GIF export could not finish."
        );
      }
    } finally {
      if (progressToastId) removeToast(progressToastId, "programmatic");
      // Restore both playhead and playback state, including when the sequence
      // reaches a natural end before the last GIF frame is captured.
      await stopGifPlayback();
      onProgressBarSeek?.(previousStep);
      await tick();
      if (wasPlaying) {
        onPlaybackToggle();
        await tick();
      }
      if (gifExportAbortController === abortController) {
        gifExportAbortController = null;
        isGifExporting = false;
      }
    }
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
          ...(canDownloadAnimationGif
            ? [
                {
                  id: "download-animation-gif",
                  label: isGifExporting ? "Building GIF…" : "Download as a GIF",
                  icon: "fa-file-arrow-down",
                  disabled: isGifExporting,
                  action: downloadAnimationGif,
                },
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

  onDestroy(() => {
    gifExportAbortController?.abort();
  });
</script>

<VisualSavePrompt bind:this={savePrompt} />

<ContextMenu {menuState} items={menuItems} onClose={closeContextMenu} />
