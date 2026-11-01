/**
 * The card-content switches: what a choreo card shows in its header, on its
 * step cells and on its start cell, and what fills its info cells. One list
 * for every surface that offers them — the viewer's card panel (all three of
 * its layouts), the card's context menu and Settings → Display — so a label or
 * handler is written once.
 *
 * Each group names where its marks draw: Header (word, level, LOOP), Steps
 * (step numbers, reversal marks), Start (the start cell, its hand colour key)
 * and Info (the chooser below). Reversals and the hand key are pictograph
 * manager keys, but only a card draws them, so they live here.
 *
 * Layout choices (columns, start lane) and footer text are not here: they are
 * per-step-count or content decisions that only the card panel owns.
 */

import { t } from "#lib/shared/i18n/i18n.svelte.js";
import type { ContextMenuItem } from "#lib/shared/components/context-menu/context-menu-types.js";
import {
  getInfoCellCount,
  infoCellPickOf,
  infoCellPicks,
  planInfoCellPick,
  resolveInfoCellDisplay,
  type InfoCellChoice,
  type InfoCellPick,
} from "#lib/shared/sequence-viewer/services/info-cell-display.js";
import {
  getStepColumnsForLayout,
  type ResolvedAutoLayout,
} from "#lib/shared/render/services/container-aware-layout.js";

/** The slice of ImageCompositionStateManager the switches read and write. */
export interface CardContentComposition {
  readonly addWord: boolean;
  readonly addStepNumbers: boolean;
  readonly addDifficultyLevel: boolean;
  readonly showLoopGlyph: boolean;
  readonly includeStartPlacement: boolean;
  readonly showQRCode: boolean;
  readonly showMandala: boolean;
  setAddWord(value: boolean): void;
  setAddBeatNumbers(value: boolean): void;
  setAddDifficultyLevel(value: boolean): void;
  setShowLoopGlyph(value: boolean): void;
  setIncludeStartPlacement(value: boolean): void;
  setShowQRCode(value: boolean): void;
  setShowMandala(value: boolean): void;
}

/** The slice of VisibilityStateManager the card's own marks read and write. */
export interface CardContentVisibility {
  getRawGlyphVisibility(glyphType: string): boolean;
  setGlyphVisibility(glyphType: string, visible: boolean): void;
}

export interface CardContentToggle {
  /** Stable id, also the analytics setting name the card panel reports. */
  id: string;
  label: string;
  icon?: string;
  active: boolean;
  set: (value: boolean) => void;
}

export interface CardContentToggleGroups {
  header: CardContentToggle[];
  steps: CardContentToggle[];
  start: CardContentToggle[];
}

export function buildCardContentToggles(
  c: CardContentComposition,
  options: { visibility: CardContentVisibility }
): CardContentToggleGroups {
  const vm = options.visibility;
  const glyph = (
    id: string,
    key: "reversalIndicators" | "handColorKey",
    label: string,
    icon: string
  ): CardContentToggle => ({
    id,
    label,
    icon,
    active: vm.getRawGlyphVisibility(key),
    set: (v) => vm.setGlyphVisibility(key, v),
  });

  const header: CardContentToggle[] = [
    {
      id: "word",
      label: t("viewer_ui_word"),
      icon: "fas fa-font",
      active: c.addWord,
      set: (v) => c.setAddWord(v),
    },
    {
      id: "difficulty",
      label: t("generator_level"),
      icon: "fas fa-signal",
      active: c.addDifficultyLevel,
      set: (v) => c.setAddDifficultyLevel(v),
    },
    {
      id: "loop_glyph",
      label: "LOOP",
      icon: "fas fa-infinity",
      active: c.showLoopGlyph,
      set: (v) => c.setShowLoopGlyph(v),
    },
  ];

  const steps: CardContentToggle[] = [
    {
      id: "step_numbers",
      label: t("animation_menu_step_numbers"),
      icon: "fas fa-list-ol",
      active: c.addStepNumbers,
      set: (v) => c.setAddBeatNumbers(v),
    },
    glyph(
      "reversals",
      "reversalIndicators",
      t("share_overlay_reversals"),
      "fas fa-rotate-left"
    ),
  ];

  const start: CardContentToggle[] = [
    {
      id: "start_position",
      label: t("viewer_ui_show"),
      icon: "fas fa-flag-checkered",
      active: c.includeStartPlacement,
      set: (v) => c.setIncludeStartPlacement(v),
    },
    glyph(
      "hand_color_key",
      "handColorKey",
      t("viewer_ui_hand_key"),
      "fas fa-palette"
    ),
  ];

  return { header, steps, start };
}

