<script lang="ts">
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import ScrubbableNumber from "$lib/shared/ui/components/ScrubbableNumber.svelte";
  import type { ExportOptionsStateManager } from "$lib/shared/animation-panel/state/export-options-state.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import { getMediaCompositionContext } from "$lib/shared/media-composition/state/media-composition-context";
  import type { ResolvedAutoLayout } from "$lib/shared/render/services/container-aware-layout";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import type {
    ClipTransform,
    LayoutRegion,
  } from "$lib/shared/media-composition/domain/media-layout-schema";
  import PostStudioSourceSettings from "./PostStudioSourceSettings.svelte";
  import { getViewerStudioSurfaces } from "$lib/shared/sequence-viewer/context/viewer-studio-surfaces-context";

  let {
    sequence,
    exportOptions,
    selectedPropType,
    onPropChange,
    resolvedAutoLayout = null,
  }: {
    sequence: SequenceData;
    exportOptions: ExportOptionsStateManager;
    selectedPropType: PropType;
    onPropChange: (propType: PropType) => void;
    resolvedAutoLayout?: ResolvedAutoLayout | null;
  } = $props();

  const composition = getMediaCompositionContext();
  const shared = getViewerStudioSurfaces();
  const sharedAnimation = $derived(
    shared?.inspectorAvailable &&
      selectedBinding?.renderMode === "sequence-animation"
  );

  const selectedBinding = $derived(composition.selectedBinding);
  $effect(() => {
    const mode = selectedBinding?.renderMode;
    shared?.setInspectorContent(
      mode === "sequence-animation"
        ? "animation"
        : mode === "choreo-card"
          ? "card"
          : "studio"
    );
  });
  // Everything the studio draws itself has a Look to edit; the exceptions are
  // dropped-in media (a video file has nothing to steer) and the 3D view, which
  // isn't wired up yet. Listing the modes that DO have settings was the older
  // shape, and it meant every new source type shipped without its controls
  // until someone remembered to extend the list.
  const WITHOUT_SOURCE_SETTINGS = ["external-media", "scene-3d"];
  const hasSourceSettings = $derived(
    Boolean(selectedBinding?.renderMode) &&
      !WITHOUT_SOURCE_SETTINGS.includes(selectedBinding?.renderMode ?? "")
  );

  /**
   * Placement is a footage-only question, and the panel no longer offers it to
   * anything else.
   *
   * Everything the studio draws itself — mandala, tunnel, animation, card — is
   * already composed to fill its slot without touching the edges. Scaling one
   * of those to 80% or fading it to 60% produces a worse post, every time, so
   * they were two sliders that existed to be left alone. A dropped-in video is
   * the one source whose framing the studio cannot know: it arrives at whatever
   * crop the phone took, and moving it inside the slot is the real work.
   *
   * `selectedSupportsFit` is already exactly "this layer is external media",
   * so it is the whole gate — Look and Fit are now two different layers'
   * panels, never two tabs of one, and the switcher is gone with them.
   */
  const isFootage = $derived(composition.selectedSupportsFit);

  const FIT_OPTIONS: Array<{ value: LayoutRegion["fit"]; label: string }> = [
    { value: "cover", label: "Crop" },
    { value: "contain", label: "Fit" },
    { value: "fill", label: "Stretch" },
  ];

  const transform = $derived(composition.selectedTransform);
  const opacity = $derived(composition.selectedOpacity ?? 1);
  const changed = $derived(
    Boolean(
      transform &&
      (transform.scale !== 1 ||
        transform.translateX !== 0 ||
        transform.translateY !== 0 ||
        transform.flipHorizontal ||
        opacity !== 1)
    )
  );

  /**
   * Flipping the FOOTAGE is a property of this one clip, so it stays here with
   * the rest of its framing. Flipping the NOTATION is not: it reflects the
   * sequence data, so every notation layer in the post moves together, and a
   * post-wide switch parked inside one layer's panel reads as belonging to that
   * layer. It lives on the action bar now, beside the safe-area overlay — the
   * other control that changes the whole post rather than a piece of it.
   */
  const mirrored = $derived(composition.selectedFlipHorizontal);

  // Crop position is only meaningful when there is hidden source to pan into
  // view, which is exactly what Crop fit produces. On Fit and Stretch the whole
  // frame is already on screen and the sliders would only push it off.
  const canPosition = $derived(
    composition.selectedSupportsFit &&
      composition.selectedRegion?.fit === "cover"
  );

  function numberFrom(event: Event): number {
    return Number((event.currentTarget as HTMLInputElement).value);
  }

  function setTransform(key: keyof ClipTransform, value: number): void {
    composition.setSelectedTransform({ [key]: value });
  }
