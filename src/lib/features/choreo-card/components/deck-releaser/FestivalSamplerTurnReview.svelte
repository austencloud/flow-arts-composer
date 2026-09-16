<script lang="ts">
  import { onMount, tick } from "svelte";
  import manifests from "../../data/festival-sampler-manifests.json";
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import { downloadBlobToDisk } from "$lib/shared/foundation/services/file-downloader";
  import { formatLOOPTypeForDisplay } from "$lib/shared/create/services/loop-type-utils";
  import {
    applyFestivalSamplerTurnAssignment,
    loadFestivalSamplerBaseSequence,
  } from "../../services/festival-sampler-turns";
  import {
    buildFestivalTurnReviewItems,
    type FestivalTurnReviewManifest,
  } from "../../services/festival-sampler-turn-review";
  import {
    createFestivalSamplerTurnReviewState,
    type FestivalTurnReviewFilter,
  } from "./state/festival-sampler-turn-review-state.svelte";

  interface Props {
    onBack: () => void;
  }

  let { onBack }: Props = $props();

  const reviewItems = buildFestivalTurnReviewItems(
    manifests.candidates as unknown as FestivalTurnReviewManifest[]
  );
  const review = createFestivalSamplerTurnReviewState(reviewItems, {
    storage: typeof window === "undefined" ? null : window.localStorage,
    sessionStorage:
      typeof window === "undefined" ? null : window.sessionStorage,
    nowIso: () => new Date().toISOString(),
    loadBaseSequence: loadFestivalSamplerBaseSequence,
    applyTurnAssignment: applyFestivalSamplerTurnAssignment,
  });

  const reviewedCount = $derived(Object.keys(review.decisions).length);
  const yayCount = $derived(
    Object.values(review.decisions).filter((entry) => entry.decision === "yay")
      .length
  );
  const nayCount = $derived(reviewedCount - yayCount);
  const filterOptions = $derived([
    {
      value: "unreviewed",
      label: "To review",
      count: review.items.length - reviewedCount,
      ariaLabel: `To review ${review.items.length - reviewedCount}`,
    },
    {
      value: "all",
      label: "All",
      count: review.items.length,
      ariaLabel: `All ${review.items.length}`,
    },
    {
      value: "yay",
      label: "Yay",
      count: yayCount,
      tone: "accent" as const,
      ariaLabel: `Yay ${yayCount}`,
    },
    {
      value: "nay",
      label: "Nay",
      count: nayCount,
      ariaLabel: `Nay ${nayCount}`,
    },
  ]);
  const motifOptions = $derived.by(() => {
    const length = review.selectedExample?.unitLength ?? 0;
    return [1, 2, 4]
      .filter((value) => value <= length && length % value === 0)
      .map((value) => ({
        value: String(value),
        label: value === 1 ? "1-step" : `${value}-step`,
      }));
  });
  const assignedLeftTotal = $derived(
    review.assignedEntries.reduce((total, entry) => total + entry.left, 0)
  );
  const assignedRightTotal = $derived(
    review.assignedEntries.reduce((total, entry) => total + entry.right, 0)
  );
  const effectiveLeftTotal = $derived(
    review.effectiveEntries.reduce((total, entry) => total + entry.left, 0)
  );
  const effectiveRightTotal = $derived(
    review.effectiveEntries.reduce((total, entry) => total + entry.right, 0)
  );
  let reviewElement: HTMLElement;
  let patternListElement: HTMLElement;
  let workspaceElement: HTMLElement;

  onMount(() => {
    let pageScrollElement: HTMLElement | null = null;
    let scrollFrame = 0;
    let disposed = false;

    const saveScrollPositions = () => {
      if (scrollFrame) return;
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = 0;
        review.setScrollPositions({
          patternScrollTop: patternListElement.scrollTop,
          patternScrollLeft: patternListElement.scrollLeft,
          workspaceScrollTop: workspaceElement.scrollTop,
          pageScrollTop: pageScrollElement?.scrollTop ?? 0,
        });
      });
    };

    const initialize = async () => {
      await review.initialize();
      await tick();
      if (disposed) return;
      pageScrollElement = reviewElement.closest<HTMLElement>(".content-area");
      patternListElement.scrollTop = review.scrollPositions.patternScrollTop;
      patternListElement.scrollLeft = review.scrollPositions.patternScrollLeft;
      workspaceElement.scrollTop = review.scrollPositions.workspaceScrollTop;
      if (pageScrollElement) {
        pageScrollElement.scrollTop = review.scrollPositions.pageScrollTop;
      }
      patternListElement.addEventListener("scroll", saveScrollPositions, {
        passive: true,
      });
      workspaceElement.addEventListener("scroll", saveScrollPositions, {
        passive: true,
      });
      pageScrollElement?.addEventListener("scroll", saveScrollPositions, {
        passive: true,
      });
    };

    void initialize();
    return () => {
      disposed = true;
      if (scrollFrame) cancelAnimationFrame(scrollFrame);
      patternListElement?.removeEventListener("scroll", saveScrollPositions);
      workspaceElement?.removeEventListener("scroll", saveScrollPositions);
      pageScrollElement?.removeEventListener("scroll", saveScrollPositions);
    };
  });

  function turnValue(value: number | undefined): string {
    return value === 0.5 ? "½" : String(value ?? 0);
  }

  function slotLabel(slot: string): string {
    const labels: Record<string, string> = {
      mirrored16: "Mirrored · 16",
      mirrored8: "Mirrored · 8",
      rotated16: "Rotated · 16 · Quartered",
      rotated8: "Rotated · 8 · Halved",
      tndBase: "Timing & Direction · Level 1",
      tndTurn: "Timing & Direction · Level 2",
      mirroredSwapped: "Mirrored + Swapped",
      mirroredInverted: "Mirrored + Inverted",
      mirroredSwapped8: "Mirrored + Swapped · 8",
      mirroredInverted8: "Mirrored + Inverted · 8",
    };
    return labels[slot] ?? slot;
  }

  function contextLabel(loopType: string | null, slot: string): string {
    return loopType ? formatLOOPTypeForDisplay(loopType) : slotLabel(slot);
  }

  async function exportDecisions(): Promise<void> {
    const decisions = review.items.flatMap((item) => {
      const decision = review.decisions[item.id];
      return decision
        ? [
            {
              id: item.id,
              label: item.label,
              symbols: item.symbols,
              minimumSequenceLength: item.minSequenceLength,
              usageCount: item.usageCount,
              packs: item.packNumbers,
              slots: item.slots,
              ...decision,
            },
          ]
        : [];
    });
    const blob = new Blob(
      [
        JSON.stringify(
          {
            schemaVersion: 3,
            exportedAt: new Date().toISOString(),
            summary: {
              total: review.items.length,
              reviewed: reviewedCount,
              yay: yayCount,
              nay: nayCount,
            },
            decisions,
          },
          null,
          2
        ),
      ],
      { type: "application/json" }
    );
    await downloadBlobToDisk(blob, "festival-sampler-turn-pattern-votes.json");
  }
