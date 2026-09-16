import { getPrintCardRenderer } from "../getPrintCardRenderer";
import { renderSignupCardPair } from "./PrintCardRenderer";
import type { CardPair } from "./types";
import { getImageComposer } from "$lib/shared/render/get-image-composer";
import { getBrowseLoader } from "$lib/shared/browse/get-browse-loader";
import { getQRCodeGenerator } from "$lib/shared/qr/get-qr-code-generator";
import { configureShortCodeManager } from "$lib/shared/qr/get-short-code-manager";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import uniquePackManifests from "../data/festival-sampler-manifests.json";
import {
  FESTIVAL_SHEET_CARD_COUNT,
  placeFestivalSignupAtCenter,
} from "./festival-sampler-sheet";
import {
  findReadyFestivalSamplerPackIndexes,
  festivalSamplerCardKey,
  festivalSamplerFingerprint,
  festivalSamplerManifestRevision,
  type FestivalSamplerCardManifest,
} from "./festival-sampler-manifest";
import { resolveFestivalSamplerCardSequence } from "./festival-sampler-turns";
import {
  buildFestivalSamplerRenderOptions,
  FESTIVAL_SAMPLER_NAME,
} from "./festival-sampler-render-options";
import { SIGNUP_CARD_ART_REVISION } from "./signup-card-canvas-renderer";

export {
  buildFestivalSamplerRenderOptions,
  FESTIVAL_SAMPLER_NAME,
} from "./festival-sampler-render-options";

export {
  applyFestivalSamplerTurnAssignment,
  findCompatibleFestivalSamplerTurnPattern,
  loadFestivalSamplerBaseSequence,
  resolveFestivalSamplerCardSequence,
} from "./festival-sampler-turns";

export {
  festivalSamplerCardKey,
  festivalSamplerFingerprint,
  festivalSamplerManifestRevision,
} from "./festival-sampler-manifest";

export const FESTIVAL_SAMPLER_CARD_COUNT = FESTIVAL_SHEET_CARD_COUNT;

export type SelectedCard = FestivalSamplerCardManifest;

export interface FestivalSamplerPair extends CardPair {
  slot: string;
  name: string;
}

export interface FestivalSamplerPack {
  packNumber: number;
  fingerprint: string;
  pairs: FestivalSamplerPair[];
}

export interface FestivalSamplerProgress {
  current: number;
  total: number;
  label: string;
}

const packManifests = (uniquePackManifests.candidates ?? []) as Array<{
  cards: SelectedCard[];
}>;
export const FESTIVAL_SAMPLER_MAX_PACKS = packManifests.length;
const FESTIVAL_SAMPLER_MANIFEST_REVISION =
  festivalSamplerManifestRevision(packManifests);
const CLASSIC_POSITIONS = new Set(["alpha1", "beta5", "gamma11"]);
const THEME = "rainbow";

interface CachedBatchRender {
  promise: Promise<FestivalSamplerPack[]>;
  progress: FestivalSamplerProgress | null;
  progressListeners: Set<(progress: FestivalSamplerProgress) => void>;
  readyPacks: FestivalSamplerPack[];
  packListeners: Set<(pack: FestivalSamplerPack) => void>;
}

// Moving between app modules destroys the deck-releaser component. Keep the
// expensive card canvases alive for this browser session so reopening the
// festival job restores the finished preview instead of drawing every card
// again. Include both the frozen-manifest and signup-art revisions so changing
// either face of the center card cannot bring older artwork back into the job.
const batchRenderCache = new Map<string, CachedBatchRender>();

function assertClassicEndpoints(
  card: SelectedCard,
  sequence: SequenceData
): void {
  const startPlacement =
    sequence.startPlacement?.gridPlacement ?? sequence.steps[0]?.startPlacement;
  const endPlacement =
    sequence.steps.at(-1)?.endPlacement ??
    (sequence.isCircular ? startPlacement : undefined);

  if (
    !CLASSIC_POSITIONS.has(startPlacement ?? "") ||
    !CLASSIC_POSITIONS.has(endPlacement ?? "")
  ) {
    throw new Error(
      `${card.name} must start and end in Alpha, Beta, or Gamma; got ${startPlacement ?? "unknown"} → ${endPlacement ?? "unknown"}`
    );
  }
}

async function renderSequencePair(
  card: SelectedCard
): Promise<FestivalSamplerPair> {
  const sequence = await resolveFestivalSamplerCardSequence(card);
  assertClassicEndpoints(card, sequence);
  const options = buildFestivalSamplerRenderOptions(card, sequence);
  const renderer = getPrintCardRenderer();
  const [front, back] = await Promise.all([
    renderer.renderFront(sequence, options),
    renderer.renderBack(sequence, options),
  ]);

  return {
    front,
    back,
    label: card.name,
    slot: card.slot,
    name: card.name,
    renderMeta: { sequence, options },
  };
}

/**
 * Render a batch of distinct festival handout sheets. Identical cards shared
 * by several packs are rendered once, then the same canvases are reused in
 * each sheet. No sequence generator or image viewer is involved.
 */
