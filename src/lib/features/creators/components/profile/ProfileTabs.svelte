<script lang="ts">
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import { onMount } from "svelte";
  import { fade } from "svelte/transition";
  import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
  import PanelState from "#lib/shared/components/panel/PanelState.svelte";
  import SortPopover from "#lib/features/browse/shared/components/SortPopover.svelte";
  import { BrowseSortMethod } from "#lib/shared/browse/domain/enums/browse-enums.js";
  import { sortSequences } from "#lib/shared/browse/services/browse-sorter.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import { simplifyRepeatedWord } from "#lib/shared/foundation/utils/word-simplifier.js";
  import type { LibrarySequence } from "#lib/shared/library/domain/models/library-sequence.js";
  import PropAwareThumbnail from "#lib/shared/browse/components/PropAwareThumbnail.svelte";
  import SectionHeader from "#lib/shared/browse/components/SectionHeader.svelte";
  import { getAnimationVisibilityManager } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  let {
    userSequences = [],
    onSequenceClick,
  }: {
    userSequences?: readonly LibrarySequence[];
    onSequenceClick: (sequence: LibrarySequence) => void;
  } = $props();

  let hapticService: HapticFeedback | undefined;

  let reducedMotion = $state(
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  $effect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e: MediaQueryListEvent) => { reducedMotion = e.matches; };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  });

  const visibilityManager = getAnimationVisibilityManager();
  let lightMode = $state(!visibilityManager.isDarkMode());

  function handleVisibilityChange() {
    lightMode = !visibilityManager.isDarkMode();
  }

  onMount(() => {
    hapticService = getHapticFeedback();
  });

  $effect(() => {
    visibilityManager.registerObserver(handleVisibilityChange);
    return () => visibilityManager.unregisterObserver(handleVisibilityChange);
  });

  // Reuses the browse gallery's sort machinery: SortPopover UI + the shared
  // sortSequences() service. Default to newest-first — most useful for a large
  // personal library.
  let sortMethod = $state<BrowseSortMethod>(BrowseSortMethod.DATE_ADDED);

  const sortedSequences = $derived(
    sortSequences([...userSequences] as SequenceData[], sortMethod) as LibrarySequence[]
  );

  // Group by exact step count so a row never mixes thumbnail heights (mixed
  // rows make shorter sequences look shrunken). Map preserves insertion order,
  // so groups follow the active sort: Length → ascending, Date → the group
  // holding the newest sequence first, A-Z → group of the first word first.
  const lengthGroups = $derived.by(() => {
    const groups = new Map<number, LibrarySequence[]>();
    for (const sequence of sortedSequences) {
      const steps = sequence.sequenceLength ?? sequence.steps?.length ?? 0;
      const bucket = groups.get(steps);
      if (bucket) bucket.push(sequence);
      else groups.set(steps, [sequence]);
    }
    return [...groups.entries()];
  });

  function getDisplayName(sequence: LibrarySequence): string {
    // A LOOP word repeats by construction, so the raw field is routinely
    // FΨFΨFΨFΨ where the only correct display is FΨ
    // (.claude/rules/simplified-word-display.md).
    if (sequence.word) return simplifyRepeatedWord(sequence.word);

    if (sequence.name) {
      const cleaned = sequence.name
        .replace(/^Circular\s+/i, "")
        .replace(/\s+Sequence$/i, "");
      if (cleaned && !/^Sequence\s+/i.test(cleaned)) return cleaned;
    }

    if (sequence.steps && sequence.steps.length > 0) {
      return `${sequence.steps.length} steps`;
    }

    return "Untitled";
  }

  function handleSequenceClick(sequence: LibrarySequence) {
    hapticService?.trigger("selection");
    onSequenceClick(sequence);
  }
</script>

