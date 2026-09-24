<script lang="ts">
  import {
    Plane,
    PLANE_COLORS,
    PLANE_LABELS,
    PRIMARY_PLANES,
  } from "@austencloud/scene-3d";
  import { getViewer3DContext } from "../context/viewer-3d-context";
  import CascadeBadge from "./controls/CascadeBadge.svelte";
  import PlanesDiagram from "./PlanesDiagram.svelte";
  import SettingToggleButton from "$lib/shared/settings/components/SettingToggleButton.svelte";
  import {
    reportViewerControlChange,
    type ViewerControlSink,
  } from "$lib/shared/sequence-viewer/domain/viewer-control-analytics";

  interface Props {
    onSettingChange?: ViewerControlSink;
  }
  let { onSettingChange }: Props = $props();

  const viewer = getViewer3DContext();
  const selectedIndex = $derived(viewer.primaryPerformerIndex);
  const isAllMode = $derived(viewer.isAllPerformersSelected);
  const selected = $derived(
    selectedIndex === null
      ? null
      : (viewer.performerManager.performers[selectedIndex] ?? null)
  );
  const scopedPerformers = $derived(viewer.scopedPerformers());
  const isMultiMode = $derived(scopedPerformers.length > 1 && !isAllMode);
  // With None selected a hand-plane write has no target, so the chips go
  // inert instead of dropping the click. Plane visibility stays scene-wide.
  const noScope = $derived(scopedPerformers.length === 0);

  // The full nine-plane catalog, derived from the enum so a new plane can
  // never be missing here. Enum order already groups the fusion planes by
  // subset (shields, ramps, wings).
  const ALL_PLANES = Object.values(Plane) as Plane[];
  const PRIMARY_ROWS = ALL_PLANES.filter((p) => PRIMARY_PLANES.has(p));
  const FUSION_ROWS = ALL_PLANES.filter((p) => !PRIMARY_PLANES.has(p));

  // Row labels stay short: "Wall Plane" → "Wall"; fusion labels ("Right
  // Shield") carry no suffix in PLANE_LABELS.
  function shortLabel(plane: Plane): string {
    return PLANE_LABELS[plane].replace(/ Plane$/, "");
  }

  function sharedPlane(hand: "left" | "right"): Plane | null {
    const defaultPlane =
      hand === "left"
        ? viewer.defaultSettings.customLeftPlane
        : viewer.defaultSettings.customRightPlane;
    const first =
      hand === "left"
        ? scopedPerformers[0]?.effectiveLeftPlane
        : scopedPerformers[0]?.effectiveRightPlane;
    if (!first) return defaultPlane;

    const everyoneMatches = scopedPerformers.every((performer) =>
      hand === "left"
        ? performer.effectiveLeftPlane === first
        : performer.effectiveRightPlane === first
    );
    return everyoneMatches ? first : null;
  }

  const leftPlane = $derived(
    isAllMode || isMultiMode
      ? sharedPlane("left")
      : (selected?.effectiveLeftPlane ?? Plane.WALL)
  );

  const rightPlane = $derived(
    isAllMode || isMultiMode
      ? sharedPlane("right")
      : (selected?.effectiveRightPlane ?? Plane.WALL)
  );

  const isOverridden = $derived(
    !isAllMode && !isMultiMode && (selected?.hasOverride.planes ?? false)
  );
  const overrideCount = $derived(
    scopedPerformers.filter((performer) => performer.hasOverride.planes).length
  );

  function hasHandOnPlane(plane: Plane): boolean {
    return leftPlane === plane || rightPlane === plane;
  }

  function isVisible(plane: Plane): boolean {
    return viewer.visiblePlanes.has(plane);
  }

  const hasStepOverrides = $derived(
    scopedPerformers.some((performer) => performer.hasStepOverrides)
  );

  // visiblePlanes is genuinely global scene state (single $state on the
  // viewer, not scoped per performer - see viewer-3d-state.svelte.ts). The
  // all-mode reset branch calls hideAllPlanes() so it's fair to count toward
  // "non-default" there; the per-performer branch deliberately does NOT touch
  // it (a single performer's reset shouldn't hide guide rings for the whole
  // scene), so it must not count there either - otherwise Reset can never
  // reach a state where it disappears again.
  const isPlaneStateNonDefault = $derived(
    leftPlane !== viewer.defaultSettings.customLeftPlane ||
      rightPlane !== viewer.defaultSettings.customRightPlane ||
      hasStepOverrides ||
      (isAllMode && viewer.visiblePlanes.size > 0)
  );

  function handlePlaneToggleClick(e: MouseEvent, plane: Plane) {
    e.stopPropagation();
    const previous = isVisible(plane);
    viewer.togglePlane(plane);
    reportViewerControlChange(
      onSettingChange,
      "viewer_3d_planes",
      `${String(plane).toLowerCase()}_visible`,
      previous,
      !previous
    );
  }

  function handleHandSlotClick(
    e: MouseEvent,
    hand: "left" | "right",
    plane: Plane
  ) {
    e.stopPropagation();
    const currentPlane = hand === "left" ? leftPlane : rightPlane;
    if (currentPlane === plane) return;

    viewer.setHandPlaneScoped(hand, plane);
    reportViewerControlChange(
      onSettingChange,
      "viewer_3d_planes",
      `${hand}_plane`,
      currentPlane,
      plane
    );
  }

  function handleResetPlanesClick(e: MouseEvent) {
    e.stopPropagation();
    viewer.resetPlanesScoped();
    if (isAllMode) viewer.hideAllPlanes();
    reportViewerControlChange(
      onSettingChange,
      "viewer_3d_planes",
      isAllMode ? "reset_all" : "reset_performer",
      false,
      true
    );
  }

  function resetAllOverrides(): void {
    viewer.resetPlanesScoped();
    reportViewerControlChange(
      onSettingChange,
      "viewer_3d_planes",
      "reset_all_overrides",
      false,
      true
    );
  }

  function resetSelectedPlanes(): void {
    viewer.resetPlanesScoped();
    reportViewerControlChange(
      onSettingChange,
      "viewer_3d_planes",
      "reset_performer_override",
      false,
      true
    );
  }

  function toggleGridLabels(e: MouseEvent): void {
    e.stopPropagation();
    const previous = viewer.showGridLabels;
    viewer.toggleGridLabels();
    reportViewerControlChange(
      onSettingChange,
      "viewer_3d_planes",
      "location_labels",
      previous,
      !previous
    );
  }
