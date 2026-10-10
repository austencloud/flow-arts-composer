<!-- The two ratio editors are one instrument. This component owns their
     relationship so linked editing is a durable state rather than a copy
     command the user has to remember pressing. -->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { spinRatioKey } from "@vtg/domain";
  import Crossfade from "#lib/shared/components/Crossfade.svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import { theoryRatioLabel } from "#lib/shared/shape-matrix/domain/theory-ratio.js";
  import { getShapeMatrixAppContext } from "../context/shape-matrix-app-context";
  import ShapeMatrixRatioEntry from "./ShapeMatrixRatioEntry.svelte";

  type RatioFocus = "left" | "right" | "both" | null;

  interface Props {
    layout?: "ribbon" | "tray";
    onfocuschange?: (hand: RatioFocus) => void;
  }
  let { layout = "ribbon", onfocuschange }: Props = $props();

  const appState = getShapeMatrixAppContext();
  const leftLabel = $derived(theoryRatioLabel(appState.theoryLeftRatio));
  const rightLabel = $derived(theoryRatioLabel(appState.theoryRightRatio));
  const ratiosMatch = $derived(
    spinRatioKey(appState.theoryLeftRatio) ===
      spinRatioKey(appState.theoryRightRatio)
  );
  let choosingSource = $state(false);

  $effect(() => {
    if (appState.theoryRatiosLinked) choosingSource = false;
  });

  function requestLink(): void {
    if (ratiosMatch) {
      appState.linkTheoryRatios("left");
      return;
    }
    choosingSource = true;
  }

  function linkUsing(source: "left" | "right"): void {
    appState.linkTheoryRatios(source);
    choosingSource = false;
  }
</script>

<section
  class="theory-builder"
  class:tray={layout === "tray"}
  class:linked={appState.theoryRatiosLinked}
  aria-label={t("shape_engine_ratio_editor_aria")}
