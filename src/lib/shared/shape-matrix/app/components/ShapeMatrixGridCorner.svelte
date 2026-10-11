<!-- src/lib/shared/shape-matrix/app/components/ShapeMatrixGridCorner.svelte
  The grid's top-left corner is where rows and columns meet, so it holds the
  controls that set them: Surprise on top, with Theory's Link toggle beside
  it so the axis rows keep the cell's height, then the Columns → value (red,
  right hand) on the same band as the column headers beside it, then the
  Rows ↓ value (blue, left hand) above the row headers below it. The reveal
  still lands rows before columns, matching the grid. Each value reads in
  the chosen notation only. The relationship is not repeated here; the
  detail pane names it. Compact hosts get a bare legend and edit from the
  header, so this only becomes a control surface on wide layouts. -->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { spinRatioEquals } from "@vtg/domain";
  import { flyFade } from "#lib/shared/transitions/motion.js";
  import {
    localizedFlowerLabel,
    localizedTheoryFlowerLabel,
    localizedMatrixTurnSpokenLabel,
    localizedTheoryRatioSpokenLabel,
  } from "#lib/shared/shape-matrix/domain/shape-matrix-display.js";
  import { localizedModeName } from "#lib/shared/shape-matrix/domain/shape-matrix-display.js";
  import { getShapeMatrixAppContext } from "../context/shape-matrix-app-context";
  import { SHAPE_MATRIX_REVEAL } from "../services/shape-matrix-reveal";
  import ShapeMatrixAxisStepper from "./ShapeMatrixAxisStepper.svelte";
  import ShapeMatrixRatioEntry from "./ShapeMatrixRatioEntry.svelte";

  interface Props {
    /** The pane that owns this corner. Both panes stay mounted, so the
       corner describes its own grid rather than whichever surface shows. */
    surface: "level" | "theory";
    onsurprise: () => void;
    /** Theory's ratio editor points back at the axis it is changing. */
    onratiofocuschange?: (hand: "left" | "right" | "both" | null) => void;
  }
  let { surface, onsurprise, onratiofocuschange }: Props = $props();

  const appState = getShapeMatrixAppContext();
  const theory = $derived(surface === "theory");
  const hasPair = $derived(
    theory ? appState.theoryPair !== null : appState.selectedPair !== null
  );

  const ratiosMatch = $derived(
    spinRatioEquals(appState.theoryLeftRatio, appState.theoryRightRatio)
  );
  function toggleLink(): void {
    if (appState.theoryRatiosLinked) {
      appState.unlinkTheoryRatios();
      return;
    }
    // Linking keeps the rows ratio; the corner reads top to bottom.
    appState.linkTheoryRatios("left");
  }

  /* One sentence for assistive technology after each roll, with everything
     the reveal shows sighted users. Reduced motion gets the same sentence,
     which is the whole reveal in that case. */
  let announcement = $state("");
  let announcedToken: number | null = null;
  $effect(() => {
    const token = appState.revealToken;
    if (announcedToken === null) {
      announcedToken = token;
      return;
    }
    if (token === announcedToken) return;
    announcedToken = token;
    // Both panes stay mounted; only the showing surface speaks the roll.
    if (theory !== (appState.surface === "theory")) return;
    const rows = theory
      ? localizedTheoryRatioSpokenLabel(
          appState.theoryLeftRatio.handCycles,
          appState.theoryLeftRatio.propRotations
        )
      : localizedMatrixTurnSpokenLabel(appState.leftTurn, appState.labelMode);
    const columns = theory
      ? localizedTheoryRatioSpokenLabel(
          appState.theoryRightRatio.handCycles,
          appState.theoryRightRatio.propRotations
        )
      : localizedMatrixTurnSpokenLabel(appState.rightTurn, appState.labelMode);
    const crossing = theory
      ? appState.theoryPair
        ? `${localizedTheoryFlowerLabel(appState.theoryPair.left)} ${t("shape_engine_over")} ${localizedTheoryFlowerLabel(appState.theoryPair.right)}`
        : null
      : appState.selectedPair
        ? `${localizedFlowerLabel(appState.selectedPair.left)} ${t("shape_engine_over")} ${localizedFlowerLabel(appState.selectedPair.right)}`
        : null;
    const mode = theory ? appState.theoryMode : appState.selectedMode;
    announcement = [
      t("shape_engine_new_grid_announcement", { rows, columns }),
      crossing ? t("shape_engine_crossing_announcement", { crossing }) : null,
      mode
        ? t("shape_engine_relationship_announcement", {
            mode,
            relationship: localizedModeName(mode),
          })
        : null,
    ]
      .filter(Boolean)
      .join(" ");
  });

  const beat = SHAPE_MATRIX_REVEAL;
