<script lang="ts">
  import { onMount } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import Crossfade from "$lib/shared/components/Crossfade.svelte";
  import ChoreoCardThumbnail from "$lib/shared/browse/components/ChoreoCardThumbnail/ChoreoCardThumbnail.svelte";
  import { getBrowseLoader } from "$lib/shared/browse/get-browse-loader";
  import {
    hydrateSequence,
    prefetch,
  } from "$lib/shared/sequence-viewer/services/sequence-data-provider";
  import {
    getSettings,
    updateSettings,
  } from "$lib/shared/application/state/app-state.svelte";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { getPropTypeDisplayInfo } from "$lib/shared/pictograph/prop/domain/prop-type-display-registry";
  import { registerLoopDetector } from "$lib/shared/create/get-loop-detector";
  import { loopDetector } from "$lib/features/create/generate/circular/services/loop-detector";
  import { t } from "$lib/shared/i18n/i18n.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

  const mobile = new MediaQuery("(max-width: 640px)");
  const propTypes = [
    PropType.STAFF,
    PropType.FAN,
    PropType.CLUB,
    PropType.POI,
    PropType.BUUGENG,
    PropType.HAND,
  ];
  let status = $state<"loading" | "ready" | "error">("loading");
  let sequences = $state<SequenceData[]>([]);
  let selected = $state<SequenceData | null>(null);
  let opening = $state(false);
  let viewerError = $state(false);
  let requestId = 0;
  let mounted = false;
  const selectedProp = $derived(getSettings().leftPropType ?? PropType.STAFF);

  function pickSequences(pool: readonly SequenceData[]): SequenceData[] {
    const words = new Set<string>();
    const picks: SequenceData[] = [];
    // Short cards keep the introductory examples readable at thumbnail size.
    const shortSequences = pool.filter((sequence) => {
      const steps = sequence.steps?.length || sequence.sequenceLength || 0;
      return steps === 4;
    });
    for (const sequence of [...shortSequences, ...pool]) {
      const word = (
        sequence.word ||
        sequence.name ||
        sequence.id
      ).toUpperCase();
      if (!sequence.id || words.has(word)) continue;
      words.add(word);
      picks.push(sequence);
      if (picks.length === 4) break;
    }
    return picks;
  }

  async function load(): Promise<void> {
    status = "loading";
    try {
      const loader = getBrowseLoader();
      const pool =
        (await loader.loadCachedSequenceMetadata()) ??
        (await loader.loadInitialSequenceMetadata()) ??
        (await loader.loadSequenceMetadata());
      if (!mounted) return;
      sequences = pickSequences(pool);
      status = sequences.length > 0 ? "ready" : "error";
    } catch (error) {
      if (!mounted) return;
      console.error(
        "[Composer gallery] Could not load community sequences",
        error
      );
      status = "error";
    }
  }

  async function open(sequence: SequenceData): Promise<void> {
    const currentRequest = ++requestId;
    opening = true;
    viewerError = false;
    try {
      const hydrated = await hydrateSequence(sequence);
      if (!mounted || currentRequest !== requestId) return;
      if (!hydrated.steps?.length) throw new Error("Sequence has no steps");
      selected = hydrated;
    } catch (error) {
      if (!mounted || currentRequest !== requestId) return;
      console.error("[Composer gallery] Could not open sequence", error);
      viewerError = true;
    } finally {
      if (mounted && currentRequest === requestId) opening = false;
    }
  }

  function back(): void {
    requestId += 1;
    selected = null;
    opening = false;
    viewerError = false;
  }

  function chooseProp(event: Event): void {
    const value = (event.currentTarget as HTMLSelectElement).value as PropType;
    if (!propTypes.includes(value) && value !== selectedProp) return;
    void updateSettings({
      leftPropType: value,
      rightPropType: value,
      propViewingMode: "my-props",
    });
  }

  onMount(() => {
    mounted = true;
    registerLoopDetector(loopDetector);
    void load();
    return () => {
      mounted = false;
      requestId += 1;
    };
  });
</script>

