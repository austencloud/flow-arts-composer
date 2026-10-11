import { EFFECTS } from "#lib/shared/effects/domain/effect-meta.js";
import type { EffectType } from "#lib/shared/effects/domain/effects-config.js";

/** Only registered effects may seed a review session. */
export function readReviewEffect(params: URLSearchParams) {
  const requested = params.get("effect") ?? params.get("focus");
  return EFFECTS.find((effect) => effect.id === requested)?.id as
    | EffectType
    | undefined;
}

/** Keep old bookmarks useful while retiring the standalone FX grid. */
export function effectGridDestination(params: URLSearchParams): string {
  const next = new URLSearchParams(params);
  next.set("effect", readReviewEffect(params) ?? "sparkles");
  next.delete("focus");
  next.delete("view");
  return `/test/viewer-3d?${next}`;
}
