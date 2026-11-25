<!-- LoopWorkbench - Construct's own pickers under a LOOP bar. A finished LOOP
     takes the pickers' place, and so do its film and all five side by side. -->
<script lang="ts">
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
  import { setOptionControlsHostContext } from "#lib/features/create/construct/option-picker/context/option-controls-host-context.js";
  import { setOptionMarkContext } from "#lib/features/create/construct/option-picker/context/option-mark-context.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { Crossfade, opaqueFade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import { onDestroy, type Snippet } from "svelte";
  import { getLoopBuilderContext } from "../context/loop-builder-context";
  import { loopFamily } from "../domain/loop-families";
  import LoopBar from "./LoopBar.svelte";
  import LoopCompare from "./LoopCompare.svelte";
  import LoopDone from "./LoopDone.svelte";
  import LoopExplainer from "./LoopExplainer.svelte";
  import LoopFilm from "./LoopFilm.svelte";
  import LoopTypeMenu from "./LoopTypeMenu.svelte";

  let {
    tools,
  }: {
    /** Construct's start and step pickers, narrowed to closing steps on ask. */
    tools: Snippet<
      [((option: PictographData) => boolean) | undefined, boolean]
    >;
  } = $props();

  const { state: loop } = getLoopBuilderContext();
  const menuId = "loop-type-menu-list";

  let menuOpen = $state(false);
  let trigger = $state<HTMLButtonElement | null>(null);
  let film = $state<LoopFilm | null>(null);

  const shown = $derived.by(() => {
    if (loop.view === "watch" && loop.made) return "watch";
    if (loop.view === "compare") return "compare";
    return loop.stage === "made" ? "done" : "tools";
  });
  /** Only the closing steps are showing, with one way back to all of them. */
  const narrowed = $derived(shown === "tools" && loop.closing);

  // Construct's list puts this mark on the steps that close the LOOP.
  const mark = $derived.by(() => {
    if (!loop.marks) return null;
    const { icon, color, on } = loopFamily(loop.family);
    return { icon, color, on, label: t("create_loop_mark_label") };
  });
  setOptionMarkContext({
    get mark() {
      return mark;
    },
    isMarked: loop.isMarked,
    onListed: loop.noteListed,
  });
  // The bar says what to do next; the steps come straight after it.
  setOptionControlsHostContext({ preferTucked: () => true });

  function closeMenu(): void {
    if (!menuOpen) return;
    menuOpen = false;
    trigger?.focus({ preventScroll: true });
  }

  onDestroy(() => (menuOpen = false));
</script>

<div class="workbench">
  <LoopBar
    {menuOpen}
    {menuId}
    onToggleMenu={() => (menuOpen = !menuOpen)}
    onReplay={() => film?.replay()}
    bind:trigger
  />
  <div class="stage">
    <!-- The pickers stay mounted under the film and All five, so they come
         back already drawn. -->
    <div
      class="tools"
      class:away={shown !== "tools"}
      class:narrowed
      inert={shown !== "tools"}
    >
      {@render tools(loop.filter, true)}
    </div>
    <div class="over" class:idle={shown === "tools"}>
      <Crossfade key={shown} fill duration={DURATION.emphasis}>
        {#if shown === "watch" && loop.made}
          <LoopFilm made={loop.made} bind:this={film} />
        {:else if shown === "compare"}
          <LoopCompare />
        {:else if shown === "done"}
          <LoopDone />
        {/if}
      </Crossfade>
    </div>
    {#if narrowed}
      <div class="way" transition:opaqueFade={{ duration: DURATION.normal }}>
        <button type="button" onclick={loop.showAllSteps}>
          <i class="fas fa-xmark" aria-hidden="true"></i>
          <span>{t("create_loop_show_all")}</span>
        </button>
      </div>
    {/if}
  </div>
  <LoopTypeMenu id={menuId} open={menuOpen} onClose={closeMenu} />
  <LoopExplainer />
</div>

<style>
  .workbench {
    --loop-tab: #ec4899;
    --loop-tap: var(--alt-touch-target, 36px);
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    color: var(--theme-text);
    container: loop / size;
  }

  /* Construct's pickers lift their own rows (the filter row sits at z-index
     20); kept in a layer of their own, they stay under the LOOP bar and the
     LOOP type menu. */
  .stage {
    position: relative;
    isolation: isolate;
    display: grid;
    flex: 1;
    grid-template: minmax(0, 1fr) / minmax(0, 1fr);
    min-height: 0;
  }

  .tools,
  .over {
    position: relative;
    grid-area: 1 / 1;
    min-width: 0;
    min-height: 0;
  }

  /* Construct's pickers size themselves against the room they really get,
     under the bar, not the whole panel. */
  .tools {
    display: flex;
    flex-direction: column;
    container: tool-panel / size;
    transition:
      opacity var(--duration-normal) var(--ease-standard) var(--duration-normal),
      padding var(--duration-normal) var(--ease-in-out),
      visibility 0s linear var(--duration-normal);
  }

  .tools.away {
    opacity: 0;
    visibility: hidden;
    transition:
      opacity var(--duration-normal) var(--ease-standard),
      visibility 0s linear var(--duration-normal);
  }

  .tools.narrowed {
    padding-bottom: calc(var(--loop-tap) + 1rem);
  }

  .over.idle {
    pointer-events: none;
  }

  .way {
    position: absolute;
    z-index: 1;
    inset-inline: 0;
    bottom: 0.5rem;
    display: grid;
    place-items: center;
    pointer-events: none;
  }

  .way button {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    min-height: var(--loop-tap);
    padding: 0 1rem;
    border: 1px solid var(--theme-stroke);
    border-radius: 1.375rem;
    background: var(--surface-panel-opaque);
    color: var(--theme-text);
    font: inherit;
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
    pointer-events: auto;
    transition: background-color var(--duration-fast) var(--ease-out);
    -webkit-tap-highlight-color: transparent;
  }

  .way i {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
  }

  .way button:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  @media (hover: hover) {
    .way button:hover {
      background: color-mix(
        in srgb,
        var(--theme-text) 8%,
        var(--surface-panel-opaque)
      );
    }
  }

  /* Tablets and computers: full-size buttons. */
  @media (min-width: 48rem) and (min-height: 34rem) {
    .workbench {
      --loop-tap: var(--min-touch-target, 44px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .tools,
    .tools.away,
    .way button {
      transition: none;
    }
  }
</style>
