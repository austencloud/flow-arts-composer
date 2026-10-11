<script lang="ts">
  import { goto } from "$app/navigation";
  import { tick } from "svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";

  const VIEWPORTS = [
    { id: "phone", label: "375 × 667", width: 375, height: 667, scale: 0.9 },
    {
      id: "landscape",
      label: "960 × 412",
      width: 960,
      height: 412,
      scale: 0.75,
    },
    {
      id: "tablet",
      label: "820 × 1180",
      width: 820,
      height: 1180,
      scale: 0.62,
    },
    {
      id: "laptop",
      label: "1440 × 900",
      width: 1440,
      height: 900,
      scale: 0.58,
    },
    { id: "hd", label: "1920 × 1080", width: 1920, height: 1080, scale: 0.46 },
    {
      id: "wide",
      label: "2560 × 1440",
      width: 2560,
      height: 1440,
      scale: 0.35,
    },
    { id: "4k", label: "3840 × 2160", width: 3840, height: 2160, scale: 0.25 },
  ] as const;

  type ViewportId = (typeof VIEWPORTS)[number]["id"];

  let viewportId = $state<ViewportId>("laptop");
  let frameRevision = $state(0);
  let frameReady = $state(false);

  const selectedViewport = $derived(
    VIEWPORTS.find((viewport) => viewport.id === viewportId) ?? VIEWPORTS[3]
  );
  const frameSource = $derived(
    `/test/construct-solo-handoff/proposal?review=${frameRevision}`
  );

  async function reloadProposal(): Promise<void> {
    frameReady = false;
    frameRevision += 1;
    await tick();
  }

  async function openFullSize(): Promise<void> {
    await goto("/test/construct-solo-handoff/proposal");
  }
</script>

<svelte:head>
  <title>Construct solo handoff review</title>
</svelte:head>

