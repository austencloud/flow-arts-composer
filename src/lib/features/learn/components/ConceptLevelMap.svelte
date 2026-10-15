<script lang="ts">
  import { Crossfade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import {
    CONCEPT_RESOURCE_BINDINGS,
    getConceptPlacesByLevel,
    type LearnConceptPlace,
    type LessonReference,
  } from "../domain/concept-place-registry";
  import { getConceptById as getLessonConceptById } from "../domain/concepts";
  import type { ConceptStatus, LearnConcept } from "../domain/types";
  import { t, tDynamic } from "#lib/shared/i18n/i18n.svelte.js";
  import { localizedConcept } from "../domain/localized-concept";
  import ConceptPreview from "./ConceptPreview.svelte";

  let {
    selectedId,
    nextPlaceId,
    lessonStatus = () => "available",
    onSelect,
    onLessonStart,
  }: {
    selectedId: string;
    /** The learner's next place; it carries the "Up next" mark. */
    nextPlaceId?: string;
    lessonStatus?: (lessonId: string) => ConceptStatus;
    onSelect: (conceptId: string) => void;
    onLessonStart: (lesson: LearnConcept, conceptPlaceId: string) => void;
  } = $props();

  const places = getConceptPlacesByLevel(1);
  const openingPlaces = places.slice(0, 4);
  const parallelPlaces = places.slice(4, 6);
  const closingPlaces = places.slice(6);
  const selectedIndex = $derived(
    Math.max(
      0,
      places.findIndex((place) => place.id === selectedId)
    )
  );
  const selectedPlace = $derived(places[selectedIndex]!);
  const previousPlace = $derived(places[selectedIndex - 1]);
  const followingPlace = $derived(places[selectedIndex + 1]);

  const placeLessons = $derived(
    selectedPlace.lessonIds.flatMap((reference) => {
      const lesson = lessonFor(reference);
      return lesson ? [{ reference, lesson }] : [];
    })
  );
  // The centre's one clear action: the first lesson still to do, else a review.
  const primaryLesson = $derived(
    placeLessons.find(
      ({ lesson }) => lessonStatus(lesson.id) !== "completed"
    ) ?? placeLessons[0]
  );
  const otherLessons = $derived(
    placeLessons.filter((entry) => entry !== primaryLesson)
  );
  // A reference-only place leads with its Guide page instead.
  const primaryGuide = $derived(
    primaryLesson ? undefined : selectedPlace.guideRefs[0]
  );
  const otherGuides = $derived(
    selectedPlace.guideRefs.filter((guide) => guide !== primaryGuide)
  );

  function lessonFor(reference: LessonReference): LearnConcept | undefined {
    return getLessonConceptById(reference.lessonId);
  }

  function hasMappedResources(place: LearnConceptPlace): boolean {
    return (
      place.lessonIds.length > 0 ||
      place.guideRefs.length > 0 ||
      place.exploration !== null ||
      place.applications.length > 0
    );
  }

  function isPlaceDone(place: LearnConceptPlace): boolean {
    return (
      place.lessonIds.length > 0 &&
      place.lessonIds.every(
        (reference) => lessonStatus(reference.lessonId) === "completed"
      )
    );
  }

  function lessonAction(status: ConceptStatus): string {
    if (status === "completed") return tDynamic("learn_card_review");
    if (status === "in-progress") return tDynamic("learn_card_continue");
    if (status === "locked") return tDynamic("learn_card_locked");
    return tDynamic("learn_card_start");
  }

  // Places borrow the lesson-card artwork. A withdrawn lesson or a Guide page
  // can still lend its picture to the place it belongs to.
  function previewIdFor(place: LearnConceptPlace): string | undefined {
    const binding = CONCEPT_RESOURCE_BINDINGS[place.id];
    return binding?.lessonIds[0]?.lessonId ?? binding?.guideRefs[0]?.slug;
  }

  function resourceLabel(place: LearnConceptPlace): string {
    if (place.lessonIds.length > 0) return t("learn_ui_lesson");
    return hasMappedResources(place)
      ? t("learn_ui_reference")
      : t("learn_ui_map_only");
  }

  function placeText(id: string, field: "name" | "description"): string {
    return tDynamic(`learn_place_${id.replaceAll(".", "_")}_${field}`);
  }

  function guideText(slug: string): string {
    return tDynamic(`learn_place_guide_${slug.replaceAll("-", "_")}`);
  }
</script>

{#snippet sideCard(
  place: LearnConceptPlace | undefined,
  direction: "previous" | "next"
)}
  {@const label =
    direction === "previous" ? t("learn_ui_previous") : t("learn_ui_next")}
  <div class="side side-{direction}">
    {#if place}
      <Crossfade key={place.id} duration={DURATION.normal}>
        <button
          type="button"
          class="side-card"
          aria-label={`${label}: ${place.id} ${placeText(place.id, "name")}`}
          onclick={() => onSelect(place.id)}
        >
          <span class="side-direction" aria-hidden="true">
            {#if direction === "previous"}
              <i class="fa-solid fa-chevron-left"></i>
            {/if}
            <span class="side-direction-label">{label}</span>
            {#if direction === "next"}
              <i class="fa-solid fa-chevron-right"></i>
            {/if}
          </span>
          {#if previewIdFor(place)}
            <span class="side-art" aria-hidden="true"
              ><ConceptPreview conceptId={previewIdFor(place)!} /></span
            >
          {/if}
          <span class="side-copy" aria-hidden="true">
            <span class="side-id">{place.id}</span>
            <span class="side-name">{placeText(place.id, "name")}</span>
            {#if isPlaceDone(place)}
              <i class="fa-solid fa-check side-done"></i>
            {/if}
          </span>
        </button>
      </Crossfade>
    {/if}
  </div>
{/snippet}

{#snippet placeButton(place: LearnConceptPlace)}
  <button
    type="button"
    class="place-button"
    class:selected={place.id === selectedPlace.id}
    aria-pressed={place.id === selectedPlace.id}
    aria-current={place.id === nextPlaceId ? "step" : undefined}
    onclick={() => onSelect(place.id)}
  >
    <span class="place-id">{place.id}</span>
    <span class="place-copy">
      <span class="place-name">{placeText(place.id, "name")}</span>
      <span class="place-resource">{resourceLabel(place)}</span>
    </span>
  </button>
{/snippet}

<section class="level-map" aria-labelledby="level-map-title">
  <header class="map-header">
    <div>
      <span class="map-kicker">Atlas</span>
      <h2 id="level-map-title">TKA Level 1</h2>
    </div>
    <p>{t("learn_ui_map_intro")}</p>
  </header>

  <div class="progression">
    {@render sideCard(previousPlace, "previous")}

    <div class="current">
      <Crossfade
        key={selectedPlace.id}
        duration={DURATION.normal}
        animateHeight
      >
        <article class="current-card" aria-labelledby="selected-place-title">
          {#if previewIdFor(selectedPlace)}
            <div class="current-art" aria-hidden="true">
              <ConceptPreview conceptId={previewIdFor(selectedPlace)!} />
            </div>
          {/if}

          <div class="current-copy">
            {#if selectedPlace.id === nextPlaceId}
              <span class="current-kicker"
                >{tDynamic("learn_card_up_next")}</span
              >
            {:else if isPlaceDone(selectedPlace)}
              <span class="current-kicker done">
                <i class="fa-solid fa-check" aria-hidden="true"></i>
                {tDynamic("learn_card_completed")}
              </span>
            {/if}
            <div class="place-heading">
              <span class="selected-id">{selectedPlace.id}</span>
              <div>
                <h3 id="selected-place-title">
                  {placeText(selectedPlace.id, "name")}
                </h3>
                <p>{placeText(selectedPlace.id, "description")}</p>
              </div>
            </div>

            {#if hasMappedResources(selectedPlace)}
              <div class="resource-actions">
                {#if primaryLesson}
                  {@const status = lessonStatus(primaryLesson.lesson.id)}
                  <PanelButton
                    variant="primary"
                    disabled={status === "locked"}
                    ariaLabel={`${lessonAction(status)}: ${localizedConcept(primaryLesson.lesson, "name")}`}
                    onclick={() =>
                      onLessonStart(primaryLesson.lesson, selectedPlace.id)}
                  >
                    {lessonAction(status)}
                    <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
                  </PanelButton>
                {:else if primaryGuide}
                  <PanelButton
                    variant="primary"
                    href="/guide/level-1/{primaryGuide.slug}"
                  >
                    {t("learn_ui_read_named", {
                      name: guideText(primaryGuide.slug),
                    })}
                    <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
                  </PanelButton>
                {/if}

                {#each otherLessons as { reference, lesson } (reference.lessonId)}
                  <button
                    type="button"
                    class="resource-action secondary"
                    onclick={() => onLessonStart(lesson, selectedPlace.id)}
                  >
                    <span
                      >{tDynamic("learn_place_lesson_named", {
                        name: localizedConcept(lesson, "name"),
                      })}</span
                    >
                    {#if reference.coverage === "partial"}
                      <small>{t("learn_ui_part_of_concept")}</small>
                    {/if}
                  </button>
                {/each}

                {#if selectedPlace.exploration}
                  <a
                    class="resource-action secondary"
                    href={selectedPlace.exploration.href}
                  >
                    {tDynamic("learn_place_open_atlas")}
                  </a>
                {/if}

                {#each otherGuides as guide (guide.slug)}
                  <a
                    class="resource-action secondary"
                    href="/guide/level-1/{guide.slug}"
                  >
                    <span
                      >{t("learn_ui_read_named", {
                        name: guideText(guide.slug),
                      })}</span
                    >
                    {#if guide.coverage === "partial"}
                      <small>{t("learn_ui_related_section")}</small>
                    {/if}
                  </a>
                {/each}

                {#each selectedPlace.applications as application (application.href)}
                  <a class="resource-action secondary" href={application.href}>
                    {tDynamic("learn_place_open_composer")}
                  </a>
                {/each}
              </div>
            {:else}
              <p class="unmapped-note">{t("learn_ui_resources_coming")}</p>
            {/if}
          </div>
        </article>
      </Crossfade>
    </div>

    {@render sideCard(followingPlace, "next")}
  </div>

  <ol class="concept-track" aria-label={t("learn_ui_level_one_concepts")}>
    {#each openingPlaces as place (place.id)}
      <li class="route-stop">{@render placeButton(place)}</li>
    {/each}

    <li class="route-branch">
      <ol aria-label={t("learn_ui_parallel_concepts")}>
        {#each parallelPlaces as place (place.id)}
          <li class="route-stop">{@render placeButton(place)}</li>
        {/each}
      </ol>
    </li>

    {#each closingPlaces as place (place.id)}
      <li class="route-stop">{@render placeButton(place)}</li>
    {/each}
  </ol>
</section>

<style>
  .level-map {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    gap: clamp(1rem, 2.5cqw, 1.5rem);
    padding: clamp(1rem, 3cqw, 1.5rem);
    background: var(--theme-panel-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 16px;
  }

  .map-header {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: var(--spacing-md, 1rem);
  }

  .map-kicker {
    display: block;
    margin-bottom: 0.25rem;
    color: var(--theme-accent, #8b5cf6);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 750;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .map-header h2,
  .place-heading h3 {
    margin: 0;
    color: var(--theme-text);
    line-height: 1.15;
  }

  .map-header h2 {
    font-size: clamp(1.25rem, 4cqw, 1.75rem);
  }

  .map-header p {
    max-width: 30rem;
    margin: 0;
    color: var(--theme-text-dim);
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.45;
    text-align: right;
    text-wrap: pretty;
  }

  /* Previous, next step and following step, side by side. */
  .progression {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 2.1fr) minmax(0, 1fr);
    align-items: center;
    gap: clamp(0.5rem, 2cqw, 1.25rem);
  }

  .side,
  .current {
    min-width: 0;
  }

  /* The neighbours sit against the centre card, not out at the panel edges. */
  .side {
    display: flex;
  }

  .side-previous {
    justify-content: flex-end;
  }

  .side > :global(*) {
    flex: 0 1 17rem;
    min-width: 0;
  }

  .side-card {
    display: grid;
    justify-items: center;
    gap: 0.625rem;
    width: 100%;
    min-height: var(--min-touch-target, 44px);
    padding: clamp(0.75rem, 1.6cqw, 1rem);
    background: color-mix(in srgb, var(--theme-card-bg) 70%, transparent);
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
    color: var(--theme-text-dim);
    font: inherit;
    text-align: center;
    cursor: pointer;
    transition:
      background-color var(--duration-normal) var(--ease-standard),
      border-color var(--duration-normal) var(--ease-standard),
      color var(--duration-normal) var(--ease-standard);
  }

  .side-card:hover {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong, var(--theme-stroke));
    color: var(--theme-text);
  }

  .side-direction {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .side-art {
    display: block;
    width: min(100%, 7.5rem);
    opacity: 0.82;
  }

  .side-copy {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: center;
    gap: 0.25rem 0.4rem;
    min-width: 0;
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.25;
  }

  .side-id {
    font-weight: 750;
    font-variant-numeric: tabular-nums;
  }

  .side-name {
    font-weight: 650;
    text-wrap: balance;
  }

  .side-done {
    color: var(--semantic-success, #22c55e);
    font-size: var(--font-size-compact, 0.75rem);
  }

  .current-card {
    display: grid;
    justify-items: center;
    gap: 1rem;
    min-width: 0;
    padding: clamp(1rem, 2.5cqw, 1.5rem);
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 8%,
      var(--theme-card-bg)
    );
    border: 1px solid
      color-mix(in srgb, var(--theme-accent, #8b5cf6) 55%, var(--theme-stroke));
    border-radius: 14px;
    box-shadow: 0 10px 32px
      color-mix(in srgb, var(--theme-accent, #8b5cf6) 14%, transparent);
  }

  .current-art {
    width: min(100%, 11rem);
  }

  .current-copy {
    display: grid;
    justify-items: center;
    gap: 0.875rem;
    min-width: 0;
    text-align: center;
  }

  .current-kicker {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    color: var(--theme-accent, #8b5cf6);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 750;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .current-kicker.done {
    color: var(--semantic-success, #22c55e);
  }

  .place-heading {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  .selected-id {
    flex: 0 0 auto;
    min-width: 3rem;
    padding: 0.3rem 0.5rem;
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 16%,
      transparent
    );
    border: 1px solid
      color-mix(in srgb, var(--theme-accent, #8b5cf6) 42%, transparent);
    border-radius: 8px;
    color: var(--theme-text);
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 750;
    font-variant-numeric: tabular-nums;
    text-align: center;
  }

  .place-heading h3 {
    font-size: clamp(1.125rem, 3cqw, 1.5rem);
    text-wrap: balance;
  }

  .place-heading p,
  .unmapped-note {
    max-width: 30rem;
    margin: 0.35rem 0 0;
    color: var(--theme-text-dim);
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.45;
    text-wrap: pretty;
  }

  .resource-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 0.625rem;
    margin: 0;
  }

  .resource-action {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 0.2rem;
    flex: 0 1 auto;
    width: fit-content;
    max-width: 22rem;
    min-height: var(--min-touch-target, 44px);
    padding: 0.7rem 0.875rem;
    border-radius: 10px;
    color: var(--theme-text);
    font: inherit;
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 650;
    line-height: 1.25;
    text-align: left;
    text-decoration: none;
    cursor: pointer;
    transition:
      background-color var(--duration-normal) var(--ease-standard),
      border-color var(--duration-normal) var(--ease-standard);
  }

  .resource-action.secondary {
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
  }

  .resource-action.secondary:hover {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong, var(--theme-stroke));
  }

  .resource-action small {
    color: inherit;
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 500;
    opacity: 0.76;
  }

  .unmapped-note {
    margin: 0;
  }

  /* Every place to jump to, in course order. */
  .concept-track {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0;
    padding: 0.25rem 0.125rem 0.5rem;
    overflow-x: auto;
    list-style: none;
    scroll-snap-type: x proximity;
    scrollbar-width: thin;
  }

  .concept-track li {
    min-width: 0;
    list-style: none;
  }

  .route-stop,
  .route-branch {
    flex: 1 0 auto;
  }

  .route-branch ol {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    margin: 0;
    padding: 0;
  }

  .place-button {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    width: 100%;
    min-width: 10.5rem;
    min-height: 52px;
    padding: 0.4rem 0.75rem 0.4rem 0.5rem;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 10px;
    color: var(--theme-text);
    font: inherit;
    text-align: left;
    cursor: pointer;
    scroll-snap-align: start;
    transition:
      background-color var(--duration-normal) var(--ease-standard),
      border-color var(--duration-normal) var(--ease-standard),
      box-shadow var(--duration-normal) var(--ease-standard);
  }

  .place-button:hover {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke);
  }

  .place-button.selected {
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 14%,
      var(--theme-card-bg)
    );
    border-color: var(--theme-accent, #8b5cf6);
    box-shadow: 0 8px 28px
      color-mix(in srgb, var(--theme-accent, #8b5cf6) 13%, transparent);
  }

  .place-button:focus-visible,
  .side-card:focus-visible,
  .resource-action:focus-visible {
    outline: 2px solid var(--theme-accent, #8b5cf6);
    outline-offset: 2px;
  }

  .place-id {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: 2.25rem;
    height: 2.25rem;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke-strong, var(--theme-stroke));
    border-radius: 999px;
    color: var(--theme-text);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 750;
    font-variant-numeric: tabular-nums;
  }

  .place-button.selected .place-id {
    background: var(--theme-accent, #8b5cf6);
    border-color: var(--theme-accent, #8b5cf6);
    color: var(--theme-text-on-accent, #fff);
  }

  .place-copy {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 0.15rem;
  }

  .place-name {
    min-width: 0;
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 680;
    line-height: 1.2;
    white-space: nowrap;
  }

  .place-resource {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 0.75rem);
    line-height: 1.2;
  }

  /* Wide: the centre card sets its picture beside its words. */
  @container (min-width: 62rem) {
    .current-card:has(.current-art) {
      grid-template-columns: minmax(9rem, 13rem) minmax(0, 1fr);
      align-items: center;
      gap: clamp(1.25rem, 2.5cqw, 2rem);
    }

    /* Places without artwork keep the same height, so the row below stays put. */
    .current-card {
      justify-items: stretch;
      align-content: center;
      min-height: calc(13rem + 2 * clamp(1rem, 2.5cqw, 1.5rem));
    }

    .current-art {
      width: 100%;
    }

    .current-copy {
      justify-items: start;
      text-align: left;
    }

    .place-heading {
      flex-direction: row;
      align-items: flex-start;
      gap: 0.875rem;
    }

    .resource-actions {
      justify-content: flex-start;
    }

    .route-stop,
    .route-branch {
      flex: 1 1 0;
    }

    .place-button {
      min-width: 0;
    }

    .place-name {
      white-space: normal;
      text-wrap: balance;
    }
  }

  @container (max-width: 56rem) {
    .map-header {
      align-items: flex-start;
      flex-direction: column;
      gap: 0.5rem;
    }

    .map-header p {
      text-align: left;
    }
  }

  /* Phone: the neighbours shrink to arrows at the edges of the next step. */
  @container (max-width: 34rem) {
    .progression {
      grid-template-columns: 2.75rem minmax(0, 1fr) 2.75rem;
      gap: 0.375rem;
    }

    .side-card {
      align-content: center;
      gap: 0.375rem;
      min-height: 7rem;
      padding: 0.5rem 0.25rem;
    }

    .side-direction-label,
    .side-art,
    .side-name,
    .side-done {
      display: none;
    }

    .side-copy {
      font-size: var(--font-size-compact, 0.75rem);
    }

    .current-card {
      padding: 1rem 0.75rem;
    }

    .current-art {
      width: min(100%, 8.5rem);
    }

    .resource-actions > :global(*) {
      flex: 1 1 100%;
      max-width: none;
    }

    .resource-action {
      align-items: center;
      text-align: center;
    }
  }

  /* Landscape phones: a smaller picture keeps the next step's button in view. */
  @media (max-height: 30rem) {
    .current-art {
      width: min(100%, 7rem);
    }

    .side-art {
      width: min(100%, 5rem);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .place-button,
    .side-card,
    .resource-action {
      transition: none;
    }
  }
</style>
