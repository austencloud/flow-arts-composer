/**
 * Effect type -> portrait painter. `EffectPresetThumbnail` dispatches through
 * this map; an effect with no entry keeps the generic look card (today that is
 * Frost only, retired from the strip). Each painter paints a full frame from
 * the merged intent in the format asked for (card 720x270, tile 240x90, chip
 * 96x64; see tile-format.ts) and never reads the preset id.
 */
import type { EffectConfigMap } from "#lib/shared/effects/state/effects-config-state.svelte.js";
import { paintAnimalTile } from "./animal-tile";
import { paintBubblesTile } from "./bubbles-tile";
import { loadGhostTileSprite, paintGhostTile } from "./ghost-tile";
import { paintGooTile } from "./goo-tile";
import { paintInkTile } from "./ink-tile";
import { paintPetalsTile } from "./petals-tile";
import { paintPulseTile } from "./pulse-tile";
import { paintSilkTile, resolveSilkTilePropColor } from "./silk-tile";
import { paintSmokeTile } from "./smoke-tile";
import { paintSparkleTile } from "./sparkle-tile";
import { paintZapTile } from "./zap-tile";
import type { TileFormat } from "./tile-format";

/** What a tile needs beyond the merged intent. Only Ghost reads it. */
export interface TileExtras {
  /** Which size to paint for; the card when absent. */
  format?: TileFormat;
  propType: string | null;
  /** True once the tile has moved on (new preset or prop); an async painter must not draw. */
  isStale: () => boolean;
}

/**
 * A painter returns `false` when its frame is incomplete and must not be
 * cached (Ghost without its sprite); anything else means the frame is final.
 */
export type TilePainter<
  E extends keyof EffectConfigMap = keyof EffectConfigMap,
> = (
  ctx: CanvasRenderingContext2D,
  intent: EffectConfigMap[E],
  extras: TileExtras
) => void | boolean | Promise<void | boolean>;

/** Effects whose portrait changes with the prop; only these key the cache on it. */
export const PROP_AWARE_TILES: ReadonlySet<string> = new Set(["ghost"]);

const PAINTERS: Partial<{ [E in keyof EffectConfigMap]: TilePainter<E> }> = {
  zap: (ctx, intent, extras) => paintZapTile(ctx, intent, extras.format),
  sparkles: (ctx, intent, extras) => paintSparkleTile(ctx, intent, extras.format),
  ghost: async (ctx, intent, extras) => {
    // Ground first so the card is never blank, then the prop once its sprite decodes.
    paintGhostTile(ctx, intent, null, extras.format);
    const sprite = await loadGhostTileSprite(extras.propType);
    if (!sprite || extras.isStale()) return false;
    paintGhostTile(ctx, intent, sprite, extras.format);
    return true;
  },
  goo: (ctx, intent, extras) => paintGooTile(ctx, intent, extras.format),
  bubbles: (ctx, intent, extras) => paintBubblesTile(ctx, intent, extras.format),
  petals: (ctx, intent, extras) => paintPetalsTile(ctx, intent, extras.format),
  smoke: (ctx, intent, extras) => paintSmokeTile(ctx, intent, extras.format),
  ink: (ctx, intent, extras) => paintInkTile(ctx, intent, extras.format),
  silk: (ctx, intent, extras) =>
    paintSilkTile(ctx, intent, resolveSilkTilePropColor(), extras.format),
  animal: (ctx, intent, extras) => paintAnimalTile(ctx, intent, extras.format),
  pulse: (ctx, intent, extras) => paintPulseTile(ctx, intent, extras.format),
};

export function tilePainterFor(effectType: string): TilePainter | null {
  if (!Object.hasOwn(PAINTERS, effectType)) return null;
  return PAINTERS[effectType as keyof EffectConfigMap] as TilePainter;
}
