<!--
  GalleryAnswerBar: the two answers from the ask screen, kept above the cards
  on phones, tablets and sideways phones (Wren's placement note). Length and
  Starts with each reopen the ask screen at their own question; "more" opens
  the Filters sheet with every other filter. Takes the old scope strip's slot.

  Composes FilterChipBase (action chips) and TKAWordGlyph; the answers are
  read from the engine, nothing is applied here.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import TKAWordGlyph from "#lib/shared/choreo-card/components/TKAWordGlyph.svelte";
  import { BrowseFilterType } from "#lib/shared/persistence/domain/enums/filtering-enums.js";
  import type { BrowseEngine } from "#lib/shared/browse/engine/types.js";
  import { appliedAnswer, type AskQuestion } from "./gallery-ask";

  let {
    engine,
    onOpen,
    onMore,
  }: {
    engine: BrowseEngine;
    onOpen: (question: AskQuestion) => void;
    onMore: () => void;
  } = $props();

  const length = $derived(
    appliedAnswer(engine.activeFilters, BrowseFilterType.LENGTH)
  );
  const letter = $derived(
    appliedAnswer(engine.activeFilters, BrowseFilterType.STARTING_LETTER) as
      | string
      | null
  );
  // Every other filter the visitor set, shown as the more button's count.
  const otherCount = $derived(
    [...engine.activeFilters.values()].filter(
      (f) =>
        !f.locked &&
        f.type !== BrowseFilterType.LENGTH &&
        f.type !== BrowseFilterType.STARTING_LETTER
    ).length
  );
  const lengthText = $derived(
    length === null
      ? t("browse_ask_length_label")
      : t("browse_ask_length_answer", { count: length })
  );
</script>

<div class="answers-frame">
  <div class="answers" role="group" aria-label={t("browse_ask_answers_label")}>
    <span class="answer">
      <FilterChipBase
        mode="action"
        labelScale="readable"
        active={length !== null}
        label={lengthText}
        ariaLabel={length === null
          ? t("browse_ask_how_long")
          : `${t("browse_ask_length_label")}: ${lengthText}`}
        onclick={() => onOpen("length")}
      />
    </span>
    <span class="answer">
      <FilterChipBase
        mode="action"
        labelScale="readable"
        active={letter !== null}
        label={letter ?? t("browse_ask_letter_label")}
        ariaLabel={letter === null
          ? t("browse_ask_starts_with")
          : `${t("browse_ask_letter_label")}: ${letter}`}
        onclick={() => onOpen("letter")}
      >
        {#snippet labelSnippet()}
          {#if letter !== null}
            <span class="answer-glyph" aria-hidden="true">
              <TKAWordGlyph word={letter} height={22} darkMode fitToParent />
            </span>
          {:else}
            <span aria-hidden="true">{t("browse_ask_letter_label")}</span>
          {/if}
        {/snippet}
      </FilterChipBase>
    </span>
    <span class="answer more">
      <FilterChipBase
        mode="action"
        icon="fas fa-sliders"
        ariaLabel={t("browse_ask_more_filters")}
        count={otherCount > 0 ? otherCount : null}
        onclick={onMore}
      />
    </span>
  </div>
</div>

<style>
  .answers-frame {
    container: answers / inline-size;
  }
  .answers {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 56px;
    gap: 8px;
    padding: 8px 14px;
  }
  .answer {
    display: flex;
    min-width: 0;
  }
  .answer :global(.filter-chip) {
    width: 100%;
    height: 44px;
    justify-content: center;
    border-radius: 12px;
  }
  .answer-glyph {
    display: flex;
    justify-content: center;
    height: 22px;
    width: 100%;
    min-width: 0;
  }
  /* The sideways side column is narrow: the answers stack under Source. */
  @container answers (max-width: 299px) {
    .answers {
      grid-template-columns: minmax(0, 1fr);
      gap: 6px;
      padding: 6px 0 0;
    }
    .answer :global(.filter-chip) {
      height: 40px;
    }
  }
</style>
