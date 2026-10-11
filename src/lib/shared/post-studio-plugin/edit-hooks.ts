import type {
  EditHooks,
  PostItem,
  PostItemPatch,
} from "@austencloud/video-editor/core";
import {
  rerecordedTakeTiming,
  shiftTakeTiming,
} from "#lib/shared/media-composition/domain/take-timing.js";
import { isPostCardQrUrl } from "./card-qr";
import { POST_MAX_SPOKEN_LENGTH } from "./item-kinds";

/** tka's edits inside the engine: a take's timing follows its media, and tka's item fields patch. */
export const TKA_EDIT_HOOKS: EditHooks = {
  takeMediaChanged(project, change, ctx) {
    const timing = project.timings?.[change.takeId];
    if (!timing) return project;
    const next =
      change.kind === "replace"
        ? shiftTakeTiming(
            timing,
            change.offsetSeconds,
            {
              takeKey: change.takeKey,
              durationSeconds: change.durationSeconds,
            },
            ctx.now
          )
        : rerecordedTakeTiming(
            timing,
            {
              takeKey: change.takeKey,
              durationSeconds: change.durationSeconds,
            },
            ctx.now
          );
    return {
      ...project,
      timings: { ...project.timings, [change.takeId]: next },
    };
  },
  patchItem(
    item: PostItem,
    next: Record<string, unknown>,
    patch: PostItemPatch
  ) {
    if (item.kind === "video") {
      if (patch.staffEffect !== undefined) {
        if (patch.staffEffect) next.staffEffect = { effect: patch.staffEffect };
        else delete next.staffEffect;
      }
    }
    if (item.kind === "animation" && patch.overlay !== undefined) {
      next.overlay = patch.overlay;
    }
    if (
      (item.kind === "animation" || item.kind === "moves") &&
      patch.animationAppearance !== undefined
    ) {
      if (patch.animationAppearance)
        next.animationAppearance = patch.animationAppearance;
      else delete next.animationAppearance;
    }
    if (item.kind === "card" && patch.cardAppearance !== undefined) {
      if (patch.cardAppearance) next.cardAppearance = patch.cardAppearance;
      else delete next.cardAppearance;
    }
    if (item.kind === "card" && patch.qrUrl !== undefined) {
      if (patch.qrUrl === null) delete next.qrUrl;
      else if (isPostCardQrUrl(patch.qrUrl)) next.qrUrl = patch.qrUrl;
    }
    if (item.kind === "moves" && patch.mode) next.mode = patch.mode;
    if (item.kind === "titles" && patch.spoken !== undefined) {
      // Kept as typed, spaces and all, so the field never fights the cursor.
      const spoken = patch.spoken.slice(0, POST_MAX_SPOKEN_LENGTH);
      if (spoken.trim()) next.spoken = spoken;
      else delete next.spoken;
    }
  },
};
