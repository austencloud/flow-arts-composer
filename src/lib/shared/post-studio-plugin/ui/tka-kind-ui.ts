import type {
  ItemKindUi,
  SelectionLayerHandle,
  SelectionLayerProps,
} from "@austencloud/video-editor";
import {
  faArrowsUpDownLeftRight,
  faHeading,
  faImages,
  faTableCellsLarge,
  faWandMagicSparkles,
} from "@austencloud/video-editor/icons";
import { TUNNEL_PART } from "./tka-parts";
import TkaArrangementSelection from "./TkaArrangementSelection.svelte";
import TkaArrangementTools from "./TkaArrangementTools.svelte";
import { tkaEditorOf } from "./tka-editor-context";
import TkaKindTools from "./TkaKindTools.svelte";
import type { Component } from "svelte";

/**
 * The icons and names the editor shows for tka's kinds, and the item tool's
 * panels for the animation, moves and titles kinds. The icons are the glyphs
 * the timeline's blocks drew for these kinds. An animation's opening tunnel
 * is its part. An arrangement's cells are picked and dragged on the canvas,
 * and the panel names the cell in hand.
 */
export const TKA_KIND_UI: Record<
  "animation" | "moves" | "carousel" | "titles" | "arrangement",
  ItemKindUi
> = {
  animation: {
    icon: faWandMagicSparkles,
    label: (t) => t("post_editor_kind_animation"),
    toolPanel: TkaKindTools,
    parts: [TUNNEL_PART],
  },
  moves: {
    icon: faArrowsUpDownLeftRight,
    label: (t, item) =>
      item?.kind === "moves" && item.mode === "mandala"
        ? t("post_editor_kind_mandala")
        : t("post_editor_kind_moves"),
    toolPanel: TkaKindTools,
  },
  carousel: {
    icon: faImages,
    label: (t) => t("post_editor_kind_carousel"),
  },
  titles: {
    icon: faHeading,
    label: (t) => t("post_editor_kind_titles"),
    toolPanel: TkaKindTools,
  },
  arrangement: {
    icon: faTableCellsLarge,
    label: () => "Arrangement",
    toolPanel: TkaArrangementTools,
    panelTitle: (item, editor) => {
      const cell = tkaEditorOf(editor)?.wrapper.selectedCell;
      if (item.kind !== "arrangement" || !cell) return null;
      const place = cell.row * item.snapshot.gridCols + cell.col + 1;
      return `${item.label ?? "Arrangement"} · Cell ${place}`;
    },
    // Plain tsc types every .svelte import as svelte's legacy component, which
    // does not overlap a Component with exports; the cast names what the file is.
    selectionLayer: TkaArrangementSelection as unknown as Component<
      SelectionLayerProps,
      SelectionLayerHandle
    >,
  },
};
