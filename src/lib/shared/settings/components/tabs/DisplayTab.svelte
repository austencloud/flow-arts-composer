<!--
  Settings → Display: what pictographs, animations and cards show, each beside
  a live example bound to the same global switches the long-press menus write.
  Three equal columns filling the tab's height where it is wide enough, one
  stacked column below, with all three sections always visible.

  The animation section is imported lazily: it carries the animation engine,
  which nothing else in Settings needs. Its frame holds the same header and
  stage box while it loads, then crossfades to the live section.
-->
<script lang="ts">
  import { onMount, type Component } from "svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { Crossfade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import DisplaySection from "./display/DisplaySection.svelte";
  import PictographDisplaySection from "./display/PictographDisplaySection.svelte";
  import CardDisplaySection from "./display/CardDisplaySection.svelte";
  import {
    loadDisplayExample,
    type DisplayExample,
  } from "./display/display-example-data";

  let example = $state<DisplayExample | null>(null);
  let AnimationSection = $state<Component<{
    example: DisplayExample | null;
  }> | null>(null);

  onMount(() => {
    let alive = true;
    void loadDisplayExample().then((built) => {
      if (alive) example = built;
    });
    void import("./display/AnimationDisplaySection.svelte").then((module) => {
      if (alive) AnimationSection = module.default;
    });
    return () => {
      alive = false;
    };
  });
</script>

<div class="display-tab">
  <div class="display-workspace">
    <PictographDisplaySection {example} />

    <div class="animation-slot">
      <Crossfade
        key={AnimationSection ? "live" : "loading"}
        duration={DURATION.normal}
        animateHeight
      >
        {#if AnimationSection}
          <AnimationSection {example} />
        {:else}
          <DisplaySection
            kind="animation"
            icon="fas fa-play"
            title={t("settings_display_animation")}
            caption={t("settings_display_animation_caption")}
            onReset={() => {}}
          >
            {#snippet stage()}{/snippet}
            {#snippet controls()}{/snippet}
          </DisplaySection>
        {/if}
      </Crossfade>
    </div>

    <CardDisplaySection {example} />
  </div>
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

  /* Stacked: hairlines between the sections, and each stage capped so the
     three fit a phone in about two scrolls. */
  .display-workspace > :global(* + *) {
    border-top: 1px solid var(--theme-stroke);
  }

  .display-workspace :global([data-display-section]) {
    --stage-max-h: 15rem;
  }

  @container display-tab (max-width: 32rem) {
    .display-workspace {
      --settings-row-inline: 0.9rem;
    }
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
      border-top: 0;
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
