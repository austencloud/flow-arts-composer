<script lang="ts">
  import { browser } from "$app/env";
  import GuideShell from "../_components/GuideShell.svelte";
  import GuideSeo from "../level-1/_components/GuideSeo.svelte";
  import MotionPathExplorer from "./_components/MotionPathExplorer.svelte";
  import MotionPathExplanation from "./_components/MotionPathExplanation.svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import { tDynamic } from "#lib/shared/i18n/i18n.svelte.js";
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
  <article class="motion-path-guide guide-page-route">
    <header class="intro">
      <h1>{tDynamic("guide_paths_title")}</h1>
      <p>{tDynamic("guide_paths_tagline")}</p>
    </header>

    <MotionPathExplanation />

    <header class="explorer-intro">
      <h2>{tDynamic("guide_paths_try_four")}</h2>
      <p>{tDynamic("guide_paths_try_four_body")}</p>
    </header>

    {#if browser}
      <MotionPathExplorer />
    {:else}
      <p role="status">{tDynamic("guide_paths_loading_comparison")}</p>
    {/if}

    <details class="reference">
      <summary>{tDynamic("guide_paths_reference")}</summary>
      <div class="reading">
        <section aria-labelledby="paths-heading">
          <h2 id="paths-heading">{tDynamic("guide_paths_what_changes")}</h2>
          <p>{tDynamic("guide_paths_what_changes_body")}</p>
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
          <p>{tDynamic("guide_paths_exceptions")}</p>
          <p>{tDynamic("guide_paths_compare")}</p>
        </section>

        <section aria-labelledby="scope-heading">
          <h2 id="scope-heading">{tDynamic("guide_paths_scope")}</h2>
          <p>{tDynamic("guide_paths_scope_body")}</p>
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
          <p>{tDynamic("guide_paths_composer")}</p>
          <p>{tDynamic("guide_paths_lines")}</p>
        </section>

        <section aria-labelledby="third-order-heading">
          <h2 id="third-order-heading">{tDynamic("guide_paths_third_order")}</h2>
          <p>{tDynamic("guide_paths_third_order_body")}</p>
          <p>{tDynamic("guide_paths_third_order_explore")}</p>
          <p>{tDynamic("guide_paths_third_order_concave")}</p>
          <div class="links">
            <PanelButton href="/toys/third-order">{tDynamic("guide_paths_open_third_order")}</PanelButton>
            <PanelButton href="/guide/ratios"
              >{tDynamic("guide_paths_spin_ratios")}</PanelButton
            >
          </div>
          <p>{tDynamic("guide_paths_sign_in")}</p>
        </section>

        <section aria-labelledby="awkward-heading">
          <h2 id="awkward-heading">{tDynamic("guide_paths_awkward")}</h2>
          <p>{tDynamic("guide_paths_awkward_body")}</p>
          <p>{tDynamic("guide_paths_awkward_advice")}</p>
          <div class="links">
            <PanelButton href="/create">{tDynamic("guide_paths_open_composer")}</PanelButton>
          </div>
        </section>
      </div>
    </details>
  </article>
</GuideShell>

<style>
  .motion-path-guide {
    width: 100%;
    min-width: 0;
    max-width: 1480px;
    margin-inline: auto;
    padding: clamp(20px, 3vw, 56px);
    color: var(--theme-text);
  }
  .intro {
    margin-bottom: var(--spacing-lg, 24px);
  }
  .intro h1 {
    text-align: left;
    padding: 0 0 var(--spacing-md, 16px);
  }
  .intro p {
    max-width: none;
    font-size: clamp(16px, 1.3vw, 20px);
    color: var(--theme-text-muted);
  }
  .explorer-intro {
    margin-block: clamp(2rem, 5vw, 3.5rem) var(--spacing-lg, 24px);
  }
  .explorer-intro h2 {
    margin: 0 0 var(--spacing-xs, 4px);
    font-size: clamp(1.4rem, 2.2vw, 1.85rem);
    line-height: 1.15;
  }
  .explorer-intro p {
    margin: 0;
    max-width: none;
    font-size: 16px;
    line-height: 1.6;
    color: var(--theme-text-muted);
  }
  .reading {
    display: grid;
    gap: clamp(32px, 4vw, 64px);
    margin-top: var(--spacing-lg, 24px);
  }
  .reference {
    margin-top: var(--spacing-xl, 32px);
  }
  .reference summary {
    cursor: pointer;
    min-height: 44px;
    padding-block: var(--spacing-sm, 8px);
    font-size: var(--font-size-min, 14px);
    color: var(--theme-text-muted);
  }
  .reference summary:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 4px;
  }
  .reading section {
    min-width: 0;
  }
  .reading p,
  dd {
    font-size: 16px;
    line-height: 1.75;
  }
  .reading p {
    color: var(--theme-text-muted);
  }
  .definitions {
    margin-block: var(--spacing-lg, 24px);
  }
  .definitions > div {
    display: grid;
    grid-template-columns: minmax(100px, 0.35fr) minmax(0, 1fr);
    gap: var(--spacing-md, 16px);
    padding-block: var(--spacing-sm, 8px);
  }
  dt {
    font-weight: 650;
    font-size: 16px;
    line-height: 1.75;
  }
  dd {
    margin: 0;
    color: var(--theme-text-muted);
  }
  .links {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-sm, 8px);
    margin-top: var(--spacing-md, 16px);
  }
  @media (min-width: 1600px) {
    .reading {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 1024px) {
    .motion-path-guide {
      padding-top: 24px;
    }
  }
  @media (max-width: 480px) {
    .definitions > div {
      grid-template-columns: 1fr;
      gap: 0;
    }
  }
</style>
