<script lang="ts">
  import { localHref } from "#lib/shared/i18n/localized-href.svelte.js";
  import { browser } from "$app/env";
  import GuideShell from "../_components/GuideShell.svelte";
  import Sentences from "../_components/Sentences.svelte";
  import GuideSeo from "../level-1/_components/GuideSeo.svelte";
  import MotionPathExplorer from "./_components/MotionPathExplorer.svelte";
  import MotionPathExplanation from "./_components/MotionPathExplanation.svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import { tDynamic } from "#lib/shared/i18n/i18n.svelte.js";
  import { onMount } from "svelte";
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

  // The explorer's room: its screen's height under the explorer's intro.
  // The explorer fills it when its boxes fit there, and otherwise keeps its
  // own layout and pans inside the screen.
  let room = $state<number | null>(null);
  function measureRoom(node: HTMLElement) {
    const area = node.closest<HTMLElement>(".fit-area");
    const intro = node.querySelector<HTMLElement>(".explorer-intro");
    if (!area || !intro) return;
    const update = () => {
      const gap = parseFloat(getComputedStyle(intro).marginBottom) || 0;
      room = Math.floor(area.clientHeight - intro.offsetHeight - gap - 2);
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
            <div class="explore" use:measureRoom>
              <header class="explorer-intro">
                <h2>{tDynamic("guide_paths_try_four")}</h2>
                <p>
                  <Sentences text={tDynamic("guide_paths_try_four_body")} />
                </p>
              </header>
              {#if browser}
                <MotionPathExplorer {room} />
              {:else}
                <p role="status">
                  {tDynamic("guide_paths_loading_comparison")}
                </p>
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
