<script lang="ts">
  import type { BrowseViewMode } from "$lib/shared/browse/domain/browse-view-mode";
  import { getSettings } from "$lib/shared/application/state/app-state.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import Drawer from "$lib/shared/foundation/ui/Drawer.svelte";
  import ChoreoCard from "$lib/shared/sequence-viewer/components/ChoreoCard.svelte";
  import { getFuseContext } from "../context/fuse-context";
  import type { FuseSide } from "../state/fuse-shuffle-pool.svelte";

  let {
    isOpen = $bindable(false),
    kind = "help",
    side = "left",
  }: {
    isOpen?: boolean;
    kind?: "help" | "notation";
    side?: FuseSide;
  } = $props();

  const { state: fuseState } = getFuseContext();
  const settings = getSettings();
  const source = $derived(side === "left" ? fuseState.left : fuseState.right);
  const label = $derived(side === "left" ? "Left" : "Right");
  const title = $derived(
    kind === "help" ? "How Fuse works" : `${label} notation`
  );
  const viewMode = $derived<BrowseViewMode>({
    subject: "props",
    granularity: "solo",
    hand: side,
  });
  const cardColumns = $derived(
    (source.sequence?.steps.length ?? 0) <= 4 ? 2 : 4
  );

  function close(): void {
    isOpen = false;
  }
</script>

<Drawer
  bind:isOpen
  placement="bottom"
  closeOnBackdrop={true}
  closeOnEscape={true}
  dismissible={true}
  showHandle={true}
  trapFocus={true}
  focusContainerOnOpen={true}
  returnFocusOnClose={true}
  preventScroll={true}
  labelledBy="fuse-detail-title"
  class="fuse-detail-drawer"
  backdropClass="fuse-detail-backdrop"
>
  <div class="detail-shell">
    <header class="detail-header">
      <div>
        <p class="detail-kicker">Fuse</p>
        <h2 id="fuse-detail-title">{title}</h2>
      </div>
      <PanelButton variant="secondary" onclick={close}>
        <i class="fas fa-xmark" aria-hidden="true"></i>
        Close
      </PanelButton>
    </header>

    {#if kind === "help"}
      <div class="help-steps">
        <section class="help-step">
          <span class="step-number" aria-hidden="true">1</span>
          <div>
            <h3>Set the length</h3>
            <p>Both one-hand LOOPs use the same step count.</p>
          </div>
        </section>
        <section class="help-step">
          <span class="step-number" aria-hidden="true">2</span>
          <div>
            <h3>Shape either LOOP</h3>
            <p>Generate, choose, or adjust each source independently.</p>
          </div>
        </section>
        <section class="help-step">
          <span class="step-number" aria-hidden="true">3</span>
          <div>
            <h3>Fuse and open</h3>
            <p>The result opens in the sequence viewer.</p>
          </div>
        </section>
      </div>
    {:else if source.sequence}
      <div class="drawer-notation themed-scrollbar">
        <ChoreoCard
          sequence={source.sequence}
          browseViewMode={viewMode}
          columnCount={cardColumns}
          includeStartPlacement={false}
          showWord={false}
          showStepNumbers={true}
          showDifficultyLevel={false}
          showNotes={false}
          showLoopGlyph={false}
          darkMode={true}
          leftPropType={settings.leftPropType}
          rightPropType={settings.rightPropType}
          hideSoloHeader={true}
          fitWidth={true}
        />
      </div>
    {:else}
      <p class="drawer-empty">This path is still loading.</p>
    {/if}
  </div>
</Drawer>

<style>
  :global(.drawer-content.fuse-detail-drawer) {
    --min-touch-target: 48px;
    --sheet-bg:
      linear-gradient(
        var(--theme-panel-bg, rgba(15, 17, 24, 0.96)),
        var(--theme-panel-bg, rgba(15, 17, 24, 0.96))
      ),
      color-mix(in srgb, var(--theme-text, white) 8%, black);
    --sheet-max-height: min(86dvh, 780px);
    --sheet-border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
    --sheet-shadow: 0 -18px 60px rgba(0, 0, 0, 0.42);
  }

  :global(.drawer-overlay.fuse-detail-backdrop) {
    --sheet-backdrop-bg: rgba(0, 0, 0, 0.42);
  }

  .detail-shell {
    display: flex;
    flex-direction: column;
    gap: var(--settings-spacing-lg, 20px);
    width: min(100%, 980px);
    min-height: 0;
    margin: 0 auto;
    padding: 10px clamp(16px, 4vw, 36px) 28px;
    color: var(--theme-text, #fff);
  }

  .detail-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .detail-kicker,
  h2,
  h3,
  p {
    margin: 0;
  }

  .detail-kicker {
    color: var(--semantic-warning, #f97316);
    font-size: var(--font-size-compact, 12px);
    font-weight: 750;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h2 {
    font-size: clamp(1.25rem, 4vw, 1.7rem);
    font-weight: 740;
  }

  .help-steps {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--settings-spacing-md, 14px);
  }

  .help-step {
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr);
    gap: 12px;
    padding: 18px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--settings-radius-lg, 16px);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
  }

  .step-number {
    display: grid;
    place-items: center;
    width: 42px;
    height: 42px;
    border: 1px solid
      color-mix(in srgb, var(--semantic-warning, #f97316) 45%, transparent);
    border-radius: 50%;
    background: color-mix(
      in srgb,
      var(--semantic-warning, #f97316) 14%,
      transparent
    );
    color: var(--semantic-warning, #f97316);
    font-size: var(--font-size-min, 14px);
    font-variant-numeric: tabular-nums;
    font-weight: 800;
  }

  .help-step h3 {
    margin-bottom: 6px;
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
  }

  .help-step p,
  .drawer-empty {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.68));
    font-size: var(--font-size-min, 14px);
    line-height: 1.5;
  }

  .drawer-notation {
    min-height: 0;
    max-height: 62dvh;
    overflow: auto;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--settings-radius-lg, 16px);
    background: color-mix(in srgb, var(--theme-card-bg, #161821) 82%, black);
  }

  .drawer-empty {
    padding: 24px;
    text-align: center;
  }

  @media (max-width: 720px) {
    .help-steps {
      grid-template-columns: 1fr;
    }

    .detail-shell {
      padding-inline: 14px;
    }
  }
</style>
