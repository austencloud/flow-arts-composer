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
import {
  type Box,
  type SmallFormat,
  type TileFormat,
  frame,
  isSmall,
  smallTable,
} from "./tile-format";

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

/**
 * Small formats lay the staff nearly flat, bright blue, at the right of the
 * frame and trail its echoes to the left in clearly stepped brightness (the
 * nearest about 70% of the staff, the last about 25%), each turned a touch
 * more, so the fan of echoes is what the eye sees and spans about 80% of the
 * width. The staff is the engine's own sprite, as on the card.
 */
const SMALL: Record<
  "tile" | "chip",
  {
    view: Box;
    width: number;
    echoes: number;
    /** The staff's centre; echoes step back from it. */
    head: { x: number; y: number };
    step: { x: number; y: number };
  }
> = {
  tile: {
    view: { x: 40, y: 0, w: 640, h: 240 },
    width: 250,
    echoes: 4,
    head: { x: 530, y: 192 },
    step: { x: 78, y: -19 },
  },
  chip: {
    view: { x: 150, y: 0, w: 420, h: 280 },
    width: 215,
    echoes: 3,
    head: { x: 440, y: 180 },
    step: { x: 68, y: -26 },
  },
};
/** First echo's brightness against the staff, and the last's. */
const ECHO_NEAR = 0.7;
const ECHO_FAR = 0.25;

export function paintGhostTile(
  ctx: CanvasRenderingContext2D,
  intent: GhostIntent,
  sprite: GhostTileSprite | null,
  format: TileFormat = "card"
): void {
  const small = isSmall(format)
    ? SMALL[smallTable(format as SmallFormat)]
    : null;
  if (small) frame(ctx, format, small.view, 0);
  ground(ctx, [0.03, 0.035, 0.06]);
  blob(ctx, 400, 140, 300, 170, hexToRgb(GHOST_FROST_WHITE), 0.05);
  if (!sprite) return;
  if (small) {
    paintGhostSmall(ctx, intent, sprite, small);
    return;
  }

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

function paintGhostSmall(
  ctx: CanvasRenderingContext2D,
  intent: GhostIntent,
  sprite: GhostTileSprite,
  small: (typeof SMALL)["tile"]
): void {
  const w = small.width;
  const h = (w * sprite.height) / sprite.width;
  const treatment = buildGhostSpriteTreatment(
    sprite.image,
    Math.ceil(w),
    Math.ceil(h)
  );
  // Quieter looks keep a shorter fan, never fewer than the contract's three.
  const echoes = Math.max(
    3,
    Math.min(small.echoes, Math.round(2 + intent.interval * 3))
  );
  // Each echo turns a little more, as the card's fan does (decay widens it).
  const turn = 0.045 + Math.min(1, intent.decay / 12) * 0.05;
  const base = -0.05;
  const lifetime = resolveGhostLifetimeSeconds(intent.decay);
  const pose = (n: number): GhostProp => ({
    id: 0,
    image: sprite.image,
    centerX: small.head.x - small.step.x * n,
    centerY: small.head.y + small.step.y * n,
    angle: base - turn * n,
    width: w,
    height: h,
    flipped: false,
  });
  // Oldest first, so the nearest echo and the staff stay on top.
  for (let n = echoes; n >= 1; n -= 1) {
    const k = echoes > 1 ? (n - 1) / (echoes - 1) : 0;
    const level = ECHO_NEAR + (ECHO_FAR - ECHO_NEAR) * k;
    // The renderer's own age curve shapes frost against rim; the stepped
    // brightness is set here so the steps are what shows.
    const v = resolveGhost2DAgeVisual(
      (n / echoes) * lifetime * 0.5,
      lifetime,
      Math.max(0.6, intent.intensity)
    );
    const norm = Math.max(0.001, v.rimAlpha);
    blitGhostPose(
      ctx,
      pose(n),
      {
        bodyAlpha: level * 0.85,
        rimAlpha: Math.min(1, level * (0.55 + 0.45 * (v.rimAlpha / norm))),
        frostAlpha: Math.min(1, level * 0.5),
      },
      treatment
    );
  }
  // The staff: the engine's sprite, lifted to a bright blue.
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  blob(ctx, small.head.x, small.head.y, 170, 85, hexToRgb(sprite.color), 0.35);
  ctx.restore();
  const head = pose(0);
  blitGhostPose(
    ctx,
    head,
    { bodyAlpha: 1, rimAlpha: 0, frostAlpha: 0 },
    treatment
  );
  ctx.save();
  ctx.translate(head.centerX, head.centerY);
  ctx.rotate(head.angle);
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 0.5;
  ctx.drawImage(sprite.image, -w / 2, -h / 2, w, h);
  ctx.restore();
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