async function renderFestivalSamplerBatchUncached(
  packCount: number,
  onProgress?: (progress: FestivalSamplerProgress) => void,
  onPackReady?: (pack: FestivalSamplerPack) => void
): Promise<FestivalSamplerPack[]> {
  const count = Math.floor(packCount);
  if (!Number.isFinite(count) || count < 1 || count > packManifests.length) {
    throw new Error(
      `Festival sampler supports 1-${packManifests.length} unique packs; received ${packCount}`
    );
  }

  const manifests = packManifests.slice(0, count);
  const fingerprints = manifests.map((manifest) =>
    festivalSamplerFingerprint(manifest.cards)
  );
  if (new Set(fingerprints).size !== manifests.length) {
    throw new Error(
      "Festival sampler batch contains duplicate pack assortments"
    );
  }

  configureShortCodeManager(getBrowseLoader());
  getImageComposer().setQRCodeGenerator(getQRCodeGenerator());

  const uniqueCards = new Map<string, SelectedCard>();
  for (const manifest of manifests) {
    if (manifest.cards.length !== FESTIVAL_SHEET_CARD_COUNT - 1) {
      throw new Error(
        `Festival pack needs 8 sample cards; received ${manifest.cards.length}`
      );
    }
    for (const card of manifest.cards) {
      uniqueCards.set(festivalSamplerCardKey(card), card);
    }
  }

  const total = uniqueCards.size + 1;
  const renderedByKey = new Map<string, FestivalSamplerPair>();
  const publishedPackIndexes = new Set<number>();
  const readyPacks = new Map<number, FestivalSamplerPack>();
  let current = 0;

  onProgress?.({
    current,
    total,
    label: "Rendering signup card",
  });
  const signup = await renderSignupCardPair({
    theme: THEME,
    cardSize: "poker",
  });
  const signupPair: FestivalSamplerPair = {
    front: signup.front,
    back: signup.back,
    label: "Start Here",
    slot: "signup",
    name: "Start Here",
  };
  current += 1;

  const publishNewlyReadyPacks = (): void => {
    const readyIndexes = findReadyFestivalSamplerPackIndexes(
      manifests,
      new Set(renderedByKey.keys()),
      publishedPackIndexes
    );
    for (const index of readyIndexes) {
      const manifest = manifests[index]!;
      const samples = manifest.cards.map((card) => {
        const rendered = renderedByKey.get(festivalSamplerCardKey(card));
        if (!rendered) {
          throw new Error(`Festival sampler render missing: ${card.name}`);
        }
        return rendered;
      });
      const pack: FestivalSamplerPack = {
        packNumber: index + 1,
        fingerprint: fingerprints[index]!,
        pairs: placeFestivalSignupAtCenter(samples, signupPair),
      };
      publishedPackIndexes.add(index);
      readyPacks.set(index, pack);
      onPackReady?.(pack);
    }
  };

  const entries = [...uniqueCards.entries()];
  let nextIndex = 0;

  // Match the normal Deck Releaser's two-lane ceiling. Front and back renders
  // can overlap their async work, but card backs still rasterize on the main
  // thread, so additional lanes hurt responsiveness more than throughput.
  const lane = async (): Promise<void> => {
    while (true) {
      const index = nextIndex++;
      if (index >= entries.length) return;
      const [key, card] = entries[index]!;
      renderedByKey.set(key, await renderSequencePair(card));
      current += 1;
      publishNewlyReadyPacks();
      onProgress?.({
        current,
        total,
        label: `Rendered ${current} of ${total}: ${card.name}`,
      });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(2, entries.length) }, () => lane())
  );

  const packs = manifests.map((_, index) => {
    const pack = readyPacks.get(index);
    if (!pack) throw new Error(`Festival sampler pack ${index + 1} is missing`);
    return pack;
  });

  onProgress?.({
    current: total,
    total,
    label: `${packs.length} unique packs ready to print`,
  });
  return packs;
}

export function renderFestivalSamplerBatch(
  packCount: number,
  onProgress?: (progress: FestivalSamplerProgress) => void,
  onPackReady?: (pack: FestivalSamplerPack) => void
): Promise<FestivalSamplerPack[]> {
  const count = Math.floor(packCount);
  const cacheKey = `${FESTIVAL_SAMPLER_MANIFEST_REVISION}:${SIGNUP_CARD_ART_REVISION}:${count}`;
  const existing = batchRenderCache.get(cacheKey);
  if (existing) {
    if (onProgress) {
      existing.progressListeners.add(onProgress);
      if (existing.progress) onProgress(existing.progress);
    }
    if (onPackReady) {
      existing.packListeners.add(onPackReady);
      for (const pack of existing.readyPacks) onPackReady(pack);
    }
    return existing.promise.finally(() => {
      if (onProgress) existing.progressListeners.delete(onProgress);
      if (onPackReady) existing.packListeners.delete(onPackReady);
    });
  }

  const progressListeners = new Set<
    (progress: FestivalSamplerProgress) => void
  >();
  const packListeners = new Set<(pack: FestivalSamplerPack) => void>();
  if (onProgress) progressListeners.add(onProgress);
  if (onPackReady) packListeners.add(onPackReady);
  const cached: CachedBatchRender = {
    promise: Promise.resolve([]),
    progress: null,
    progressListeners,
    readyPacks: [],
    packListeners,
  };
  cached.promise = renderFestivalSamplerBatchUncached(
    count,
    (progress) => {
      cached.progress = progress;
      for (const listener of cached.progressListeners) listener(progress);
    },
    (pack) => {
      cached.readyPacks.push(pack);
      cached.readyPacks.sort((a, b) => a.packNumber - b.packNumber);
      for (const listener of cached.packListeners) listener(pack);
    }
  ).catch((cause) => {
    batchRenderCache.delete(cacheKey);
    throw cause;
  });
  batchRenderCache.set(cacheKey, cached);

  return cached.promise.finally(() => {
    if (onProgress) cached.progressListeners.delete(onProgress);
    if (onPackReady) cached.packListeners.delete(onPackReady);
  });
}

/** Render the approved control pack for the capture harness. */
export async function renderFestivalSampler(
  onProgress?: (progress: FestivalSamplerProgress) => void
): Promise<FestivalSamplerPair[]> {
  const [pack] = await renderFestivalSamplerBatch(1, onProgress);
  return pack!.pairs;
}