<div class="gallery-frame">
  <header class="gallery-header">
    <div class="header-copy">
      <span class="eyebrow">Community sequences</span>
      <h3>{selected ? selected.name || selected.word : "Pick a sequence"}</h3>
    </div>
    {#if selected}
      <button
        class="back-button"
        type="button"
        aria-label="Back to sequences"
        onclick={back}
      >
        <i class="fas fa-arrow-left" aria-hidden="true"></i>
        {mobile.current ? "Back" : "Back to sequences"}
      </button>
    {:else}
      <label class="prop-picker">
        <span>Props</span>
        <select
          value={selectedProp}
          onchange={chooseProp}
          aria-label="Choose props for sequences"
        >
          {#if !propTypes.includes(selectedProp)}
            <option value={selectedProp}
              >{getPropTypeDisplayInfo(selectedProp).label}</option
            >
          {/if}
          {#each propTypes as prop (prop)}
            <option value={prop}>{getPropTypeDisplayInfo(prop).label}</option>
          {/each}
        </select>
      </label>
    {/if}
  </header>

  <div class="gallery-stage">
    <Crossfade
      key={selected?.id ?? "grid"}
      fill
      label={selected ? "Sequence viewer" : "Community sequences"}
    >
      {#if selected}
        {#await import("./ComposerInlineSequenceViewer.svelte") then viewer}
          <viewer.default
            sequence={selected}
            isMobile={mobile.current}
            onBack={back}
          />
        {:catch}
          <div class="gallery-error" role="alert">
            The viewer couldn't open. <button type="button" onclick={back}
              >Back to sequences</button
            >
          </div>
        {/await}
      {:else if status === "ready"}
        <div class="sequence-grid">
          {#each sequences as sequence (sequence.id)}
            <ChoreoCardThumbnail
              {sequence}
              eager
              allowQR={false}
              onHover={prefetch}
              onPrimaryAction={open}
            />
          {/each}
        </div>
      {:else if status === "loading"}
        <div class="gallery-skeleton" aria-hidden="true">
          {#each Array.from({ length: 4 }, (_, i) => i) as i (i)}
            <div class="skeleton-cell" style:--stagger={i}></div>
          {/each}
        </div>
      {:else}
        <div class="gallery-error" role="alert">
          <p>{t("composer_gallery_demo_failed")}</p>
          <button type="button" onclick={() => void load()}
            >{t("composer_retry_gallery")}</button
          >
        </div>
      {/if}
    </Crossfade>
  </div>
  <div class="gallery-feedback" role={viewerError ? "alert" : "status"}>
    {#if opening || viewerError}
      {#if viewerError}
        This sequence couldn't open. <button
          type="button"
          onclick={() => (viewerError = false)}>Dismiss</button
        >
      {:else}
        Opening sequence…
      {/if}
    {/if}
  </div>
</div>

<style>
  .gallery-frame {
    display: flex;
    flex-direction: column;
    min-width: 0;
    height: var(--composer-gallery-height, 36rem);
    overflow: hidden;
    padding: clamp(0.75rem, 1.7vw, 1.4rem);
    border: 1px solid var(--theme-stroke, oklch(0.45 0.03 270 / 0.2));
    border-radius: clamp(1rem, 1.5vw, 1.5rem);
    background: var(--theme-panel-bg, oklch(0.13 0.025 270 / 0.94));
    box-shadow: 0 1.5rem 4rem oklch(0.04 0.03 270 / 0.3);
  }
  .gallery-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    min-height: 3.5rem;
    margin-bottom: 0.8rem;
  }
  .header-copy {
    min-width: 0;
  }
  .eyebrow {
    color: var(--theme-text-muted, #b5b3c4);
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  h3 {
    margin: 0.2rem 0 0;
    overflow: hidden;
    color: var(--theme-text, white);
    font-size: clamp(1rem, 1.6vw, 1.25rem);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .prop-picker {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--theme-text-muted, #b5b3c4);
    font-size: 0.875rem;
    white-space: nowrap;
  }
  .prop-picker select,
  .back-button,
  .gallery-error button,
  .gallery-feedback button {
    min-height: 3rem;
    padding: 0.4rem 0.7rem;
    border: 1px solid var(--theme-stroke-strong, #777487);
    border-radius: 0.7rem;
    background: var(--theme-card-bg, #242332);
    color: var(--theme-text, white);
    font: inherit;
    cursor: pointer;
  }
  .prop-picker select {
    max-width: 12rem;
  }
  .back-button {
    flex-shrink: 0;
    white-space: nowrap;
  }
  .gallery-stage {
    position: relative;
    flex: 1;
    min-height: 0;
    container-type: size;
  }
  .gallery-stage :global(.crossfade) {
    height: 100%;
  }
  .sequence-grid,
  .gallery-skeleton {
    display: grid;
    width: 100%;
    height: 100%;
    grid-template-columns: repeat(4, minmax(0, min(13rem, 55cqh)));
    align-content: center;
    justify-content: center;
    gap: clamp(0.55rem, 1vw, 1rem);
  }
  .sequence-grid :global(.choreo-card) {
    min-width: 0;
  }
  .skeleton-cell {
    aspect-ratio: 0.8;
    max-height: 100%;
    border-radius: 0.9rem;
    background: linear-gradient(
      100deg,
      oklch(0.2 0.03 270 / 0.7) 40%,
      oklch(0.26 0.04 274 / 0.8) 50%,
      oklch(0.2 0.03 270 / 0.7) 60%
    );
    background-size: 200% 100%;
    animation: gallery-shimmer 1.6s ease-in-out infinite;
    animation-delay: calc(var(--stagger) * 90ms);
  }
  @keyframes gallery-shimmer {
    from {
      background-position: 120% 0;
    }
    to {
      background-position: -80% 0;
    }
  }
  .gallery-error {
    display: flex;
    height: 100%;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.9rem;
    color: var(--theme-text-muted, #b5b3c4);
    text-align: center;
  }
  .gallery-error p {
    margin: 0;
  }
  .gallery-feedback {
    flex: 0 0 1.7rem;
    display: flex;
    align-items: center;
    color: var(--theme-text-muted, #b5b3c4);
    font-size: 0.8rem;
  }
  button:focus-visible,
  select:focus-visible {
    outline: 2px solid var(--theme-accent, #8b8cff);
    outline-offset: 3px;
  }
  @media (max-width: 640px) {
    .gallery-header {
      align-items: flex-start;
    }
    .prop-picker {
      flex-direction: column;
      align-items: flex-end;
      gap: 0.2rem;
    }
    .prop-picker select {
      max-width: 9rem;
    }
    .sequence-grid,
    .gallery-skeleton {
      grid-template-columns: repeat(2, minmax(0, min(10rem, 28cqh)));
      grid-template-rows: repeat(2, minmax(0, 1fr));
    }
    .sequence-grid :global(.choreo-card) {
      max-height: 100%;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .skeleton-cell {
      animation: none;
    }
  }
</style>
