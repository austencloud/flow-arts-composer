/**
 * Assembles the endless spinner's playback stack: the library orchestrator,
 * the infinite generator, and a fresh playback controller bound to the page's
 * own AnimationScope.
 *
 * This lives outside the route component so the page file owns only what the
 * visitor can see (layout, controls, states) while the service wiring — which
 * never changes at runtime — reads as one construction step. Everything here
 * is per-visit: leaving the page throws the whole stack away, so nothing a
 * visitor does on the spinner can bleed into their saved app settings.
 */

import { EndlessSpinnerOrchestrator } from "$lib/features/landing/services/endless-spinner-orchestrator";
import { getBrowseLoader } from "$lib/shared/browse/get-browse-loader";
import { getGenerationOrchestrator } from "$lib/features/create/generate/shared/get-generation-orchestrator";
import { sequenceTransformer } from "$lib/shared/create/services/sequence-transformer";
import { startPlacementDeriver } from "$lib/shared/pictograph/shared/services/start-placement-deriver";
import { InfiniteSequenceGenerator } from "$lib/features/landing/services/infinite-sequence-generator";
import { SpinnerMetricsRepository } from "$lib/features/landing/services/spinner-metrics-repository";
import { orientationCycleExtender } from "$lib/features/create/generate/circular/services/orientation-cycle-extender";
import { createAnimationPlaybackController } from "$lib/features/compose/services/animation-playback-controller-factory";
import {
  createEndlessPlayback,
  type EndlessPlaybackState,
} from "$lib/shared/animation-engine/state/endless-playback-state.svelte";
import type { AnimationScope } from "$lib/shared/animation-engine/state/animation-scope.svelte";

export interface SpinnerSession {
  playback: EndlessPlaybackState;
  spinnerOrchestrator: EndlessSpinnerOrchestrator;
  infiniteGenerator: InfiniteSequenceGenerator;
  metricsRepository: SpinnerMetricsRepository;
}

export function createSpinnerSession(scope: AnimationScope): SpinnerSession {
  const spinnerOrchestrator = new EndlessSpinnerOrchestrator(
    getBrowseLoader(),
    getGenerationOrchestrator(),
    sequenceTransformer,
    startPlacementDeriver
  );

  const metricsRepository = new SpinnerMetricsRepository();
  const infiniteGenerator = new InfiniteSequenceGenerator(
    getGenerationOrchestrator(),
    metricsRepository,
    orientationCycleExtender
  );

  // Fresh controller per page visit; passing the scope's visibility manager
  // keeps prop interpolation on the same paths this scope's overlays draw.
  const playbackController = createAnimationPlaybackController(scope.visibility);

  const playback = createEndlessPlayback({
    modes: ["infinite", "library"],
    defaultMode: "infinite",
    spinnerOrchestrator,
    infiniteGenerator,
    playbackController,
  });

  return { playback, spinnerOrchestrator, infiniteGenerator, metricsRepository };
}
