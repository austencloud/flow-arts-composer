/**
 * card-back-bitmaps-constant.ts
 *
 * Rasterizers + per-key caches for the card-back elements that are CONSTANT
 * across all cards of a given theme / level / icon. Each element is rendered
 * ONCE to an ImageBitmap and reused for every card that shares the key
 * (composited later — possibly in a worker, hence ImageBitmap output).
 *
 * Constant elements covered here:
 *   - brand           (theme-constant): "The Kinetic Alphabet" + ornament + "Choreo Cards"
 *   - url             (theme-constant): ornament + "tkaflowarts.com" + "© <year>"
 *   - difficulty badge (level-constant): levels 1/2/3
 *   - loop icons      (icon-constant): the 6 LOOP component icons + quartered variants
 *
 * RENDER SCALE — single source of truth:
 *   The card back renders at 1644×2244 (822×1122 logical * scale 2). BUT cqi on
 *   the live card resolves against the BORDER-FRAME CONTENT box, not the full
 *   card: `.border-frame` carries `container-type:inline-size` and
 *   `padding:borderWidth cqi`, so every inner `cqi` is sized against
 *   (cardWidth − 2·borderPx). We therefore mount each element inside a container
 *   whose inline-size = that inner content width, so its cqi units (`cqiEff`)
 *   match the live card exactly. Computing against the full 1644 width oversizes
 *   everything ~7-8%. See `borderAwareBasis()`.
 *
 *   Brand + URL are flex-column slots whose block size is text-flow driven, so
 *   they rasterize at NATURAL height (rasterize-node `naturalHeight`) — a fixed
 *   crop dropped the last line ("Choreo Cards" / "© <year>"). The builder then
 *   anchors them by the bitmap's own height.
 *
 * PARITY: the brand/url/loop markup + styles are reproduced VERBATIM in the
 * standalone extraction components (CardBackBrand / CardBackUrl /
 * CardBackLoopIcon). DifficultyBadge / SwapIcon / CheckerboardCircleIcon are
 * the real shared components, mounted with the same props CardBack.svelte uses.
 */

import CardBackBrand from "../../components/card-back/CardBackBrand.svelte";
import CardBackUrl from "../../components/card-back/CardBackUrl.svelte";
import CardBackLoopIcon from "../../components/card-back/CardBackLoopIcon.svelte";
import {
  getReflectionIconTransform,
  type LOOPComponentId,
  type LoopReflectionAxis,
} from "@tka/render-composition";
import DifficultyBadge from "#lib/shared/components/DifficultyBadge.svelte";
import { getCardBackThemeVisuals } from "../../components/card-back/card-back-theme-visuals";
import { LOOPComponent } from "#lib/shared/foundation/domain/models/generation/generate-models.js";
import { rasterizeComponent } from "./rasterize-node";

// ── Render scale (matches card-back-layout.ts / CardBack.svelte) ───────────
/** Card back render width in px (822 logical * scale 2). */
export const CARD_RENDER_WIDTH = 1644;

/**
 * Border-frame content-box basis for a theme. `.border-frame` resolves its own
 * `padding:borderWidth cqi` against ~card width, then `.back` (and every cqi
 * inside it) resolves against the resulting CONTENT box. This mirrors
 * computeCardBackLayout's border math so the rasterizers render at the SAME cqi
 * as the live card / layout boxes.
 *
 * @param theme Theme name → getCardBackThemeVisuals(theme).borderWidth (proof
 *              mode = 8.759; default 2 if a theme omits it).
 */
function borderAwareBasis(theme: string): { innerWidth: number; cqiEff: number } {
  const borderWidth = getCardBackThemeVisuals(theme).borderWidth ?? 2;
  const borderPx = borderWidth * (CARD_RENDER_WIDTH / 100);
  const innerWidth = CARD_RENDER_WIDTH - 2 * borderPx;
  return { innerWidth, cqiEff: innerWidth / 100 };
}

// ── LOOP icon map (verbatim from CardBack.svelte) ──────────────────────────
/** fa class + color + label for each surfaced LOOP component. */
export const LOOP_ICONS: Record<string, { fa: string; color: string; label: string }> = {
  [LOOPComponent.ROTATED]:  { fa: "fas fa-rotate",    color: "#36c3ff", label: "Rotated" },
  [LOOPComponent.MIRRORED]: { fa: "fas fa-left-right", color: "#6F2DA8", label: "Mirrored" },
  [LOOPComponent.FLIPPED]:  { fa: "fas fa-up-down",    color: "#6F2DA8", label: "Flipped" },
  [LOOPComponent.SWAPPED]:  { fa: "fas fa-shuffle",    color: "#2ecc71", label: "Swapped" },
  [LOOPComponent.INVERTED]: { fa: "fas fa-adjust",     color: "#eb7d00", label: "Inverted" },
  [LOOPComponent.REWOUND]:  { fa: "fas fa-backward",   color: "#00bcd4", label: "Rewound" },
};


