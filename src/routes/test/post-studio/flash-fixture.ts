import { createEmptyPostProject } from "#lib/shared/post-studio-plugin/index.js";
import { editContext } from "#lib/shared/post-studio-plugin/index.js";
import type { PostCardItem, PostProject } from "@austencloud/video-editor/core";
import { addFlashItem } from "#lib/shared/media-composition/domain/post-flash-join-edits.js";

/** The hit: where the flash goes off. */
const FLASH_AT_SECONDS = 2;
const CARD_SECONDS = 6;

/**
 * A card under a flash clip at 2 s, its square box around the middle of the
 * frame, made by the same edit the Add menu runs. In memory only: it never
 * loads or saves the creator's draft.
 */
export function flashFixture(sequenceId: string): PostProject {
  const card: PostCardItem = {
    id: "flash-card",
    label: "Card",
    kind: "card",
    start: 0,
    duration: CARD_SECONDS,
    box: { x: 0.05, y: 0.05, width: 0.9, height: 0.9 },
    opacity: 1,
    fadeIn: 0,
    fadeOut: 0,
    anchor: null,
    fill: false,
    cardAppearance: { darkMode: true },
  };
  const base: PostProject = {
    ...createEmptyPostProject({ sequenceId, now: 0 }),
    tracks: [{ id: "main", hidden: false, locked: false, items: [card] }],
  };
  return (
    addFlashItem(base, editContext(0), { at: FLASH_AT_SECONDS })?.project ??
    base
  );
}
