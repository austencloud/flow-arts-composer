/**
 * Vivid Hero Trail Preset
 *
 * TrailSettings for the homepage attract act's canvas, passed to
 * InlineAnimationPlayer via `trailSettingsOverride`. It must never mutate the
 * global `animationSettings.trail` singleton — that singleton is also read by
 * the in-app Compose panel, and a visitor's homepage settings must not leak
 * into it (and vice versa).
 *
 * DEFAULT_TRAIL_SETTINGS is tuned for the in-app animation panel, viewed up
 * close at panel size. The hero canvas is smaller (roughly 500px) and has to
 * read at a glance from across the page, so this preset pushes the numbers
 * that control how visible the trail is:
 *
 * - fadeDurationMs 2500 → 3200: the trail hangs around longer, so a visitor
 *   who glances mid-loop still catches the shape.
 * - glowBlur 2.5 → 8: a brighter halo — enough to read at hero scale,
 *   where the in-app default reads as barely-there.
 * - tailLength 20 → 36: more of the mandala arc stays visible at once.
 * - lineWidth 4 → 5: one step above the app default so it holds at hero scale.
 * - minOpacity 0.25 → 0.35: the tail's fading tip stays legible longer.
 *
 * These are a starting point, not final. Acceptance is "clearly visible
 * trail at hero size" (screenshot-verified against the live act), not these
 * specific constants — expect a follow-up tuning pass once it's on screen.
 */
import {
  TrailMode,
  TrailEffect,
  DEFAULT_TRAIL_SETTINGS,
  type TrailSettings,
} from "#lib/shared/animation-engine/domain/types/trail-types.js";
import {
  setCellWide,
  type TipEffectMap,
} from "#lib/shared/animation-engine/services/tip-effect-resolver.js";

/**
 * Trail settings alone do NOT make trails render. The render loop's
 * effectiveTrailsVisible gate is `hasTrailTips(tipEffectMap)`, and an empty
 * map means "no tips assigned trails" — which is why surfaces that never
 * pass a tip-effect map (this player included, until now) draw zero trails
 * even with mode FADE. A cell-wide "trails" assignment turns every tip of
 * both hands into a trail emitter, matching what the Compose cell surfaces
 * do when the user picks the trail effect.
 */
export const HERO_TIP_EFFECT_MAP: TipEffectMap = setCellWide({}, "trails");

export const HERO_TRAIL_PRESET: TrailSettings = {
  ...DEFAULT_TRAIL_SETTINGS,
  mode: TrailMode.FADE,
  effect: TrailEffect.GLOW,
  fadeDurationMs: 3200,
  glowBlur: 8,
  tailLength: 36,
  lineWidth: DEFAULT_TRAIL_SETTINGS.lineWidth + 1,
  minOpacity: 0.35,
};