<main class="review-page">
  <header class="review-header">
    <div>
      <span class="eyebrow">Solo-aware UX harness</span>
      <h1>Choreo Card → Construct</h1>
      <p>
        A proposed first-run flow built with real sequence data, motion catalog
        options, and production pictograph renderers.
      </p>
    </div>
    <div class="header-actions">
      <PanelButton variant="secondary" onclick={reloadProposal}>
        Reset walkthrough
      </PanelButton>
      <PanelButton variant="primary" onclick={openFullSize}>
        Open full size
      </PanelButton>
    </div>
  </header>

  <div class="review-layout">
    <aside class="review-rail">
      <section class="fixture-summary">
        <span class="section-label">Fixture</span>
        <strong>Left-hand smooth box</strong>
        <span>8 canonical steps · complete solo artifact</span>
      </section>

      <section>
        <span class="section-label" id="solo-viewport-label">Viewport</span>
        <div
          class="viewport-options"
          role="radiogroup"
          aria-labelledby="solo-viewport-label"
        >
          {#each VIEWPORTS as viewport}
            <button
              type="button"
              class:active={viewport.id === viewportId}
              role="radio"
              aria-checked={viewport.id === viewportId}
              onclick={() => (viewportId = viewport.id)}
            >
              <strong>{viewport.label}</strong>
              <span>{Math.round(viewport.scale * 100)}% review scale</span>
            </button>
          {/each}
        </div>
      </section>

      <section class="truth-panel">
        <span class="section-label">What is real here</span>
        <dl>
          <div>
            <dt>Artifact</dt>
            <dd><code>soloPropToSequence</code></dd>
          </div>
          <div>
            <dt>Sequence</dt>
            <dd>production <code>StepGrid</code></dd>
          </div>
          <div>
            <dt>Hand</dt>
            <dd>left only</dd>
          </div>
          <div>
            <dt>Options</dt>
            <dd>production motion catalog</dd>
          </div>
          <div>
            <dt>Rendering</dt>
            <dd>production pictographs</dd>
          </div>
        </dl>
      </section>

      <section class="review-question">
        <span class="section-label">Walkthrough</span>
        <p>
          Start by continuing blue. Then press <strong>Add red path</strong> to see
          the separate pairing task. Choose the saved red path to reach the normal
          two-hand state.
        </p>
      </section>
    </aside>

    <section
      class="review-workspace"
      aria-label="Solo-aware Construct proposal"
    >
      <header class="frame-header">
        <div>
          <strong>{selectedViewport.width} × {selectedViewport.height}</strong>
          <span>interactive proposal</span>
        </div>
        <span class:ready={frameReady} class="status">
          {frameReady ? "Ready to review" : "Loading proposal…"}
        </span>
      </header>

      <div class="preview-scroll">
        <div
          class="viewport-shell"
          style={`--frame-width:${selectedViewport.width}px;--frame-height:${selectedViewport.height}px;--frame-scale:${selectedViewport.scale};--display-width:${selectedViewport.width * selectedViewport.scale}px;--display-height:${selectedViewport.height * selectedViewport.scale}px;`}
        >
          {#key frameRevision}
            <iframe
              src={frameSource}
              title="Solo-aware Construct walkthrough"
              onload={() => (frameReady = true)}
            ></iframe>
          {/key}
        </div>
      </div>
    </section>
  </div>
</main>

<style>
  :global(html),
  :global(body) {
    margin: 0;
    min-height: 100%;
    background: #090b11;
  }

  .review-page {
    min-height: 100dvh;
    padding: clamp(16px, 2vw, 36px);
    background:
      radial-gradient(
        circle at 12% 8%,
        rgba(255, 145, 35, 0.08),
        transparent 28%
      ),
      #090b11;
    color: var(--theme-text, #f7f8fb);
    font-family: system-ui, sans-serif;
  }

  .review-header,
  .review-layout {
    width: min(100%, 1760px);
    margin-inline: auto;
  }

  .review-header {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 24px;
    margin-bottom: 20px;
  }

  .eyebrow,
  .section-label {
    color: var(--theme-accent, #ff9123);
    font-size: var(--font-size-compact, 12px);
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  h1,
  p {
    margin: 0;
  }

  h1 {
    margin-top: 4px;
    font-size: clamp(28px, 3vw, 48px);
    letter-spacing: -0.035em;
  }

  .review-header p {
    max-width: 54rem;
    margin-top: 7px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.62));
    line-height: 1.5;
  }

  .header-actions {
    display: flex;
    flex: none;
    gap: 8px;
  }

  .review-layout {
    display: grid;
    grid-template-columns: minmax(260px, 330px) minmax(0, 1fr);
    gap: 18px;
  }

  .review-rail,
  .review-workspace {
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 18px;
    background: var(--theme-panel-bg, #11131a);
  }

  .review-rail {
    align-self: start;
    padding: 14px;
  }

  .review-rail section + section {
    margin-top: 18px;
  }

  .section-label {
    display: block;
    margin-bottom: 8px;
  }

  .fixture-summary {
    padding: 12px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
  }

  .fixture-summary strong,
  .fixture-summary > span:last-child {
    display: block;
  }

  .fixture-summary strong {
    font-size: 14px;
  }

  .fixture-summary > span:last-child {
    margin-top: 3px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.58));
    font-size: 12px;
  }

  .viewport-options {
    display: grid;
    gap: 6px;
  }

  .viewport-options button {
    display: flex;
    min-height: var(--min-touch-target, 44px);
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 10px;
    border: 1px solid transparent;
    border-radius: 10px;
    background: transparent;
    color: var(--theme-text, #fff);
    text-align: left;
    cursor: pointer;
  }

  .viewport-options button:hover {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
  }

  .viewport-options button.active {
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #ff9123) 55%,
      transparent
    );
    background: color-mix(
      in srgb,
      var(--theme-accent, #ff9123) 13%,
      transparent
    );
  }

  .viewport-options strong,
  .viewport-options span {
    display: block;
  }

  .viewport-options strong {
    font-size: 13px;
  }

  .viewport-options span {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.58));
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }

  .truth-panel,
  .review-question {
    padding: 12px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
  }

  dl {
    display: grid;
    gap: 8px;
    margin: 0;
  }

  dl div {
    display: grid;
    grid-template-columns: 5rem minmax(0, 1fr);
    gap: 8px;
    font-size: 12px;
  }

  dt {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.58));
  }

  dd {
    min-width: 0;
    margin: 0;
    overflow-wrap: anywhere;
  }

  code {
    font-size: 11px;
  }

  .review-question p {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.68));
    font-size: 13px;
    line-height: 1.5;
  }

  .review-workspace {
    min-width: 0;
    overflow: hidden;
  }

  .frame-header {
    display: flex;
    min-height: 54px;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 9px 12px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .frame-header strong,
  .frame-header span {
    display: block;
  }

  .frame-header strong {
    font-size: 13px;
    font-variant-numeric: tabular-nums;
  }

  .frame-header div span,
  .status {
    margin-top: 2px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.58));
    font-size: 11px;
  }

  .status {
    margin: 0;
  }

  .status.ready {
    color: var(--semantic-success, #4ade80);
  }

  .preview-scroll {
    min-height: 720px;
    padding: 18px;
    overflow: auto;
    background: #05070a;
  }

  .viewport-shell {
    width: var(--display-width);
    height: var(--display-height);
    margin-inline: auto;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.13);
    border-radius: 10px;
    background: #07121b;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.38);
  }

  iframe {
    display: block;
    width: var(--frame-width);
    height: var(--frame-height);
    border: 0;
    background: #07121b;
    transform: scale(var(--frame-scale));
    transform-origin: top left;
  }

  @media (max-width: 980px) {
    .review-header {
      align-items: start;
      flex-direction: column;
    }

    .review-layout {
      grid-template-columns: 1fr;
    }

    .viewport-options {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 560px) {
    .review-page {
      padding: 10px;
    }

    .header-actions,
    .header-actions :global(button) {
      width: 100%;
    }

    .viewport-options {
      grid-template-columns: 1fr;
    }

    .preview-scroll {
      min-height: 540px;
      padding: 8px;
    }
  }
</style>
