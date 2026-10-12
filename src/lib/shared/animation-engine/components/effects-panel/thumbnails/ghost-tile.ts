/**
 * Ghost portrait. The tile blits the same prop sprite the engine draws, for
 * whichever prop is selected, at its last poses. Ages follow the renderer's
 * curve: glassy body, then frost veil, then pale rim, then gone. The
 * treatment layers and the pose blit are the renderer's own exports, so the
 * tile cannot drift from the effect on stage.
 * Ported from the approved reference page (spec reference/ghost2.html).
 */
import { generateLeftPropSvg } from "#lib/shared/animation-engine/services/svg-generator.js";
import { resolveGhostLifetimeSeconds } from "#lib/shared/effects/domain/ghost-parameters.js";
import {
  GHOST_FROST_WHITE,
  resolveGhost2DAgeVisual,
} from "#lib/shared/effects/renderers/ghost-chrono-frost-2d.js";
import {
  type GhostProp,
  blitGhostPose,
  buildGhostSpriteTreatment,
} from "#lib/shared/effects/renderers/ghost-2d-renderer.js";
import type { EffectConfigMap } from "#lib/shared/effects/state/effects-config-state.svelte.js";
import { blob, ground, hexToRgb } from "./tile-paint";

export type GhostIntent = EffectConfigMap["ghost"];

export interface GhostTileSprite {
  image: CanvasImageSource;
  width: number;
  height: number;
  /** The hand color the sprite was generated with; lights the head. */
  color: string;
}

/** The blue hand's sprite width on the tile; height follows the sprite. */
const DRAW_WIDTH = 230;
const HEAD = { x: 410, y: 165, angle: 0.25 };

export function paintGhostTile(
  ctx: CanvasRenderingContext2D,
  intent: GhostIntent,
  sprite: GhostTileSprite | null
): void {
  ground(ctx, [0.03, 0.035, 0.06]);
  blob(ctx, 400, 140, 300, 170, hexToRgb(GHOST_FROST_WHITE), 0.05);
  if (!sprite) return;

  const w = DRAW_WIDTH;
  const h = (w * sprite.height) / sprite.width;
  const treatment = buildGhostSpriteTreatment(
    sprite.image,
    Math.ceil(w),
    Math.ceil(h)
  );
  const lifetime = resolveGhostLifetimeSeconds(intent.decay);
  const span = (0.3 + Math.min(1, intent.decay / 12) * 0.3) * Math.PI;
  const copies = Math.round(5 + intent.interval * 9);

  const pose = (age: number): GhostProp => ({
    id: 0,
    image: sprite.image,
    centerX: HEAD.x - age * 110,
    centerY: HEAD.y - age * 25,
    angle: HEAD.angle - span * age,
    width: w,
    height: h,
    flipped: false,
  });

  // Oldest first, so the young ice stays readable on top, as the renderer draws.
  for (let i = copies; i >= 1; i -= 1) {
    const age = i / copies;
    const visual = resolveGhost2DAgeVisual(
      age * lifetime,
      lifetime,
      intent.intensity
    );
    blitGhostPose(ctx, pose(age), visual, treatment);
  }
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  blob(ctx, HEAD.x, HEAD.y, 120, 70, hexToRgb(sprite.color), 0.3);
  ctx.restore();
  blitGhostPose(
    ctx,
    pose(0),
    { bodyAlpha: 1, rimAlpha: 0, frostAlpha: 0 },
    treatment
  );
}

const spriteCache = new Map<string, Promise<GhostTileSprite | null>>();

function decode(
  svg: string,
  width: number,
  height: number,
  color: string
): Promise<GhostTileSprite> {
  return new Promise((resolve, reject) => {
    const image = new Image(width, height);
    image.onload = () => resolve({ image, width, height, color });
    image.onerror = () =>
      reject(new Error("ghost tile sprite failed to decode"));
    image.src = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  });
}

/** The engine's own blue-hand sprite for a prop, cached per prop type. */
export function loadGhostTileSprite(
  propType: string | null
): Promise<GhostTileSprite | null> {
  const key = propType ?? "staff";
  let pending = spriteCache.get(key);
  if (!pending) {
    pending = generateLeftPropSvg(key, true)
      .then((data) =>
        decode(data.svg, data.width, data.height, spriteFill(data.svg))
      )
      .catch(() => {
        spriteCache.delete(key);
        return null;
      });
    spriteCache.set(key, pending);
  }
  return pending;
}

/** First fill color in the generated sprite, the hand color; frost-white if none. */
function spriteFill(svg: string): string {
  const m = /fill="(#[0-9a-fA-F]{3,8})"/.exec(svg);
  return m?.[1] ?? GHOST_FROST_WHITE;
}
