<script lang="ts">
  import { onDestroy, type Snippet } from "svelte";
  import { getAnimationVisibilityManager } from "../../state/animation-visibility-state.svelte";
  import { getAnimationVisibilityContext } from "../../state/animation-visibility-context";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import { getViewerPathContext } from "$lib/shared/sequence-viewer/context/viewer-path-context";
  import { showToast } from "$lib/shared/toast/state/toast-state.svelte";

  let {
    onSettingChange,
    preview,
    showHelp = true,
  }: {
    onSettingChange?: (previousValue: string, value: string) => void;
    preview?: Snippet<["arc" | "linear" | "concave" | "hybrid", number]>;
    showHelp?: boolean;
  } = $props();

  const vm = getAnimationVisibilityContext() ?? getAnimationVisibilityManager();
  const viewerPaths = getViewerPathContext();
  let session = $state(vm.getPathSession());
  let previewWidth = $state(0);

  let pathShape = $state(vm.getPathShape());
  let motionAware = $state(vm.getMotionAwarePaths());

  function handleVisibilityChange(): void {
    pathShape = vm.getPathShape();
    motionAware = vm.getMotionAwarePaths();
    session = vm.getPathSession();
  }

  vm.registerObserver(handleVisibilityChange);
  onDestroy(() => vm.unregisterObserver(handleVisibilityChange));

  // These choices change the movement even when path guides are hidden.
  // Hybrid is a peer option: selecting a fixed shape always turns it off.
  interface PathOption {
    id: "arc" | "linear" | "concave" | "byMotion";
    label: string;
    color: string;
    caption: string;
    /** SVG path(s) in a 24×12 viewBox; dots share the path endpoints. */
    glyph: string[];
    dots: [number, number][];
  }

  const options: PathOption[] = [
    {
      id: "arc",
      label: "Arc",
      color: "#60a5fa",
      caption: "Hands swing along the circle",
      glyph: ["M3 9.5 Q12 0.5 21 9.5"],
      dots: [
        [3, 9.5],
        [21, 9.5],
      ],
    },
    {
      id: "linear",
      label: "Linear",
      color: "#f97316",
      caption: "Hands cut straight across",
      glyph: ["M3 6 L21 6"],
      dots: [
        [3, 6],
        [21, 6],
      ],
    },
    {
      id: "concave",
      label: "Concave",
      color: "#a78bfa",
      caption: "Hands curve in toward center",
      glyph: ["M3 2.5 Q12 11.5 21 2.5"],
      dots: [
        [3, 2.5],
        [21, 2.5],
      ],
    },
    {
      id: "byMotion",
      label: "Hybrid",
      color: "#2dd4bf",
      caption: "Pro → Arc · Anti → Concave",
      glyph: ["M3 6 Q12 -1 21 6", "M3 6 Q12 13 21 6"],
      dots: [
        [3, 6],
        [21, 6],
      ],
    },
  ];

  const isActive = (o: PathOption): boolean =>
    o.id === "byMotion" ? motionAware : !motionAware && pathShape === o.id;
  const selected = $derived(options.find(isActive) ?? options[0]!);

  function select(o: PathOption): void {
    const previous = motionAware ? "byMotion" : pathShape;
    vm.setPathPolicy({
      pathShape: o.id === "byMotion" ? pathShape : o.id,
      motionAwarePaths: o.id === "byMotion",
    });
    onSettingChange?.(previous, o.id);
  }

  function makeDefault(): void {
    try {
      vm.makePathsDefault();
      showToast("Motion path default saved", "success");
    } catch {
      showToast("Couldn't save the motion path default", "error");
    }
  }
</script>

<!-- Header doubles as the explanation slot: section label left, the selected
     option's caption right. Fixed single-line row — captions swap with no
     layout shift. -->
<div class="path-header">
  <span class="rt-section-label">Motion paths</span>
  <span class="path-caption" style:color={selected.color}
    >{selected.caption}</span
  >
</div>

<div
  class="path-shape-grid"
  class:with-preview={!!preview}
  bind:clientWidth={previewWidth}
