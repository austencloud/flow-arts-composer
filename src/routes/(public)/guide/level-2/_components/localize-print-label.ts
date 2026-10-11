import { t } from "#lib/shared/i18n/i18n.svelte.js";

/** Translate the small labels shared by the fixed-layout Level 2 sheets. */
export function localizePrintLabel(label: string): string {
  switch (label) {
    case "start": return t("guide_l2_frame_start");
    case "halfway": return t("guide_l2_frame_halfway");
    case "end": return t("guide_l2_frame_end");
    case "in": return t("guide_l2_frame_in");
    case "out": return t("guide_l2_frame_out");
    case "mixed": return t("guide_l2_print_mixed");
    case "thumbs:": return t("guide_l2_print_thumbs");
    case "thumb in": return t("guide_l2_print_thumb_in");
    case "thumb out": return t("guide_l2_print_thumb_out");
    case "High": return t("guide_l2_print_high");
    case "Low": return t("guide_l2_print_low");
    case "Left": return t("guide_l2_print_left");
    case "Right": return t("guide_l2_print_right");
    case "Continuation": return t("guide_l2_print_continuation");
    case "2-Turns": return t("guide_l2_print_two_turns");
    default: return label;
  }
}
