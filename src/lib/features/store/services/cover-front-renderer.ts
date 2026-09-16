/**
 * cover-front-renderer
 *
 * Renders shop cover cards through the REAL print pipeline
 * (PrintCardRenderer.renderFront: canonical locked visibility + MPC frame +
 * accent coloring), so a shop fan shows the exact card a buyer receives, not
 * an approximation. Returns object URLs, cached per (sequence, accent) for the
 * session; renders are throttled to a few lanes so a grid of fans doesn't
 * stampede the composition worker.
 *
 * Two pieces of app wiring the public shop routes don't otherwise get:
 * - QR generator injection (the app does it in composition-root
 *   deferred-registrations) — without it renderFront silently skips the QR.
 * - Worker asset-bundle seeding (prewarmCardPool) — without it the worker
 *   composes cells with NO arrow/prop/glyph assets and cards come out as bare
 *   grids. Call `prewarmCovers` with a page's full cover set BEFORE fans
 *   mount; the dispatcher gate makes racing renders wait for the seed.
 */

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { CoverCard } from "../domain/models/product";
import { getPrintCardRenderer } from "$lib/features/choreo-card/getPrintCardRenderer";
import { getCatalogLayoutPolicy } from "$lib/features/choreo-card/domain/catalog-layout-policy";
import { hydrateSequence } from "$lib/features/choreo-card/services/catalog-loader";
import type { TnDElement } from "$lib/features/choreo-card/domain/tnd-element";
import type { PrintRenderOptions } from "$lib/features/choreo-card/services/types";
import { getImageComposer } from "$lib/shared/render/get-image-composer";
import { getQRCodeGenerator } from "$lib/shared/qr/get-qr-code-generator";
import { prewarmCardPool } from "$lib/shared/render/services/card-pool-prewarm";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { bakedCoverUrl, SHOP_BACK_THEME } from "../domain/shop-prop-options";
import {
  configureShortCodeManager,
  getShortCodeManager,
} from "$lib/shared/qr/get-short-code-manager";
import type { PublicSequencesLoader } from "$lib/shared/browse/services/public-sequences-loader";
import { loopDetector } from "$lib/features/create/generate/circular/services/loop-detector";
import { registerLoopDetector } from "$lib/shared/create/get-loop-detector";
import { registerLoopDisplayResolver } from "$lib/shared/loop-labeler/get-loop-display-resolver";
import { resolveLoopDisplay } from "$lib/features/loop-labeler/services/loop-display-resolver";
import { initializeAppServices } from "$lib/shared/application/state/services.svelte";

// Covers show the printed deck, so they don't follow the viewer's prop
// settings — they follow the buyer's shop prop choice (both hands the same
// prop), defaulting to staves, the canonical TKA prop.
const DEFAULT_COVER_PROP = PropType.STAFF;

// Browse-cache integration the shortcode manager doesn't need for GENERATING
// codes (same stub /q uses — see routes/q/[code]/+page.svelte).
const stubBrowseLoader = {
  loadSequenceMetadata: async () => [],
  loadFullSequenceData: async () => null,
  removeFromCache: () => {},
  addToCache: () => {},
  warmFromCache: () => {},
  refreshFromFirestore: async () => [],
} as unknown as PublicSequencesLoader;

// Public shop routes skip the app composition root, so the print pipeline's
// dependencies never register. Wire the same set /q wires: shortcode manager
// (QR codes), LOOP detector (compositional QR encoding), loop display
// resolver, settings service, then inject the QR generator the way
// composition-root/deferred-registrations does. Idempotent; respects an
// already-configured app context.
let bootstrapped: Promise<void> | null = null;
function ensureCardPipeline(): Promise<void> {
  return (bootstrapped ??= (async () => {
    try {
      try {
        getShortCodeManager();
      } catch {
        configureShortCodeManager(stubBrowseLoader);
      }
      registerLoopDetector(loopDetector);
      registerLoopDisplayResolver(resolveLoopDisplay);
      await initializeAppServices();
      getImageComposer().setQRCodeGenerator(getQRCodeGenerator());
    } catch (e) {
      console.warn("[cover-front-renderer] card pipeline bootstrap failed:", e);
    }
  })());
}

// Renders wait for the first prewarm so the worker never seeds an EMPTY asset
// bundle (bare-grid cards). Fallback timer keeps a surface that forgot to call
// prewarmCovers rendering (main-thread path still works without a seed).
let seedRequested: (() => void) | null = null;
const seedGate = new Promise<void>((resolve) => {
  seedRequested = resolve;
});
const seedGateWithTimeout = Promise.race([
  seedGate,
  new Promise<void>((resolve) => setTimeout(resolve, 8000)),
]);

