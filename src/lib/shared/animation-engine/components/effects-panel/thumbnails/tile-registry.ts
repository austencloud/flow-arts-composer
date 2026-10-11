/**
 * Effect type -> portrait painter. `EffectPresetThumbnail` dispatches through
 * this map; an effect with no entry keeps the generic look card (today that is
 * Frost only, retired from the strip). Each painter paints a full 720x270
 * frame from the merged intent and never reads the preset id.
 */
import type { EffectConfigMap } from "#lib/shared/effects/state/effects-config-state.svelte.js";
import { loadGhostTileSprite, paintGhostTile } from "./ghost-tile";
import { paintSparkleTile } from "./sparkle-tile";
import { paintZapTile } from "./zap-tile";

/** What a tile needs beyond the merged intent. Only Ghost and Silk read it. */
export interface TileExtras {
  propType: string | null;
}

export type TilePainter<
  E extends keyof EffectConfigMap = keyof EffectConfigMap,
> = (
  ctx: CanvasRenderingContext2D,
  intent: EffectConfigMap[E],
  extras: TileExtras
) => void | Promise<void>;

const PAINTERS: Partial<{ [E in keyof EffectConfigMap]: TilePainter<E> }> = {
  zap: (ctx, intent) => paintZapTile(ctx, intent),
  sparkles: (ctx, intent) => paintSparkleTile(ctx, intent),
  ghost: async (ctx, intent, extras) => {
    // Ground first so the card is never blank, then the prop once its sprite decodes.
    paintGhostTile(ctx, intent, null);
    const sprite = await loadGhostTileSprite(extras.propType);
    if (sprite) paintGhostTile(ctx, intent, sprite);
  },
};

export function tilePainterFor(effectType: string): TilePainter | null {
  return (
    (PAINTERS as Record<string, TilePainter | undefined>)[effectType] ?? null
  );
}