/** The two card marks a pictograph's own menu cannot offer. */
const CARD_MARK_IDS: ReadonlySet<string> = new Set([
  "reversals",
  "hand_color_key",
]);

/**
 * The step cells' reversal marks and the start cell's hand colour key as menu
 * rows, so a card's context menu carries them from this list rather than a
 * second hand-written row. Menu builders write bare `fa-*` names.
 */
export function cardMarkMenuItems(
  groups: CardContentToggleGroups
): ContextMenuItem[] {
  return [...groups.steps, ...groups.start]
    .filter((item) => CARD_MARK_IDS.has(item.id))
    .map((item) => ({
      id: `card-${item.id.replace(/_/g, "-")}`,
      label: item.label,
      icon: item.icon?.replace(/^fas\s+/, ""),
      checked: item.active,
      keepOpen: true,
      action: () => item.set(!item.active),
    }));
}

// ---- Info cell ---------------------------------------------------------------

/** What the chooser reads and writes beyond the two global switches. */
export interface InfoCellComposition extends CardContentComposition {
  getInfoCellChoiceForStepCount(stepCount: number): InfoCellChoice;
  setInfoCellChoiceForStepCount(stepCount: number, value: InfoCellChoice): void;
  getColumnCountForStepCount(stepCount: number): number | null;
  getStartPlacementLayoutForStepCount(stepCount: number): "row" | "column";
}

export interface InfoCellChooser {
  /** How many info cells this card has; the chooser exists only from one. */
  count: number;
  options: { value: InfoCellPick; label: string }[];
  /** What the card shows now, read back through resolveInfoCellDisplay. */
  value: InfoCellPick;
  select: (pick: InfoCellPick) => void;
}

export interface InfoCellCardGeometry {
  stepCount: number;
  startPlacementLayout: "row" | "column";
  /** Step columns the card draws (an override or the measured Auto winner). */
  columnCount: number | null;
}

/**
 * The grid a card of `stepCount` steps draws, as its info cells see it: the
 * stored column override, else the live card's measured Auto winner (which
 * also decides the start lane), else the stored lane and the layout table.
 */
export function infoCellGeometryFor(
  c: InfoCellComposition,
  stepCount: number,
  resolvedAutoLayout: ResolvedAutoLayout | null | undefined
): InfoCellCardGeometry {
  const override = c.getColumnCountForStepCount(stepCount);
  const auto =
    override === null && resolvedAutoLayout?.stepCount === stepCount
      ? resolvedAutoLayout
      : null;
  return {
    stepCount,
    startPlacementLayout:
      auto && auto.startPlacement !== "none"
        ? auto.startPlacement
        : c.getStartPlacementLayoutForStepCount(stepCount),
    columnCount: override ?? (auto ? getStepColumnsForLayout(auto) : null),
  };
}

/**
 * One chooser for the card's info cells: QR, Mandala, Both (two or more
 * cells), None. Null when the card has no info cell (start hidden, a one-count
 * card), so a host shows nothing rather than a dead control.
 */
export function buildInfoCellChooser(
  c: InfoCellComposition,
  geometry: InfoCellCardGeometry,
  options: { canQRCode: boolean }
): InfoCellChooser | null {
  const args = {
    ...geometry,
    includeStartPlacement: c.includeStartPlacement,
  };
  const count = getInfoCellCount(args);
  const picks = infoCellPicks(count, options.canQRCode);
  if (picks.length === 0) return null;

  const resolved = resolveInfoCellDisplay({
    ...args,
    showQRCode: c.showQRCode,
    showMandala: c.showMandala,
    infoCellChoice: c.getInfoCellChoiceForStepCount(geometry.stepCount),
    isAuthenticated: options.canQRCode,
  });

  // Words, not icons: SegmentedControl draws an option's icon instead of its
  // label, and a lone asterisk or ban sign does not say "Mandala" or "None".
  const labels: Record<InfoCellPick, string> = {
    qr: "QR",
    mandala: t("share_mandala"),
    both: t("viewer_ui_both"),
    none: t("viewer_ui_none"),
  };

  return {
    count,
    options: picks.map((value) => ({ value, label: labels[value] })),
    value: infoCellPickOf(resolved),
    select: (pick) => {
      const write = planInfoCellPick(pick, count);
      if (c.showQRCode !== write.showQRCode) c.setShowQRCode(write.showQRCode);
      if (c.showMandala !== write.showMandala) {
        c.setShowMandala(write.showMandala);
      }
      if (write.infoCellChoice) {
        c.setInfoCellChoiceForStepCount(
          geometry.stepCount,
          write.infoCellChoice
        );
      }
    },
  };
}