</script>

<section
  class="inspector"
  class:source-open={hasSourceSettings}
  class:shared-animation={sharedAnimation}
  aria-labelledby={sharedAnimation ? undefined : "post-studio-inspector"}
  aria-label={sharedAnimation ? "Animation settings" : undefined}
>
  <!-- One row, not three. "SELECTED LAYER" above the name said the same thing
       twice, and the Look/Fit switcher below it took a third band — ~105px
       before a single control appeared, in a rail whose whole job is the
       controls. The switcher is gone entirely: a layer has a Look or a Fit,
       never both, so there was never anything to switch between. -->
  {#if !sharedAnimation}
    <div class="inspector-heading">
      <h3 id="post-studio-inspector">
        {selectedBinding?.label ??
          composition.selectedRegion?.label ??
          "Canvas"}
      </h3>

      {#if isFootage && composition.selectedRegion && transform}
        <button
          type="button"
          class="reset-button"
          disabled={!changed}
          aria-label="Reset how the selected layer fills its slot"
          onclick={composition.resetSelectedAppearance}
        >
          <i class="fa-solid fa-arrow-rotate-left" aria-hidden="true"></i>
          Reset
        </button>
      {/if}
    </div>
  {/if}

  {#if composition.selectedRegion && transform}
    {#if hasSourceSettings}
      <PostStudioSourceSettings
        {sequence}
        {exportOptions}
        {selectedPropType}
        {onPropChange}
        {resolvedAutoLayout}
      />
    {:else if isFootage}
      <div class="control-group">
        <span class="group-label">Frame fit</span>
        <div class="switch-row wide">
          <SegmentedControl
            options={FIT_OPTIONS}
            value={composition.selectedRegion.fit}
            onchange={composition.setSelectedFit}
            ariaLabel="How the source fits the selected area"
            semantics="radiogroup"
            size="sm"
            color="accent"
          />
        </div>
      </div>

      <div class="control-group">
        <span class="group-label">Mirror</span>
        <button
          type="button"
          class="mirror-button"
          class:on={mirrored}
          aria-pressed={mirrored}
          onclick={composition.toggleSelectedFlip}
        >
          <i class="fa-solid fa-right-left" aria-hidden="true"></i>
          <span class="mirror-label">Mirror video</span>
          <span class="mirror-state">{mirrored ? "On" : "Off"}</span>
        </button>
        <p class="group-hint">
          Reflects the footage. Any text burned into the take reverses with it.
        </p>
      </div>

      <div class="control-group fill-controls">
        <div class="group-heading">
          <span class="group-label">Fill</span>
        </div>

        <div class="slider-row">
          <span>Scale</span>
          <input
            type="range"
            min="50"
            max="200"
            step="1"
            value={Math.round(transform.scale * 100)}
            aria-label="Scale"
            aria-valuetext={`${Math.round(transform.scale * 100)} percent`}
            oninput={(event) => setTransform("scale", numberFrom(event) / 100)}
          />
          <ScrubbableNumber
            label="Scale"
            value={transform.scale * 100}
            min={50}
            max={200}
            step={1}
            unit="%"
            showLabel={false}
            onchange={(value) => setTransform("scale", value / 100)}
          />
        </div>

        {#if canPosition}
          <!-- Only under Crop: that is the fit that hides part of the source, so
               it is the only one where sliding the frame reveals anything. -->
          <div class="slider-row">
            <span>Across</span>
            <input
              type="range"
              min="-50"
              max="50"
              step="1"
              value={Math.round(transform.translateX * 100)}
              aria-label="Crop position across"
              aria-valuetext={`${Math.round(transform.translateX * 100)} percent`}
              oninput={(event) =>
                setTransform("translateX", numberFrom(event) / 100)}
            />
            <ScrubbableNumber
              label="Across"
              value={transform.translateX * 100}
              min={-50}
              max={50}
              step={1}
              unit="%"
              showLabel={false}
              onchange={(value) => setTransform("translateX", value / 100)}
            />
          </div>

          <div class="slider-row">
            <span>Down</span>
            <input
              type="range"
              min="-50"
              max="50"
              step="1"
              value={Math.round(transform.translateY * 100)}
              aria-label="Crop position down"
              aria-valuetext={`${Math.round(transform.translateY * 100)} percent`}
              oninput={(event) =>
                setTransform("translateY", numberFrom(event) / 100)}
            />
            <ScrubbableNumber
              label="Down"
              value={transform.translateY * 100}
              min={-50}
              max={50}
              step={1}
              unit="%"
              showLabel={false}
              onchange={(value) => setTransform("translateY", value / 100)}
            />
          </div>
        {/if}

        <div class="slider-row">
          <span>Opacity</span>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={Math.round(opacity * 100)}
            aria-label="Opacity"
            aria-valuetext={`${Math.round(opacity * 100)} percent`}
            oninput={(event) =>
              composition.setSelectedOpacity(numberFrom(event) / 100)}
          />
          <ScrubbableNumber
            label="Opacity"
            value={opacity * 100}
            min={0}
            max={100}
            step={1}
            unit="%"
            showLabel={false}
            onchange={(value) => composition.setSelectedOpacity(value / 100)}
          />
        </div>
      </div>
    {:else}
      <!-- Neither a Look nor a Fit: today that is only the 3D view, whose own
           controls are not wired up yet. It still composes itself to its slot,
           so there is nothing to place. -->
      <div class="inspector-empty">
        <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>
        <p>This layer fills its slot on its own. Nothing to adjust yet.</p>
      </div>
    {/if}
  {:else}
    <div class="inspector-empty">
      <i class="fa-solid fa-arrow-pointer" aria-hidden="true"></i>
      <p>Select a slot on the canvas to edit what is in it.</p>
    </div>
  {/if}
</section>

<style>
  .inspector {
    display: grid;
    min-height: 0;
    align-content: start;
    gap: var(--studio-panel-gap, var(--spacing-lg));
  }

  .inspector.source-open {
    grid-template-rows: auto minmax(0, 1fr);
    height: 100%;
    align-content: stretch;
  }
  .inspector.shared-animation {
    grid-template-rows: minmax(0, 1fr);
    gap: 0;
  }

  /* SegmentedControl is width:100% by design, so a full-width parent stretches
     two short words across the whole rail — 359px per tab at 1920, 507px at
     4K. The switch is a control, not a progress bar: size it from the control
     height so it steps with the studio's own 105rem / 180rem tiers. In the
     heading row `flex` must be pinned too, because `flex-basis: auto` reads
     that same `width: 100%` off the child. */
  /* SegmentedControl is width:100% by design, so a consumer has to state both
     flex-basis and width. Same two-term cap as .control-group. */
  .switch-row,
  .switch-row.wide {
    flex: 0 0 auto;
    width: min(100%, max(calc(var(--studio-control-height, 2.75rem) * 8), 56%));
  }

  .inspector-heading,
  .group-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-md);
  }

  /* The name takes the slack so the switcher and Reset sit hard right, and a
     long source name never pushes them off the row. */
  .inspector-heading h3 {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .group-label {
    color: var(--theme-text-dim);
    font-size: var(--studio-meta-size, var(--font-size-compact));
    font-weight: 650;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  h3 {
    margin: 0;
    color: var(--theme-text);
    font-size: var(--studio-section-title-size, 1.15rem);
  }

  .reset-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-sm);
    min-height: var(--studio-control-height, 2.75rem);
    padding: 0.5rem 0.7rem;
    border: 1px solid var(--theme-stroke);
    border-radius: var(--radius-2026-sm);
    background: var(--theme-card-bg);
    color: var(--theme-text);
    font: inherit;
    font-size: var(--studio-meta-size, var(--font-size-compact));
    cursor: pointer;
  }

  .reset-button:disabled {
    opacity: 0.42;
    cursor: not-allowed;
  }

  .reset-button:focus-visible,
  input:focus-visible {
    outline: 3px solid var(--theme-accent);
    outline-offset: 2px;
  }

  /* The footage panel now owns the whole rail, which at 1920 is ~620px and at
     4K is wider still. A slider drawn edge to edge across that is harder to
     land on, not easier — the controls keep a measure and the rail keeps the
     slack. */
  /* A control column, not a progress bar. The absolute term keeps three short
     words from stretching across a 620px rail; the 70% term keeps the same
     proportion at 4K, where the rail more than doubles but the control-height
     token only grows by half — an absolute cap alone left 48% of the rail
     empty there. */
  .control-group {
    display: grid;
    gap: 0.75rem;
    max-width: min(
      100%,
      max(calc(var(--studio-control-height, 2.75rem) * 10), 70%)
    );
  }

  .fill-controls {
    padding-top: var(--spacing-md);
    border-top: 1px solid var(--theme-stroke);
  }

  .mirror-button {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: var(--spacing-sm);
    width: min(100%, calc(var(--studio-control-height, 2.75rem) * 11));
    min-height: var(--studio-control-height, 2.75rem);
    padding: 0.5rem 0.85rem;
    border: 1px solid var(--theme-stroke);
    border-radius: var(--radius-2026-sm);
    background: var(--theme-card-bg);
    color: var(--theme-text);
    font: inherit;
    font-size: var(--studio-body-size, var(--font-size-min));
    text-align: left;
    cursor: pointer;
  }

  .mirror-button.on {
    border-color: var(--theme-accent);
    background: color-mix(
      in srgb,
      var(--theme-accent) 22%,
      var(--theme-card-bg)
    );
  }

  .mirror-button:disabled {
    opacity: 0.42;
    cursor: progress;
  }

  .mirror-button:focus-visible {
    outline: 3px solid var(--theme-accent);
    outline-offset: 2px;
  }

  /* On and Off are different widths, so the slot is sized to the wider one and
     the word never drags the button's contents sideways as it toggles. */
  .mirror-state {
    min-width: 3ch;
    color: var(--theme-text-dim);
    font-size: var(--studio-meta-size, var(--font-size-compact));
    font-weight: 650;
    letter-spacing: 0.06em;
    text-align: right;
    text-transform: uppercase;
  }

  .mirror-button.on .mirror-state {
    color: var(--theme-accent);
  }

  /* No reserved height: the hint changes only when the selected layer changes,
     and that swaps the whole panel — there is no in-place text swap to hold
     space for, so a floor would only be dead rail. */
  .group-hint {
    margin: 0;
    color: var(--theme-text-dim);
    font-size: var(--studio-meta-size, var(--font-size-compact));
    line-height: 1.45;
  }

  .slider-row {
    display: grid;
    grid-template-columns: 5.25rem minmax(5rem, 1fr) 5rem;
    align-items: center;
    gap: 0.75rem;
    min-height: var(--studio-control-height, 2.75rem);
    color: var(--theme-text-dim);
    font-size: var(--studio-body-size, var(--font-size-min));
  }

  .slider-row input {
    width: 100%;
    height: var(--studio-control-height, 2.75rem);
    margin: 0;
    accent-color: var(--theme-accent);
    cursor: ew-resize;
  }

  .inspector-empty {
    display: grid;
    justify-items: center;
    gap: var(--spacing-md);
    padding: var(--spacing-xl) var(--spacing-md);
    color: var(--theme-text-dim);
    text-align: center;
  }

  .inspector-empty i {
    font-size: 1.5rem;
  }

  .inspector-empty p {
    margin: 0;
    font-size: var(--font-size-min);
    line-height: 1.45;
  }

  @container post-studio (max-width: 30rem) {
    /* Still one row at phone width — that is where the rail can least afford a
       band per idea. Two short tab labels need far less than the 22rem the
       desktop switch is sized to. */
    .switch-row {
      width: min(100%, 12rem);
    }

    .slider-row {
      grid-template-columns: 4.5rem minmax(4rem, 1fr) 5rem;
      gap: var(--spacing-sm);
    }
  }
</style>
