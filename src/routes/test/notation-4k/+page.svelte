<script lang="ts">
  import MarketingChrome from "#lib/shared/landing/components/MarketingChrome.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import demoJson from "#lib/shared/landing/data/demo-sequence.json";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import NotationLayoutStudy from "./_components/NotationLayoutStudy.svelte";

  type LayoutMode = "atlas" | "cinematic";

  const layoutOptions: Array<{ value: LayoutMode; label: string }> = [
    { value: "atlas", label: "Editorial Atlas" },
    { value: "cinematic", label: "Cinematic Runway" },
  ];

  const heroDemoSequence = demoJson as unknown as SequenceData;
  let layoutMode = $state<LayoutMode>("atlas");
</script>

<svelte:head>
  <title>Notation 4K Layout Lab</title>
  <meta
    name="description"
    content="A native comparison of two large-screen Flow Arts Notation layouts."
  />
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<MarketingChrome>
  <div class="lab-shell">
    <aside class="layout-control" aria-label="Choose a notation layout">
      <span class="control-label">4K composition</span>
      <div class="control-input">
        <SegmentedControl
          options={layoutOptions}
          value={layoutMode}
          onchange={(value) => (layoutMode = value)}
          color="accent"
        />
      </div>
    </aside>

    <NotationLayoutStudy {layoutMode} sequence={heroDemoSequence} />
  </div>
</MarketingChrome>

<style>
  .lab-shell {
    position: relative;
    min-height: 100vh;
    padding-top: 72px;
  }

  .layout-control {
    position: sticky;
    z-index: 30;
    top: 72px;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0.55rem;
    width: min(calc(100% - 2rem), 32rem);
    margin: 0 auto;
    padding: 0.75rem;
    background: var(--theme-panel-bg, #111326);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: var(--radius-lg, 1rem);
    box-shadow: 0 16px 36px rgba(0, 0, 0, 0.22);
  }

  .control-label {
    color: var(--theme-text-dim, #aaa5bc);
    font-family: "Inter", system-ui, sans-serif;
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 680;
    letter-spacing: 0.14em;
    text-align: center;
    text-transform: uppercase;
  }

  .control-input {
    min-width: 0;
  }

  @media (min-width: 640px) {
    .layout-control {
      grid-template-columns: auto minmax(18rem, 1fr);
      align-items: center;
      width: min(calc(100% - 3rem), 38rem);
      padding: 0.55rem 0.65rem 0.55rem 1rem;
    }
  }
</style>