>
  <Crossfade
    key={appState.theoryRatiosLinked
      ? "linked"
      : choosingSource
        ? "choosing"
        : "separate"}
    animateHeight={layout === "tray"}
  >
    {#if appState.theoryRatiosLinked}
      <div class="linked-layout">
        <ShapeMatrixRatioEntry hand="both" {layout} {onfocuschange} />
        <div class="relationship-control linked-control">
          <span class="relationship-note">{t("shape_engine_editing_both")}</span
          >
          <PanelButton
            fullWidth
            ariaPressed={true}
            ariaLabel={t("shape_engine_unlink_ratios")}
            onclick={appState.unlinkTheoryRatios}
          >
            <i class="fas fa-link" aria-hidden="true"></i>
            <strong>{t("shape_engine_linked")}</strong>
          </PanelButton>
        </div>
      </div>
    {:else}
      <div class="split-layout">
        <ShapeMatrixRatioEntry hand="left" {layout} {onfocuschange} />

        <div class="relationship-control">
          {#if choosingSource}
            <span class="relationship-note"
              >{t("shape_engine_which_ratio")}</span
            >
            <div class="source-choices">
              <PanelButton
                ariaLabel={t("shape_engine_link_using_rows", {
                  ratio: leftLabel,
                })}
                onclick={() => linkUsing("left")}
              >
                <span class="axis-dot left-dot" aria-hidden="true"></span>
                <span>{t("shape_engine_ratio_rows", { ratio: leftLabel })}</span
                >
              </PanelButton>
              <PanelButton
                ariaLabel={t("shape_engine_link_using_columns", {
                  ratio: rightLabel,
                })}
                onclick={() => linkUsing("right")}
              >
                <span class="axis-dot right-dot" aria-hidden="true"></span>
                <span
                  >{t("shape_engine_ratio_columns", {
                    ratio: rightLabel,
                  })}</span
                >
              </PanelButton>
              <button
                type="button"
                class="cancel-link"
                aria-label={t("shape_engine_cancel_link")}
                onclick={() => (choosingSource = false)}
              >
                <i class="fas fa-xmark" aria-hidden="true"></i>
              </button>
            </div>
          {:else}
            <span class="relationship-note">{t("shape_engine_keep_sync")}</span>
            <PanelButton
              fullWidth
              ariaPressed={false}
              ariaLabel={t("shape_engine_link_ratios_aria")}
              onclick={requestLink}
            >
              <i class="fas fa-link" aria-hidden="true"></i>
              <strong>{t("shape_engine_link_ratios")}</strong>
            </PanelButton>
          {/if}
        </div>

        <ShapeMatrixRatioEntry hand="right" {layout} {onfocuschange} />
      </div>
    {/if}
  </Crossfade>
</section>

<style>
  .theory-builder {
    width: fit-content;
    max-width: 100%;
  }

  .split-layout,
  .linked-layout {
    display: grid;
    align-items: start;
    gap: 0.8rem;
    width: fit-content;
    max-width: 100%;
  }

  .split-layout {
    grid-template-columns: 20rem 15rem 20rem;
  }

  .linked-layout {
    grid-template-columns: 20rem 15rem;
  }

  .relationship-control {
    display: grid;
    min-width: 0;
    gap: 0.25rem;
    padding-top: 0.25rem;
  }

  .relationship-note {
    min-height: 1.1rem;
    color: var(--theme-text-dim, rgb(255 255 255 / 0.62));
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 600;
    line-height: 1.1rem;
    text-align: center;
    white-space: nowrap;
  }

  .relationship-control :global(.panel-btn) {
    min-width: 0;
    padding-inline: 0.7rem;
    border-color: var(--theme-stroke-strong, rgb(255 255 255 / 0.2));
    background: color-mix(in srgb, var(--theme-text, #fff) 5%, transparent);
    white-space: nowrap;
  }

  .relationship-control :global(.panel-btn:hover) {
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #f59e0b) 55%,
      transparent
    );
  }

  .linked-control :global(.panel-btn) {
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #f59e0b) 55%,
      var(--theme-stroke, transparent)
    );
    background: color-mix(
      in srgb,
      var(--theme-accent, #f59e0b) 12%,
      transparent
    );
  }

  .source-choices {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) var(
        --min-touch-target,
        44px
      );
    gap: 0.3rem;
  }

  .source-choices :global(.panel-btn) {
    padding-inline: 0.45rem;
    font-size: var(--font-size-min, 0.875rem);
  }

  .axis-dot {
    width: 0.5rem;
    height: 0.5rem;
    flex: 0 0 auto;
    border-radius: 50%;
  }

  .left-dot {
    background: var(--prop-blue-text, #818cf8);
  }

  .right-dot {
    background: var(--prop-red-text, #f87171);
  }

  .cancel-link {
    display: grid;
    width: var(--min-touch-target, 44px);
    min-width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    place-items: center;
    padding: 0;
    border: 1px solid var(--theme-stroke, rgb(255 255 255 / 0.12));
    border-radius: 8px;
    background: var(--theme-card-bg, rgb(255 255 255 / 0.05));
    color: var(--theme-text-dim, rgb(255 255 255 / 0.72));
    cursor: pointer;
  }

  .cancel-link:hover {
    border-color: var(--theme-stroke-strong, rgb(255 255 255 / 0.22));
    color: var(--theme-text, #fff);
  }

  .cancel-link:focus-visible {
    outline: 2px solid var(--theme-accent, #f59e0b);
    outline-offset: 2px;
  }

  .theory-builder.tray {
    width: min(23rem, calc(100vw - 3rem));
  }

  .theory-builder.tray .split-layout,
  .theory-builder.tray .linked-layout {
    grid-template-columns: minmax(0, 1fr);
    width: 100%;
    gap: 0.55rem;
  }

  .theory-builder.tray .relationship-control {
    order: 2;
    padding-top: 0;
  }

  .theory-builder.tray .split-layout > :global(.ratio-side.right) {
    order: 3;
  }
</style>
