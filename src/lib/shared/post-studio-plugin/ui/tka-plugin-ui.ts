import type { PluginUi } from "@austencloud/video-editor";
import { tkaAddItems } from "./tka-add-items";
import { tkaCropSteps } from "./tka-crop-steps";
import { NO_FACTS, tkaRow, tkaRowFacts } from "./tka-row";
import { tkaTimelineJoin } from "./tka-timeline-join";
import { TKA_TOOLS } from "./tka-tools";

/** Tasks 13 to 15b add toolPanel, mediaSublayer, canvasOverlays, modes, panels, createBindings and layerContextMenu. */
export function createTkaPluginUi(): PluginUi {
  return {
    tools: TKA_TOOLS,
    toolRow: (item, core, editor) =>
      tkaRow(item, core, item ? tkaRowFacts(item, editor) : NO_FACTS),
    addItems: tkaAddItems,
    cropSteps: tkaCropSteps,
    timelineJoin: tkaTimelineJoin,
  };
}