</script>

<div class="corner-frame" class:theory>
  {#if appState.compact}
    <div class="corner-guide">
      <strong>{t("shape_engine_pick_crossing")}</strong>
      <span class="compact-axis" aria-hidden="true">
        <i class="column-arrow fas fa-arrow-right"></i>
        <i class="row-arrow fas fa-arrow-down"></i>
      </span>
    </div>
  {:else}
    <div
      class="corner-home"
      role="group"
      aria-label={t("shape_engine_current_grid_aria")}
    >
      <div class="top">
        <button
          type="button"
          class="surprise"
          aria-label={t("shape_engine_surprise_aria")}
          title={t("shape_engine_surprise_title")}
          disabled={!theory && !appState.data}
          onclick={onsurprise}
        >
          <i class="fas fa-dice" aria-hidden="true"></i>
          <span>{t("shape_engine_surprise_me")}</span>
        </button>
        {#if theory}
          <button
            type="button"
            class="link"
            class:linked={appState.theoryRatiosLinked}
            aria-pressed={appState.theoryRatiosLinked}
            aria-label={appState.theoryRatiosLinked
              ? t("shape_engine_unlink_ratios")
              : ratiosMatch
                ? t("shape_engine_link_ratios")
                : t("shape_engine_link_column_to_row")}
            title={appState.theoryRatiosLinked
              ? t("shape_engine_linked")
              : t("shape_engine_link_ratios")}
            onclick={toggleLink}
          >
            <i class="fas fa-link" aria-hidden="true"></i>
          </button>
        {/if}
      </div>

      {#key appState.revealToken}
        <div
          class="axis columns"
          in:flyFade={{
            y: -4,
            delay: beat.columns.at,
            duration: beat.columns.duration,
          }}
        >
          <i class="axis-mark fas fa-arrow-right" aria-hidden="true"></i>
          {#if theory}
            <ShapeMatrixRatioEntry
              hand="right"
              layout="corner"
              onfocuschange={onratiofocuschange}
            />
          {:else}
            <ShapeMatrixAxisStepper hand="right" layout="corner" />
          {/if}
        </div>
      {/key}

      {#key appState.revealToken}
        <div
          class="axis rows"
          in:flyFade={{ y: -4, duration: beat.rows.duration }}
        >
          <i class="axis-mark fas fa-arrow-down" aria-hidden="true"></i>
          {#if theory}
            <ShapeMatrixRatioEntry
              hand="left"
              layout="corner"
              onfocuschange={onratiofocuschange}
            />
          {:else}
            <ShapeMatrixAxisStepper hand="left" layout="corner" />
          {/if}
        </div>
      {/key}

      <div class="foot">
        {#if !hasPair}
          <span class="hint">{t("shape_engine_pick_crossing")}</span>
        {/if}
      </div>
    </div>
  {/if}

  <span class="sr-only" aria-live="polite">{announcement}</span>
</div>

<style>
  .corner-frame {
    position: absolute;
    inset: 0;
    container-type: size;
  }

  /* The controls scale with the cell: every size below reads in container
     inline units so the corner stays usable from a laptop's 7rem cell up to
     the 20rem cell of a wide monitor. */
  .corner-home {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: stretch;
    width: 100%;
    height: 100%;
    gap: clamp(0.2rem, 3.5cqi, 0.6rem);
    padding: clamp(0.25rem, 5cqi, 0.9rem);
    color: var(--theme-text, #fff);
  }

  /* Surprise and Theory's Link toggle share one band, so the axis rows
     below keep the cell's height for their steppers. */
  .top {
    display: flex;
    align-items: stretch;
    gap: clamp(0.2rem, 3cqi, 0.45rem);
    min-width: 0;
  }

  .surprise {
    display: inline-flex;
    flex: 1 1 auto;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    min-width: 0;
    min-height: clamp(1.75rem, 18cqi, 2.75rem);
    padding: 0.2rem clamp(0.3rem, 3.5cqi, 0.6rem);
    border: 1px solid
      color-mix(
        in srgb,
        var(--theme-accent, #f59e0b) 58%,
        var(--theme-stroke, transparent)
      );
    border-radius: 9px;
    background: color-mix(
      in srgb,
      var(--theme-accent, #f59e0b) 13%,
      var(--theme-card-bg, transparent)
    );
    color: var(--theme-text, #fff);
    cursor: pointer;
    font: inherit;
    font-size: clamp(0.75rem, 9cqi, 0.95rem);
    font-weight: 750;
    white-space: nowrap;
    transition:
      border-color var(--duration-fast, 150ms) ease,
      background var(--duration-fast, 150ms) ease,
      transform var(--duration-fast, 150ms) ease;
  }

  .surprise i {
    color: var(--theme-accent, #f59e0b);
  }

  .surprise:hover:not(:disabled) {
    border-color: var(--theme-accent, #f59e0b);
    background: color-mix(
      in srgb,
      var(--theme-accent, #f59e0b) 22%,
      var(--theme-card-bg, transparent)
    );
  }

  .surprise:active:not(:disabled) {
    transform: scale(0.97);
  }

  .surprise:active:not(:disabled) i {
    animation: roll 420ms ease;
  }

  .surprise:disabled {
    opacity: 0.55;
    cursor: default;
  }

  .surprise:focus-visible,
  .link:focus-visible {
    outline: 2px solid var(--theme-accent, #f59e0b);
    outline-offset: 2px;
  }

  @keyframes roll {
    to {
      transform: rotate(360deg);
    }
  }

  .axis {
    --axis-color: var(--prop-blue-text, #818cf8);
    display: flex;
    align-items: center;
    gap: clamp(0.2rem, 3cqi, 0.45rem);
    min-width: 0;
  }

  .axis.columns {
    --axis-color: var(--prop-red-text, #f87171);
  }

  /* Icon arrows: the text glyphs were too thin to read as arrows. */
  .axis-mark {
    flex: 0 0 auto;
    width: 1.1em;
    color: var(--axis-color);
    font-size: clamp(0.9rem, 11cqi, 1.3rem);
    text-align: center;
    line-height: 1;
  }

  .axis > :global(:not(.axis-mark)) {
    flex: 1 1 auto;
    min-width: 0;
  }

  .foot {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    min-height: 1em;
  }

  .hint {
    color: var(--theme-text-dim, rgb(255 255 255 / 0.62));
    font-size: clamp(0.7rem, 8.5cqi, 0.875rem);
    font-weight: 600;
    text-align: center;
    white-space: nowrap;
  }

  /* A square as tall as Surprise. The global 44px floor would make it the
     tallest thing in the cell; this corner is a pointer surface on wide
     layouts, and compact hosts link from the header. */
  .link {
    display: grid;
    flex: 0 0 auto;
    width: clamp(1.75rem, 18cqi, 2.75rem);
    min-width: 0;
    min-height: clamp(1.75rem, 18cqi, 2.75rem);
    place-items: center;
    padding: 0;
    border: 1px solid var(--theme-stroke, rgb(255 255 255 / 0.14));
    border-radius: 9px;
    background: transparent;
    color: var(--theme-text-dim, rgb(255 255 255 / 0.62));
    font-size: clamp(0.7rem, 8cqi, 0.95rem);
    cursor: pointer;
    transition:
      color var(--duration-fast, 150ms) ease,
      border-color var(--duration-fast, 150ms) ease,
      background var(--duration-fast, 150ms) ease;
  }

  .link:hover {
    color: var(--theme-text, #fff);
    border-color: var(--theme-text-dim, rgb(255 255 255 / 0.4));
  }

  .link.linked {
    color: var(--theme-accent, #f59e0b);
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #f59e0b) 60%,
      transparent
    );
    background: color-mix(
      in srgb,
      var(--theme-accent, #f59e0b) 14%,
      transparent
    );
  }

  /* Compact: the header edits the grid, so the corner only points at the
     two axes and names the next move. */
  .corner-guide {
    display: grid;
    width: 100%;
    height: 100%;
    place-content: center;
    gap: clamp(0.25rem, 5cqi, 0.6rem);
    padding: clamp(0.25rem, 6cqi, 0.8rem);
    color: var(--theme-text, #fff);
    text-align: center;
  }

  .corner-guide > strong {
    font-size: clamp(0.8rem, 10cqi, 1rem);
    font-weight: 750;
    line-height: 1.1;
  }

  .compact-axis {
    display: inline-flex;
    justify-content: center;
    align-items: center;
    gap: 0.35rem;
    font-size: clamp(0.9rem, 18cqi, 1.25rem);
  }

  .row-arrow {
    color: var(--prop-blue-text, #818cf8);
  }

  .column-arrow {
    color: var(--prop-red-text, #f87171);
  }

  @container (max-width: 5rem) or (max-height: 5rem) {
    .corner-guide {
      padding: 0;
    }

    .corner-guide > strong {
      display: none;
    }
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  @media (prefers-reduced-motion: reduce) {
    .surprise,
    .link {
      transition: none;
    }

    .surprise:active:not(:disabled) {
      transform: none;
    }

    .surprise:active:not(:disabled) i {
      animation: none;
    }
  }
</style>
