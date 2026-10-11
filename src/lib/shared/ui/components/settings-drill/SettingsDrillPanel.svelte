<!--
SettingsDrillPanel.svelte — one-decision-at-a-time settings container.

Root is a list of rows, each showing a setting's current value. Choosing a row
gives that one setting the whole panel, with a back arrow. Nothing else is on
screen while the user decides.

The default list stays one column. Customize opts into a centered choice grid
for wide stages; detail screens still use the whole panel. A persistent
list-plus-detail split was removed because it made the drawer much wider than
its siblings and stretched a short form through a tall pane.

SCROLLER DISCIPLINE — this component owns it, and nothing inside a detail may
declare a scroller of its own. `.layer-body` is the single `overflow-y: auto`
element. The panel this replaced had four nested candidates, and an expanded
section flex-shrank below its content and clipped 415px against its own
`overflow: hidden` instead of letting the scroller scroll. Children are
`flex: 0 0 auto` for that reason.

Motion is a horizontal push. ONE keyed layer, intro only, no `out:` — two
`{#if}` branches each carrying their own out-transition left the outgoing layer
in the DOM long past its duration (seconds, on light content too), which meant
two scrollers and a stale hit-testable list under the detail. An intro-only
keyed block removes the old layer synchronously, so the stage provably holds
exactly one layer.

Deliberately NOT `<Crossfade>`: that primitive keys on `{#key}` and remounts its
children, and detail bodies here are heavy pictograph grids — the carve-out
named in .claude/rules/crossfade-primitive.md.
-->
<script module lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  export type SettingsDrillItem = {
    id: string;
    label: string;
    value: string;
    disabled?: boolean;
    disabledReason?: string;
  };
</script>

<script lang="ts">
  import { fly } from "svelte/transition";
  import { quintOut } from "svelte/easing";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import type { Snippet } from "svelte";
  import SettingsDrillRow from "./SettingsDrillRow.svelte";

  let {
    items,
    selected = $bindable(null),
    detail,
    listHeader,
    listContent,
    onSelect,
    choiceLayout = "list",
  }: {
    items: SettingsDrillItem[];
    /** Currently drilled-into item id, or null for the root list. */
    selected?: string | null;
    /** Renders the body for a given item id. */
    detail: Snippet<[string]>;
    /** Pinned above the list — notes, hints. */
    listHeader?: Snippet;
    /** Optional custom landing content. The drill still owns navigation. */
    listContent?: Snippet;
    onSelect?: (id: string | null) => void;
    choiceLayout?: "list" | "cards";
  } = $props();

  const activeItem = $derived(items.find((i) => i.id === selected) ?? null);

  let reducedMotion = $state(
    typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  $effect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e: MediaQueryListEvent) => {
      reducedMotion = e.matches;
    };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  });

  // Svelte transitions are JS-driven, so a CSS `transition: none` can't stop
  // them — collapse the duration instead.
  const motionMs = $derived(reducedMotion ? 0 : DURATION.normal);

  // Push slides in from the right, pop slides back in from the left.
  const enterX = $derived(activeItem ? 32 : -32);

  function choose(item: SettingsDrillItem) {
    // A locked row explains itself in place; it never navigates to a detail
    // the user can't act on.
    if (item.disabled) return;
    selected = item.id;
    onSelect?.(item.id);
  }

  function goBack() {
    selected = null;
    onSelect?.(null);
  }
</script>