</script>

<div
  class="turn-review"
  data-testid="festival-turn-review"
  bind:this={reviewElement}
>
  <header class="review-header">
    <div class="header-start">
      <button class="back-button" type="button" onclick={onBack}>
        <i class="fas fa-arrow-left" aria-hidden="true"></i>
        Festival sampler
      </button>
      <div class="title-block">
        <span class="eyebrow">Turn pattern review</span>
        <h1>Apply it. Watch it close. Vote.</h1>
        <p>
          Twelve rhythmic families, with tighter choices for short sequences.
          Try each family in its LOOP contexts, then vote on the family.
        </p>
      </div>
    </div>

    <div
      class="review-progress"
      aria-label={`${reviewedCount} of ${review.items.length} reviewed`}
    >
      <div class="progress-count">
        <strong>{reviewedCount}</strong><span>/ {review.items.length}</span>
      </div>
      <div class="progress-copy">
        <strong>{review.items.length - reviewedCount} left</strong>
        <span>{yayCount} yay · {nayCount} nay</span>
      </div>
      <div class="progress-track" aria-hidden="true">
        <span style={`width: ${(reviewedCount / review.items.length) * 100}%`}
        ></span>
      </div>
    </div>
  </header>

  <div class="review-layout">
    <aside class="pattern-rail" aria-label="Turn patterns">
      <div class="rail-controls">
        <SegmentedControl
          options={filterOptions}
          value={review.filter}
          onchange={(value) =>
            void review.setFilter(value as FestivalTurnReviewFilter)}
          color="accent"
          size="sm"
          density="compact"
          semantics="radiogroup"
          ariaLabel="Filter turn patterns"
        />
        <button
          class="export-button"
          type="button"
          onclick={exportDecisions}
          disabled={reviewedCount === 0}
        >
          <i class="fas fa-download" aria-hidden="true"></i>
          Export votes
        </button>
      </div>

      <div class="pattern-list" bind:this={patternListElement}>
        {#if review.filteredItems.length === 0}
          <p class="empty-list">No patterns match this filter.</p>
        {:else}
          {#each review.filteredItems as item, index (item.id)}
            {@const saved = review.decisions[item.id]}
            <button
              type="button"
              class="pattern-row"
              class:selected={item.id === review.selectedId}
              class:yay={saved?.decision === "yay"}
              class:nay={saved?.decision === "nay"}
              onclick={() => void review.select(item.id)}
              aria-current={item.id === review.selectedId ? "true" : undefined}
              aria-label={`${index + 1}. ${item.label}, ${item.minSequenceLength} steps and longer, used by ${item.usageCount} ${item.usageCount === 1 ? "card" : "cards"}, ${saved?.decision ?? "not reviewed"}`}
            >
              <span class="row-number"
                >{String(index + 1).padStart(2, "0")}</span
              >
              <span class="row-body">
                <strong>{item.label}</strong>
                <span class="row-patterns">
                  <span><em>Rhythm</em><code>{item.symbols}</code></span>
                  <span
                    ><em>Tier</em><code>{item.minSequenceLength}+ steps</code
                    ></span
                  >
                </span>
                <small
                  >{item.examples.length}
                  {item.examples.length === 1
                    ? "LOOP context"
                    : "LOOP contexts"} · {item.usageCount}
                  {item.usageCount === 1 ? "card" : "cards"}</small
                >
              </span>
              <span
                class="row-vote"
                aria-label={saved ? saved.decision : "Not reviewed"}
              >
                {#if saved?.decision === "yay"}
                  <i class="fas fa-check" aria-hidden="true"></i>
                {:else if saved?.decision === "nay"}
                  <i class="fas fa-xmark" aria-hidden="true"></i>
                {:else}
                  <i class="far fa-circle" aria-hidden="true"></i>
                {/if}
              </span>
            </button>
          {/each}
        {/if}
      </div>
    </aside>

    <main class="review-workspace" bind:this={workspaceElement}>
      {#if review.selected && review.selectedExample}
        <section class="sequence-panel" aria-labelledby="sequence-title">
          <div class="section-heading">
            <div>
              <span class="section-kicker">Representative card</span>
              <h2 id="sequence-title">
                {review.selectedExample.representativeCard.name}
              </h2>
              <p>
                Pack {review.selectedExample.representativePackNumber} ·
                {contextLabel(
                  review.selectedExample.loopType,
                  review.selectedExample.representativeCard.slot
                )} · {review.selectedExample.sequenceLength} steps · {review
                  .selectedExample.turnIntensity === 0.5
                  ? "½-turn"
                  : "1-turn"}
              </p>
            </div>
            <div class="step-navigation" aria-label="LOOP context navigation">
              <button
                type="button"
                onclick={() => void review.moveExample(-1)}
                aria-label="Previous LOOP context"
              >
                <i class="fas fa-chevron-left" aria-hidden="true"></i>
              </button>
              <span
                >{review.selected.examples.findIndex(
                  (example) => example.id === review.selectedExample?.id
                ) + 1} of {review.selected.examples.length}</span
              >
              <button
                type="button"
                onclick={() => void review.moveExample(1)}
                aria-label="Next LOOP context"
              >
                <i class="fas fa-chevron-right" aria-hidden="true"></i>
              </button>
            </div>
          </div>

          {#if review.isLoading}
            <div class="sequence-state">
              <i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i>
              Applying the turn pattern…
            </div>
          {:else if review.validationError}
            <div class="sequence-state invalid" role="status">
              <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
              <div>
                <strong>This version does not pass.</strong><span
                  >{review.validationError}</span
                >
              </div>
            </div>
          {:else if review.sequence}
            <div class="closure-status valid" role="status">
              <i class="fas fa-link" aria-hidden="true"></i>
              Applied to the card. The sequence closes.
            </div>
            <div
              class="sequence-grid"
              class:long={review.sequence.steps.length >= 8}
            >
              {#each review.sequence.steps as step, index (step.id ?? index)}
                <article class="sequence-step">
                  <header>
                    <span class="step-title">
                      <strong>Step {index + 1}</strong>
                      {#if review.swapMask[index]}
                        <span class="swap-phase">B↔R</span>
                      {/if}
                    </span>
                    <span class="actual-turns">
                      <span class="blue-dot" aria-hidden="true"
                      ></span>{turnValue(step.motions?.left?.turns)}
                      <span class="red-dot" aria-hidden="true"
                      ></span>{turnValue(step.motions?.right?.turns)}
                    </span>
                  </header>
                  <div class="pictograph">
                    <PictographContainer
                      pictographData={step}
                      disableTransitions
                      disableContentTransitions
                      showGrid
                      showTKA
                      showTnD
                      showElemental
                      showPlacements
                      stepNumberOverride={false}
                      darkMode={true}
                    />
                  </div>
                </article>
              {/each}
            </div>
          {/if}
        </section>

        <section class="pattern-editor" aria-labelledby="pattern-editor-title">
          <div class="editor-heading">
            <div>
              <span class="section-kicker">Cyclic editor</span>
              <h2 id="pattern-editor-title">Set the turns</h2>
              <p>
                Edit the printed left and right assignment. The effective line
                follows those values through the LOOP.
              </p>
            </div>
            <button
              class="reset-button"
              type="button"
              onclick={() => void review.reset()}
              disabled={!review.isEdited}
            >
              <i class="fas fa-rotate-left" aria-hidden="true"></i>
              Reset
            </button>
          </div>

          <div class="motif-toolbar">
            <div class="motif-choice">
              <span>Repeat</span>
              <SegmentedControl
                options={motifOptions}
                value={String(review.motifLength)}
                onchange={(value) => void review.setMotifLength(Number(value))}
                color="accent"
                size="sm"
                density="compact"
                semantics="radiogroup"
                ariaLabel="Turn motif length"
              />
            </div>
            <div class="balance-pair">
              <div
                class="balance"
                aria-label={"Assigned left total " +
                  assignedLeftTotal +
                  "; assigned right total " +
                  assignedRightTotal}
              >
                <span class="balance-label">Assigned</span>
                <span class="blue-balance"
                  ><i aria-hidden="true"></i>L {turnValue(
                    assignedLeftTotal
                  )}</span
                >
                <span class="red-balance"
                  ><i aria-hidden="true"></i>R {turnValue(
                    assignedRightTotal
                  )}</span
                >
              </div>
              <div
                class="balance effective"
                aria-label={"Effective left-track total " +
                  effectiveLeftTotal +
                  "; effective right-track total " +
                  effectiveRightTotal}
              >
                <span class="balance-label">Effective</span>
                <span class="blue-balance"
                  ><i aria-hidden="true"></i>L {turnValue(
                    effectiveLeftTotal
                  )}</span
                >
                <span class="red-balance"
                  ><i aria-hidden="true"></i>R {turnValue(
                    effectiveRightTotal
                  )}</span
                >
              </div>
            </div>
          </div>

          <div class="turn-unit" class:eight={review.draftEntries.length === 8}>
            {#each review.draftEntries as entry, index}
              <div
                class="turn-step"
                class:motif-start={index > 0 &&
                  index % review.motifLength === 0}
              >
                <span class="turn-step-label"
                  >{index + 1}<small>M{(index % review.motifLength) + 1}</small
                  ></span
                >
                <button
                  type="button"
                  class="hand-turn blue"
                  class:active={entry.left ===
                    review.selectedExample.turnIntensity}
                  aria-pressed={entry.left ===
                    review.selectedExample.turnIntensity}
                  onclick={() => void review.toggleTurn(index, "left")}
                >
                  <span>L</span><strong>{turnValue(entry.left)}</strong>
                  <span class="sr-only"
                    >. Step {index + 1}, left hand, {turnValue(entry.left)} turns.</span
                  >
                </button>
                <button
                  type="button"
                  class="hand-turn red"
                  class:active={entry.right ===
                    review.selectedExample.turnIntensity}
                  aria-pressed={entry.right ===
                    review.selectedExample.turnIntensity}
                  onclick={() => void review.toggleTurn(index, "right")}
                >
                  <span>R</span><strong>{turnValue(entry.right)}</strong>
                  <span class="sr-only"
                    >. Step {index + 1}, right hand, {turnValue(entry.right)} turns.</span
                  >
                </button>
              </div>
            {/each}
          </div>

          <div class="pattern-readout">
            <div class="pattern-readouts">
              <div>
                <span>Turn assignment</span><code>{review.draftPattern}</code>
              </div>
              <div class:changed={review.selectedExample.swapPeriod !== null}>
                <span>Effective after LOOP</span><code
                  >{review.effectivePattern}</code
                >
              </div>
            </div>
            {#if review.isEdited}<strong>Proposed replacement</strong
              >{:else}<strong>Frozen original</strong>{/if}
          </div>

          <div class="vote-row">
            <p>
              Yay or Nay saves this rhythmic family, then opens the next
              unreviewed family. All 12 print families are approved.
            </p>
            <div class="vote-actions">
              <button
                type="button"
                class="vote-button nay"
                class:selected={review.currentDecision?.decision === "nay"}
                onclick={() => void review.vote("nay")}
              >
                <i class="fas fa-xmark" aria-hidden="true"></i>
                Nay
              </button>
              <button
                type="button"
                class="vote-button yay"
                class:selected={review.currentDecision?.decision === "yay"}
                disabled={Boolean(review.validationError) || review.isLoading}
                onclick={() => void review.vote("yay")}
              >
                <i class="fas fa-check" aria-hidden="true"></i>
                Yay
              </button>
            </div>
          </div>
        </section>
      {/if}
    </main>
  </div>
</div>

<style>
  .turn-review {
    --min-touch-target: 44px;
    --motion-blue: var(--dm-motion-blue, #3575e2);
    --motion-red: var(--dm-motion-red, #ed1c24);

    color-scheme: dark;
    container-type: inline-size;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    color: var(--theme-text, #f8f7fb);
    background:
      radial-gradient(
        circle at 82% 0%,
        color-mix(in srgb, var(--theme-accent, #8b5cf6) 12%, transparent),
        transparent 31rem
      ),
      color-mix(in srgb, var(--theme-panel-bg, #0b0911) 94%, black);
    font-variant-numeric: tabular-nums;
  }

  button {
    min-height: var(--min-touch-target);
    border: 0;
    border-radius: 0.7rem;
    color: inherit;
    font: inherit;
    font-weight: 750;
    cursor: pointer;
  }

  button:focus-visible {
    outline: 3px solid var(--theme-accent, #9c7cff);
    outline-offset: 2px;
  }

  button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .review-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1.5rem;
    padding: 1.15rem clamp(1rem, 2vw, 2rem);
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    background: color-mix(
      in srgb,
      var(--theme-panel-bg, #11101a) 90%,
      transparent
    );
  }

  .header-start {
    display: flex;
    align-items: center;
    gap: 1.2rem;
    min-width: 0;
  }

  .back-button,
  .export-button,
  .reset-button,
  .step-navigation button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0 0.9rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.065));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.13));
  }

  .back-button {
    flex: 0 0 auto;
  }

  .title-block {
    min-width: 0;
  }

  .title-block h1,
  .title-block p,
  .eyebrow,
  .section-heading h2,
  .section-heading p,
  .editor-heading h2,
  .editor-heading p,
  .section-kicker {
    margin: 0;
  }

  .eyebrow,
  .section-kicker {
    display: block;
    margin-bottom: 0.2rem;
    color: var(--theme-accent, #a78bfa);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 850;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .title-block h1 {
    font-size: clamp(1.45rem, 2vw, 2rem);
    line-height: 1.05;
  }

  .title-block p,
  .section-heading p,
  .editor-heading p,
  .vote-row p {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.66));
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.45;
  }

  .title-block p {
    margin-top: 0.3rem;
  }

  .review-progress {
    display: grid;
    grid-template-columns: auto auto;
    align-items: center;
    gap: 0.25rem 0.8rem;
    min-width: 15rem;
    padding: 0.65rem 0.8rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.13));
    border-radius: 0.85rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.055));
  }

  .progress-count {
    display: flex;
    align-items: baseline;
    gap: 0.2rem;
  }

  .progress-count strong {
    font-size: 1.6rem;
    line-height: 1;
  }

  .progress-count span,
  .progress-copy span {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-compact, 0.75rem);
  }

  .progress-copy {
    display: grid;
    gap: 0.1rem;
    font-size: var(--font-size-min, 0.875rem);
  }

  .progress-track {
    grid-column: 1 / -1;
    height: 0.28rem;
    overflow: hidden;
    border-radius: 999px;
    background: color-mix(in srgb, var(--theme-stroke, white) 50%, transparent);
  }

  .progress-track span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--theme-accent, #8b5cf6);
  }

  .review-layout {
    display: grid;
    grid-template-columns: clamp(18rem, 22vw, 25rem) minmax(0, 1fr);
    min-height: 0;
  }

  .pattern-rail {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    min-width: 0;
    min-height: 0;
    border-right: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    background: color-mix(in srgb, var(--theme-panel-bg, #111019) 94%, black);
  }

  .rail-controls {
    display: grid;
    gap: 0.65rem;
    padding: 0.85rem;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .export-button {
    width: 100%;
  }

  .pattern-list {
    min-height: 0;
    overflow-y: auto;
    scrollbar-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.25))
      transparent;
  }

  .pattern-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.65rem;
    width: 100%;
    min-height: 7.1rem;
    padding: 0.7rem 0.8rem;
    border-radius: 0;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.075));
    background: transparent;
    text-align: left;
  }

  .pattern-row:hover,
  .pattern-row.selected {
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 13%,
      transparent
    );
  }

  .pattern-row.selected {
    box-shadow: inset 0.22rem 0 var(--theme-accent, #8b5cf6);
  }

  .row-number {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.48));
    font-size: var(--font-size-compact, 0.75rem);
  }

  .row-body {
    display: grid;
    gap: 0.2rem;
    min-width: 0;
  }

  .row-body strong {
    font-size: var(--font-size-min, 0.875rem);
  }

  .row-patterns {
    display: grid;
    gap: 0.18rem;
    min-width: 0;
  }

  .row-patterns > span {
    display: grid;
    grid-template-columns: 3.9rem minmax(0, 1fr);
    align-items: baseline;
    gap: 0.4rem;
    min-width: 0;
  }

  .row-patterns em {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-compact, 0.75rem);
    font-style: normal;
    font-weight: 800;
    text-transform: uppercase;
  }

  .row-patterns .changed em {
    color: var(--theme-accent, #a78bfa);
  }

  .row-body code,
  .pattern-readout code {
    overflow: hidden;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.72));
    font-family: "Cascadia Mono", "SFMono-Regular", Consolas, monospace;
    font-size: var(--font-size-compact, 0.75rem);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .row-body small {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.52));
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 500;
  }

  .row-vote {
    display: grid;
    width: 1.75rem;
    height: 1.75rem;
    place-items: center;
    border-radius: 50%;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
  }

  .pattern-row.yay .row-vote {
    background: color-mix(
      in srgb,
      var(--semantic-success, #10b981) 18%,
      transparent
    );
    color: var(--semantic-success, #34d399);
  }

  .pattern-row.nay .row-vote {
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 18%,
      transparent
    );
    color: var(--semantic-error, #fb7185);
  }

  .empty-list {
    padding: 1.2rem;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.62));
    font-size: var(--font-size-min, 0.875rem);
  }

  .review-workspace {
    display: grid;
    grid-template-columns: minmax(0, 1.45fr) minmax(20rem, 0.82fr);
    gap: clamp(0.8rem, 1.2vw, 1.25rem);
    min-width: 0;
    min-height: 0;
    overflow: auto;
    padding: clamp(0.8rem, 1.5vw, 1.5rem);
  }

  .sequence-panel,
  .pattern-editor {
    min-width: 0;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 1rem;
    background: var(--theme-panel-bg, rgba(18, 17, 27, 0.96));
  }

  .sequence-panel {
    align-self: start;
    overflow: hidden;
  }

  .section-heading,
  .editor-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 1.1rem;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .section-heading h2,
  .editor-heading h2 {
    font-size: 1.3rem;
    line-height: 1.1;
  }

  .section-heading p,
  .editor-heading p {
    margin-top: 0.25rem;
  }

  .step-navigation {
    display: inline-grid;
    grid-template-columns: var(--min-touch-target) auto var(--min-touch-target);
    align-items: center;
    flex: 0 0 auto;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 0.75rem;
    overflow: hidden;
  }

  .step-navigation button {
    min-width: var(--min-touch-target);
    padding: 0;
    border: 0;
    border-radius: 0;
  }

  .step-navigation span {
    padding: 0 0.65rem;
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 800;
  }

  .closure-status,
  .sequence-state {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    min-height: 3.1rem;
    padding: 0.65rem 1.1rem;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.72));
    font-size: var(--font-size-min, 0.875rem);
  }

  .closure-status.valid {
    color: var(--semantic-success, #34d399);
  }

  .sequence-state {
    min-height: 18rem;
    justify-content: center;
  }

  .sequence-state.invalid {
    align-items: flex-start;
    justify-content: flex-start;
    color: var(--semantic-error, #fda4af);
  }

  .sequence-state.invalid div {
    display: grid;
    gap: 0.3rem;
  }

  .sequence-state.invalid span {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.66));
  }

  .sequence-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 1px;
    background: var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .sequence-step {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    min-width: 0;
    background: var(--theme-card-bg, #12111b);
    color: var(--theme-text, #f8f7fb);
  }

  .sequence-step header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.35rem;
    min-height: 2rem;
    padding: 0.2rem 0.45rem;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    font-size: var(--font-size-compact, 0.75rem);
  }

  .step-title {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .swap-phase {
    padding: 0.08rem 0.28rem;
    border: 1px solid
      color-mix(in srgb, var(--theme-accent, #8b5cf6) 55%, transparent);
    border-radius: 0.3rem;
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 15%,
      transparent
    );
    color: var(--theme-accent, #c4b5fd);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 900;
  }

  .actual-turns {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-weight: 850;
  }

  .blue-dot,
  .red-dot {
    width: 0.45rem;
    height: 0.45rem;
    border-radius: 50%;
  }

  .blue-dot {
    background: var(--motion-blue);
  }

  .red-dot {
    margin-left: 0.2rem;
    background: var(--motion-red);
  }

  .pictograph {
    aspect-ratio: 1;
    min-width: 0;
    overflow: hidden;
    background: var(--theme-card-bg, #12111b);
  }

  .pattern-editor {
    align-self: start;
    overflow: hidden;
  }

  .reset-button {
    flex: 0 0 auto;
  }

  .motif-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
    padding: 0.8rem 1rem;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .motif-choice {
    display: flex;
    align-items: center;
    gap: 0.65rem;
  }

  .motif-choice > span {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.62));
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 800;
    text-transform: uppercase;
  }

  .balance {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 800;
  }

  .balance-pair {
    display: grid;
    gap: 0.28rem;
  }

  .balance-label {
    min-width: 4.2rem;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    text-transform: uppercase;
  }

  .balance.effective {
    color: color-mix(
      in srgb,
      var(--theme-accent, #a78bfa) 72%,
      var(--theme-text, white)
    );
  }

  .blue-balance,
  .red-balance {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }

  .blue-balance i,
  .red-balance i {
    width: 0.55rem;
    height: 0.55rem;
    border-radius: 50%;
  }

  .blue-balance i {
    background: var(--motion-blue);
  }

  .red-balance i {
    background: var(--motion-red);
  }

  .turn-unit {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.55rem;
    padding: 1rem;
  }

  .turn-step {
    display: grid;
    grid-template-columns: 1.7rem minmax(0, 1fr);
    grid-template-rows: repeat(2, minmax(var(--min-touch-target), auto));
    gap: 0.35rem;
    min-width: 0;
    padding: 0.45rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 0.75rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.045));
  }

  .turn-step.motif-start {
    box-shadow: -0.25rem 0 var(--theme-accent, #8b5cf6);
  }

  .turn-step-label {
    grid-row: 1 / 3;
    display: grid;
    align-content: center;
    justify-items: center;
    gap: 0.15rem;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.68));
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 900;
  }

  .turn-step-label small {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
    font-size: var(--font-size-compact, 0.75rem);
  }

  .hand-turn {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.25rem;
    min-width: 0;
    padding: 0 0.5rem;
    background: transparent;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.13));
  }

  .hand-turn span {
    overflow: hidden;
    font-size: var(--font-size-compact, 0.75rem);
    text-overflow: ellipsis;
  }

  .hand-turn strong {
    font-size: 1rem;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .hand-turn.blue span {
    color: color-mix(in srgb, var(--motion-blue) 78%, white);
  }

  .hand-turn.red span {
    color: color-mix(in srgb, var(--motion-red) 72%, white);
  }

  .hand-turn.blue.active {
    border-color: color-mix(in srgb, var(--motion-blue) 70%, white);
    background: color-mix(in srgb, var(--motion-blue) 28%, transparent);
  }

  .hand-turn.red.active {
    border-color: color-mix(in srgb, var(--motion-red) 70%, white);
    background: color-mix(in srgb, var(--motion-red) 28%, transparent);
  }

  .pattern-readout {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.8rem 1rem;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .pattern-readout div {
    display: grid;
    gap: 0.25rem;
    min-width: 0;
  }

  .pattern-readouts {
    flex: 1 1 auto;
  }

  .pattern-readouts > div {
    grid-template-columns: 8.8rem minmax(0, 1fr);
    align-items: baseline;
    gap: 0.6rem;
  }

  .pattern-readouts > .changed {
    padding-left: 0.55rem;
    border-left: 0.2rem solid var(--theme-accent, #8b5cf6);
  }

  .pattern-readout code {
    line-height: 1.4;
    overflow-wrap: anywhere;
    text-overflow: clip;
    white-space: normal;
  }

  .pattern-readout span {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.58));
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 800;
    text-transform: uppercase;
  }

  .pattern-readout strong {
    flex: 0 0 auto;
    color: var(--theme-accent, #a78bfa);
    font-size: var(--font-size-compact, 0.75rem);
    text-transform: uppercase;
  }

  .vote-row {
    display: grid;
    gap: 0.8rem;
    padding: 1rem;
  }

  .vote-row p {
    margin: 0;
  }

  .vote-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.65rem;
  }

  .vote-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.55rem;
    min-height: 3.25rem;
    border: 1px solid transparent;
    color: white;
  }

  .vote-button.nay {
    background: color-mix(in srgb, var(--semantic-error, #ef4444) 55%, #201017);
  }

  .vote-button.yay {
    background: color-mix(
      in srgb,
      var(--semantic-success, #10b981) 60%,
      #0b1a14
    );
  }

  .vote-button.selected {
    border-color: white;
    box-shadow: 0 0 0 2px currentColor;
  }

  @media (min-width: 1680px) {
    .review-workspace {
      grid-template-columns: minmax(0, 1.6fr) minmax(24rem, 0.9fr);
    }
  }

  @media (min-width: 2600px) {
    .turn-review {
      --font-size-compact: 0.875rem;
      --font-size-min: 1rem;
      --min-touch-target: 52px;
    }

    .review-header {
      padding: 1.5rem 2.5rem;
    }

    .review-layout {
      grid-template-columns: clamp(25rem, 19vw, 34rem) minmax(0, 1fr);
    }

    .review-workspace {
      grid-template-columns: minmax(0, 1.7fr) minmax(31rem, 0.95fr);
      align-content: start;
      gap: 1.5rem;
      padding: 2rem;
    }

    .title-block h1 {
      font-size: 2.5rem;
    }

    .section-heading h2,
    .editor-heading h2 {
      font-size: 1.65rem;
    }

    .pattern-row {
      min-height: 6.4rem;
    }
  }

  @media (max-width: 1240px) {
    .review-workspace {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 900px) {
    .turn-review {
      height: auto;
      min-height: 100%;
      overflow: visible;
    }

    .review-header {
      align-items: flex-start;
    }

    .header-start {
      align-items: flex-start;
    }

    .review-layout {
      grid-template-columns: 1fr;
    }

    .pattern-rail {
      grid-template-rows: auto auto;
      border-right: 0;
      border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    }

    .pattern-list {
      display: grid;
      grid-auto-flow: column;
      grid-auto-columns: minmax(16rem, 18rem);
      max-height: none;
      overflow-x: auto;
      overflow-y: hidden;
    }

    .pattern-row {
      border-right: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.075));
      border-bottom: 0;
    }

    .review-workspace {
      overflow: visible;
    }
  }

  @media (max-width: 700px) {
    .review-header {
      display: grid;
      gap: 0.9rem;
      padding: 0.8rem;
    }

    .header-start {
      display: grid;
      gap: 0.75rem;
    }

    .back-button {
      justify-self: start;
    }

    .review-progress {
      width: 100%;
      min-width: 0;
      box-sizing: border-box;
    }

    .rail-controls {
      grid-template-columns: 1fr auto;
      align-items: center;
    }

    .export-button {
      width: auto;
    }

    .review-workspace {
      padding: 0.65rem;
    }

    .section-heading,
    .editor-heading,
    .motif-toolbar {
      align-items: flex-start;
    }

    .sequence-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .turn-unit {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .motif-toolbar {
      display: grid;
    }

    .pattern-readout {
      align-items: flex-start;
    }
  }

  @media (max-width: 440px) {
    .title-block h1 {
      font-size: 1.3rem;
    }

    .title-block p {
      font-size: 0.875rem;
    }

    .rail-controls {
      grid-template-columns: 1fr;
    }

    .export-button {
      width: 100%;
    }

    .section-heading,
    .editor-heading {
      display: grid;
    }

    .step-navigation,
    .reset-button {
      justify-self: start;
    }

    .pattern-readout {
      display: grid;
    }
  }

  @media (min-width: 701px) and (max-height: 600px) {
    .review-header {
      padding-block: 0.55rem;
    }

    .title-block p,
    .eyebrow {
      display: none;
    }

    .title-block h1 {
      font-size: 1.25rem;
    }

    .review-progress {
      padding-block: 0.4rem;
    }

    .review-workspace {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: max-content max-content;
      align-content: start;
      padding: 0.55rem;
    }

    .section-heading,
    .editor-heading {
      padding: 0.65rem 0.8rem;
    }

    .sequence-grid.long {
      grid-template-columns: repeat(8, minmax(0, 1fr));
    }

    .turn-unit {
      padding: 0.6rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.fa-spin) {
      animation: none;
    }
  }
</style>