</script>

<div class="planes-popover">
  {#if (isAllMode || isMultiMode) && overrideCount > 0}
    <CascadeBadge
      mode="overrides"
      {overrideCount}
      categoryLabel="planes"
      onReset={resetAllOverrides}
    />
  {:else if !isAllMode && !isMultiMode && isOverridden}
    <CascadeBadge mode="custom" onReset={resetSelectedPlanes} />
  {:else if !isAllMode && !isMultiMode}
    <CascadeBadge mode="default" />
  {/if}

  <div class="planes-header">
    <p class="planes-hint">
      Each hand spins in one plane. Tap <strong>Left</strong> or
      <strong>Right</strong> to move that hand; the eye shows or hides a plane's guide
      ring.
    </p>
    <button
      class="reset-btn"
      class:with-overrides={hasStepOverrides}
      class:reset-btn-hidden={!isPlaneStateNonDefault}
      onclick={handleResetPlanesClick}
      aria-hidden={!isPlaneStateNonDefault}
      tabindex={isPlaneStateNonDefault ? 0 : -1}
      aria-label={hasStepOverrides
        ? "Reset all planes and clear step overrides"
        : "Reset all planes"}
      title={hasStepOverrides
        ? "Reset all planes and clear step overrides"
        : "Reset all planes"}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M3 7v6h6" />
        <path d="M21 17a9 9 0 0 0-15-6.7L3 13" />
      </svg>
      Reset
      {#if hasStepOverrides}
        <span class="override-badge" aria-hidden="true"></span>
      {/if}
    </button>
  </div>

  <div class="planes-body">
    <PlanesDiagram
      {leftPlane}
      {rightPlane}
      visiblePlanes={viewer.visiblePlanes}
    />

    <div class="plane-matrix">
      <div class="plane-group" role="group" aria-label="Primary planes">
        <span class="group-label">Primary</span>
        {#each PRIMARY_ROWS as plane (plane)}
          {@render planeRow(plane)}
        {/each}
      </div>
      <div class="plane-group" role="group" aria-label="Fusion planes">
        <span class="group-label">
          Fusion <span class="group-hint">45° between primaries</span>
        </span>
        {#each FUSION_ROWS as plane (plane)}
          {@render planeRow(plane)}
        {/each}
      </div>
    </div>

    {#snippet planeRow(plane: Plane)}
      {@const label = shortLabel(plane)}
      {@const visible = isVisible(plane)}
      {@const handAssigned = hasHandOnPlane(plane)}
      {@const color = PLANE_COLORS[plane]}
      <div
        class="plane-row"
        class:with-hand={handAssigned}
        class:hidden-row={!visible}
      >
        <button
          class="plane-left"
          onclick={(e) => handlePlaneToggleClick(e, plane)}
          aria-pressed={visible}
        >
          <span
            class="plane-toggle"
            class:visible
            class:hidden={!visible}
            style="--dot-color: {color};"
          >
            <i
              class="plane-eye {visible ? 'fas fa-eye' : 'fas fa-eye-slash'}"
              aria-hidden="true"
            ></i>
          </span>
          <span class="plane-name">
            <span class="plane-label">{label}</span>
            <span class="eye-state">{visible ? "Shown" : "Hidden"}</span>
          </span>
        </button>
        <div class="plane-right">
          <button
            class="hand-chip blue"
            class:filled={leftPlane === plane}
            onclick={(e) => handleHandSlotClick(e, "left", plane)}
            disabled={noScope}
            aria-pressed={leftPlane === plane}
            aria-label={`Left hand on ${label}`}
          >
            Left
          </button>
          <button
            class="hand-chip red"
            class:filled={rightPlane === plane}
            onclick={(e) => handleHandSlotClick(e, "right", plane)}
            disabled={noScope}
            aria-pressed={rightPlane === plane}
            aria-label={`Right hand on ${label}`}
          >
            Right
          </button>
        </div>
      </div>
    {/snippet}
  </div>

  <SettingToggleButton
    label="Location labels"
    checked={viewer.showGridLabels}
    onToggle={toggleGridLabels}
    surface="inset"
    density="compact"
  />
</div>

<style>
  .plane-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 12px;
    min-height: 44px;
    border-radius: 10px;
    background: var(--surface-inset-deep);
    border: 1px solid var(--theme-stroke);
    transition:
      background 180ms cubic-bezier(0.2, 0, 0.13, 1.5),
      border-color 180ms cubic-bezier(0.2, 0, 0.13, 1.5),
      box-shadow 180ms cubic-bezier(0.2, 0, 0.13, 1.5),
      color 180ms cubic-bezier(0.2, 0, 0.13, 1.5),
      transform 180ms cubic-bezier(0.2, 0, 0.13, 1.5);
  }

  .plane-row:hover {
    background: var(--surface-darker);
    border-color: var(--theme-stroke-strong);
  }

  .plane-row.with-hand {
    background: var(--theme-card-bg);
    border-color: var(--theme-stroke-strong);
  }

  .plane-row.hidden-row {
    opacity: 0.55;
  }

  .plane-left {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
    min-width: 0;
    min-height: 44px;
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
    text-align: left;
  }

  .plane-right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .plane-toggle {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    cursor: pointer;
    border: 2px solid;
    display: flex;
    align-items: center;
    justify-content: center;
    transition:
      background 180ms cubic-bezier(0.2, 0, 0.13, 1.5),
      border-color 180ms cubic-bezier(0.2, 0, 0.13, 1.5),
      box-shadow 180ms cubic-bezier(0.2, 0, 0.13, 1.5),
      color 180ms cubic-bezier(0.2, 0, 0.13, 1.5),
      transform 180ms cubic-bezier(0.2, 0, 0.13, 1.5);
    background: transparent;
    flex-shrink: 0;
    padding: 0;
    color: var(--theme-text);
  }

  .plane-eye {
    font-size: 14px;
    line-height: 1;
    text-shadow: 0 0 2px var(--surface-darker);
  }

  .plane-toggle.visible {
    background: var(--dot-color);
    border-color: var(--dot-color);
    box-shadow: 0 0 14px color-mix(in srgb, var(--dot-color) 45%, transparent);
    color: var(--theme-text);
  }

  .plane-toggle.hidden {
    background: transparent;
    border-color: color-mix(in srgb, var(--dot-color) 50%, transparent);
    color: var(--dot-color);
  }

  .plane-toggle:hover {
    transform: scale(1.1);
  }

  .plane-label {
    font-size: 14px;
    font-weight: 600;
    color: var(--theme-text);
  }

  .plane-row.hidden-row .plane-label {
    color: var(--theme-text-dim);
  }

  .reset-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 6px 12px;
    min-height: 44px;
    border-radius: 8px;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    color: var(--theme-text-dim);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    position: relative;
    flex-shrink: 0;
    transition:
      background 180ms cubic-bezier(0.2, 0, 0.13, 1.5),
      border-color 180ms cubic-bezier(0.2, 0, 0.13, 1.5),
      box-shadow 180ms cubic-bezier(0.2, 0, 0.13, 1.5),
      color 180ms cubic-bezier(0.2, 0, 0.13, 1.5),
      transform 180ms cubic-bezier(0.2, 0, 0.13, 1.5);
  }

  .reset-btn:hover {
    color: var(--theme-text);
    border-color: var(--theme-stroke-strong);
    background: var(--theme-card-hover-bg);
    transform: translateY(-1px);
  }

  .reset-btn.with-overrides .override-badge {
    position: absolute;
    top: -3px;
    right: -3px;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--semantic-warning);
    border: 1.5px solid var(--surface-darker);
  }

  .reset-btn.reset-btn-hidden {
    visibility: hidden;
    pointer-events: none;
  }

  .planes-popover {
    display: flex;
    flex-direction: column;
    gap: 10px;
    /* One band for header, body, and toggle: diagram (10rem) + gap + matrix
       (34rem). Centered so wide docks split the leftover evenly. */
    max-width: 45rem;
    margin-inline: auto;
    container-type: inline-size;
    container-name: planes-popover;
  }

  .planes-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
  }
  .planes-hint {
    margin: 0;
    color: var(--theme-text-dim);
    font-size: 14px;
    line-height: 1.45;
    max-width: 34rem;
  }
  .planes-hint strong {
    color: var(--theme-text);
    font-weight: 700;
  }
  .planes-body {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .planes-body :global(.planes-diagram) {
    flex: 0 0 auto;
    width: clamp(7rem, 26%, 10rem);
  }
  .plane-matrix {
    display: flex;
    flex-direction: column;
    gap: 12px;
    flex: 1;
    min-width: 0;
    max-width: 34rem;
  }
  .plane-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }
  .group-label {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding-inline: 2px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--theme-text-tertiary);
  }
  .group-hint {
    font-weight: 600;
    letter-spacing: normal;
    text-transform: none;
    color: var(--theme-text-tertiary);
  }
  .plane-name {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }
  .eye-state {
    color: var(--theme-text-tertiary);
    font-size: 12px;
    font-weight: 600;
  }
  .hand-chip {
    min-width: 3.75rem;
    min-height: 44px;
    padding: 0 12px;
    border-radius: 22px;
    border: 2px solid;
    background: transparent;
    cursor: pointer;
    font-size: 13px;
    font-weight: 750;
    transition:
      background 180ms cubic-bezier(0.2, 0, 0.13, 1.5),
      border-color 180ms cubic-bezier(0.2, 0, 0.13, 1.5),
      box-shadow 180ms cubic-bezier(0.2, 0, 0.13, 1.5),
      color 180ms cubic-bezier(0.2, 0, 0.13, 1.5);
    flex-shrink: 0;
  }
  .hand-chip.blue {
    border-color: color-mix(
      in srgb,
      var(--prop-blue) 45%,
      var(--theme-text-dim)
    );
    color: color-mix(in srgb, var(--prop-blue) 55%, var(--theme-text));
  }
  .hand-chip.red {
    border-color: color-mix(
      in srgb,
      var(--prop-red) 45%,
      var(--theme-text-dim)
    );
    color: color-mix(in srgb, var(--prop-red) 55%, var(--theme-text));
  }
  .hand-chip:hover:not(.filled):not(:disabled).blue {
    border-color: color-mix(in srgb, var(--prop-blue) 75%, transparent);
    box-shadow: 0 0 10px color-mix(in srgb, var(--prop-blue) 20%, transparent);
  }
  .hand-chip:hover:not(.filled):not(:disabled).red {
    border-color: color-mix(in srgb, var(--prop-red) 75%, transparent);
    box-shadow: 0 0 10px color-mix(in srgb, var(--prop-red) 20%, transparent);
  }
  .hand-chip.filled.blue {
    background: var(--prop-blue);
    border-color: var(--prop-blue);
    color: white;
    box-shadow: 0 0 12px color-mix(in srgb, var(--prop-blue) 50%, transparent);
  }
  .hand-chip.filled.red {
    background: color-mix(in srgb, var(--prop-red) 85%, black);
    border-color: color-mix(in srgb, var(--prop-red) 85%, black);
    color: white;
    box-shadow: 0 0 12px color-mix(in srgb, var(--prop-red) 50%, transparent);
  }
  .hand-chip:disabled {
    opacity: 0.35;
    cursor: not-allowed;
    box-shadow: none;
  }
  .hand-chip:disabled:not(.filled) {
    border-color: var(--theme-stroke);
    color: var(--theme-text-dim);
  }
  @container planes-popover (max-width: 460px) {
    .planes-body {
      flex-direction: column;
      align-items: stretch;
    }
    .planes-body :global(.planes-diagram) {
      width: clamp(7rem, 45%, 10rem);
      margin: 0 auto;
    }
  }
</style>