/**
 * The function the cache wrappers use to actually produce a bitmap. Indirection
 * exists so tests can inject a fake (real rasterization can't run in jsdom).
 */
type RasterizeFn = (
  Comp: unknown,
  props: Record<string, unknown>,
  w: number,
  h: number,
  opts?: { containerWidth?: number; naturalHeight?: boolean },
) => Promise<ImageBitmap>;

let rasterize: RasterizeFn = rasterizeComponent;

/** Test-only: swap the underlying rasterize implementation. */
export function __setRasterizeFnForTest(fn: RasterizeFn | null): void {
  rasterize = fn ?? rasterizeComponent;
}

const brandCache = new Map<string, Promise<ImageBitmap>>();
const urlCache = new Map<string, Promise<ImageBitmap>>();
const badgeCache = new Map<string, Promise<ImageBitmap>>();
const loopIconCache = new Map<string, Promise<ImageBitmap>>();

/**
 * Get-or-create against a Map cache. Stores the in-flight Promise so concurrent
 * callers for the same key share one rasterization (and so a second call with
 * the same key never invokes `produce` again).
 */
function cached<K>(
  cache: Map<K, Promise<ImageBitmap>>,
  key: K,
  produce: () => Promise<ImageBitmap>,
): Promise<ImageBitmap> {
  const existing = cache.get(key);
  if (existing) return existing;
  const created = produce();
  cache.set(key, created);
  return created;
}

// ── Brand (theme-constant) ─────────────────────────────────────────────────

/**
 * Rasterize the brand slot ("The Kinetic Alphabet" + ornament + "Choreo Cards")
 * for `theme`. Cache key: theme name (per-theme borderWidth → cqi is isolated).
 *
 * Rendered full-content-box width at the border-aware cqi, at NATURAL height so
 * the "Choreo Cards" sub-line is never cropped. The builder anchors the
 * resulting bitmap (top:3.2cqi, horizontally centered) by its own height.
 */
export function rasterizeBrand(theme: string): Promise<ImageBitmap> {
  return cached(brandCache, theme, () => {
    const { innerWidth } = borderAwareBasis(theme);
    return rasterize(
      CardBackBrand,
      { theme: getCardBackThemeVisuals(theme) },
      Math.round(innerWidth),
      0, // ignored — naturalHeight measures the laid-out content
      { containerWidth: Math.round(innerWidth), naturalHeight: true },
    );
  });
}

// ── URL (theme-constant) ───────────────────────────────────────────────────

/**
 * Rasterize the url slot (ornament + "tkaflowarts.com" + "© <year>") for
 * `theme`. Cache key: theme name (per-theme borderWidth → cqi is isolated).
 *
 * Rendered full-content-box width at the border-aware cqi, at NATURAL height so
 * the "© <year>" line is never cropped. The builder anchors the resulting bitmap
 * (bottom:2.8cqi, horizontally centered) by its own height.
 */
export function rasterizeUrl(theme: string): Promise<ImageBitmap> {
  return cached(urlCache, theme, () => {
    const { innerWidth } = borderAwareBasis(theme);
    return rasterize(
      CardBackUrl,
      { theme: getCardBackThemeVisuals(theme) },
      Math.round(innerWidth),
      0, // ignored — naturalHeight measures the laid-out content
      { containerWidth: Math.round(innerWidth), naturalHeight: true },
    );
  });
}

// ── Difficulty badge (level-constant) ──────────────────────────────────────

/**
 * Rasterize the difficulty badge for `level` (1/2/3) at `theme`'s border-aware
 * cqi. Cache key: `level:cqiEff` (theme only matters via its borderWidth).
 *
 * CardBack.svelte mounts <DifficultyBadge size="7cqi" fontSize="4.2cqi" />, and
 * those cqi resolve against the border-frame content box — so size/fontSize use
 * `cqiEff`, not the full-card cqi (which oversized the badge ~7-8%). Passed as
 * explicit px so the badge renders correctly inside its own (non-cqi) crop box.
 */
export function rasterizeDifficultyBadge(
  level: number,
  theme?: string,
): Promise<ImageBitmap> {
  const { cqiEff } = borderAwareBasis(theme ?? "");
  const badgeSize = 7 * cqiEff;
  const size = `${badgeSize}px`;
  const fontSize = `${4.2 * cqiEff}px`;
  const key = `${level}:${cqiEff.toFixed(4)}`;
  return cached(badgeCache, key, () =>
    rasterize(
      DifficultyBadge,
      { level, size, fontSize },
      Math.round(badgeSize),
      Math.round(badgeSize),
    ),
  );
}

// ── Loop icons (icon-constant) ─────────────────────────────────────────────

