import { t } from "#lib/shared/i18n/i18n.svelte.js";
import type { PathShapeValue } from "../../services/step-operations/path-shape-handler";

export function handLabel(hand: "left" | "right"): string {
  return hand === "left" ? t("shared_controls_left") : t("shared_controls_right");
}

export function pathShapeLabel(shape: PathShapeValue): string {
  switch (shape) {
    case "arc": return t("viewer_ui_arc");
    case "linear": return t("viewer_ui_linear");
    case "concave": return t("viewer_ui_concave");
  }
}