/**
 * Seed the composition worker with the asset bundle for a page's full cover
 * set (union across fans, ONE signature) so every fan hits the warm worker
 * path with arrows/props/glyphs present. Fire-and-forget and idempotent per
 * set; safe to call again when products stream in.
 */
export function prewarmCovers(
  cards: readonly CoverCard[],
  propType: PropType = DEFAULT_COVER_PROP,
  { includeBaked = false }: { includeBaked?: boolean } = {}
): void {
  // Baked cards for this prop load as plain images, so by default they don't
  // need the worker pipeline seeded. A page whose OWN cards are generated live
  // — the Deck Architect samples and generates every card it shows — has to
  // pass `includeBaked`: its seed set (the flavor SKUs' covers) is fully baked,
  // so the default filter emptied it, nothing seeded the pool, and every
  // generated card came back a blank white rectangle. NOTE: the pool holds ONE
  // prop bundle at a time (prop types are part of the seed signature), so a
  // prop switch re-seeds.
  const seedFrom = includeBaked
    ? cards
    : cards.filter((c) => !bakedCoverUrl(c, propType));
  const sequences = seedFrom
    .map((c) => c.sequence && hydrateCached(c.sequence))
    .filter(Boolean) as SequenceData[];
  if (!sequences.length) return;
  void ensureCardPipeline();
  const iconPaths = [...new Set(cards.map((c) => c.iconPath).filter((p): p is string => !!p))];
  // beginSeed inside prewarmCardPool is synchronous, so opening the render gate
  // right after guarantees queued renders wait on the dispatcher's seed gate
  // instead of seeding the pool empty.
  prewarmCardPool({
    sequences,
    leftPropType: propType,
    rightPropType: propType,
    theme: "cosmic",
    iconPaths,
  });
  seedRequested?.();
}

const urlCache = new Map<string, Promise<string>>();

// Raw embedded cover docs -> render-ready SequenceData (arrow/prop placement
// data filled). Cached per raw object so prewarm + render share one hydration.
const hydrationCache = new WeakMap<object, SequenceData>();
function hydrateCached(raw: SequenceData): SequenceData {
  const key = raw as unknown as object;
  let hydrated = hydrationCache.get(key);
  if (!hydrated) {
    hydrated = hydrateSequence(raw as unknown as Record<string, unknown>);
    hydrationCache.set(key, hydrated);
  }
  return hydrated;
}

// Bounded lanes: cover fans can queue 12+ renders at once on /shop.
const MAX_LANES = 3;
let active = 0;
const waiters: (() => void)[] = [];

async function acquireLane(): Promise<void> {
  if (active < MAX_LANES) {
    active++;
    return;
  }
  await new Promise<void>((resolve) => waiters.push(resolve));
  active++;
}

function releaseLane(): void {
  active--;
  waiters.shift()?.();
}

function frameElement(card: CoverCard): TnDElement | undefined {
  if (!card.accentColor) return undefined;
  // The front path consumes accentColor / darkComplement / cardTintOpacity /
  // iconPath; the identity fields (and iconScale, a badge-only concern) just
  // satisfy the type.
  return {
    familyId: "cover",
    name: card.footerCenter ?? "cover",
    element: "cover",
    accentColor: card.accentColor,
    darkComplement: card.darkComplement ?? "#444444",
    iconPath: card.iconPath ?? "",
    cardTintOpacity: card.tintOpacity ?? 0.1,
    iconScale: 1,
  };
}

/**
 * Render one cover card front and return an object URL for an <img>.
 * Deck id/name feed QR attribution, same as the print path.
 */
// MPC poker print target — the resolution a baked/print cover renders at.
const PRINT_W = 822;
const PRINT_H = 1122;
const PRINT_BLEED = 36;

/**
 * Scale the print canvas down to a display target. The whole card-front layout
 * derives linearly from canvasWidth (card-front-assembler: stepSize + every
 * offset), so a smaller canvas is the SAME card at fewer pixels — no layout
 * drift. Returns undefined (full print res) when the target is >= print width
 * or unset. Widths are quantized to 128px buckets so a resize within a band
 * reuses the cached render instead of re-rasterizing.
 */
