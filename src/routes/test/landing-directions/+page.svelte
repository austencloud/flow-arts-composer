<script lang="ts">
  import MarketingChrome from "#lib/shared/landing/components/MarketingChrome.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import EditorialFrontPage from "./_components/EditorialFrontPage.svelte";
  import ReadingIndex from "./_components/ReadingIndex.svelte";
  import "#lib/shared/landing/styles/public-editorial.css";

  type Direction = "front-page" | "reading-index";

  const directions: Array<{ value: Direction; label: string }> = [
    { value: "front-page", label: "A · Front page" },
    { value: "reading-index", label: "B · Reading index" },
  ];

  let direction = $state<Direction>("front-page");
</script>

<svelte:head>
  <title>Landing page directions · TKA test</title>
  <meta
    name="description"
    content="Two live-component directions for The Kinetic Alphabet landing page."
  />
</svelte:head>

<MarketingChrome>
  <div class="direction-lab">
    <div class="direction-switcher" aria-label="Landing page direction">
      <div class="switcher-copy">
        <span class="switcher-kicker">Landing study</span>
        <span class="switcher-note">Same content. Two ways in.</span>
      </div>
      <div class="switcher-control">
        <SegmentedControl
          options={directions}
          value={direction}
          onchange={(next) => (direction = next)}
          color="accent"
        />
      </div>
    </div>

    {#if direction === "front-page"}
      <EditorialFrontPage />
    {:else}
      <ReadingIndex />
    {/if}
  </div>
</MarketingChrome>

<style>
  .direction-lab {
    --lab-surface: color-mix(
      in oklch,
      var(--theme-card-bg, oklch(0.16 0.02 275)) 88%,
      transparent
    );
    --lab-stroke: var(--theme-stroke, oklch(0.75 0.02 275 / 0.18));
    min-height: 100vh;
    padding-top: 80px;
  }

  .direction-switcher {
    position: sticky;
    top: 68px;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1.25rem;
    width: min(72rem, calc(100% - 2rem));
    min-height: 64px;
    margin: 0 auto 1.25rem;
    padding: 0.65rem 0.8rem 0.65rem 1rem;
    border: 1px solid var(--lab-stroke);
    border-radius: 14px;
    background: var(--lab-surface);
    box-shadow: 0 16px 50px oklch(0.04 0.03 275 / 0.28);
    backdrop-filter: blur(22px);
    -webkit-backdrop-filter: blur(22px);
  }

  .switcher-copy {
    display: flex;
    flex-direction: column;
    min-width: 0;
    line-height: 1.2;
  }

  .switcher-kicker {
    color: var(--theme-text, white);
    font-size: 0.78rem;
    font-weight: 720;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .switcher-note {
    margin-top: 0.18rem;
    color: var(--theme-text-secondary, oklch(0.72 0.02 275));
    font-size: 0.82rem;
  }

  .switcher-control {
    width: min(25rem, 46vw);
    flex: 0 0 auto;
  }

  @media (max-width: 640px) {
    .direction-lab {
      padding-top: 72px;
    }

    .direction-switcher {
      top: 60px;
      align-items: stretch;
      flex-direction: column;
      width: calc(100% - 1rem);
      padding: 0.7rem;
    }

    .switcher-copy {
      padding-inline: 0.25rem;
    }

    .switcher-note {
      display: none;
    }

    .switcher-control {
      width: 100%;
    }
  }
</style>
