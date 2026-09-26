import { t } from "$lib/shared/i18n/i18n.svelte.js";
import type {
  PostItem,
  PostItemKind,
  PostMovesMode,
  PostProject,
} from "$lib/shared/media-composition/domain/post-project";

/** The names and icons every part of the editor shows for an item kind. */

export const ITEM_KIND_ICON: Record<PostItemKind, string> = {
  video: "fa-film",
  card: "fa-id-card",
  animation: "fa-person-running",
  moves: "fa-shapes",
  carousel: "fa-table-cells",
  text: "fa-font",
};

export const MANDALA_ICON = "fa-sun";

export function itemKindLabel(kind: PostItemKind, mode?: PostMovesMode): string {
  switch (kind) {
    case "video":
      return t("post_editor_kind_video");
    case "card":
      return t("post_editor_kind_card");
    case "animation":
      return t("post_editor_kind_animation");
    case "moves":
      return mode === "mandala"
        ? t("post_editor_kind_mandala")
        : t("post_editor_kind_moves");
    case "carousel":
      return t("post_editor_kind_carousel");
    case "text":
      return t("post_editor_kind_text");
  }
}

export function itemIcon(item: PostItem): string {
  return item.kind === "moves" && item.mode === "mandala"
    ? MANDALA_ICON
    : ITEM_KIND_ICON[item.kind];
}

/**
 * What a block or a heading calls an item: Austen's own name for it, the
 * words of a text, the take a clip is cut from, or its kind.
 */
export function itemDisplayLabel(item: PostItem, project: PostProject): string {
  if (item.label) return item.label;
  if (item.kind === "text" && item.text.trim()) return item.text.trim();
  if (item.kind === "video") {
    const take = project.takes.find((entry) => entry.id === item.takeId);
    if (take) return take.label;
  }
  return itemKindLabel(item.kind, item.kind === "moves" ? item.mode : undefined);
}
