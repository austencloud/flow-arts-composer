import type { PluginUi, VideoEditorState } from "@austencloud/video-editor";
import { deriveWord } from "#lib/shared/foundation/services/word-deriver.js";
import { simplifyRepeatedWord } from "#lib/shared/foundation/utils/word-simplifier.js";
import { qrImageForAppearance } from "./post-qr-image-appearance";
import { tkaAddItems } from "./tka-add-items";
import { TKA_BACKUP } from "./tka-backup";
import { layerQrAppearance } from "./tka-canvas-layer";
import { tkaCropSteps } from "./tka-crop-steps";
import { tkaEditorOf } from "./tka-editor-context";
import { createTkaBindings } from "./tka-painters.svelte";
import { TKA_ARRANGEMENT_LANES } from "./tka-arrangement-lanes";
import { NO_FACTS, tkaRow, tkaRowFacts } from "./tka-row";
import { tkaTimelineJoin } from "./tka-timeline-join";
import { TKA_TIMING_MODE } from "./tka-timing-mode";
import { TKA_TOOLS } from "./tka-tools";
import TkaItemTools from "./TkaItemTools.svelte";
import TkaLookPanel from "./TkaLookPanel.svelte";
import TkaMediaSublayer from "./TkaMediaSublayer.svelte";
import TkaStripGuide from "./TkaStripGuide.svelte";

/**
 * The post's own title, else its sequence's name or derived word, with a
 * repeated word simplified; null when it has none, so the editor shows its
 * default name.
 */
function subjectName(editor: VideoEditorState): string | null {
  const s = tkaEditorOf(editor)?.sequence;
  const name =
    editor.project.title || (s ? s.displayName || deriveWord(s) : "");
  return name ? simplifyRepeatedWord(name) : null;
}

/**
 * Tools that need the post's sequence: its look and beat tapping. An
 * arrangement's Look is its own, so it stays without one.
 */
const SEQUENCE_TOOLS = new Set(["look", "beats"]);

/** tka's editor UI: its tools and panels, the timing mode and its backup. */
export function createTkaPluginUi(): PluginUi {
  return {
    toolPanel: TkaItemTools,
    tools: TKA_TOOLS,
    toolRow: (item, core, editor) => {
      const row = tkaRow(item, core, item ? tkaRowFacts(item, editor) : NO_FACTS);
      return tkaEditorOf(editor)?.sequence === null &&
        item?.kind !== "arrangement"
        ? row.filter((id) => !SEQUENCE_TOOLS.has(id))
        : row;
    },
    // An arrangement takes a transition, but not while a cell is in hand.
    transitionOffered: (item, editor) =>
      item.kind !== "arrangement" || !tkaEditorOf(editor)?.wrapper.selectedCell,
    itemLanes: TKA_ARRANGEMENT_LANES,
    addItems: tkaAddItems,
    cropSteps: tkaCropSteps,
    timelineJoin: tkaTimelineJoin,
    mediaSublayer: {
      renderModes: [
        "sequence-animation",
        "choreo-card",
        "tunnel",
        "mandala",
        "arrangement",
      ],
      component: TkaMediaSublayer,
    },
    // A QR image in its own look, else the poster look of the card under it.
    imageRestyle: {
      look: ({ editor, sourceItem, underlyingItem }) =>
        layerQrAppearance(
          tkaEditorOf(editor)?.cardRenderOptions ?? null,
          sourceItem,
          underlyingItem
        ) ?? null,
      render: (source, look) =>
        look === "light" || look === "dark"
          ? qrImageForAppearance(source, look)
          : Promise.resolve(null),
    },
    // The save menu for the post's sequence, where a media layer was
    // right-clicked, through the facts tka registered for that editor.
    layerContextMenu: (event, editor) =>
      tkaEditorOf(editor)?.openSaveMenu?.(event),
    canvasOverlays: [TkaStripGuide],
    modes: [TKA_TIMING_MODE],
    // A post with no sequence starts from footage, text or an image.
    emptyHint: (editor, where) => {
      if (editor.project.sourceKind !== "none") return null;
      if (where === "preview")
        return "Add footage, text, or an image to see the post here";
      return editor.project.tracks.some((track) => track.items.length > 0)
        ? "Add footage to the main track"
        : "Start with footage, text, or an image";
    },
    // From a cell, Back goes up to its arrangement, not out of it.
    back: (editor) => {
      const wrapper = tkaEditorOf(editor)?.wrapper;
      if (!wrapper || wrapper.selectedCellId === null) return false;
      wrapper.selectCell(null);
      return true;
    },
    panels: { look: TkaLookPanel },
    createBindings: createTkaBindings,
    backup: TKA_BACKUP,
    subjectName,
    // The simplified word; without one the editor names the file after its
    // default name, as before.
    exportFileStem: (editor) => {
      const name = subjectName(editor);
      return name ? simplifyRepeatedWord(name) : null;
    },
  };
}
