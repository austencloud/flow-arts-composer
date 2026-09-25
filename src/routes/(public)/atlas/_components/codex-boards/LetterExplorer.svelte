<script lang="ts">
  import GuidePictograph from "../../../guide/level-1/_components/GuidePictograph.svelte";
  import PictographTypeFrame from "$lib/shared/pictograph/shared/components/PictographTypeFrame.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import PropControlPair from "$lib/features/create/shared/components/sequence-actions/PropControlPair.svelte";
  import PropTurnsControl from "$lib/features/create/shared/components/sequence-actions/PropTurnsControl.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import {
    HandSide,
    MotionType,
    type RotationDirection,
  } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import {
    GridMode,
    type GridMode as GridModeValue,
  } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import type { TurnValue } from "$lib/shared/create/domain/turn-pattern-data";
  import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
  import {
    generateSequenceRoutePath,
    UnencodableMotionError,
  } from "$lib/shared/navigation/services/sequence-encoder";
  import { buildGalleryLetterHref } from "$lib/shared/browse/navigation/gallery-letter-link";
  import type { CodexLetterInfo } from "./codex-letters";

  const GRID_OPTIONS = [
    { value: GridMode.DIAMOND, label: "Diamond" },
    { value: GridMode.BOX, label: "Box" },
  ];

  let {
    info,
    gridMode,
    variations,
    selectedIndex,
    draft,
    leftTurns,
    rightTurns,
    leftRotation,
    rightRotation,
    edited,
    isLoading,
    loadError,
    learningMatches,
    learningLoading,
    learningError,
    composerHref,
    onGridChange,
    onVariationChange,
    onTurnsChange,
    onRotationChange,
    onReset,
    onRetry,
    onLearningRetry,
    onCopyLink,
  }: {
    info: CodexLetterInfo;
    gridMode: GridModeValue;
    variations: PictographData[];
    selectedIndex: number;
    draft: PictographData | null;
    leftTurns: TurnValue;
    rightTurns: TurnValue;
    leftRotation: RotationDirection;
    rightRotation: RotationDirection;
    edited: boolean;
    isLoading: boolean;
    loadError: boolean;
    learningMatches: readonly SequenceData[];
    learningLoading: boolean;
    learningError: boolean;
    composerHref: string | null;
    onGridChange: (gridMode: GridModeValue) => void;
    onVariationChange: (index: number) => void;
    onTurnsChange: (color: HandSide, delta: number) => void;
    onRotationChange: (
      color: HandSide,
      direction: RotationDirection
    ) => void;
    onReset: () => void;
    onRetry: () => void;
    onLearningRetry: () => void;
    onCopyLink: () => void;
  } = $props();

  const leftMotion = $derived(draft?.motions?.left);
  const rightMotion = $derived(draft?.motions?.right);
  const leftCanChooseRotation = $derived(
    leftTurns !== "fl" &&
      leftTurns > 0 &&
      (leftMotion?.motionType === MotionType.DASH ||
        leftMotion?.motionType === MotionType.STATIC)
  );
  const rightCanChooseRotation = $derived(
    rightTurns !== "fl" &&
      rightTurns > 0 &&
      (rightMotion?.motionType === MotionType.DASH ||
        rightMotion?.motionType === MotionType.STATIC)
  );
  const gridLabel = $derived(
    gridMode === GridMode.BOX ? "Box grid" : "Diamond grid"
  );
  const galleryHref = $derived(buildGalleryLetterHref(info.label));
  // A card link is optional; the panel is not. A card with a motion the
  // encoder cannot represent is left out of the list instead of throwing
  // during render.
  const learningLinks = $derived(
    learningMatches.flatMap((sequence) => {
      try {
        return [{ sequence, href: generateSequenceRoutePath(sequence) }];
      } catch (error) {
        if (!(error instanceof UnencodableMotionError)) throw error;
        console.warn(
          "[LetterExplorer] Leaving out a card link that cannot be encoded.",
          { sequenceId: sequence.id, field: error.field, value: error.value }
        );
        return [];
      }
    })
  );
