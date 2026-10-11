<script lang="ts">
  import { Canvas } from "@threlte/core";
  import { AgXToneMapping, PCFSoftShadowMap, WebGLRenderer } from "three";

  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";

  import CloudbreakAssetCatalogScene from "./CloudbreakAssetCatalogScene.svelte";
  import {
    CLOUDBREAK_ASSET_HUNT,
    CLOUDBREAK_ASSET_CATALOG,
    CLOUDBREAK_CATALOG_VIEWS,
    assetsForView,
    formatCatalogBytes,
    formatCatalogVertices,
    type CloudbreakAssetVerdict,
    type CloudbreakCatalogView,
  } from "./catalog";

  let view = $state<CloudbreakCatalogView>("front");
  let readyIds = $state(new Set<string>());

  const visibleAssets = $derived(assetsForView(view));
  const isSpatialView = $derived(
    view === "front" || view === "rear" || view === "plan"
  );
  const reusableCount = CLOUDBREAK_ASSET_CATALOG.filter(
    (asset) => asset.verdict === "reuse" || asset.verdict === "adapt"
  ).length;

  const verdictLabels: Record<CloudbreakAssetVerdict, string> = {
    reuse: "Reuse",
    adapt: "Adapt",
    "distant-only": "Distant only",
    exclude: "Exclude",
  };

  const viewCopy = $derived.by(() => {
    if (view === "front") {
      return {
        caption: "Registered front",
        title: "Sunlight finds the waterline.",
        body: "A shaped wet-stone bank surrounds the reflective lagoon, the overflow leaves a visible crest, and stronger sun and shadow separate the stage from the shelf.",
      };
    }
    if (view === "rear") {
      return {
        caption: "Reverse camera",
        title: "The stage belongs to a massive sanctuary.",
        body: "The stronger worn circulation band leads into the 42 by 26 metre sanctuary mass. Its geometry remains an explicit graybox until the production-model pass.",
      };
    }
    if (view === "plan") {
      return {
        caption: "Measured overview",
        title: "One continuous shelf, front to sanctuary.",
        body: "The plan keeps the raised performance circle clear, holds the reflective lagoon to the right, and carries the worn path into a rear mass large enough to explain the whole location.",
      };
    }
    return {
      caption: `${view} bench`,
      title: "",
      body: "",
    };
  });

  function createRenderer(canvas: HTMLCanvasElement): WebGLRenderer {
    const renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    renderer.toneMapping = AgXToneMapping;
    renderer.toneMappingExposure = 1.05;
    return renderer;
  }

  function markAssetReady(id: string): void {
    if (readyIds.has(id)) return;
    readyIds = new Set([...readyIds, id]);
  }

  $effect(() => {
    if (typeof window === "undefined") return;
    (
      window as typeof window & {
        __cloudbreakAssetCatalog?: {
          view: CloudbreakCatalogView;
          totalAssets: number;
          visibleAssets: number;
          loadedAssets: number;
          reusableAssets: number;
        };
      }
    ).__cloudbreakAssetCatalog = {
      view,
      totalAssets: CLOUDBREAK_ASSET_CATALOG.length,
      visibleAssets: visibleAssets.length,
      loadedAssets: readyIds.size,
      reusableAssets: reusableCount,
    };
  });
</script>

