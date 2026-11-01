<!--
  Settings → Display: what pictographs, animations and cards show, each beside
  a live example bound to the same global switches the long-press menus write.
  Three equal columns filling the tab's height where it is wide enough, one
  stacked column below, with all three sections always visible.

  Below the three-column tier (the tab under 64rem) the three sections do not
  fit one screen, and settings never scroll (no-page-scroll.md). The tab then
  shows three drill-down boxes, each with a one-line summary of what is on,
  and opens one section at a time as its own screen with a back arrow, as the
  Download video screen's File and Show panes do.

  The animation section is imported lazily: it carries the animation engine,
  which nothing else in Settings needs. Its frame holds the same header and
  stage box while it loads, then crossfades to the live section.
-->
<script lang="ts">
  import { onMount, type Component } from "svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { Crossfade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import { getVisibilityStateManager } from "#lib/shared/pictograph/shared/state/visibility-state.svelte.js";
  import { getAnimationVisibilityManager } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";
  import { getImageCompositionManager } from "#lib/shared/share/state/image-composition-state.svelte.js";
  import { getExportOptionsState } from "#lib/shared/animation-panel/state/export-options-state.svelte.js";
  import DisplaySection from "./display/DisplaySection.svelte";
  import PictographDisplaySection from "./display/PictographDisplaySection.svelte";
  import CardDisplaySection from "./display/CardDisplaySection.svelte";
  import {
    loadDisplayExample,
    type DisplayExample,
  } from "./display/display-example-data";
  import {
    animationSummary,
    cardSummary,
    pictographSummary,
  } from "./display/display-switches";

  type SectionKind = "pictograph" | "animation" | "card";

  let example = $state<DisplayExample | null>(null);
  let AnimationSection = $state<Component<{
    example: DisplayExample | null;
    onBack?: () => void;
  }> | null>(null);

  // The tab's own width decides the tier, the same 64rem its container
  // queries use; 0 until the first measure, when nothing is laid out yet.
  let tabWidth = $state(0);
  let remPx = $state(16);
  const tier = $derived<"columns" | "drill" | null>(
    tabWidth === 0 ? null : tabWidth >= 64 * remPx ? "columns" : "drill"
  );
  let open = $state<SectionKind | null>(null);
  const back = () => (open = null);

  const vm = getVisibilityStateManager();
  const animationVisibility = getAnimationVisibilityManager();
  const composition = getImageCompositionManager();
  const exportOptions = getExportOptionsState();
  let version = $state(0);

  onMount(() => {
    let alive = true;
    remPx =
      parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    void loadDisplayExample().then((built) => {
      if (alive) example = built;
    });
    void import("./display/AnimationDisplaySection.svelte").then((module) => {
      if (alive) AnimationSection = module.default;
    });
    // The box summaries follow every switch, wherever it was flipped.
    const bump = () => version++;
    vm.registerObserver(bump, ["all"]);
    animationVisibility.registerObserver(bump);
    composition.registerObserver(bump);
    void vm.ensureSettingsLoaded().then(bump);
    return () => {
      alive = false;
      vm.unregisterObserver(bump);
      animationVisibility.unregisterObserver(bump);
      composition.unregisterObserver(bump);
    };
  });

  const boxes = $derived.by(() => {
    void version;
    void exportOptions.imageDarkMode;
    return [
      {
        kind: "pictograph" as const,
        icon: "fas fa-shapes",
        label: t("settings_display_pictograph"),
        summary: pictographSummary(vm),
      },
      {
        kind: "animation" as const,
        icon: "fas fa-play",
        label: t("settings_display_animation"),
        summary: animationSummary(animationVisibility),
      },
      {
        kind: "card" as const,
        icon: "fas fa-id-card",
        label: t("settings_display_card"),
        summary: cardSummary(composition, vm, exportOptions.imageDarkMode),
      },
    ];
  });
</script>