<div class="drill-panel">
  {#key selected ?? "__root__"}
    <div class="stage">
      <div
        class="layer"
        in:fly={{ x: enterX, duration: motionMs, easing: quintOut }}
      >
        {#if !activeItem}
          {#if listHeader}
            <div class="layer-header">{@render listHeader()}</div>
          {/if}
          <div
            class="layer-body themed-scrollbar"
            class:cards={choiceLayout === "cards"}
          >
            {#if listContent}
              {@render listContent()}
            {:else}
              <div class="row-list" class:cards={choiceLayout === "cards"}>
                {#each items as item (item.id)}
                  <SettingsDrillRow
                    label={item.label}
                    value={item.value}
                    disabled={item.disabled}
                    disabledReason={item.disabledReason}
                    onclick={() => choose(item)}
                  />
                {/each}
              </div>
            {/if}
          </div>
        {:else}
          <div class="layer-header detail-title-row">
            <button
              class="back-button"
              type="button"
              onclick={goBack}
              aria-label={t("settings_back_all")}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                aria-hidden="true"
              >
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </button>
            <h4 class="detail-title">{activeItem.label}</h4>
          </div>
          <div class="layer-body themed-scrollbar">
            {@render detail(activeItem.id)}
          </div>
        {/if}
      </div>
    </div>
  {/key}
</div>

<style>
  .drill-panel {
    flex: 1;
    min-height: 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .stage {
    position: relative;
    flex: 1;
    min-height: 0;
  }

  .layer {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .layer-header {
    flex-shrink: 0;
  }

  /* The one scroller. Vertical only: `overflow-x` left at its `visible` initial
     value does NOT stay visible once the other axis is `auto` — CSS computes it
     to `auto` too, so any child overshooting the pane by a pixel (a translated
     card slot, a shadow-bearing control) hangs a horizontal scrollbar across the
     bottom of the panel. Detail bodies are laid out to the pane's width; there
     is nothing to scroll to sideways. */
  .layer-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    overscroll-behavior: contain;
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
  }

  /* Content-sized: `flex-shrink: 0` stops a child absorbing its own overflow
     and clipping instead of letting the body scroll; `flex-grow: 0` stops a
     child that declares `flex: 1` for some other host (GenerationStylePanel does,
     from its accordion days) stretching and centering itself in a tall pane. */
  .layer-body > :global(*) {
    flex: 0 0 auto;
  }

  /* Opt-in for a wrapper that should take the remaining height — used by the
     pictograph grids so they can size against it. */
  .layer-body > :global(.drill-fill) {
    flex: 1 1 auto;
    min-height: 0;
    max-width: 100%;
  }

  /* Opt-in for a form that pins its own footer to the bottom of the pane. It
     takes the remaining height like `.drill-fill`, but never shrinks below its
     own content — so on a pane too short for the form, the overflow reaches
     this body's scroller instead of the form clipping itself. */
  .layer-body > :global(.drill-grow) {
    flex: 1 0 auto;
    max-width: 100%;
  }

  .row-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .layer-body.cards {
    container-type: inline-size;
  }

  .row-list.cards {
    display: grid;
    grid-template-columns: 1fr;
    align-content: center;
    gap: 0.75rem;
    width: 100%;
    max-width: 1050px;
    min-height: 100%;
    margin-inline: auto;
  }

  @container (min-width: 660px) {
    .row-list.cards {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @container (min-width: 820px) {
    .row-list.cards {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  .detail-title-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding-bottom: 0.625rem;
    margin-bottom: 0.25rem;
    border-bottom: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }

  .detail-title {
    margin: 0;
    font-size: var(--font-size-base, 16px);
    font-weight: 700;
    color: white;
  }

  /* Back is the exit the user takes on every visit; Close is the one they take
     once. It reads as a button for the same reason Close does — an unstyled
     glyph gives no signal it is pressable, and its 44px hit area is invisible
     until the pointer is already on it. Matches the overlay header's close
     button, one tone quieter. */
  .back-button {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    padding: 0;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.07));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.16));
    border-radius: 0.5rem;
    color: rgba(255, 255, 255, 0.9);
    cursor: pointer;
    transition:
      background var(--duration-normal) ease,
      border-color var(--duration-normal) ease;
  }

  .back-button:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.14));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.3));
  }

  .back-button:focus-visible {
    outline: 3px solid var(--theme-text, white);
    outline-offset: 2px;
  }

  .back-button svg {
    width: 1.25rem;
    height: 1.25rem;
  }

  @media (prefers-reduced-motion: reduce) {
    .back-button {
      transition: none;
    }
  }
</style>
