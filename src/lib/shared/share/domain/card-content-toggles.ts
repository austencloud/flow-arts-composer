/**
 * The card-content switches: what a choreo card shows in its header, whether
 * it draws the start placement, and what fills its info cell. One list for
 * every surface that offers them — the viewer's card panel (all three of its
 * layouts) and Settings → Display — so a label or handler is written once.
 *
 * Layout choices (columns, start lane, the one-spot info chooser) and footer
 * text are not here: they are per-step-count or content decisions that only
 * the card panel owns.
 */

import { t } from "#lib/shared/i18n/i18n.svelte.js";

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
  start: CardContentToggle;
  info: CardContentToggle[];
}

export function buildCardContentToggles(
  c: CardContentComposition,
  options: { canQRCode: boolean }
): CardContentToggleGroups {
  const header: CardContentToggle[] = [
    {
      id: "word",
      label: t("viewer_ui_word"),
      icon: "fas fa-font",
      active: c.addWord,
      set: (v) => c.setAddWord(v),
    },
    {
      id: "step_numbers",
      label: t("learn_steps"),
      icon: "fas fa-list-ol",
      active: c.addStepNumbers,
      set: (v) => c.setAddBeatNumbers(v),
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

  const start: CardContentToggle = {
    id: "start_position",
    label: t("viewer_ui_show"),
    icon: "fas fa-flag-checkered",
    active: c.includeStartPlacement,
    set: (v) => c.setIncludeStartPlacement(v),
  };

  // Guests can't mint a scannable QR (it needs an account-owned short code),
  // so the switch is withheld rather than shown and then ignored.
  const info: CardContentToggle[] = [
    ...(options.canQRCode
      ? [
          {
            id: "qr_code",
            label: "QR",
            icon: "fas fa-qrcode",
            active: c.showQRCode,
            set: (v: boolean) => c.setShowQRCode(v),
          },
        ]
      : []),
    {
      id: "mandala",
      label: t("share_mandala"),
      icon: "fas fa-asterisk",
      active: c.showMandala,
      set: (v) => c.setShowMandala(v),
    },
  ];

  return { header, start, info };
}
