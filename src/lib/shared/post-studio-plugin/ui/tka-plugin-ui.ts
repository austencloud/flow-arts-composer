import type { PluginUi } from "@austencloud/video-editor";
import { tkaAddItems } from "./tka-add-items";
import { tkaCropSteps } from "./tka-crop-steps";
import { NO_FACTS, tkaRow, tkaRowFacts } from "./tka-row";
import { tkaTimelineJoin } from "./tka-timeline-join";
import { TKA_TOOLS } from "./tka-tools";
import TkaItemTools from "./TkaItemTools.svelte";

/** Tasks 14 to 15b add mediaSublayer, canvasOverlays, modes, panels, createBindings and layerContextMenu. */
export function createTkaPluginUi(): PluginUi {
  return {
    toolPanel: TkaItemTools,
    tools: TKA_TOOLS,
    toolRow: (item, core, editor) =>
      tkaRow(item, core, item ? tkaRowFacts(item, editor) : NO_FACTS),
    addItems: tkaAddItems,
    cropSteps: tkaCropSteps,
    timelineJoin: tkaTimelineJoin,
  };
}