/**
 * Rasterize a single LOOP component icon cell, matching CardBack.svelte's
 * node-selection logic exactly:
 *   - SWAPPED            -> fa-shuffle (kind "swap", monochrome brand color)
 *   - quartered INVERTED -> CheckerboardCircleIcon (opts.quarteredInv)
 *   - quartered ROTATED  -> <i class="fas fa-arrows-spin"> (opts.quarteredRot)
 *   - else               -> <i class={LOOP_ICONS[component].fa}>
 *
 * Cache key: `${component}:${color}:${quarteredRot}:${quarteredInv}:${cqiEff}`.
 * Rendered at the theme's border-aware cqi (9cqi cell against the content box).
 *
 * @param component LOOPComponent value (e.g. "rotated").
 * @param color     Icon color (caller passes LOOP_ICONS[component].color).
 * @param opts      quarteredRot / quarteredInv flags + theme (for border-aware cqi).
 */
export function rasterizeLoopIcon(
  component: string,
  color: string,
  opts: {
    quarteredRot?: boolean;
    quarteredInv?: boolean;
    reflectionAxis?: LoopReflectionAxis;
    theme?: string;
  } = {},
): Promise<ImageBitmap> {
  const quarteredRot = opts.quarteredRot ?? false;
  const quarteredInv = opts.quarteredInv ?? false;
  const { innerWidth, cqiEff } = borderAwareBasis(opts.theme ?? "");
  const loopCellSize = 9 * cqiEff;
  const reflection = getReflectionIconTransform(
    component as LOOPComponentId,
    opts.reflectionAxis
  );
  const key = `${component}:${color}:${quarteredRot}:${quarteredInv}:${reflection?.axis ?? ""}:${cqiEff.toFixed(4)}`;

  return cached(loopIconCache, key, () => {
    let props: Record<string, unknown>;
    if (component === LOOPComponent.SWAPPED) {
      props = { kind: "swap", color };
    } else if (component === LOOPComponent.INVERTED && quarteredInv) {
      props = { kind: "checkerboard", color };
    } else if (component === LOOPComponent.ROTATED && quarteredRot) {
      props = { kind: "fa", fa: "fas fa-arrows-spin", color };
    } else if (reflection) {
      props = {
        kind: "fa",
        fa: "fas fa-left-right",
        color,
        rotationDegrees: reflection.rotationDegrees,
        iconScale: reflection.scale,
      };
    } else {
      const fa = LOOP_ICONS[component]?.fa ?? "";
      props = { kind: "fa", fa, color };
    }
    return rasterize(
      CardBackLoopIcon,
      props,
      Math.round(loopCellSize),
      Math.round(loopCellSize),
      { containerWidth: Math.round(innerWidth) },
    );
  });
}

/**
 * Rasterize a single loop icon cell directly from a RESOLVED column spec
 * (`{kind, fa, color}`), mounting CardBackLoopIcon once per
 * `kind:fa:color:cqiEff` and caching the ImageBitmap. Used by the canvas-native
 * loop-row composer in card-back-bitmaps-percard.ts: the icons stay
 * mount-rasterized (FontAwesome glyphs / SwapIcon / CheckerboardCircleIcon can't
 * be drawn directly to canvas without their SVG/font assets) but are CACHED, so
 * there is no per-card mount — only the row composition (text + drawImage) runs
 * per card.
 *
 * @param kind  Icon node kind ("swap" | "checkerboard" | "fa").
 * @param fa    FontAwesome class string (used when kind === "fa").
 * @param color Icon color.
 * @param theme Theme name (for border-aware cqi; the 9cqi cell resolves against
 *              the border-frame content box).
 */
export function rasterizeLoopIconByKind(
  kind: "swap" | "checkerboard" | "fa",
  fa: string,
  color: string,
  theme?: string,
): Promise<ImageBitmap> {
  const { innerWidth, cqiEff } = borderAwareBasis(theme ?? "");
  const loopCellSize = 9 * cqiEff;
  const key = `${kind}:${fa}:${color}:${cqiEff.toFixed(4)}`;
  return cached(loopIconCache, key, () =>
    rasterize(
      CardBackLoopIcon,
      { kind, fa, color },
      Math.round(loopCellSize),
      Math.round(loopCellSize),
      { containerWidth: Math.round(innerWidth) },
    ),
  );
}

// ── Cache reset ────────────────────────────────────────────────────────────

/**
 * Clear all constant-element caches, closing any resolved ImageBitmaps to free
 * GPU/decoder memory. In-flight (unresolved) promises are dropped without
 * waiting; their bitmaps will be GC'd once unreferenced.
 */
export function clearCardBackConstantCache(): void {
  const caches: Map<unknown, Promise<ImageBitmap>>[] = [
    brandCache as Map<unknown, Promise<ImageBitmap>>,
    urlCache as Map<unknown, Promise<ImageBitmap>>,
    badgeCache as Map<unknown, Promise<ImageBitmap>>,
    loopIconCache as Map<unknown, Promise<ImageBitmap>>,
  ];
  for (const cache of caches) {
    for (const entry of cache.values()) {
      entry
        .then((bmp) => bmp.close?.())
        .catch(() => {
          /* never rendered / already closed */
        });
    }
    cache.clear();
  }
}
