<!--
  The tunnel page's viewer host. It resolves both performers' codes and opens
  the shared viewer on its tunnel playback with both of them cast. The other
  views show the front performer; the Tunnel view's settings link each
  performer's own page. Viewer chrome stays the shell's.
-->
<script lang="ts">
  import { browser } from "$app/env";
  import { goto } from "$app/navigation";
  import { onDestroy, onMount } from "svelte";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import { hydrateSequence } from "#lib/shared/navigation/services/sequence-hydrator.js";
  import { loopDetector } from "#lib/features/create/generate/circular/services/loop-detector.js";
  import { registerLoopDetector } from "#lib/shared/create/get-loop-detector.js";
  import { registerLoopDisplayResolver } from "#lib/shared/loop-labeler/get-loop-display-resolver.js";
  import { resolveLoopDisplay } from "#lib/features/loop-labeler/services/loop-display-resolver.js";
  import {
    configureShortCodeManager,
    getShortCodeManager,
  } from "#lib/shared/qr/get-short-code-manager.js";
  import type { ShortCodeSequenceLoader } from "#lib/shared/qr/services/short-code-manager.js";
  import { registerLibraryRepository } from "#lib/shared/composition-root/register-library-repository.js";
  import { initializeAppServices } from "#lib/shared/application/state/services.svelte.js";
  import { createRouteLoadFence } from "#lib/shared/navigation/services/route-load-fence.js";
  import SequenceViewerOrchestrator from "#lib/shared/sequence-viewer/components/SequenceViewerOrchestrator.svelte";
  import SequenceViewerShell from "#lib/shared/sequence-viewer/components/SequenceViewerShell.svelte";
  import type { TunnelComposition } from "#lib/shared/sequence-viewer/tunnel/tunnel-composition.js";
  import {
    partnerTunnelComposition,
    type PartnerTunnelAddress,
  } from "#lib/shared/sequence-viewer/tunnel/partner-tunnel.js";
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";
  import SequencePageLoading from "../../sequence/[id]/SequencePageLoading.svelte";
  import { useSequencePageLoading } from "../../sequence/[id]/sequence-page-loading.svelte.js";

  let { address }: { address: PartnerTunnelAddress | null } = $props();

  // This standalone route never mounts the app's composition root; see the
  // same registration in SequenceViewerPage.
  if (browser) registerLibraryRepository();

  interface TunnelCast {
    front: SequenceData;
    composition: TunnelComposition;
  }

  let cast = $state<TunnelCast | null>(null);
  let loadError = $state<string | null>(null);
  let isMobile = $state(false);

  const loading = useSequencePageLoading();
  const loadingSession = browser ? loading.open() : null;
  $effect(() => {
    if (!loadingSession || (!cast && !loadError)) return;
    if (loadError) loadingSession.abandon();
    else loadingSession.complete();
  });

  const routeLoad = createRouteLoadFence();
  let resizeCleanup: (() => void) | null = null;

  async function resolveCode(code: string): Promise<SequenceData> {
    const sequence = await getShortCodeManager().resolveShortCode(code);
    if (!sequence) throw new Error(`Sequence ${code} was not found.`);
    return hydrateSequence(sequence, { loopDetector });
  }

  async function loadCast(run: number): Promise<void> {
    if (!address) {
      loadError = "A tunnel address names two sequences, like 4UMY-B7Y4.";
      return;
    }
    try {
      const [front, back] = await Promise.all([
        resolveCode(address.front),
        resolveCode(address.back),
      ]);
      if (routeLoad.isStale(run)) return;
      const composition = await partnerTunnelComposition(address, front, back);
      if (routeLoad.isStale(run)) return;
      cast = { front, composition };
    } catch (error) {
      if (routeLoad.isStale(run)) return;
      loadError =
        error instanceof Error ? error.message : "The tunnel could not load.";
    }
  }

  onMount(() => {
    loadingSession?.reach("viewer");
    try {
      getShortCodeManager();
    } catch {
      configureShortCodeManager({
        loadFullSequenceData: async () => null,
      } satisfies ShortCodeSequenceLoader);
    }
    registerLoopDetector(loopDetector);
    registerLoopDisplayResolver(resolveLoopDisplay);
    initializeAppServices().catch(() => {});

    const checkMobile = () => {
      isMobile = window.innerWidth < 768;
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    resizeCleanup = () => window.removeEventListener("resize", checkMobile);

    void loadCast(routeLoad.begin());
  });

  onDestroy(() => {
    routeLoad.dispose();
    resizeCleanup?.();
  });

  function handleClose(reason?: "navigate") {
    if (reason === "navigate") return;
    if (browser && window.history.length > 1) {
      window.history.back();
      return;
    }
    void goto("/browse/gallery");
  }
</script>

{#if loadError}
  <div class="tunnel-route-page">
    <div class="error-card">
      <h1>This tunnel isn't available</h1>
      <p>{loadError}</p>
      <LinkChip href="/browse/gallery">Browse sequences</LinkChip>
    </div>
  </div>
{:else if !cast}
  <div class="tunnel-route-page">
    {#if loadingSession}
      <SequencePageLoading session={loadingSession} />
    {/if}
  </div>
{:else}
  {@const shown = cast}
  <SequenceViewerOrchestrator
    sequence={shown.front}
    {isMobile}
    initialViewerMode="tunnel"
    onClose={handleClose}
  >
    {#snippet children(ctx)}
      <main class="tunnel-route-page" data-fullscreen={ctx.isFullscreen}>
        <div class="viewer">
          <SequenceViewerShell
            {ctx}
            sequence={shown.front}
            analyticsSource="external_link"
            {isMobile}
            onClose={handleClose}
            navigation={{ label: "Back" }}
            tunnelComposition={shown.composition}
            showFullscreenControls
          />
        </div>
      </main>
    {/snippet}
  </SequenceViewerOrchestrator>
{/if}

<style>
  .tunnel-route-page {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100vh;
    height: 100dvh;
    overflow: hidden;
  }

  .viewer {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .viewer > :global(*) {
    flex: 1;
    min-height: 0;
  }

  .error-card {
    margin: auto;
    display: grid;
    justify-items: center;
    gap: 12px;
    max-width: 400px;
    padding: 2rem;
    text-align: center;
    color: var(--theme-text, #ffffff);
  }

  .error-card h1 {
    margin: 0;
    font-size: 1.5rem;
  }

  .error-card p {
    margin: 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
  }
</style>