</script>

<div class="explorer-container">
  <div class="explorer">
    <section class="preview-column" aria-label="Selected letter variation">
      <div class="identity-row">
        <span class="state-badge" class:edited>
          {edited ? "Unsaved draft" : "Canonical variation"}
        </span>
        <span class="variation-count">
          {gridLabel} · {variations.length} pictographs
        </span>
      </div>

      <div class="hero-frame">
        {#if draft}
          <PictographTypeFrame letter={draft.letter}>
            <GuidePictograph
              data={draft}
              size="lg"
              showGrid
              showArrows
              showTKA
              showNonRadialPoints={gridMode === GridMode.BOX}
              forceTheme="dark"
              eager
            />
          </PictographTypeFrame>
        {:else if isLoading}
          <div class="hero-state" role="status">
            <i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i>
            Loading variation…
          </div>
        {:else}
          <div class="hero-state">No variation selected.</div>
        {/if}
      </div>

      {#if draft}
        <div class="motion-identity">
          <strong>{draft.startPlacement} → {draft.endPlacement}</strong>
        </div>
      {/if}

      <div class="editor-card">
        <div class="section-heading compact-heading">
          <div>
            <h3>Pictograph turns</h3>
            <p class="heading-note">Applied to every variation shown.</p>
          </div>
          {#if edited}
            <button class="reset-button" type="button" onclick={onReset}>
              Reset
            </button>
          {/if}
        </div>

        {#if draft}
          <PropControlPair compact>
            {#snippet leftContent()}
              <div class="prop-editor">
                <PropTurnsControl
                  hand="left"
                  turns={leftTurns}
                  rotationDirection={leftRotation}
                  showRotation={leftCanChooseRotation}
                  compact
                  onTurnsChange={(delta) =>
                    onTurnsChange(HandSide.LEFT, delta)}
                  onRotationChange={(direction) =>
                    onRotationChange(HandSide.LEFT, direction)}
                />
              </div>
            {/snippet}
            {#snippet rightContent()}
              <div class="prop-editor">
                <PropTurnsControl
                  hand="right"
                  turns={rightTurns}
                  rotationDirection={rightRotation}
                  showRotation={rightCanChooseRotation}
                  compact
                  onTurnsChange={(delta) =>
                    onTurnsChange(HandSide.RIGHT, delta)}
                  onRotationChange={(direction) =>
                    onRotationChange(HandSide.RIGHT, direction)}
                />
              </div>
            {/snippet}
          </PropControlPair>
        {/if}
      </div>

      <div class="draft-actions">
        <button class="action secondary" type="button" onclick={onCopyLink}>
          <i class="fa-solid fa-link" aria-hidden="true"></i>
          Copy exact link
        </button>
        {#if composerHref}
          <a class="action primary" href={composerHref}>
            Continue in Composer
            <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
          </a>
        {/if}
      </div>
      <p class="draft-note">
        {edited
          ? "The link carries these turn edits. This draft is not saved to your Library."
          : "Choose a variation or add turns here. Composer is where you add more steps and save."}
      </p>
    </section>

    <div class="detail-column">
      <section class="variation-section" aria-labelledby="variation-heading">
        <div class="section-heading">
          <div>
            <h3 id="variation-heading">{info.label} variations</h3>
            <p class="heading-note">
              Select any pictograph to inspect it at full size.
            </p>
          </div>
          <div class="grid-switcher">
            <span>View grid</span>
            <SegmentedControl
              options={GRID_OPTIONS}
              value={gridMode}
              onchange={onGridChange}
              color="accent"
              size="sm"
              semantics="tabs"
              ariaLabel="Pictograph grid"
            />
          </div>
        </div>

        {#if isLoading}
          <div class="load-state" role="status">
            <i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i>
            Loading {gridLabel.toLowerCase()} variations…
          </div>
        {:else if loadError}
          <div class="load-state" role="alert">
            <span>The {gridLabel.toLowerCase()} variations did not load.</span>
            <button type="button" onclick={onRetry}>Try again</button>
          </div>
        {:else if variations.length === 0}
          <div class="load-state">
            No {gridLabel.toLowerCase()} variations recorded.
          </div>
        {:else}
          <div
            class="variation-grid themed-scrollbar"
            aria-label={`${info.label} ${gridLabel} variations`}
          >
            {#each variations as pictograph, index (pictograph.id ?? index)}
              <button
                class="variation-button"
                class:selected={index === selectedIndex}
                type="button"
                aria-pressed={index === selectedIndex}
                aria-label={`${info.label}, ${gridLabel}, variation ${index + 1}`}
                onclick={() => onVariationChange(index)}
              >
                <span class="variation-picture">
                  <PictographTypeFrame letter={pictograph.letter}>
                    <GuidePictograph
                      data={pictograph}
                      size="sm"
                      showGrid
                      showArrows
                      showTKA
                      showNonRadialPoints={gridMode === GridMode.BOX}
                      forceTheme="dark"
                      eager
                    />
                  </PictographTypeFrame>
                </span>
              </button>
            {/each}
          </div>
        {/if}
      </section>

      <section class="contexts" aria-labelledby="contexts-heading">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Learn and use</p>
            <h3 id="contexts-heading">Where {info.label} appears</h3>
          </div>
        </div>

        <div class="context-grid">
          <article class="context-card">
            <span class="provenance">Canonical deck membership</span>
            <h4>TKA 1: Learning Letters</h4>
            {#if learningLoading}
              <p class="context-state" role="status">
                Checking the 19-card deck…
              </p>
            {:else if learningError}
              <div class="context-state error">
                <span>The deck could not be checked.</span>
                <button type="button" onclick={onLearningRetry}
                  >Try again</button
                >
              </div>
            {:else if learningMatches.length > 0}
              <p>
                {learningMatches.length === 1
                  ? "This letter appears in one canonical card."
                  : `This letter appears in ${learningMatches.length} canonical cards.`}
              </p>
              <div
                class="word-links"
                aria-label={`${info.label} cards in Learning Letters`}
              >
                {#each learningLinks as { sequence, href } (sequence.id)}
                  <a {href}>
                    {simplifyRepeatedWord(sequence.word || sequence.name)}
                  </a>
                {/each}
              </div>
            {:else}
              <p>
                This letter is not a member of the 19-card Learning Letters
                deck.
              </p>
            {/if}
            <div class="context-links">
              <a href="/learn/concepts/words-alpha-beta">Open the lesson</a>
              <a href="/browse/you/collections/founding_tka-1"
                >View all 19 cards</a
              >
            </div>
          </article>

          <article class="context-card">
            <span class="provenance">Exact notation query</span>
            <h4>Gallery sequences</h4>
            <p>
              Find public sequences whose notation contains {info.label}. Names
              and notes are not counted.
            </p>
            <a class="gallery-link" href={galleryHref}>
              Search the Gallery for {info.label}
              <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
            </a>
          </article>
        </div>
      </section>
    </div>
  </div>
</div>

<style>
  .explorer-container {
    container: letter-explorer / inline-size;
    min-width: 0;
  }

  .explorer {
    display: grid;
    grid-template-columns: minmax(17rem, 0.8fr) minmax(0, 1.8fr);
    gap: clamp(1rem, 2cqi, 2rem);
    min-width: 0;
    padding: clamp(0.9rem, 1.6cqi, 1.6rem);
    --pictograph-border: none;
  }

  .preview-column,
  .detail-column,
  .variation-section,
  .contexts {
    min-width: 0;
  }

  .preview-column {
    align-self: start;
    position: sticky;
    top: 0;
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
  }

  .detail-column {
    display: flex;
    flex-direction: column;
    gap: clamp(1.25rem, 2cqi, 2rem);
  }

  .identity-row,
  .section-heading,
  .draft-actions,
  .context-links,
  .word-links {
    display: flex;
    align-items: center;
  }

  .identity-row {
    justify-content: space-between;
    gap: 0.75rem;
    min-height: 2rem;
  }

  .state-badge,
  .provenance,
  .variation-count {
    font-size: var(--font-size-compact, 0.75rem);
  }

  .state-badge,
  .provenance {
    display: inline-flex;
    align-items: center;
    width: fit-content;
    min-height: 1.75rem;
    padding: 0.2rem 0.65rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 999px;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.68));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .state-badge.edited {
    border-color: color-mix(in srgb, var(--semantic-warning) 55%, transparent);
    color: var(--semantic-warning);
  }

  .variation-count {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.58));
    text-align: right;
  }

  .hero-frame {
    display: grid;
    place-items: center;
    width: min(100%, clamp(16rem, 31cqi, 30rem));
    aspect-ratio: 1;
    margin-inline: auto;
    overflow: hidden;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
  }

  .hero-frame :global(.guide-pictograph),
  .hero-frame :global(.guide-pictograph.size-lg .pictograph-wrapper),
  .variation-picture :global(.guide-pictograph),
  .variation-picture :global(.guide-pictograph.size-sm .pictograph-wrapper) {
    width: 100%;
    height: 100%;
    max-width: none;
    gap: 0;
  }

  .hero-state,
  .load-state,
  .context-state {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.65rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.64));
    font-size: var(--font-size-sm, 0.875rem);
    text-align: center;
  }

  .motion-identity {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.2rem;
    color: var(--theme-text, #fff);
    text-align: center;
  }

  .motion-identity strong {
    font-size: clamp(1rem, 0.5cqi + 0.85rem, 1.35rem);
  }

  .editor-card,
  .context-card {
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-lg, 16px);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
  }

  .editor-card {
    padding: 0.85rem;
  }

  .section-heading {
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.9rem;
  }

  .compact-heading {
    margin-bottom: 0.7rem;
  }

  .eyebrow {
    margin: 0 0 0.15rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.58));
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 750;
    letter-spacing: 0.09em;
    text-transform: uppercase;
  }

  .heading-note {
    margin-top: 0.2rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-sm, 0.875rem);
    line-height: 1.4;
  }

  h3,
  h4,
  p {
    margin: 0;
  }

  h3 {
    color: var(--theme-text, #fff);
    font-size: clamp(1.05rem, 0.65cqi + 0.85rem, 1.55rem);
    line-height: 1.2;
  }

  h4 {
    color: var(--theme-text, #fff);
    font-size: clamp(1rem, 0.3cqi + 0.9rem, 1.25rem);
  }

  .reset-button,
  .load-state button,
  .context-state button {
    min-height: 44px;
    padding: 0.45rem 0.85rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 10px;
    color: var(--theme-text, #fff);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    font-family: inherit;
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 700;
    line-height: 1;
    cursor: pointer;
  }

  .prop-editor {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .draft-actions {
    gap: 0.65rem;
  }

  .action,
  .gallery-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.55rem;
    min-height: 44px;
    border-radius: 11px;
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 750;
    text-decoration: none;
    cursor: pointer;
  }

  .action {
    flex: 1 1 0;
    padding: 0.55rem 0.8rem;
  }

  .action.secondary {
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.16));
    color: var(--theme-text, #fff);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
  }

  .action.primary,
  .gallery-link {
    border: 1px solid color-mix(in srgb, var(--theme-accent) 70%, transparent);
    color: #fff;
    background: color-mix(in srgb, var(--theme-accent) 82%, #111 18%);
  }

  .draft-note,
  .context-card p {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.72));
    font-size: var(--font-size-sm, 0.875rem);
    line-height: 1.55;
  }

  .draft-note {
    text-align: center;
  }

  .grid-switcher {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    min-width: min(100%, 18rem);
  }

  .grid-switcher > span {
    flex: 0 0 auto;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.58));
    font-size: var(--font-size-sm, 0.875rem);
  }

  .grid-switcher :global(.segmented-control) {
    flex: 1;
  }

  .load-state {
    min-height: 9rem;
    flex-direction: column;
  }

  .variation-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.65rem;
  }

  .variation-button {
    position: relative;
    min-width: 0;
    padding: 0;
    overflow: hidden;
    border: 0;
    border-radius: 0;
    color: var(--theme-text, #fff);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    cursor: pointer;
    transition:
      border-color var(--duration-fast, 140ms) ease,
      transform var(--duration-fast, 140ms) ease,
      box-shadow var(--duration-fast, 140ms) ease;
  }

  .variation-button:hover {
    transform: translateY(-2px);
  }

  .variation-button.selected {
    outline: 3px solid var(--theme-accent);
    outline-offset: 2px;
    box-shadow: 0 0 16px
      color-mix(in srgb, var(--theme-accent) 32%, transparent);
  }

  .variation-button:focus-visible,
  .action:focus-visible,
  .gallery-link:focus-visible,
  .context-links a:focus-visible,
  .word-links a:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .variation-picture {
    display: block;
    width: 100%;
    aspect-ratio: 1;
  }

  .context-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.85rem;
  }

  .context-card {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.75rem;
    padding: clamp(1rem, 1.4cqi, 1.4rem);
  }

  .word-links,
  .context-links {
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .word-links a,
  .context-links a {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 44px;
    min-height: 44px;
    padding: 0.45rem 0.75rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 999px;
    color: var(--theme-text, #fff);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 700;
    text-decoration: none;
  }

  .gallery-link {
    margin-top: auto;
    padding: 0.55rem 0.9rem;
  }

  .context-state.error {
    align-items: flex-start;
    flex-direction: column;
  }

  @container letter-explorer (max-width: 58rem) {
    .explorer {
      grid-template-columns: 1fr;
    }

    .preview-column {
      position: static;
    }

    .hero-frame {
      width: min(100%, 25rem);
    }
  }

  @container letter-explorer (max-width: 42rem) {
    .section-heading {
      align-items: stretch;
      flex-direction: column;
    }

    .grid-switcher {
      width: 100%;
    }

    .variation-grid {
      display: flex;
      gap: 0.65rem;
      overflow-x: auto;
      overscroll-behavior-inline: contain;
      scroll-snap-type: inline proximity;
      padding: 0.15rem 0.15rem 0.75rem;
    }

    .variation-button {
      flex: 0 0 7.5rem;
      scroll-snap-align: start;
    }

    .context-grid {
      grid-template-columns: 1fr;
    }
  }

  @container letter-explorer (max-width: 28rem) {
    .explorer {
      padding: 0.75rem;
    }

    .identity-row,
    .draft-actions {
      align-items: stretch;
      flex-direction: column;
    }

    .variation-count {
      text-align: left;
    }

    .action {
      flex-basis: auto;
      width: 100%;
    }
  }

  @media (max-height: 600px) and (min-width: 700px) {
    .explorer {
      grid-template-columns: minmax(14rem, 0.8fr) minmax(0, 1.8fr);
      gap: 1rem;
    }

    .preview-column {
      position: sticky;
    }

    .hero-frame {
      width: min(100%, 16rem);
    }

    .section-heading {
      align-items: center;
      flex-direction: row;
    }

    .variation-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      overflow: visible;
      padding: 0;
    }

    .variation-button {
      width: auto;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .variation-button {
      transition: none;
    }

    .variation-button:hover {
      transform: none;
    }
  }
</style>
