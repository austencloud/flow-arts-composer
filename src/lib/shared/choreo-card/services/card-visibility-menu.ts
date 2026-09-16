/**
 * card-visibility-menu.ts
 *
 * The "Visibility" submenu of the choreo card context menu — the card-side
 * twin of the animation canvas's Visibility submenu, so right-clicking either
 * pane of Side-by-Side offers the same kind of quick toggles. Every entry reads
 * and writes the same manager the card options panel (ExportImagePanel) uses,
 * so the two surfaces never disagree; there is no menu-local state.
 *
 * Start placement (row/column) and the footer stay panel-only: they are layout
 * and text choices, not visibility toggles.
 */

import type { ContextMenuItem } from "$lib/shared/components/context-menu/context-menu-types";

/** The slice of ImageCompositionStateManager the submenu touches. */
export interface CardCompositionVisibility {
  readonly addWord: boolean;
  readonly addDifficultyLevel: boolean;
  readonly showLoopGlyph: boolean;
  readonly includeStartPosition: boolean;
  readonly showQRCode: boolean;
  readonly showMandala: boolean;
  setAddWord(value: boolean): void;
  setAddDifficultyLevel(value: boolean): void;
  setShowLoopGlyph(value: boolean): void;
  setIncludeStartPosition(value: boolean): void;
  setShowQRCode(value: boolean): void;
  setShowMandala(value: boolean): void;
}

/** The slice of ExportOptionsStateManager the submenu touches. */
export interface CardThemeVisibility {
  readonly imageDarkMode: boolean;
  setImageDarkMode(dark: boolean): void;
}

export interface CardVisibilityMenuDeps {
  composition: CardCompositionVisibility;
  /** Omit outside image-export mode: the preview card only honors
   *  imageDarkMode while the card options panel is open, so a Dark Mode
   *  toggle anywhere else would flip a setting the card isn't reading. */
  exportOptions?: CardThemeVisibility;
  /** Same gate as the panel: guests can't mint a scannable QR, so the entry is
   *  withheld rather than shown-then-ignored. */
  canQRCode: boolean;
}

export function buildCardVisibilityMenuItems(
  deps: CardVisibilityMenuDeps
): ContextMenuItem[] {
  const c = deps.composition;
  const items: ContextMenuItem[] = [
    {
      id: "card-vis-word-header",
      label: "Word Header",
      icon: "fa-heading",
      checked: c.addWord,
      keepOpen: true,
      action: () => c.setAddWord(!c.addWord),
    },
    {
      id: "card-vis-level",
      label: "Level",
      icon: "fa-signal",
      checked: c.addDifficultyLevel,
      keepOpen: true,
      action: () => c.setAddDifficultyLevel(!c.addDifficultyLevel),
    },
    {
      id: "card-vis-loop-glyph",
      label: "LOOP Glyph",
      icon: "fa-rotate",
      checked: c.showLoopGlyph,
      keepOpen: true,
      action: () => c.setShowLoopGlyph(!c.showLoopGlyph),
    },
    {
      id: "card-vis-start-position",
      label: "Start Position",
      icon: "fa-flag",
      checked: c.includeStartPosition,
      keepOpen: true,
      action: () => c.setIncludeStartPosition(!c.includeStartPosition),
    },
  ];

  if (deps.canQRCode) {
    items.push({
      id: "card-vis-qr-code",
      label: "QR Code",
      icon: "fa-qrcode",
      checked: c.showQRCode,
      keepOpen: true,
      action: () => c.setShowQRCode(!c.showQRCode),
    });
  }

  items.push({
    id: "card-vis-mandala",
    label: "Mandala",
    icon: "fa-draw-polygon",
    checked: c.showMandala,
    keepOpen: true,
    action: () => c.setShowMandala(!c.showMandala),
  });

  const theme = deps.exportOptions;
  if (theme) {
    items.push({
      id: "card-vis-dark-mode",
      label: "Dark Mode",
      icon: "fa-moon",
      checked: theme.imageDarkMode,
      keepOpen: true,
      action: () => theme.setImageDarkMode(!theme.imageDarkMode),
    });
  }

  return items;
}
