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
import { CREDIT_MAX_LEAD_LENGTH } from "#lib/shared/media-composition/domain/credit.js";
import { shiftTkaItemTimes } from "./item-times";
import { MANDALA_MAX_SEQUENCES } from "#lib/shared/mandala/domain/mandala-shift-types.js";
import {
  POST_MAX_SPOKEN_LENGTH,
  POST_TITLES_SPOKEN_SIZE_MAX,
  POST_TITLES_SPOKEN_SIZE_MIN,
  clampFlashValue,
} from "./item-kinds";
import {
  PostCardEnterSchema,
  PostCardQrExitSchema,
  PostCardRingSchema,
} from "./card-ending";
import {
  PostAnimationSplitSchema,
  normalizeAnimationSplit,
} from "#lib/shared/media-composition/domain/post-animation-split.js";
import {
  PostPanelLiftSchema,
  normalizePanelLift,
} from "#lib/shared/media-composition/domain/post-panel-lift.js";

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
  shiftItemTimes: shiftTkaItemTimes,
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
      if (patch.cometTrails !== undefined) {
        if (patch.cometTrails) next.cometTrails = patch.cometTrails;
        else delete next.cometTrails;
      }
    }
    if (item.kind === "animation" && patch.overlay !== undefined) {
      next.overlay = patch.overlay;
    }
    if (item.kind === "animation" && patch.followers !== undefined) {
      if (patch.followers?.length) next.followers = patch.followers;
      else delete next.followers;
    }
    if (item.kind === "animation" && patch.stage3d !== undefined) {
      if (patch.stage3d) next.stage3d = patch.stage3d;
      else delete next.stage3d;
    }
    if (item.kind === "animation" && patch.split !== undefined) {
      // A split that breaks the schema is passed over, as a bad scan link is.
      const parsed = patch.split
        ? PostAnimationSplitSchema.safeParse(patch.split)
        : null;
      if (parsed?.success) next.split = normalizeAnimationSplit(parsed.data);
      else if (!patch.split) delete next.split;
    }
    if (item.kind === "animation" && patch.panelLift !== undefined) {
      // As with the split: a lift that breaks the schema is passed over.
      const parsed = patch.panelLift
        ? PostPanelLiftSchema.safeParse(patch.panelLift)
        : null;
      if (parsed?.success) next.panelLift = normalizePanelLift(parsed.data);
      else if (!patch.panelLift) delete next.panelLift;
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
    if (item.kind === "mandala") {
      if (patch.sequences)
        next.sequences = patch.sequences.slice(0, MANDALA_MAX_SEQUENCES);
      if (patch.shift) next.shift = { ...item.shift, ...patch.shift };
      if (patch.look) next.look = { ...item.look, ...patch.look };
    }
    if (item.kind === "credit" && patch.lead !== undefined) {
      // Kept as typed, spaces and all, so the field never fights the cursor.
      next.lead = patch.lead.slice(0, CREDIT_MAX_LEAD_LENGTH);
    }
    if (item.kind === "flash") {
      // A value outside its range is kept at the nearest end of it.
      if (patch.strength !== undefined)
        next.strength = clampFlashValue(
          "strength",
          patch.strength,
          item.strength
        );
      if (patch.fade !== undefined)
        next.fade = clampFlashValue("fade", patch.fade, item.fade);
      if (patch.marks !== undefined) next.marks = patch.marks === true;
    }
    if (item.kind === "titles" && patch.spoken !== undefined) {
      // Kept as typed, spaces and all, so the field never fights the cursor.
      const spoken = patch.spoken.slice(0, POST_MAX_SPOKEN_LENGTH);
      if (spoken.trim()) next.spoken = spoken;
      else delete next.spoken;
    }
    if (item.kind === "titles") {
      // The default choices are left unsaid, so older posts read the same.
      if (patch.leave !== undefined) {
        if (patch.leave === "stay") next.leave = "stay";
        else delete next.leave;
      }
      if (patch.enter !== undefined && typeof patch.enter !== "object") {
        if (patch.enter === "none") next.enter = "none";
        else delete next.enter;
      }
      if (patch.lit !== undefined) {
        if (patch.lit) next.lit = { from: patch.lit.from, to: patch.lit.to };
        else delete next.lit;
      }
      if (patch.quiet !== undefined) {
        if (patch.quiet && patch.quiet.to > patch.quiet.from)
          next.quiet = { from: patch.quiet.from, to: patch.quiet.to };
        else if (!patch.quiet) delete next.quiet;
      }
      for (const key of ["spokenSize", "spokenSizeSmall"] as const) {
        const value = patch[key];
        if (value === undefined) continue;
        if (value === null) delete next[key];
        else if (Number.isFinite(value))
          next[key] = Math.min(
            POST_TITLES_SPOKEN_SIZE_MAX,
            Math.max(POST_TITLES_SPOKEN_SIZE_MIN, value)
          );
      }
    }
    if (item.kind === "card") {
      // Each ending setting is checked on its own; one that breaks its rule
      // is passed over, so a bad value never reaches a saved post.
      if (patch.enter !== undefined && typeof patch.enter !== "string") {
        const parsed = PostCardEnterSchema.safeParse(patch.enter);
        if (patch.enter === null) delete next.enter;
        else if (parsed.success) next.enter = parsed.data;
      }
      if (patch.ring !== undefined) {
        const parsed = PostCardRingSchema.safeParse(patch.ring);
        if (patch.ring === null) delete next.ring;
        else if (parsed.success) next.ring = parsed.data;
      }
      if (patch.qrExit !== undefined) {
        const parsed = PostCardQrExitSchema.safeParse(patch.qrExit);
        if (patch.qrExit === null) delete next.qrExit;
        else if (parsed.success) next.qrExit = parsed.data;
      }
      if (patch.headerTitle !== undefined) {
        if (patch.headerTitle === "clip") next.headerTitle = "clip";
        else delete next.headerTitle;
      }
    }
  },
};
