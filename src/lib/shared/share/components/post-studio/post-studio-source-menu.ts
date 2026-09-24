/**
 * The "what goes in this slot" menu, shared by everything that offers it.
 *
 * This lived inside PostStudioPreview when the picker was a chip floating on
 * the artwork. The chip is gone — a control sitting on top of the thing it
 * describes covers the picture and reads as clutter — so the same menu is now
 * built by the composition bar. Keeping the builder here means the icon table
 * and the "already in the other slot" rule have one owner rather than one per
 * surface that offers a source.
 */

import {
  POST_STUDIO_SOURCES,
  POST_STUDIO_SOURCE_ORDER,
  type PostStudioRoleKey,
} from "$lib/shared/media-composition/domain/post-studio-presets";
import type { PostStudioSlotId } from "$lib/shared/media-composition/domain/post-studio-slots";
import type { MediaCompositionState } from "$lib/shared/media-composition/state/media-composition-state.svelte";

export const ROLE_ICON: Record<PostStudioRoleKey, string> = {
  "sequence-animation": "fa-solid fa-person-running",
  "performance-video": "fa-solid fa-video",
  "choreo-card": "fa-solid fa-table-cells-large",
  "sequence-tunnel": "fa-solid fa-circle-notch",
  "sequence-scene-3d": "fa-solid fa-cube",
  "sequence-mandala": "fa-solid fa-asterisk",
  "sequence-carousel": "fa-solid fa-film",
};

/** Icon for a binding kind, used by the empty-slot placeholder in the frame. */
export function sourceIcon(kind: string): string {
  if (kind === "video") return "fa-solid fa-video";
  if (kind === "sequence-animation") return "fa-solid fa-person-running";
  if (kind === "choreo-card") return "fa-solid fa-table-cells-large";
  if (kind === "tunnel") return "fa-solid fa-circle-notch";
  if (kind === "scene-3d") return "fa-solid fa-cube";
  if (kind === "mandala") return "fa-solid fa-asterisk";
  if (kind === "beat-carousel") return "fa-solid fa-film";
  return "fa-solid fa-photo-film";
}

/**
 * The whole source list for one slot, plus Remove. This is the entire
 * "choose what goes here" interaction — it replaced a rail of layout templates
 * and a rail of sources, neither of which could express a pairing the four
 * presets did not already contain.
 *
 * Remove is offered only while a second slot exists: emptying the last one
 * would leave a post with nothing in it.
 */
export function buildSourceMenuItems(
  composition: MediaCompositionState,
  slot: PostStudioSlotId,
  current: string | null
) {
  const canRemove = composition.regions.length > 1;
  const items = POST_STUDIO_SOURCE_ORDER.map((roleKey) => {
    const source = POST_STUDIO_SOURCES[roleKey];
    const blocked = !composition.slotAccepts(slot, roleKey);
    return {
      label: source.label,
      icon: ROLE_ICON[roleKey],
      selected: current === roleKey,
      disabled: blocked,
      hint: blocked ? "Already in the other slot" : undefined,
      action: () => composition.setSlotSource(slot, roleKey),
    };
  });

  return canRemove
    ? [
        ...items,
        {
          label: "Remove",
          icon: "fa-solid fa-trash-can",
          variant: "danger" as const,
          action: () => composition.clearSlot(slot),
        },
      ]
    : items;
}
