<script lang="ts">
  import type { PageData } from "./$types";
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { onMount, onDestroy } from "svelte";
  import SequenceViewerOrchestrator from "$lib/shared/sequence-viewer/components/SequenceViewerOrchestrator.svelte";
  import SequenceViewerShell from "$lib/shared/sequence-viewer/components/SequenceViewerShell.svelte";
  import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
  import { loopDetector } from "$lib/features/create/generate/circular/services/loop-detector";
  import { registerLoopDetector } from "$lib/shared/create/get-loop-detector";
  import { registerLoopDisplayResolver } from "$lib/shared/loop-labeler/get-loop-display-resolver";
  import { resolveLoopDisplay } from "$lib/features/loop-labeler/services/loop-display-resolver";
  import { registerLibraryRepository } from "$lib/shared/composition-root/register-library-repository";
  import {
    configureShortCodeManager,
    getShortCodeManager,
  } from "$lib/shared/qr/get-short-code-manager";
  import type { ShortCodeSequenceLoader } from "$lib/shared/qr/services/short-code-manager";

  // Same reason as the /sequence host: this route never mounts
  // MainApplication's composition root, so nothing else registers these owners.
  // Unlike /sequence, the sequence arrives synchronously from load(), so the
  // orchestrator's playback boot races the host's onMount — registration must
  // happen at component init, before the orchestrator mounts. Registering is
  // idempotent.
  if (browser) {
    registerLibraryRepository();
    registerLoopDetector(loopDetector);
    registerLoopDisplayResolver(resolveLoopDisplay);
    try {
      getShortCodeManager();
    } catch {
      configureShortCodeManager({
        loadFullSequenceData: async () => null,
      } satisfies ShortCodeSequenceLoader);
    }
  }

  let { data }: { data: PageData } = $props();

  let isMobile = $state(false);
  let resizeCleanup: (() => void) | null = null;

  /** His names for the three catalogues, not TKA's internal key spelling. */
  const CONCEPT_LABELS: Record<string, string> = {
    vtg: "VTG",
    qtr: "Quarter spacing",
    "8stp": "Eight Step",
  };

  const word = $derived(
    data.status === "resolved" ? simplifyRepeatedWord(data.entry.word) : ""
  );

  const conceptLabel = $derived(
    data.status === "resolved"
      ? (CONCEPT_LABELS[data.entry.concept] ?? data.entry.concept)
      : ""
  );

  /**
   * The provenance line must identify the cell the visitor came from. The
   * Eight Step catalogue has no speed-ratio axis, so printing one there would
   * invent a distinction his data does not carry; the anti variant is part of
   * the cell's identity and is named when present.
   */
  const cellDescription = $derived.by(() => {
    if (data.status !== "resolved") return "";
    const parts = [`${conceptLabel} cell ${data.entry.reference}`];
    if (data.entry.concept !== "8stp") {
      parts.push(data.entry.speedRatio ?? "1:1");
    }
    if (data.entry.isAnti) parts.push("anti");
    return parts.join(" · ");
  });

  onMount(() => {
    // The shell's share sheet resolves short codes; without the composition
    // root nothing configured the manager and it throws. Only when nothing
    // else already did — app mode's real loader must win.
    try {
      getShortCodeManager();
    } catch {
      configureShortCodeManager({
        loadFullSequenceData: async () => null,
      } satisfies ShortCodeSequenceLoader);
    }

    // Playback's getLoopDetector() throws without these, and LOOP labels
    // silently disappear from the header. Registering is idempotent.
    registerLoopDetector(loopDetector);
    registerLoopDisplayResolver(resolveLoopDisplay);

    const checkMobile = () => {
      isMobile = window.innerWidth < 768;
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    resizeCleanup = () => window.removeEventListener("resize", checkMobile);
  });

  onDestroy(() => {
    resizeCleanup?.();
  });

  function handleClose() {
    void goto("/");
  }
</script>

<svelte:head>
  <!-- A generated landing surface for links from another app: never indexed. -->
  <meta name="robots" content="noindex" />
  <title>
    {data.status === "resolved"
      ? `${word} · from SpiroAnim`
      : "Unknown SpiroAnim cell"}
  </title>
</svelte:head>

{#snippet provenance()}
  {#if data.status === "resolved"}
    <div class="bridge-provenance">
      <p class="bridge-provenance-text">
        Opened from SpiroAnim · {cellDescription}
      </p>
      {#if data.returnLink}
        <a
          class="bridge-button"
          href={data.returnLink}
          target="_blank"
          rel="noopener"
        >
          <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>
          View in SpiroAnim
        </a>
      {/if}
    </div>
  {/if}
{/snippet}

{#if data.status === "resolved"}
  <SequenceViewerOrchestrator
    sequence={data.sequence}
    {isMobile}
    onClose={handleClose}
  >
    {#snippet children(ctx)}
      <main class="bridge-route-page" data-fullscreen={ctx.isFullscreen}>
        <SequenceViewerShell
          {ctx}
          sequence={data.sequence}
          analyticsSource="spiroanim"
          {isMobile}
          onClose={handleClose}
          navigation={{ label: "Back to Flow Arts Composer" }}
          openAppHref="/app"
          contextContent={provenance}
          showFullscreenControls
        />
      </main>
    {/snippet}
  </SequenceViewerOrchestrator>
{:else}
  <div class="bridge-route-page">
    <div class="bridge-empty-container">
      <div class="bridge-empty-card">
        <i class="fas fa-link-slash bridge-empty-icon" aria-hidden="true"></i>
        <h1>No bridge entry for {data.cellKey}</h1>
        <p>This link may come from a newer SpiroAnim version.</p>
        <div class="bridge-empty-actions">
          <a class="bridge-button" href="https://spiroanim.com">
            <i class="fas fa-arrow-left" aria-hidden="true"></i>
            Back to SpiroAnim
          </a>
          <a class="bridge-button ghost" href="/">
            <i class="fas fa-house" aria-hidden="true"></i>
            TKA home
          </a>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .bridge-route-page {
    /* One shared clock for the practice push (matches the other hosts). */
    --ws-dur: 300ms;
    --ws-ease: cubic-bezier(0.2, 0, 0, 1);
    display: flex;
    flex-direction: column;
    height: 100vh;
    height: 100dvh;
    overflow: hidden;
  }

  .bridge-provenance {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 0.5rem 0.75rem;
    padding: 0.5rem 1rem;
  }

  .bridge-provenance-text {
    margin: 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-sm, 14px);
  }

  .bridge-empty-container {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }

  .bridge-empty-card {
    text-align: center;
    padding: 2rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 1rem;
    max-width: 420px;
  }

  .bridge-empty-icon {
    font-size: 48px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    margin-bottom: 1rem;
  }

  .bridge-empty-card h1 {
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--theme-text, #ffffff);
    margin: 0 0 0.5rem 0;
    overflow-wrap: anywhere;
  }

  .bridge-empty-card p {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    margin: 0 0 1.5rem 0;
    font-size: var(--font-size-sm, 14px);
  }

  .bridge-empty-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.5rem;
  }

  .bridge-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    min-height: var(--min-touch-target);
    padding: 0.75rem 1.25rem;
    background: var(--theme-accent, #f43f5e);
    color: white;
    border: none;
    border-radius: 0.5rem;
    font-weight: 600;
    font-size: var(--font-size-sm, 14px);
    text-decoration: none;
    cursor: pointer;
    transition: filter var(--duration-normal, 200ms) ease;
  }

  .bridge-button.ghost {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.18));
    color: var(--theme-text, #ffffff);
  }

  .bridge-button:hover {
    filter: brightness(1.1);
  }

  .bridge-button:focus-visible {
    outline: 2px solid var(--theme-accent, #f43f5e);
    outline-offset: 2px;
  }
</style>
