<!--
  Where a letter is used: the TKA 1 cards that spell it, the Gallery search
  for it, the exact link to this view and the Composer draft. The explorer
  dialog shows these in its footer ("footer"); the Codex's Links screen
  shows them as a column of boxes ("screen"). One component, so the two
  never drift.
-->
<script lang="ts">
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import { simplifyRepeatedWord } from "#lib/shared/foundation/utils/word-simplifier.js";
  import {
    generateSequenceRoutePath,
    UnencodableMotionError,
  } from "#lib/shared/navigation/services/sequence-encoder.js";
  import { buildGalleryLetterHref } from "#lib/shared/browse/navigation/gallery-letter-link.js";

  let {
    label,
    learningMatches,
    learningError,
    learningLoading = false,
    composerHref,
    onLearningRetry,
    onCopyLink,
    layout = "footer",
  }: {
    /** The letter the links are for (the shown letter, after Invert). */
    label: string;
    learningMatches: readonly SequenceData[];
    learningError: boolean;
    /** The TKA 1 deck is still loading: say nothing about the cards yet. */
    learningLoading?: boolean;
    composerHref: string | null;
    onLearningRetry: () => void;
    onCopyLink: () => void;
    layout?: "footer" | "screen";
  } = $props();

  const galleryHref = $derived(buildGalleryLetterHref(label));
  // A card link is optional; the explorer is not. A card with a motion the
  // encoder cannot represent is left out instead of throwing during render.
  const learningLinks = $derived(
    learningMatches.flatMap((sequence) => {
      try {
        return [{ sequence, href: generateSequenceRoutePath(sequence) }];
      } catch (error) {
        if (!(error instanceof UnencodableMotionError)) throw error;
        console.warn(
          "[LetterLinks] Leaving out a card link that cannot be encoded.",
          { sequenceId: sequence.id, field: error.field, value: error.value }
        );
        return [];
      }
    })
  );
</script>

{#snippet cards()}
  {#if learningLinks.length > 0}
    {#each learningLinks as { sequence, href } (sequence.id)}
      <LinkChip {href}>
        {simplifyRepeatedWord(sequence.word || sequence.name)}
      </LinkChip>
    {/each}
  {:else if learningError}
    <FilterChipBase
      mode="action"
      size="sm"
      label="Retry TKA 1 cards"
      icon="fas fa-rotate-right"
      onclick={onLearningRetry}
    />
  {/if}
{/snippet}

{#snippet actions()}
  <button class="action secondary" type="button" onclick={onCopyLink}>
    <i class="fa-solid fa-link" aria-hidden="true"></i>
    Copy link
  </button>
  {#if composerHref}
    <a class="action primary" href={composerHref}>
      Continue in Composer
      <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
    </a>
  {/if}
{/snippet}

{#if layout === "footer"}
  <div class="footer-links">
    <div class="links">
      {#if learningLinks.length > 0}
        <span class="links-label">In TKA 1</span>
      {/if}
      {@render cards()}
      <LinkChip href={galleryHref}>Find in Gallery</LinkChip>
    </div>
    <div class="actions">{@render actions()}</div>
  </div>
{:else}
  <div class="screen-links">
    <section class="box" aria-labelledby="letter-links-tka1">
      <h2 id="letter-links-tka1" class="box-label">In TKA 1</h2>
      <div class="card-row">
        {@render cards()}
        {#if learningLinks.length === 0 && !learningError && !learningLoading}
          <span class="none">No TKA 1 card spells {label}.</span>
        {/if}
      </div>
    </section>
    <section class="box" aria-labelledby="letter-links-gallery">
      <h2 id="letter-links-gallery" class="box-label">Gallery</h2>
      <div class="card-row">
        <LinkChip href={galleryHref}>Find in Gallery</LinkChip>
      </div>
    </section>
    <div class="screen-actions">{@render actions()}</div>
  </div>
{/if}

<style>
  .footer-links {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem 1.5rem;
  }

  .links,
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }

  .links-label {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-sm, 0.875rem);
  }

  .screen-links {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
  }

  .box {
    display: grid;
    gap: 8px;
    min-width: 0;
    padding: 12px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.16));
    border-radius: 14px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
  }

  .box-label {
    margin: 0;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.7));
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  /* The cards pan sideways inside their own box when they do not fit. */
  .card-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    padding-bottom: 2px;
  }

  .card-row > :global(*) {
    flex: none;
  }

  .none {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-sm, 0.875rem);
  }

  .screen-actions {
    display: grid;
    gap: 8px;
  }

  .action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.55rem;
    min-height: 44px;
    padding: 0.55rem 0.95rem;
    border-radius: 11px;
    font-family: inherit;
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 750;
    text-decoration: none;
    cursor: pointer;
  }

  .action.secondary {
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.16));
    color: var(--theme-text, #fff);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
  }

  .action.primary {
    border: 1px solid color-mix(in srgb, var(--theme-accent) 70%, transparent);
    color: #fff;
    background: color-mix(in srgb, var(--theme-accent) 82%, #111 18%);
  }

  .action:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .screen-actions .action {
    width: 100%;
    box-sizing: border-box;
  }

  @media (max-width: 520px) {
    .footer-links .actions,
    .footer-links .action {
      width: 100%;
    }

    .footer-links .action {
      flex: 1 1 0;
    }
  }
</style>
