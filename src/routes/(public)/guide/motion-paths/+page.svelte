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
    readScreenParam,
    watchScreenTier,
  } from "../_components/fit/guide-screen-url";
  import {
    createScreenSplits,
    JOINED_MIN_FIT,
  } from "../_components/fit/screen-splits.svelte.js";
  import PathStage from "./_components/PathStage.svelte";
  import PathMandala from "./_components/PathMandala.svelte";
  import PathFlower from "./_components/PathFlower.svelte";
  import PathPanelFigure from "./_components/PathPanelFigure.svelte";
  import type { MandalaPathShape } from "#lib/shared/mandala/domain/mandala-types.js";
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";

  // One screen at a time (2026-10-24 fit pass). The walkthrough, the explorer
  // and each reference topic get a screen, and every reading screen shows its
  // picture (2026-11-20, Guide pass 2): the explorer's own stage in the state
  // the words describe, the app's own path control, or its own flower. A
  // screen whose words and picture do not fit together at a readable size
  // falls back, in place, to two screens that each show the picture
  // (createScreenSplits).
  type Part =
    | "explain"
    | "explore"
    | "what"
    | "whatFig"
    | "defsA"
    | "defsB"
    | "notes1"
    | "notes2"
    | "notesFig"
    | "scope"
    | "scopeFig"
    | "sdefsA"
    | "sdefsB"
    | "snotes1"
    | "snotes2"
    | "snotesFig"
    | "third"
    | "third2"
    | "third3"
    | "thirdLinks"
    | "thirdFig"
    | "awk1"
    | "awk2"
    | "awkFig";
  type View = { label: string; parts: Part[]; group?: string };

  const splits = createScreenSplits();
  let measured = $state(false);
  onMount(() =>
    watchScreenTier(() => {
      splits.restore();
      measured = true;
    })
  );
  // Before the window is measured the page draws the most split cut.
  const at = (group: string, max: number) =>
    measured ? splits.step(group, max) : max;
  // How many cuts each joined group can fall back through.
  const CUTS: Record<string, number> = { third: 2 };

  // A pill that names two things, from words the page already has.
  const pair = (
    a: Parameters<typeof tDynamic>[0],
    b: Parameters<typeof tDynamic>[0]
  ) => `${tDynamic(a)} · ${tDynamic(b)}`;
  const views = $derived.by((): View[] => {
    const out: View[] = [];
    const pick = (
      group: string,
      joined: [string, Part[]][],
      ...cuts: [string, Part[]][][]
    ) => {
      const step = at(group, cuts.length);
      for (const [label, parts] of step ? cuts[step - 1]! : joined) {
        out.push(step < cuts.length ? { label, parts, group } : { label, parts });
      }
    };
    out.push({ label: tDynamic("guide_paths_stage_three"), parts: ["explain"] });
    out.push({ label: tDynamic("guide_paths_screen_try_all"), parts: ["explore"] });
    out.push({
      label: tDynamic("guide_paths_screen_what_changes"),
      parts: ["what", "whatFig"],
    });
    pick(
      "defs",
      [[tDynamic("guide_paths_screen_four_paths"), ["defsA", "defsB"]]],
      [
        [pair("guide_paths_arc", "guide_paths_linear"), ["defsA"]],
        [pair("guide_paths_concave", "guide_paths_hybrid"), ["defsB"]],
      ]
    );
    pick(
      "notes",
      [
        [
          tDynamic("guide_paths_screen_exceptions"),
          ["notes1", "notes2", "notesFig"],
        ],
      ],
      [
        [tDynamic("guide_paths_screen_exceptions"), ["notes1", "notesFig"]],
        [tDynamic("guide_paths_comparison"), ["notes2", "notesFig"]],
      ]
    );
    out.push({
      label: tDynamic("guide_paths_screen_scope"),
      parts: ["scope", "scopeFig"],
    });
    pick(
      "sdefs",
      [[tDynamic("guide_paths_screen_preview_save"), ["sdefsA", "sdefsB"]]],
      [
        [tDynamic("guide_paths_preview"), ["sdefsA"]],
        [tDynamic("guide_paths_save"), ["sdefsB"]],
      ]
    );
    pick(
      "snotes",
      [
        [
          tDynamic("guide_paths_screen_in_composer"),
          ["snotes1", "snotes2", "snotesFig"],
        ],
      ],
      [
        [tDynamic("guide_paths_screen_in_composer"), ["snotes1", "snotesFig"]],
        [tDynamic("guide_paths_screen_path_lines"), ["snotes2", "snotesFig"]],
      ]
    );
    pick(
      "third",
      [
        [
          tDynamic("guide_paths_screen_third_order"),
          ["third", "third2", "third3", "thirdLinks", "thirdFig"],
        ],
      ],
      [
        [
          tDynamic("guide_paths_screen_third_order"),
          ["third", "third2", "thirdFig"],
        ],
        [
          tDynamic("guide_paths_screen_concave_flowers"),
          ["third3", "thirdLinks", "thirdFig"],
        ],
      ],
      [
        [tDynamic("guide_paths_screen_third_order"), ["third", "thirdFig"]],
        [tDynamic("guide_paths_screen_third_explore"), ["third2", "thirdFig"]],
        [
          tDynamic("guide_paths_screen_concave_flowers"),
          ["third3", "thirdFig"],
        ],
        [tDynamic("guide_paths_screen_third_links"), ["thirdLinks", "thirdFig"]],
      ]
    );
    pick(
      "awk",
      [
        [
          tDynamic("guide_paths_screen_awkward"),
          ["awk1", "awk2", "awkFig"],
        ],
      ],
      [
        [tDynamic("guide_paths_screen_awkward"), ["awk1", "awkFig"]],
        [tDynamic("guide_paths_screen_awkward_advice"), ["awk2", "awkFig"]],
      ]
    );
    return out;
  });
  // The join the awkward screen draws: straight lines kink where steps meet.
  const AWKWARD_KIND: MandalaPathShape = "linear";
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
      cutKey={`${measured}${splits.key}`}
      floors={views.map((v) => (v.group ? JOINED_MIN_FIT : undefined))}
      onoverflow={() => {
        const v =
          views[
            Math.min(readScreenParam(window.location.search), views.length - 1)
          ];
        if (v?.group) splits.bump(v.group, CUTS[v.group] ?? 1);
      }}
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
                    <PanelButton onclick={() => showIntro(true)}
                      >More</PanelButton
                    >
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

          {#if has(n, "what")}
            <section class="reading" aria-labelledby="paths-heading-{n}">
              <h2 id="paths-heading-{n}">
                {tDynamic("guide_paths_what_changes")}
              </h2>
              <p>{tDynamic("guide_paths_what_changes_body")}</p>
            </section>
          {/if}
          {#if has(n, "whatFig")}
            <div class="plate">
              <PathStage
                kind="hybrid"
                size={280}
                glyph
                label={tDynamic("guide_paths_hybrid")}
              />
            </div>
          {/if}

          {#if has(n, "defsA") || has(n, "defsB")}
            <div class="plate grid" class:quad={has(n, "defsA") && has(n, "defsB")}>
              {#if has(n, "defsA")}
                {@render cell("arc", "guide_paths_arc", "guide_paths_arc_definition")}
                {@render cell("linear", "guide_paths_linear", "guide_paths_linear_definition")}
              {/if}
              {#if has(n, "defsB")}
                {@render cell("concave", "guide_paths_concave", "guide_paths_concave_definition")}
                {@render cell("hybrid", "guide_paths_hybrid", "guide_paths_hybrid_definition")}
              {/if}
            </div>
          {/if}

          {#if has(n, "notes1") || has(n, "notes2")}
            <section class="reading">
              {#if has(n, "notes1")}<p>{tDynamic("guide_paths_exceptions")}</p>{/if}
              {#if has(n, "notes2")}<p>{tDynamic("guide_paths_compare")}</p>{/if}
            </section>
          {/if}
          {#if has(n, "notesFig")}
            <div class="plate grid">
              {@render cell("arc", "guide_paths_arc")}
              {@render cell("hybrid", "guide_paths_hybrid")}
            </div>
          {/if}

          {#if has(n, "scope")}
            <section class="reading" aria-labelledby="scope-heading-{n}">
              <h2 id="scope-heading-{n}">{tDynamic("guide_paths_scope")}</h2>
              <p>{tDynamic("guide_paths_scope_body")}</p>
            </section>
          {/if}
          {#if has(n, "scopeFig")}
            <div class="plate"><PathPanelFigure /></div>
          {/if}

          {#if has(n, "sdefsA") || has(n, "sdefsB")}
            <div class="plate grid" class:quad={has(n, "sdefsA") && has(n, "sdefsB")}>
              {#if has(n, "sdefsA")}
                {@render cell("concave", "guide_paths_preview", "guide_paths_preview_definition")}
                {@render cell("hybrid", "guide_paths_restore", "guide_paths_restore_definition")}
              {/if}
              {#if has(n, "sdefsB")}
                {@render cell("concave", "guide_paths_save", "guide_paths_save_definition")}
                {@render cell("hybrid", "guide_paths_default", "guide_paths_default_definition")}
              {/if}
            </div>
          {/if}

          {#if has(n, "snotes1") || has(n, "snotes2")}
            <section class="reading">
              {#if has(n, "snotes1")}<p>{tDynamic("guide_paths_composer")}</p>{/if}
              {#if has(n, "snotes2")}<p>{tDynamic("guide_paths_lines")}</p>{/if}
            </section>
          {/if}
          {#if has(n, "snotesFig")}
            <div class="plate grid">
              {@render cell("arc", "guide_paths_lines_shown", undefined, true)}
              {@render cell("arc", "guide_paths_lines_hidden", undefined, false)}
            </div>
          {/if}

          {#if has(n, "third")}
            <section class="reading" aria-labelledby="third-order-heading-{n}">
              <h2 id="third-order-heading-{n}">
                {tDynamic("guide_paths_third_order")}
              </h2>
              <p>{tDynamic("guide_paths_third_order_body")}</p>
            </section>
          {/if}
          {#if has(n, "third2")}
            <section class="reading">
              <p>{tDynamic("guide_paths_third_order_explore")}</p>
            </section>
          {/if}
          {#if has(n, "third3")}
            <section class="reading">
              <p>{tDynamic("guide_paths_third_order_concave")}</p>
            </section>
          {/if}
          {#if has(n, "thirdLinks")}
            <section class="reading">{@render thirdLinks()}</section>
          {/if}
          {#if has(n, "thirdFig")}
            <div class="plate grid">
              <figure class="cell">
                <PathStage
                  kind="concave"
                  size={170}
                  label={tDynamic("guide_paths_concave")}
                />
                <figcaption><strong>{tDynamic("guide_paths_concave")}</strong></figcaption>
              </figure>
              <figure class="cell">
                <PathFlower
                  style="anti"
                  turns={1}
                  size={170}
                  label={tDynamic("guide_paths_antispin")}
                />
                <figcaption><strong>{tDynamic("guide_paths_antispin")}</strong></figcaption>
              </figure>
            </div>
          {/if}

          {#if has(n, "awk1") || has(n, "awk2")}
            <section class="reading" aria-labelledby="awkward-heading-{n}">
              {#if has(n, "awk1")}
                <h2 id="awkward-heading-{n}">
                  {tDynamic("guide_paths_awkward")}
                </h2>
                <p>{tDynamic("guide_paths_awkward_body")}</p>
              {/if}
              {#if has(n, "awk2")}
                <p>{tDynamic("guide_paths_awkward_advice")}</p>
                <div class="links">
                  <PanelButton href="/create"
                    >{tDynamic("guide_paths_open_composer")}</PanelButton
                  >
                </div>
              {/if}
            </section>
          {/if}
          {#if has(n, "awkFig")}
            <div class="plate grid">
              <PathMandala
                kind={AWKWARD_KIND}
                size={160}
                label={tDynamic("guide_paths_awkward")}
              />
              <PathStage
                kind={AWKWARD_KIND}
                size={160}
                label={tDynamic("guide_paths_awkward")}
              />
            </div>
          {/if}
        </div>
      {/snippet}
    </GuideScreens>
  </main>
</GuideShell>

{#snippet cell(
  kind: MandalaPathShape,
  termKey: Parameters<typeof tDynamic>[0],
  definitionKey?: Parameters<typeof tDynamic>[0],
  lines: boolean = true
)}
  <figure class="cell">
    <PathStage {kind} size={150} pathLines={lines} label={tDynamic(termKey)} />
    <figcaption>
      <strong>{tDynamic(termKey)}</strong>
      {#if definitionKey}<span>{tDynamic(definitionKey)}</span>{/if}
    </figcaption>
  </figure>
{/snippet}

{#snippet thirdLinks()}
  <div class="links">
    <LinkChip href="/toys/third-order"
      >{tDynamic("guide_paths_open_third_order")}</LinkChip
    >
    <LinkChip href={localHref("/guide/ratios")}
      >{tDynamic("guide_paths_spin_ratios")}</LinkChip
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
  .plate {
    display: flex;
    justify-content: center;
    margin-block: 0.5rem;
    min-width: 0;
  }
  .plate.grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    width: 100%;
    justify-content: center;
    align-items: start;
    gap: 0.5rem calc(var(--spacing-md, 16px) * var(--fit, 1));
  }
  .cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    margin: 0;
    min-width: 0;
  }
  figcaption {
    display: flex;
    flex-direction: column;
    text-align: center;
    font-size: var(--font-size-sm);
    line-height: 1.35;
    color: var(--theme-text-muted);
    max-width: 16rem;
  }
  figcaption strong {
    font-size: var(--font-size-base);
    color: var(--theme-text);
  }
  @media (max-width: 480px) {
    .definitions > div {
      grid-template-columns: 1fr;
      gap: 0;
    }
  }
</style>
