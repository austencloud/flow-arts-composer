import type { PluginUi } from "@austencloud/video-editor";
import { tkaAddItems } from "./tka-add-items";
import { tkaCropSteps } from "./tka-crop-steps";
import { tkaEditorOf } from "./tka-editor-context";
import { createTkaBindings } from "./tka-painters.svelte";
import { NO_FACTS, tkaRow, tkaRowFacts } from "./tka-row";
import { tkaTimelineJoin } from "./tka-timeline-join";
import { TKA_TOOLS } from "./tka-tools";
import TkaItemTools from "./TkaItemTools.svelte";
import TkaMediaSublayer from "./TkaMediaSublayer.svelte";
import TkaStripGuide from "./TkaStripGuide.svelte";

/** Task 15b adds modes and panels. */
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
    createBindings: createTkaBindings,
  };
}
