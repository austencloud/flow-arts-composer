<script lang="ts">
  import { localHref } from "#lib/shared/i18n/localized-href.svelte.js";
  import { browser } from "$app/env";
  import GuideShell from "../_components/GuideShell.svelte";
  import Sentences from "../_components/Sentences.svelte";
  import { sentences } from "../_components/sentences";
  import GuideSeo from "../level-1/_components/GuideSeo.svelte";
  import MotionPathExplorer from "./_components/MotionPathExplorer.svelte";
  import MotionPathExplanation from "./_components/MotionPathExplanation.svelte";
  import type { StudioPhase } from "./_data/explorer-layout";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import { tDynamic } from "#lib/shared/i18n/i18n.svelte.js";
  import { onMount, tick } from "svelte";
  import GuideScreens from "../_components/fit/GuideScreens.svelte";
  import {
    watchScreenTier,
    type ScreenTier,
  } from "../_components/fit/guide-screen-url";

  // One screen at a time (2026-10-24 fit pass). The walkthrough, the
  // explorer and each reference topic get a screen; below a large window
  // the longer topics split in two so the words never need scrolling.
  type Part =
    | "explain"
    | "explore"
    | "what"
    | "whatDefs"
    | "whatNotes"
    | "scope"
    | "scopeDefs"
    | "scopeNotes"
    | "third"
    | "thirdLinks"
    | "awkward";
  let tier = $state<ScreenTier>("large");
  onMount(() => watchScreenTier((v) => (tier = v)));
  const views = $derived<{ label: string; parts: Part[] }[]>([
    { label: tDynamic("guide_paths_stage_three"), parts: ["explain"] },
    { label: "Try all four", parts: ["explore"] },
    ...(tier === "large"
      ? [
          {
            label: tDynamic("guide_paths_what_changes"),
            parts: ["what", "whatDefs", "whatNotes"] as Part[],
          },
          {
            label: tDynamic("guide_paths_scope"),
            parts: ["scope", "scopeDefs", "scopeNotes"] as Part[],
          },
          {
            label: tDynamic("guide_paths_third_order"),
            parts: ["third", "thirdLinks"] as Part[],
          },
        ]
      : tier === "medium"
        ? [
            {
              label: tDynamic("guide_paths_what_changes"),
              parts: ["what", "whatDefs"] as Part[],
            },
            { label: "Exceptions", parts: ["whatNotes"] as Part[] },
            {
              label: tDynamic("guide_paths_scope"),
              parts: ["scope", "scopeDefs"] as Part[],
            },
            { label: "In Composer", parts: ["scopeNotes"] as Part[] },
            {
              label: tDynamic("guide_paths_third_order"),
              parts: ["third"] as Part[],
            },
            { label: "Concave and flowers", parts: ["thirdLinks"] as Part[] },
          ]
        : [
            {
              label: tDynamic("guide_paths_what_changes"),
              parts: ["what"] as Part[],
            },
            { label: "The four paths", parts: ["whatDefs"] as Part[] },
            { label: "Exceptions", parts: ["whatNotes"] as Part[] },
            {
              label: tDynamic("guide_paths_scope"),
              parts: ["scope"] as Part[],
            },
            { label: "Preview and save", parts: ["scopeDefs"] as Part[] },
            { label: "In Composer", parts: ["scopeNotes"] as Part[] },
            {
              label: tDynamic("guide_paths_third_order"),
              parts: ["third"] as Part[],
            },
            { label: "Concave and flowers", parts: ["thirdLinks"] as Part[] },
          ]),
    { label: tDynamic("guide_paths_awkward"), parts: ["awkward"] },
  ]);
  const has = (n: number, part: Part) => views[n]?.parts.includes(part);

  // The explorer's room: its screen's height, less its intro. The explorer
  // composes itself to fit exactly that.
  let room = $state<number | null>(null);
  let areaHeight = $state(0);
  let areaWidth = $state(0);
  // On a phone or a short screen the intro steps aside while the studio is
  // open, on the same beats as the lesson's own pickers. The studio needs those
  // rows for the canvas and the section, and the intro is back when it closes.
  const INTRO_YIELDS_WIDTH = 640;
  let studioPhase = $state<StudioPhase>("rest");
  const introYields = $derived(shortScreen || areaWidth < INTRO_YIELDS_WIDTH);
  const introFaded = $derived(introYields && studioPhase !== "rest");
  const introGone = $derived(
    introYields && (studioPhase === "open" || studioPhase === "closing")
  );
  // Worked out here rather than measured, so the studio's motion sees the new
  // height in the flush that opens it.
  const explorerRoom = $derived(introGone ? areaHeight - 2 : room);
  // A short screen keeps the canvas big: the intro's first sentence stays with
  // the explorer and the rest is one tap away, in the explorer's place.
  const SHORT_SCREEN_HEIGHT = 520;
  let shortScreen = $state(false);
  let introOpen = $state(false);
  let moreButton = $state<HTMLElement | null>(null);
  let backButton = $state<HTMLElement | null>(null);
  const introBody = $derived(tDynamic("guide_paths_try_four_body"));

  async function showIntro(open: boolean) {
    introOpen = open;
    await tick();
    (open ? backButton : moreButton)?.querySelector("button")?.focus();
  }

  function measureRoom(node: HTMLElement) {
    const area = node.closest<HTMLElement>(".fit-area");
    if (!area) return;
    const intro = node.querySelector<HTMLElement>(".explorer-intro");
    if (!intro) return;
    introOpen = false;
    // Stepped aside it measures nothing, and the room it will take back when it
    // returns is still the room the explorer composes to.
    let introHeight = 0;
    const update = () => {
      areaHeight = area.clientHeight;
      areaWidth = area.clientWidth;
      shortScreen = area.clientHeight < SHORT_SCREEN_HEIGHT;
      if (!shortScreen) introOpen = false;
      if (intro.offsetHeight > 0) {
        introHeight =
          intro.offsetHeight +
          (parseFloat(getComputedStyle(intro).marginBottom) || 0);
      }
      room = Math.floor(area.clientHeight - introHeight - 2);
    };
    const observer = new ResizeObserver(update);
    observer.observe(area);
    observer.observe(intro);
    update();
    return { destroy: () => observer.disconnect() };
  }
