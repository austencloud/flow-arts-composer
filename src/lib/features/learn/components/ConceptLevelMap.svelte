<script lang="ts">
  import Crossfade from "$lib/shared/components/Crossfade.svelte";
  import LessonGridDisplay from "$lib/shared/pictograph/grid/components/LessonGridDisplay.svelte";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import {
    getConceptPlacesByLevel,
    type LearnConceptPlace,
    type LessonReference,
  } from "../domain/concept-place-registry";
  import { getConceptById as getLessonConceptById } from "../domain/concepts";
  import type { LearnConcept } from "../domain/types";
  import { t, tDynamic } from "$lib/shared/i18n/i18n.svelte.js";
  import { localizedConcept } from "../domain/localized-concept";

  let {
    selectedId,
    onSelect,
    onLessonStart,
  }: {
    selectedId: string;
    onSelect: (conceptId: string) => void;
    onLessonStart: (lesson: LearnConcept, conceptPlaceId: string) => void;
  } = $props();

  const places = getConceptPlacesByLevel(1);
  const openingPlaces = places.slice(0, 4);
  const parallelPlaces = places.slice(4, 6);
  const closingPlaces = places.slice(6);
  const selectedPlace = $derived(
    places.find((place) => place.id === selectedId) ?? places[0]!
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

<section class="level-map" aria-labelledby="level-map-title">
  <header class="map-header">
    <div>
      <span class="map-kicker">Atlas</span>
      <h2 id="level-map-title">TKA Level 1</h2>
    </div>
    <p>{t("learn_ui_map_intro")}</p>
  </header>

  <div class="atlas-body">
    <ol class="concept-track" aria-label={t("learn_ui_level_one_concepts")}>
      {#each openingPlaces as place (place.id)}
        <li class="route-stop">
          <button
            type="button"
            class="place-button"
            class:selected={place.id === selectedPlace.id}
            aria-pressed={place.id === selectedPlace.id}
            onclick={() => onSelect(place.id)}
          >
            <span class="place-id">{place.id}</span>
            <span class="place-copy">
              <span class="place-name">{placeText(place.id, "name")}</span>
              <span class="place-resource">{resourceLabel(place)}</span>
            </span>
          </button>
        </li>
      {/each}

      <li class="route-branch">
        <ol aria-label={t("learn_ui_parallel_concepts")}>
          {#each parallelPlaces as place (place.id)}
            <li class="route-stop branch-stop">
              <button
                type="button"
                class="place-button"
                class:selected={place.id === selectedPlace.id}
                aria-pressed={place.id === selectedPlace.id}
                onclick={() => onSelect(place.id)}
              >
                <span class="place-id">{place.id}</span>
                <span class="place-copy">
                  <span class="place-name">{placeText(place.id, "name")}</span>
                  <span class="place-resource">{resourceLabel(place)}</span>
                </span>
              </button>
            </li>
          {/each}
        </ol>
      </li>

      {#each closingPlaces as place (place.id)}
        <li class="route-stop">
          <button
            type="button"
            class="place-button"
            class:selected={place.id === selectedPlace.id}
            aria-pressed={place.id === selectedPlace.id}
            onclick={() => onSelect(place.id)}
          >
            <span class="place-id">{place.id}</span>
            <span class="place-copy">
              <span class="place-name">{placeText(place.id, "name")}</span>
              <span class="place-resource">{resourceLabel(place)}</span>
            </span>
          </button>
        </li>
      {/each}
    </ol>

    <div class="place-detail">
      <Crossfade
        key={selectedPlace.id}
        duration={DURATION.normal}
        animateHeight
      >
        <article aria-labelledby="selected-place-title">
          <div class="place-heading">
            <span class="selected-id">{selectedPlace.id}</span>
            <div>
              <h3 id="selected-place-title">{placeText(selectedPlace.id, "name")}</h3>
              <p>{placeText(selectedPlace.id, "description")}</p>
            </div>
          </div>

          {#if selectedPlace.id === "1.1"}
            <div
              class="grid-preview"
              aria-label={t("learn_ui_diamond_box_grids")}
            >
              <figure>
                <LessonGridDisplay type="diamond" size="medium" />
                <figcaption>{t("generator_grid_diamond")}</figcaption>
              </figure>
              <figure>
                <LessonGridDisplay type="box" size="medium" />
                <figcaption>{t("generator_grid_box")}</figcaption>
              </figure>
            </div>
          {/if}

          {#if hasMappedResources(selectedPlace)}
            <div class="resource-actions">
              {#each selectedPlace.lessonIds as lessonRef (lessonRef.lessonId)}
                {@const lesson = lessonFor(lessonRef)}
                {#if lesson}
                  <button
                    type="button"
                    class="resource-action primary"
                    onclick={() => onLessonStart(lesson, selectedPlace.id)}
                  >
                    <span>{tDynamic("learn_place_lesson_named", { name: localizedConcept(lesson, "name") })}</span>
                    {#if lessonRef.coverage === "partial"}
                      <small>{t("learn_ui_part_of_concept")}</small>
                    {/if}
                  </button>
                {/if}
              {/each}

              {#if selectedPlace.exploration}
                <a
                  class="resource-action secondary"
                  href={selectedPlace.exploration.href}
                >
                  {tDynamic("learn_place_open_atlas")}
                </a>
              {/if}

              {#each selectedPlace.guideRefs as guide (guide.slug)}
                <a
                  class="resource-action secondary"
                  href="/guide/level-1/{guide.slug}"
                >
                  <span>{t("learn_ui_read_named", { name: guideText(guide.slug) })}</span>
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
        </article>
      </Crossfade>
    </div>
  </div>
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

  .atlas-body {
    display: grid;
    grid-template-columns: clamp(20rem, 30cqw, 28rem) minmax(0, 1fr);
    gap: clamp(1rem, 3cqw, 2rem);
    align-items: start;
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

  .concept-track {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .concept-track::before {
    position: absolute;
    top: 1.25rem;
    bottom: 1.25rem;
    left: 1.25rem;
    width: 2px;
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 35%,
      var(--theme-stroke)
    );
    content: "";
  }

  .concept-track li {
    min-width: 0;
    list-style: none;
  }

  .route-stop {
    position: relative;
    padding: 0.25rem 0;
  }

  .route-branch {
    position: relative;
    margin: 0.25rem 0;
    padding-left: 2.5rem;
  }

  .route-branch::before,
  .route-branch::after {
    position: absolute;
    left: 1.25rem;
    width: 1.25rem;
    border-left: 2px solid
      color-mix(in srgb, var(--theme-accent, #8b5cf6) 35%, var(--theme-stroke));
    content: "";
  }

  .route-branch::before {
    top: 0;
    height: 50%;
    border-bottom: 2px solid
      color-mix(in srgb, var(--theme-accent, #8b5cf6) 35%, var(--theme-stroke));
    border-bottom-left-radius: 0.75rem;
  }

  .route-branch::after {
    bottom: 0;
    height: 50%;
    border-top: 2px solid
      color-mix(in srgb, var(--theme-accent, #8b5cf6) 35%, var(--theme-stroke));
    border-top-left-radius: 0.75rem;
  }

  .route-branch ol {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.5rem;
    margin: 0;
    padding: 0;
  }

  .place-button {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    min-height: 52px;
    padding: 0.5rem 0.75rem 0.5rem 0.625rem;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 10px;
    color: var(--theme-text);
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition:
      background-color var(--duration-normal) ease,
      border-color var(--duration-normal) ease,
      box-shadow var(--duration-normal) ease;
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
  .resource-action:focus-visible {
    outline: 2px solid var(--theme-accent, #8b5cf6);
    outline-offset: 2px;
  }

  .place-id {
    position: relative;
    z-index: 1;
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    min-width: 2.5rem;
    height: 2.5rem;
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
    overflow: hidden;
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 680;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .place-resource {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 0.75rem);
    line-height: 1.2;
  }

  .place-detail {
    align-self: start;
    min-width: 0;
    padding: clamp(1rem, 3cqw, 1.5rem);
    background: color-mix(in srgb, var(--theme-card-bg) 82%, transparent);
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
  }

  .place-detail article {
    display: grid;
    gap: 1rem;
    min-width: 0;
  }

  .grid-preview {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 17.5rem));
    justify-content: start;
    gap: 0.75rem;
    margin: 0;
  }

  .grid-preview figure {
    min-width: 0;
    margin: 0;
  }

  .grid-preview figcaption {
    margin-top: 0.5rem;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 700;
    text-align: center;
  }

  .place-heading {
    display: flex;
    align-items: flex-start;
    gap: 0.875rem;
  }

  .selected-id {
    flex: 0 0 auto;
    min-width: 3rem;
    padding: 0.4rem 0.5rem;
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
    font-size: 1.125rem;
  }

  .place-heading p,
  .unmapped-note {
    margin: 0.35rem 0 0;
    color: var(--theme-text-dim);
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.45;
    text-wrap: pretty;
  }

  .resource-actions {
    display: flex;
    flex-wrap: wrap;
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
      background-color var(--duration-normal) ease,
      border-color var(--duration-normal) ease;
  }

  .resource-action.primary {
    background: color-mix(
      in srgb,
      var(--theme-accent, #7c3aed) 12%,
      var(--theme-card-bg)
    );
    border: 1px solid
      color-mix(in srgb, var(--theme-accent, #7c3aed) 62%, var(--theme-stroke));
    color: var(--theme-text);
  }

  .resource-action.primary:hover {
    background: color-mix(
      in srgb,
      var(--theme-accent, #7c3aed) 19%,
      var(--theme-card-bg)
    );
    border-color: var(--theme-accent, #7c3aed);
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

  @container (min-width: 70rem) {
    .place-detail:not(:has(.grid-preview)) {
      max-width: 36rem;
    }

    .place-detail article {
      grid-template-columns: minmax(13rem, 0.7fr) minmax(24rem, 1.3fr);
      grid-template-areas:
        "heading preview"
        "heading actions";
      column-gap: clamp(1.5rem, 3cqw, 3rem);
      align-items: start;
    }

    .place-detail article:not(:has(.grid-preview)) {
      grid-template-columns: 1fr;
      grid-template-areas:
        "heading"
        "actions";
    }

    .place-heading {
      grid-area: heading;
    }

    .grid-preview {
      grid-area: preview;
    }

    .resource-actions,
    .unmapped-note {
      grid-area: actions;
    }
  }

  @container (max-width: 56rem) {
    .atlas-body {
      grid-template-columns: 1fr;
    }

    .concept-track {
      flex-direction: row;
      gap: 0.5rem;
      overflow-x: auto;
      padding: 0.25rem 0 0.75rem;
      scroll-snap-type: x proximity;
      scrollbar-width: thin;
    }

    .concept-track::before,
    .route-branch::before,
    .route-branch::after {
      display: none;
    }

    .route-stop,
    .route-branch {
      flex: 0 0 auto;
      padding: 0;
    }

    .route-branch {
      margin: 0;
    }

    .route-branch ol {
      display: flex;
      gap: 0.5rem;
    }

    .place-button {
      width: auto;
      min-width: 11.5rem;
      scroll-snap-align: start;
    }

    .map-header {
      align-items: flex-start;
      flex-direction: column;
      gap: 0.5rem;
    }

    .map-header p {
      text-align: left;
    }

    .resource-action {
      flex: 1 1 14rem;
      width: auto;
      max-width: none;
    }
  }

  @container (max-width: 28rem) {
    .grid-preview {
      grid-template-columns: 1fr 1fr;
      gap: 0.5rem;
    }

    .grid-preview figure {
      padding: 0.4rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .place-button,
    .resource-action {
      transition: none;
    }
  }
</style>