function previewSizeOpts(
  maxWidthPx: number | undefined
): Pick<PrintRenderOptions, "canvasWidth" | "canvasHeight" | "bleedPx" | "showQRCode"> | undefined {
  if (!maxWidthPx || maxWidthPx >= PRINT_W) return undefined;
  const w = Math.min(PRINT_W, Math.max(256, Math.ceil(maxWidthPx / 128) * 128));
  if (w >= PRINT_W) return undefined;
  return {
    canvasWidth: w,
    canvasHeight: Math.round((w * PRINT_H) / PRINT_W),
    bleedPx: Math.round((w * PRINT_BLEED) / PRINT_W),
    // A preview card is never scanned — skip the per-card QR pre-render entirely.
    showQRCode: false,
  };
}

export function renderCoverFront(
  card: CoverCard,
  deck: {
    deckId?: string;
    deckName?: string;
    propType?: PropType;
    /** Display target width in px (DPR-scaled). Set by the live preview fan to
     *  render at screen resolution instead of 822×1122 print res. Omit to bake
     *  full print res. */
    maxWidthPx?: number;
  } = {}
): Promise<string> {
  const seq = card.sequence;
  const propType = deck.propType ?? DEFAULT_COVER_PROP;
  const sizeOpts = previewSizeOpts(deck.maxWidthPx);
  // Size + QR ride the cache key so preview and full-res renders never collide.
  const sizeTag = sizeOpts ? `p${sizeOpts.canvasWidth}` : "full";
  // Every input that changes the pixels is in the key. deckId and deckName feed
  // the QR and its attribution, and the icon/tint/complement paint the frame:
  // two decks sharing a sequence used to hand each other the other's artwork
  // and the other's QR because none of that was named here.
  const key = [
    seq.id ?? seq.word ?? "?",
    card.accentColor ?? "-",
    card.darkComplement ?? "-",
    card.iconPath ?? "-",
    card.tintOpacity ?? "-",
    card.footerCenter ?? "-",
    propType,
    deck.deckId ?? "-",
    deck.deckName ?? "-",
    sizeTag,
  ].join("|");
  const cached = urlCache.get(key);
  if (cached) return cached;

  const work = (async () => {
    await seedGateWithTimeout;
    await ensureCardPipeline();
    await acquireLane();
    try {
      const hydrated = hydrateCached(seq);
      const stepCount = hydrated.steps?.length ?? 8;
      const options: PrintRenderOptions = {
        includeStartPlacement: true,
        // Same policy as the print preview: 8/12-count cards put the start
        // position in the left column.
        startPlacementLayout: getCatalogLayoutPolicy(stepCount),
        showMandala: true,
        tndElement: frameElement(card),
        leftPropType: propType,
        rightPropType: propType,
        // TnD cards keep their element footer; everything else carries the
        // brand line (the deck identity lives on the card BACK).
        notes: card.footerCenter ?? "The Kinetic Alphabet",
        iconPath: card.iconPath,
        ...(deck.deckId && { deckId: deck.deckId }),
        ...(deck.deckName && { deckName: deck.deckName }),
        ...sizeOpts,
      };
      const canvas = await getPrintCardRenderer().renderFront(hydrated, options);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png")
      );
      if (!blob) throw new Error("cover front toBlob returned null");
      return URL.createObjectURL(blob);
    } finally {
      releaseLane();
    }
  })();

  // A failed render shouldn't poison the cache for the session.
  urlCache.set(key, work);
  work.catch(() => urlCache.delete(key));
  return work;
}

const backUrlCache = new Map<string, Promise<string>>();

/**
 * Render one cover card BACK (same MPC canvas + bleed as the front, so the
 * fan's guillotine overscan applies unchanged). Backs never bake — they're
 * only requested one at a time from the card viewer.
 */
export function renderCoverBack(
  card: CoverCard,
  deck: { propType?: PropType } = {}
): Promise<string> {
  const seq = card.sequence;
  const propType = deck.propType ?? DEFAULT_COVER_PROP;
  const key = `${seq.id ?? seq.word ?? "?"}|${propType}|${SHOP_BACK_THEME}`;
  const cached = backUrlCache.get(key);
  if (cached) return cached;

  const work = (async () => {
    await ensureCardPipeline();
    await acquireLane();
    try {
      const hydrated = hydrateCached(seq);
      const canvas = await getPrintCardRenderer().renderBack(hydrated, {
        includeStartPlacement: true,
        theme: SHOP_BACK_THEME,
        leftPropType: propType,
        rightPropType: propType,
      });
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png")
      );
      if (!blob) throw new Error("cover back toBlob returned null");
      return URL.createObjectURL(blob);
    } finally {
      releaseLane();
    }
  })();

  backUrlCache.set(key, work);
  work.catch(() => backUrlCache.delete(key));
  return work;
}