<svelte:head>
  <title>Olive Cloudbreak asset bench</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main class="catalog-shell" data-view={view} data-loaded-assets={readyIds.size}>
  <section class="catalog-stage" aria-label="Cloudbreak asset preview">
    <Canvas {createRenderer} dpr={1} shadows>
      <CloudbreakAssetCatalogScene {view} onAssetReady={markAssetReady} />
    </Canvas>

    <div class="stage-caption">
      <span
        >{isSpatialView ? "Gate 1 · Amendment" : "Gate 4 · Asset audit"}</span
      >
      <strong>{viewCopy.caption}</strong>
      <small>Drag to orbit · wheel to inspect</small>
    </div>
  </section>

  <aside class="catalog-panel">
    <header>
      <p class="eyebrow">Olive Cloudbreak</p>
      <h1>Asset bench</h1>
      <p class="lede">
        Front, rear, and plan views share one measured shelf and the production
        cloud panorama. The lagoon now uses its authored outline instead of a
        rectangular water overlay.
      </p>
    </header>

    <SegmentedControl
      options={CLOUDBREAK_CATALOG_VIEWS}
      value={view}
      onchange={(next) => (view = next)}
      color="accent"
      semantics="tabs"
      ariaLabel="Asset catalog view"
    />

    {#if isSpatialView}
      <section class="decision-card">
        <span class="decision-kicker">Gate 1 · Revision 6</span>
        <h2>{viewCopy.title}</h2>
        <p>{viewCopy.body}</p>
        <div class="decision-stats" aria-label="Catalog summary">
          <span><strong>4</strong> floating banks</span>
          <span><strong>2</strong> finished olives</span>
          <span><strong>1</strong> massive sanctuary</span>
        </div>
      </section>

      <section class="hunt-section" aria-labelledby="hunt-heading">
        <div class="section-heading">
          <span class="decision-kicker">Asset production ledger</span>
          <h2 id="hunt-heading">
            Generate the signatures. Source the geology.
          </h2>
        </div>
        <div class="hunt-list">
          {#each CLOUDBREAK_ASSET_HUNT as target (target.id)}
            <article class="hunt-card" data-method={target.method}>
              <div class="hunt-heading">
                <div>
                  <span class="asset-role">{target.role}</span>
                  <h3>{target.label}</h3>
                </div>
                <span class="method">{target.method}</span>
              </div>
              <p>{target.target}</p>
              <small
                ><strong>{target.priority}:</strong> {target.acceptance}</small
              >
            </article>
          {/each}
        </div>
      </section>
    {/if}

    {#if visibleAssets.length > 0}
      <section class="asset-list" aria-live="polite">
        {#each visibleAssets as asset (asset.id)}
          <article class="asset-card" data-verdict={asset.verdict}>
            <div class="asset-heading">
              <div>
                <span class="asset-role">{asset.role}</span>
                <h2>{asset.label}</h2>
              </div>
              <span class="verdict">{verdictLabels[asset.verdict]}</span>
            </div>
            <p>{asset.rationale}</p>
            <dl>
              <div>
                <dt>Source</dt>
                <dd>{asset.sourceLabel}</dd>
              </div>
              <div>
                <dt>Weight</dt>
                <dd>
                  {formatCatalogBytes(asset.sizeBytes)} · {formatCatalogVertices(
                    asset.renderVertexCount
                  )}
                </dd>
              </div>
              <div>
                <dt>Rights</dt>
                <dd>{asset.license}</dd>
              </div>
            </dl>
          </article>
        {/each}
      </section>
    {/if}
  </aside>
</main>

<style>
  :global(html) {
    background: #b8cad9;
  }

  :global(body) {
    margin: 0;
    overflow: hidden;
    background: #b8cad9;
  }

  .catalog-shell {
    --panel: rgb(30 35 35 / 0.94);
    --panel-soft: rgb(255 250 239 / 0.065);
    --stroke: rgb(246 231 197 / 0.17);
    --ink: #fffaf0;
    --muted: #c8c5bb;
    --gold: #efd49a;
    --olive: #aeb887;
    --use: #b8dbb1;
    --adapt: #efd49a;
    --distant: #b8c9d8;
    --exclude: #d4aaa3;

    display: grid;
    grid-template-columns: minmax(0, 1fr) clamp(24rem, 27vw, 34rem);
    width: 100vw;
    height: 100dvh;
    overflow: hidden;
    color: var(--ink);
    background: #b8cad9;
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  }

  .catalog-stage {
    position: relative;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .catalog-stage :global(canvas) {
    display: block;
    width: 100%;
    height: 100%;
    cursor: grab;
    touch-action: none;
  }

  .catalog-stage :global(canvas:active) {
    cursor: grabbing;
  }

  .stage-caption {
    position: absolute;
    bottom: 1.25rem;
    left: 1.25rem;
    display: grid;
    gap: 0.18rem;
    min-width: 16rem;
    padding: 0.8rem 1rem;
    border: 1px solid rgb(255 255 255 / 0.24);
    border-radius: 0.9rem;
    background: rgb(29 35 36 / 0.72);
    box-shadow: 0 1.2rem 3rem rgb(32 39 46 / 0.18);
    backdrop-filter: blur(14px);
    pointer-events: none;
  }

  .stage-caption span,
  .stage-caption small {
    color: #e5e1d6;
    font-size: max(12px, 0.72rem);
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }

  .stage-caption strong {
    font-family: Georgia, "Times New Roman", serif;
    font-size: clamp(1.12rem, 1.25vw, 1.55rem);
    font-weight: 500;
  }

  .catalog-panel {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    min-width: 0;
    min-height: 0;
    padding: clamp(1.2rem, 2vw, 2rem);
    overflow-y: auto;
    border-left: 1px solid var(--stroke);
    background:
      radial-gradient(
        circle at 100% 0%,
        rgb(173 184 135 / 0.12),
        transparent 34%
      ),
      var(--panel);
    box-shadow: -1.5rem 0 4rem rgb(24 31 35 / 0.16);
  }

  header {
    display: grid;
    gap: 0.45rem;
  }

  .eyebrow,
  .asset-role,
  .decision-kicker {
    margin: 0;
    color: var(--gold);
    font-size: max(12px, 0.7rem);
    font-weight: 760;
    letter-spacing: 0.13em;
    text-transform: uppercase;
  }

  h1,
  h2,
  p {
    margin: 0;
  }

  h1 {
    font-family: Georgia, "Times New Roman", serif;
    font-size: clamp(2rem, 3vw, 3.2rem);
    font-weight: 500;
    letter-spacing: -0.035em;
    line-height: 0.98;
  }

  .lede {
    color: var(--muted);
    font-size: max(15px, 0.94rem);
    line-height: 1.55;
  }

  :global(.catalog-panel .segmented-control) {
    --theme-card-bg: rgb(255 255 255 / 0.055);
    --theme-stroke: var(--stroke);
    --theme-text: var(--ink);
    --theme-text-dim: var(--muted);
    --theme-accent: #a48d58;
    flex: 0 0 auto;
  }

  .decision-card,
  .asset-card,
  .hunt-card {
    border: 1px solid var(--stroke);
    border-radius: 1rem;
    background: var(--panel-soft);
  }

  .decision-card {
    display: grid;
    gap: 0.7rem;
    padding: 1rem;
  }

  .decision-card h2 {
    font-family: Georgia, "Times New Roman", serif;
    font-size: clamp(1.22rem, 1.5vw, 1.55rem);
    font-weight: 500;
    line-height: 1.16;
  }

  .decision-card p,
  .asset-card > p,
  .hunt-card > p,
  .hunt-card > small {
    color: var(--muted);
    font-size: max(14px, 0.84rem);
    line-height: 1.48;
  }

  .decision-stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.5rem;
  }

  .decision-stats span {
    display: grid;
    gap: 0.12rem;
    padding: 0.62rem;
    border-radius: 0.7rem;
    color: var(--muted);
    background: rgb(0 0 0 / 0.14);
    font-size: max(12px, 0.7rem);
    line-height: 1.24;
  }

  .decision-stats strong {
    color: var(--ink);
    font-size: 1.18rem;
    font-variant-numeric: tabular-nums;
  }

  .asset-list {
    display: grid;
    gap: 0.72rem;
    padding-bottom: 1rem;
  }

  .hunt-section,
  .section-heading {
    display: grid;
  }

  .hunt-section {
    gap: 0.7rem;
  }

  .section-heading {
    gap: 0.28rem;
  }

  .section-heading h2 {
    margin: 0;
    font-family: Georgia, "Times New Roman", serif;
    font-size: clamp(1.15rem, 1.35vw, 1.45rem);
    font-weight: 500;
    line-height: 1.16;
  }

  .hunt-list {
    display: grid;
    gap: 0.62rem;
  }

  .hunt-card {
    display: grid;
    gap: 0.58rem;
    padding: 0.82rem;
  }

  .hunt-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.7rem;
  }

  .hunt-heading > div {
    display: grid;
    gap: 0.18rem;
  }

  .hunt-heading h3 {
    margin: 0;
    font-family: Georgia, "Times New Roman", serif;
    font-size: clamp(1rem, 1.08vw, 1.18rem);
    font-weight: 500;
  }

  .method {
    flex: 0 0 auto;
    padding: 0.32rem 0.48rem;
    border: 1px solid rgb(239 212 154 / 0.56);
    border-radius: 999px;
    color: var(--gold);
    font-size: max(12px, 0.64rem);
    font-weight: 720;
    letter-spacing: 0.025em;
    white-space: nowrap;
  }

  .hunt-card > small strong {
    color: var(--ink);
  }

  .asset-card {
    display: grid;
    gap: 0.72rem;
    padding: 0.92rem;
  }

  .asset-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.8rem;
  }

  .asset-heading > div {
    display: grid;
    gap: 0.2rem;
    min-width: 0;
  }

  .asset-heading h2 {
    font-family: Georgia, "Times New Roman", serif;
    font-size: clamp(1.08rem, 1.2vw, 1.3rem);
    font-weight: 500;
  }

  .asset-role {
    color: var(--muted);
    letter-spacing: 0.07em;
  }

  .verdict {
    flex: 0 0 auto;
    min-width: 5.7rem;
    padding: 0.35rem 0.52rem;
    border: 1px solid currentColor;
    border-radius: 999px;
    font-size: max(12px, 0.68rem);
    font-weight: 760;
    letter-spacing: 0.045em;
    text-align: center;
    text-transform: uppercase;
  }

  [data-verdict="reuse"] .verdict {
    color: var(--use);
  }

  [data-verdict="adapt"] .verdict {
    color: var(--adapt);
  }

  [data-verdict="distant-only"] .verdict {
    color: var(--distant);
  }

  [data-verdict="exclude"] .verdict {
    color: var(--exclude);
  }

  dl {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.55rem;
    margin: 0;
  }

  dl div {
    min-width: 0;
  }

  dt {
    margin-bottom: 0.16rem;
    color: #999b96;
    font-size: max(11px, 0.62rem);
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }

  dd {
    margin: 0;
    color: #e5e1d7;
    font-size: max(12px, 0.7rem);
    line-height: 1.35;
    overflow-wrap: anywhere;
  }

  @media (min-width: 1680px) {
    .catalog-panel {
      gap: 1.2rem;
    }

    .asset-list {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .catalog-shell {
      grid-template-columns: minmax(0, 1fr) clamp(34rem, 34vw, 54rem);
    }

    dl {
      grid-template-columns: 1fr;
    }
  }

  @media (min-width: 2600px) {
    .catalog-shell {
      font-size: 1.2rem;
    }

    .catalog-panel {
      padding: 2.6rem;
    }
  }

  @media (max-width: 760px) {
    :global(body) {
      overflow: auto;
    }

    .catalog-shell {
      grid-template-columns: 1fr;
      grid-template-rows: minmax(18rem, 46dvh) auto;
      height: auto;
      min-height: 100dvh;
      overflow: visible;
    }

    .catalog-panel {
      min-height: 54dvh;
      overflow: visible;
      border-top: 1px solid var(--stroke);
      border-left: 0;
    }

    .stage-caption {
      right: 0.75rem;
      bottom: 0.75rem;
      left: 0.75rem;
      min-width: 0;
      padding: 0.62rem 0.75rem;
    }

    .decision-stats,
    dl {
      grid-template-columns: 1fr;
    }
  }

  @media (max-height: 500px) and (min-width: 761px) {
    .catalog-shell {
      grid-template-columns: minmax(0, 1fr) minmax(21rem, 38vw);
    }

    .catalog-panel {
      gap: 0.7rem;
      padding: 0.8rem;
    }

    .lede,
    .decision-card {
      display: none;
    }

    h1 {
      font-size: 1.7rem;
    }

    .asset-card {
      gap: 0.45rem;
      padding: 0.65rem;
    }

    .asset-card > p,
    dl {
      display: none;
    }

    .stage-caption {
      bottom: 0.65rem;
      left: 0.65rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .catalog-shell * {
      scroll-behavior: auto !important;
    }
  }
</style>
