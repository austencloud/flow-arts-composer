import type { PluginUi } from "@austencloud/video-editor";
import { tkaAddItems } from "./tka-add-items";
import { TKA_BACKUP } from "./tka-backup";
import { tkaCropSteps } from "./tka-crop-steps";
import { tkaEditorOf } from "./tka-editor-context";
import { createTkaBindings } from "./tka-painters.svelte";
import { NO_FACTS, tkaRow, tkaRowFacts } from "./tka-row";
import { tkaTimelineJoin } from "./tka-timeline-join";
import { TKA_TIMING_MODE } from "./tka-timing-mode";
import { TKA_TOOLS } from "./tka-tools";
import TkaItemTools from "./TkaItemTools.svelte";
import TkaLookPanel from "./TkaLookPanel.svelte";
import TkaMediaSublayer from "./TkaMediaSublayer.svelte";
import TkaStripGuide from "./TkaStripGuide.svelte";

/** tka's editor UI: its tools and panels, the timing mode and its backup. */
export function createTkaPluginUi(): PluginUi {
  return {
    toolPanel: TkaItemTools,
    tools: TKA_TOOLS,
    toolRow: (item, core, editor) =>
      tkaRow(item, core, item ? tkaRowFacts(item, editor) : NO_FACTS),
    addItems: tkaAddItems,
    cropSteps: tkaCropSteps,
    timelineJoin: tkaTimelineJoin,
    mediaSublayer: {
      renderModes: ["sequence-animation", "choreo-card", "tunnel", "mandala"],
      component: TkaMediaSublayer,
    },
    // The save menu for the post's sequence, where a media layer was
    // right-clicked, through the facts tka registered for that editor.
    layerContextMenu: (event, editor) =>
      tkaEditorOf(editor)?.openSaveMenu?.(event),
    canvasOverlays: [TkaStripGuide],
    modes: [TKA_TIMING_MODE],
    panels: { look: TkaLookPanel },
    createBindings: createTkaBindings,
    backup: TKA_BACKUP,
  };
}