{#if userSequences.length === 0}
  <div class="gallery-content">
    <PanelState
      type="empty"
      icon="fa-list"
      title={t("browse_verified_no_sequences_yet")}
      message={t("browse_verified_creator_no_sequences")}
      compact
    />
  </div>
{:else}
  <div class="gallery-toolbar">
    <span class="gallery-count">
      {userSequences.length === 1
        ? t("profile_sequence_count_one")
        : t("profile_sequence_count_other", { count: String(userSequences.length) })}
    </span>
    <!-- align="end": the trigger sits at the toolbar's right edge and the
         profile scroller clips overflow-x, so the panel must open leftward. -->
    <SortPopover currentMethod={sortMethod} onSortChange={(m) => (sortMethod = m)} align="end" />
  </div>

  <div class="gallery-content">
    {#each lengthGroups as [steps, group] (steps)}
      <!-- Count travels inside the title as "(N sequences)" — the committed
           SectionHeader parses it out; its explicit count prop is another
           session's in-flight addition, not safe to depend on yet. -->
      <SectionHeader
        title={`${t("browse_n_steps", { count: String(steps) })} (${t(group.length === 1 ? "browse_audit_one_sequence" : "browse_audit_many_sequences", { count: group.length })})`}
      />
      <div class="gallery-grid">
        {#each group as sequence (sequence.id)}
          <button
            class="gallery-card"
            onclick={() => handleSequenceClick(sequence)}
            transition:fade={{ duration: reducedMotion ? 0 : 200 }}
            aria-label={t("browse_verified_view_sequence", { name: getDisplayName(sequence) })}
          >
            <div class="card-thumbnail">
              <PropAwareThumbnail {sequence} {lightMode} />
            </div>

            {#if sequence.starCount > 0}
              <div class="star-pill">
                <span class="star-icon">&#9733;</span>
                <span class="star-count">{sequence.starCount}</span>
              </div>
            {/if}
          </button>
        {/each}
      </div>
    {/each}
  </div>
{/if}

<style>
  .gallery-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 16px;
    flex-wrap: wrap;
    /* Lift the sort popover above the gallery grid below it. The grid's
       container-type establishes a stacking context, so without this the
       cards paint over the open popover. */
    position: relative;
    z-index: 30;
  }

  .gallery-count {
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--theme-text-dim);
  }

  .gallery-content {
    container-type: inline-size;
    container-name: gallery;
    width: 100%;
  }

  .gallery-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 12px;
    /* Thumbnails carry per-beat-count aspect ratios, so card heights vary.
       Same rule as BrowseGrid: hug content instead of stretching every card
       to the row's tallest — otherwise short cards render big blank slabs. */
    align-items: start;
  }

  .gallery-card {
    position: relative;
    display: flex;
    flex-direction: column;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    overflow: hidden;
    padding: 0;
    text-align: left;
  }

  .gallery-card:hover {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong);
    transform: translateY(-2px);
    box-shadow: var(--shadow-glass-hover, 0 4px 12px rgba(0,0,0,0.3));
  }

  .card-thumbnail {
    width: 100%;
    container-type: inline-size;
    container-name: sequence-card;
  }

  .star-pill {
    position: absolute;
    bottom: 8px;
    right: 8px;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    background: rgba(0, 0, 0, 0.65);
    backdrop-filter: blur(8px);
    border-radius: 6px;
    opacity: 0;
    transform: translateY(4px);
    transition: all var(--duration-normal) ease;
    pointer-events: none;
  }

  .gallery-card:hover .star-pill {
    opacity: 1;
    transform: translateY(0);
  }

  .star-icon {
    font-size: 0.7rem;
    color: var(--semantic-warning, #f59e0b);
  }

  .star-count {
    font-size: var(--font-size-xs, 11px);
    font-weight: 600;
    color: rgba(255, 255, 255, 0.85);
  }

  @container gallery (max-width: 640px) {
    .gallery-grid {
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: 8px;
    }

    .star-pill {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @container gallery (min-width: 2000px) {
    .gallery-grid {
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .gallery-card {
      transition: none;
    }

    .gallery-card:hover {
      transform: none;
    }

    .star-pill {
      opacity: 1;
      transform: none;
      transition: none;
    }
  }

  @media (hover: none) {
    .star-pill {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