</script>

<GuideSeo
  title={tDynamic("guide_paths_seo_title")}
  description={tDynamic("guide_paths_seo_description")}
  path="/guide/motion-paths"
  datePublished="2026-09-08"
  partOf={{ name: tDynamic("guide_paths_part_of"), path: "/guide" }}
  breadcrumbs={[
    { name: "Home", path: "/" },
    { name: "Guide", path: "/guide" },
    { name: tDynamic("guide_paths_title"), path: "/guide/motion-paths" },
  ]}
/>

<GuideShell>
  <main class="motion-path-guide guide-page-route">
    <GuideScreens
      title={tDynamic("guide_paths_title")}
      subtitle={tDynamic("guide_paths_tagline")}
      labels={views.map((v) => v.label)}
      prevPage={{
        href: localHref("/guide/ratios"),
        title: tDynamic("guide_hub_ratios_title"),
      }}
      nextPage={{
        href: localHref("/guide/zans-diamond"),
        title: tDynamic("guide_hub_zans_diamond_title"),
      }}
      hubHref={localHref("/guide")}
    >
      {#snippet screen(n)}
        <div class="screen">
          {#if has(n, "explain")}
            <MotionPathExplanation />
          {/if}

          {#if has(n, "explore")}
            <div class="explore" class:intro-open={introOpen} use:measureRoom>
              <header
                class="explorer-intro"
                class:short={shortScreen}
                class:faded={introFaded}
                class:gone={introGone}
              >
                {#if shortScreen}
                  <p>{sentences(introBody)[0]}</p>
                  <span class="intro-more" bind:this={moreButton}>
                    <PanelButton onclick={() => showIntro(true)}>More</PanelButton>
                  </span>
                {:else}
                  <h2>{tDynamic("guide_paths_try_four")}</h2>
                  <p><Sentences text={introBody} /></p>
                {/if}
              </header>
              <div class="explorer-slot">
                {#if browser}
                  <MotionPathExplorer
                    room={explorerRoom}
                    layoutRoom={room}
                    onstudiophase={(phase) => (studioPhase = phase)}
                  />
                {:else}
                  <p role="status">
                    {tDynamic("guide_paths_loading_comparison")}
                  </p>
                {/if}
              </div>
              {#if shortScreen}
                <div class="intro-drill" inert={!introOpen}>
                  <h2>{tDynamic("guide_paths_try_four")}</h2>
                  <p><Sentences text={introBody} /></p>
                  <span bind:this={backButton}>
                    <PanelButton onclick={() => showIntro(false)}
                      >{tDynamic("common_back")}</PanelButton
                    >
                  </span>
                </div>
              {/if}
            </div>
          {/if}

          {#if has(n, "what") || has(n, "whatDefs") || has(n, "whatNotes")}
            <section
              class="reading"
              aria-labelledby={has(n, "what")
                ? `paths-heading-${n}`
                : undefined}
            >
              {#if has(n, "what")}
                <h2 id="paths-heading-{n}">
                  {tDynamic("guide_paths_what_changes")}
                </h2>
                <p>{tDynamic("guide_paths_what_changes_body")}</p>
              {/if}
              {#if has(n, "whatDefs")}
                <dl class="definitions">
                  <div>
                    <dt>{tDynamic("guide_paths_arc")}</dt>
                    <dd>{tDynamic("guide_paths_arc_definition")}</dd>
                  </div>
                  <div>
                    <dt>{tDynamic("guide_paths_linear")}</dt>
                    <dd>{tDynamic("guide_paths_linear_definition")}</dd>
                  </div>
                  <div>
                    <dt>{tDynamic("guide_paths_concave")}</dt>
                    <dd>{tDynamic("guide_paths_concave_definition")}</dd>
                  </div>
                  <div>
                    <dt>{tDynamic("guide_paths_hybrid")}</dt>
                    <dd>{tDynamic("guide_paths_hybrid_definition")}</dd>
                  </div>
                </dl>
              {/if}
              {#if has(n, "whatNotes")}{@render whatNotes()}{/if}
            </section>
          {/if}

          {#if has(n, "scope") || has(n, "scopeDefs") || has(n, "scopeNotes")}
            <section
              class="reading"
              aria-labelledby={has(n, "scope")
                ? `scope-heading-${n}`
                : undefined}
            >
              {#if has(n, "scope")}
                <h2 id="scope-heading-{n}">{tDynamic("guide_paths_scope")}</h2>
                <p>{tDynamic("guide_paths_scope_body")}</p>
              {/if}
              {#if has(n, "scopeDefs")}
                <dl class="definitions">
                  <div>
                    <dt>{tDynamic("guide_paths_preview")}</dt>
                    <dd>{tDynamic("guide_paths_preview_definition")}</dd>
                  </div>
                  <div>
                    <dt>{tDynamic("guide_paths_restore")}</dt>
                    <dd>{tDynamic("guide_paths_restore_definition")}</dd>
                  </div>
                  <div>
                    <dt>{tDynamic("guide_paths_save")}</dt>
                    <dd>{tDynamic("guide_paths_save_definition")}</dd>
                  </div>
                  <div>
                    <dt>{tDynamic("guide_paths_default")}</dt>
                    <dd>{tDynamic("guide_paths_default_definition")}</dd>
                  </div>
                </dl>
              {/if}
              {#if has(n, "scopeNotes")}{@render scopeNotes()}{/if}
            </section>
          {/if}

          {#if has(n, "third")}
            <section class="reading" aria-labelledby="third-order-heading-{n}">
              <h2 id="third-order-heading-{n}">
                {tDynamic("guide_paths_third_order")}
              </h2>
              <p>{tDynamic("guide_paths_third_order_body")}</p>
              <p>{tDynamic("guide_paths_third_order_explore")}</p>
              {#if has(n, "thirdLinks")}{@render thirdLinks()}{/if}
            </section>
          {:else if has(n, "thirdLinks")}
            <section class="reading">{@render thirdLinks()}</section>
          {/if}

          {#if has(n, "awkward")}
            <section class="reading" aria-labelledby="awkward-heading-{n}">
              <h2 id="awkward-heading-{n}">
                {tDynamic("guide_paths_awkward")}
              </h2>
              <p>{tDynamic("guide_paths_awkward_body")}</p>
              <p>{tDynamic("guide_paths_awkward_advice")}</p>
              <div class="links">
                <PanelButton href="/create"
                  >{tDynamic("guide_paths_open_composer")}</PanelButton
                >
              </div>
            </section>
          {/if}
        </div>
      {/snippet}
    </GuideScreens>
  </main>
</GuideShell>

{#snippet whatNotes()}
  <p>{tDynamic("guide_paths_exceptions")}</p>
  <p>{tDynamic("guide_paths_compare")}</p>
{/snippet}

{#snippet scopeNotes()}
  <p>{tDynamic("guide_paths_composer")}</p>
  <p>{tDynamic("guide_paths_lines")}</p>
{/snippet}

{#snippet thirdLinks()}
  <p>{tDynamic("guide_paths_third_order_concave")}</p>
  <div class="links">
    <PanelButton href="/toys/third-order"
      >{tDynamic("guide_paths_open_third_order")}</PanelButton
    >
    <PanelButton href={localHref("/guide/ratios")}
      >{tDynamic("guide_paths_spin_ratios")}</PanelButton
    >
  </div>
  <p>{tDynamic("guide_paths_sign_in")}</p>
{/snippet}

<style>
  /* The guide's dark page: the screen frame's ink follows the theme. */
  .motion-path-guide {
    --ink: var(--theme-text);
    --ink-dim: var(--theme-text-muted);
    width: 100%;
    min-width: 0;
    color: var(--theme-text);
  }
  .screen {
    width: 100%;
    max-width: 1480px;
    margin-inline: auto;
  }
  .explorer-intro {
    text-align: center;
    margin-bottom: clamp(0.5rem, 1.5vh, 1.25rem);
  }
  .explorer-intro.short {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-sm, 8px);
  }
  .explorer-intro.short p {
    margin: 0;
    min-width: 0;
    text-wrap: balance;
  }
  .intro-more {
    flex: none;
  }
  .explore {
    position: relative;
  }
  /* The rest of the intro opens in the explorer's place; the explorer keeps its
     box under it, so opening and closing moves nothing. */
  /* Whatever is arriving is visible at once, so it can take focus; whatever is
     leaving stays visible until its fade ends. */
  .explorer-intro,
  .explorer-slot,
  .intro-open .intro-drill {
    transition:
      opacity var(--duration-fast) var(--ease-standard),
      visibility 0s linear;
  }
  .intro-open .explorer-intro,
  .intro-open .explorer-slot,
  .intro-drill {
    transition:
      opacity var(--duration-fast) var(--ease-standard),
      visibility 0s linear var(--duration-fast);
  }
  .intro-open .explorer-intro,
  .intro-open .explorer-slot,
  .explorer-intro.faded {
    opacity: 0;
    visibility: hidden;
  }
  .explorer-intro.gone {
    display: none;
  }
  .intro-drill {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-md, 16px);
    text-align: center;
    opacity: 0;
    visibility: hidden;
  }
  .intro-open .intro-drill {
    opacity: 1;
    visibility: visible;
    transition:
      opacity var(--duration-fast) var(--ease-standard),
      visibility 0s linear;
  }
  .intro-drill h2 {
    margin: 0;
    font-size: clamp(1.3rem, 1rem + 1.2vh, 1.85rem);
    line-height: 1.15;
  }
  .intro-drill p {
    margin: 0;
    max-width: 60ch;
    font-size: 16px;
    line-height: 1.5;
    color: var(--theme-text-muted);
  }
  .explorer-intro h2,
  .reading h2 {
    margin: 0 0 0.5rem;
    font-size: clamp(1.3rem, 1rem + 1.2vh, 1.85rem);
    line-height: 1.15;
  }
  .explorer-intro p {
    margin: 0 auto;
    max-width: 60ch;
    font-size: 16px;
    line-height: 1.5;
    color: var(--theme-text-muted);
  }
  .reading {
    max-width: 44rem;
    margin-inline: auto;
    min-width: 0;
  }
  .reading p {
    margin: 0 0 0.75rem;
    font-size: 16px;
    line-height: 1.6;
    color: var(--theme-text-muted);
  }
  .definitions {
    margin-block: 0.75rem;
  }
  .definitions > div {
    display: grid;
    grid-template-columns: minmax(100px, 0.35fr) minmax(0, 1fr);
    gap: var(--spacing-md, 16px);
    padding-block: 0.3rem;
  }
  dt {
    font-weight: 650;
    font-size: 16px;
    line-height: 1.6;
  }
  dd {
    margin: 0;
    font-size: 16px;
    line-height: 1.6;
    color: var(--theme-text-muted);
  }
  .links {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-sm, 8px);
    margin-block: 0.25rem 0.75rem;
  }
  @media (max-width: 480px) {
    .definitions > div {
      grid-template-columns: 1fr;
      gap: 0;
    }
  }
</style>