>
  {#each options as option (option.id)}
    <button
      class="path-btn"
      class:active={isActive(option)}
      type="button"
      aria-pressed={isActive(option)}
      onclick={() => select(option)}
      style:--path-color={option.color}
    >
      {#if preview}
        <span class="path-preview" aria-hidden="true">
          {@render preview(
            option.id === "byMotion" ? "hybrid" : option.id,
            Math.max(1, (previewWidth - 8) / 2 - 20)
          )}
        </span>
      {:else}
        <svg class="path-glyph" viewBox="0 0 24 12" aria-hidden="true">
          {#each option.glyph as d}
            <path {d} />
          {/each}
          {#each option.dots as [cx, cy]}
            <circle {cx} {cy} r="1.8" />
          {/each}
        </svg>
      {/if}
      <span>{option.label}</span>
    </button>
  {/each}
</div>

{#if session}
  <p class="path-scope" aria-live="polite">
    {session.preview ? "Preview for this sequence" : "Saved paths"}
    {#if session.overrideCount > 0}
      · {session.overrideCount} step {session.overrideCount === 1
        ? "exception"
        : "exceptions"}{session.preview ? " overridden" : ""}
    {/if}
  </p>
  <div class="path-actions">
    <PanelButton
      disabled={!session.preview}
      onclick={() => vm.restoreSavedPaths()}>Restore saved paths</PanelButton
    >
    {#if viewerPaths?.canSave}
      <PanelButton
        disabled={!session.preview || viewerPaths.saving}
        onclick={() => viewerPaths.save()}
        ariaBusy={viewerPaths.saving}>Save paths</PanelButton
      >
    {/if}
    <PanelButton onclick={makeDefault}>Make default</PanelButton>
  </div>
{/if}

{#if showHelp}
  <a
    class="path-help"
    href="/guide/motion-paths"
    target="_blank"
    rel="noopener noreferrer"
  >
    About motion paths <span class="sr-only">(opens in a new tab)</span>
  </a>
{/if}

<style>
  .path-help {
    display: inline-flex;
    align-items: center;
    min-height: var(--min-touch-target, 44px);
    color: var(--theme-accent);
    font-size: var(--font-size-sm, 14px);
    text-underline-offset: 3px;
  }
  .path-help:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }
  .path-shape-grid.with-preview {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--spacing-sm, 8px);
  }
  .path-preview {
    display: block;
    width: 100%;
    aspect-ratio: 1;
    min-width: 0;
    pointer-events: none;
  }
  .with-preview .path-btn {
    padding: var(--spacing-sm, 8px);
    min-width: 0;
  }
  .path-scope {
    color: var(--theme-text-muted);
    font-size: var(--font-size-sm, 14px);
    min-height: 2.8em;
    margin: 8px 0;
  }

  .path-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .path-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    min-height: 1.2em;
  }

  .path-caption {
    font-size: var(--font-size-compact, 12px);
    opacity: 0.85;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
    transition: color var(--duration-fast, 100ms) ease;
  }

  .path-shape-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
    margin-top: 2px;
  }

  .path-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    min-height: var(--min-touch-target, 44px);
    padding: 6px 2px;
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-min, 14px);
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
    transition:
      background-color var(--duration-fast, 100ms) ease,
      border-color var(--duration-fast, 100ms) ease;
  }

  .path-glyph {
    width: 26px;
    height: 13px;
    overflow: visible;
  }
  .path-glyph path {
    fill: none;
    stroke: var(--path-color);
    stroke-width: 1.6;
    stroke-linecap: round;
    opacity: 0.9;
  }
  .path-glyph circle {
    fill: var(--path-color);
  }

  .path-btn:hover {
    background: color-mix(in srgb, var(--theme-text) 8%, transparent);
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    color: var(--theme-text, white);
  }

  .path-btn.active {
    background: color-mix(in srgb, var(--path-color) 20%, transparent);
    border-color: color-mix(in srgb, var(--path-color) 50%, transparent);
    color: var(--theme-text, white);
  }

  .path-btn:focus-visible {
    outline: 2px solid var(--path-color, #60a5fa);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .path-btn,
    .path-caption {
      transition: none;
    }
  }
</style>