{#snippet animationSection(onBack?: () => void)}
  <Crossfade
    key={AnimationSection ? "live" : "loading"}
    duration={DURATION.normal}
    animateHeight={!onBack}
    fill={!!onBack}
  >
    {#if AnimationSection}
      <AnimationSection {example} {onBack} />
    {:else}
      <DisplaySection
        kind="animation"
        icon="fas fa-play"
        title={t("settings_display_animation")}
        caption={t("settings_display_animation_caption")}
        onReset={() => {}}
        {onBack}
      >
        {#snippet stage()}{/snippet}
        {#snippet controls()}{/snippet}
      </DisplaySection>
    {/if}
  </Crossfade>
{/snippet}

<div class="display-tab" bind:clientWidth={tabWidth} data-tier={tier}>
  {#if tier === "columns"}
    <div class="display-workspace">
      <PictographDisplaySection {example} />
      <div class="animation-slot">{@render animationSection()}</div>
      <CardDisplaySection {example} />
    </div>
  {:else if tier === "drill"}
    <div class="display-workspace drill">
      <Crossfade key={open ?? "boxes"} duration={DURATION.normal}>
        {#if open === "pictograph"}
          <PictographDisplaySection {example} onBack={back} />
        {:else if open === "animation"}
          <div class="animation-slot">{@render animationSection(back)}</div>
        {:else if open === "card"}
          <CardDisplaySection {example} onBack={back} />
        {:else}
          <div class="drill-boxes" data-display-boxes>
            {#each boxes as box (box.kind)}
              <button
                type="button"
                class="drill-box"
                data-drill={box.kind}
                onclick={() => (open = box.kind)}
              >
                <i class="drill-icon {box.icon}" aria-hidden="true"></i>
                <span class="drill-label">{box.label}</span>
                <small class="drill-summary">{box.summary}</small>
                <i
                  class="fa-solid fa-chevron-right drill-chevron"
                  aria-hidden="true"
                ></i>
              </button>
            {/each}
          </div>
        {/if}
      </Crossfade>
    </div>
  {/if}
</div>

<style>
  .display-tab {
    display: flex;
    flex-direction: column;
    flex: 1;
    width: 100%;
    max-width: var(--shell-w, 100%);
    min-height: 0;
    margin: 0 auto;
    overflow-y: auto;
    box-sizing: border-box;
    container: display-tab / inline-size;
  }

  /* Matches the Preferences, Account and Props panels: one bordered surface,
     sections opened by header bands and split by hairlines. */
  .display-workspace {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    flex: 0 0 auto;
    min-width: 0;
    margin: clamp(0.75em, 1.4cqi, 1.75em) clamp(0.75em, 2cqi, 3em);
    overflow: hidden;
    border: 1px solid var(--theme-stroke-strong, var(--theme-stroke));
    border-radius: 1.25em;
    background: color-mix(
      in srgb,
      var(--theme-panel-bg, rgba(0, 0, 0, 0.88)) 14%,
      #070b10 86%
    );
    box-shadow: var(--theme-panel-shadow, 0 1rem 3rem rgba(0, 0, 0, 0.35));
    isolation: isolate;
    --settings-row-inline: 1.15em;
  }

  :global(html[data-theme-luminance="bright"]) .display-workspace {
    background: color-mix(
      in srgb,
      var(--theme-panel-bg, rgba(255, 255, 255, 0.88)) 14%,
      #f6f7f9 86%
    );
  }

  /* The crossfade wrapper sizes to its content, so the slot carries the
     section tint down the full column instead of the section. */
  .animation-slot {
    display: flex;
    flex-direction: column;
    min-width: 0;
    background: color-mix(in srgb, var(--theme-text) 2%, transparent);
  }

  .animation-slot :global(.display-section) {
    background: transparent;
  }

  @container display-tab (max-width: 32rem) {
    .display-workspace {
      --settings-row-inline: 0.9rem;
    }
  }

  /* Drill-down: the workspace is the tab's height, and the boxes or the open
     section fill it. The crossfade stacks both layers in that one box. */
  .display-workspace.drill {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
    container: display-screen / size;
  }

  .drill > :global(.crossfade) {
    position: absolute;
    inset: 0;
  }

  .drill > :global(.crossfade > .layer),
  .drill .animation-slot :global(.crossfade > .layer) {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .drill .animation-slot {
    flex: 1 1 auto;
    min-height: 0;
  }

  .drill .animation-slot > :global(.crossfade) {
    flex: 1 1 auto;
    min-height: 0;
  }

  /* The boxes follow the Download video screen's File and Show panes: icon,
     title, the one-line summary under it, a chevron saying it opens. */
  .drill-boxes {
    display: grid;
    align-content: start;
    gap: 0.5rem;
    padding: 1rem var(--settings-row-inline);
  }

  .drill-box {
    display: grid;
    grid-template-columns: 2.75rem minmax(0, 1fr) auto;
    grid-template-rows: auto auto;
    column-gap: 0.875rem;
    align-items: center;
    min-height: 5rem;
    padding: 0.875rem 1.125rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 0.875rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    color: var(--theme-text, #fff);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .drill-box:hover {
    border-color: var(--theme-accent, #8b7cff);
    background: var(--theme-surface-hover, rgba(255, 255, 255, 0.1));
  }

  .drill-box:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .drill-icon {
    grid-row: span 2;
    display: grid;
    place-items: center;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 0.75rem;
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b7cff) 16%,
      transparent
    );
    font-size: 1.25rem;
    color: var(--theme-accent, #8b7cff);
  }

  .drill-label {
    grid-column: 2;
    font-size: 1rem;
    font-weight: 650;
  }

  .drill-summary {
    grid-column: 2;
    min-width: 0;
    overflow: hidden;
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.68));
    font-size: 0.875rem;
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .drill-chevron {
    grid-column: 3;
    grid-row: 1 / span 2;
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.68));
  }

  /* Side by side: three equal columns, split by vertical hairlines, filling
     the tab's height. Each section's stage takes its column's free height
     (DisplaySection), so the band widens with the window's height too: a
     column only as wide as the 2600px shell allows would make a 4K column
     ~830px wide and ~2000px tall, and no square stage can fill that. The
     band stays the shell's on a laptop and grows toward full width where the
     window is tall enough to use it. */
  @container display-tab (min-width: 64rem) {
    .display-workspace {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      grid-template-rows: minmax(0, 1fr);
      flex: 1 1 auto;
      min-height: 0;
    }

    .display-workspace > :global(* + *) {
      border-left: 1px solid var(--theme-stroke);
    }

    .display-workspace > :global(*) {
      display: flex;
      flex-direction: column;
      min-height: 0;
    }

    /* The crossfade box and its layer pass the column's height through. Its
       animateHeight writes the stacked tier's content height inline; here
       the row fixes the height, so the column's wins. */
    .animation-slot > :global(.crossfade) {
      flex: 1 1 auto;
      height: auto !important;
      min-height: 0;
      grid-template-rows: minmax(0, 1fr);
    }

    /* animateHeight pins each layer to its natural height (align-self:
       start); a full-height layer is its natural height here. */
    .animation-slot :global(.crossfade > .layer) {
      height: 100%;
      display: flex;
      flex-direction: column;
    }
  }

  @media (min-width: 64rem) {
    .display-tab {
      max-width: max(var(--shell-w, 100%), calc((100dvh - 12rem) * 2.6));
    }
  }
</style>
