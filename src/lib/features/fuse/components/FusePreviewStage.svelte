<script lang="ts">
  import { Popover } from "bits-ui";
  import BpmChips from "$lib/shared/animation-engine/components/controls/BpmChips.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import ActionButton from "$lib/shared/components/selection/ActionButton.svelte";
  import { getSequenceDisplayName } from "$lib/shared/foundation/services/word-deriver";
  import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
  import { getFuseContext } from "../context/fuse-context";
  import type { FuseSide } from "../state/fuse-shuffle-pool.svelte";
  import FuseAnimationPreview from "./FuseAnimationPreview.svelte";
  import FuseMobileControls from "./FuseMobileControls.svelte";
  import FuseSourceCard from "./FuseSourceCard.svelte";

  let {
    onOpenViewer,
    onShare,
    onSave,
    onChooseFirstStep,
    onBuildPath,
    onEditPairing,
    compact = false,
    isSaving = false,
  }: {
    onOpenViewer: () => Promise<void>;
    onShare: () => Promise<void>;
    onSave: () => Promise<void>;
    onChooseFirstStep: (side: FuseSide) => void;
    onBuildPath: (side: FuseSide) => void;
    /** Opens the Pairing editor from the derived follower's badge. */
    onEditPairing?: () => void;
    compact?: boolean;
    isSaving?: boolean;
  } = $props();
  const { state: fuseState } = getFuseContext();
  let tempoOpen = $state(false);
  let decompositionOverride = $state<boolean | null>(null);
  const previewDecomposed = $derived(decompositionOverride ?? compact);

  function toggleDecomposition(): void {
    decompositionOverride = !previewDecomposed;
  }

  const leftName = $derived.by(() =>
    fuseState.left.sequence
      ? simplifyRepeatedWord(getSequenceDisplayName(fuseState.left.sequence))
      : "Left path"
  );
  const rightName = $derived.by(() =>
    fuseState.right.sequence
      ? simplifyRepeatedWord(getSequenceDisplayName(fuseState.right.sequence))
      : "Right path"
  );
  const previewDescription = $derived(
    fuseState.previewSequence && fuseState.appliedLength
      ? `Combined preview of Left path ${leftName} and Right path ${rightName}, ${fuseState.appliedLength} steps at ${fuseState.bpm} BPM.`
      : "Combined preview is loading."
  );
  const previewRevision = $derived(
    fuseState.left.revision + fuseState.right.revision
  );
</script>

<section
  class="preview-stage"
  class:compact
  data-fuse-layout-region="preview"
  aria-labelledby="fuse-preview-heading"
>
  <header class="preview-heading">
    <div>
      <h3 id="fuse-preview-heading">Combined preview</h3>
    </div>
    <div class="preview-heading-tools">
      <span class="preview-meta">
        {fuseState.appliedLength ?? fuseState.requestedLength} steps · {fuseState.bpm}
        BPM
      </span>
      {#if !compact}
        <div class="assembly-control">
          <PanelButton
            variant="secondary"
            disabled={!fuseState.previewSequence}
            ariaLabel={previewDecomposed
              ? "Reassemble combined preview"
              : "Disassemble combined preview"}
            onclick={toggleDecomposition}
          >
            <i
              class="fas {previewDecomposed
                ? 'fa-compress'
                : 'fa-table-columns'}"
              aria-hidden="true"
            ></i>
            {previewDecomposed ? "Reassemble" : "Disassemble"}
          </PanelButton>
        </div>
      {/if}
    </div>
  </header>

  {#if compact}
    <div class="mobile-source-toolbar" aria-label="Source path controls">
      <FuseSourceCard
        side="left"
        compactHero={true}
        toolbarOnly={true}
        {onChooseFirstStep}
        {onBuildPath}
        {onEditPairing}
      />
      <FuseSourceCard
        side="right"
        compactHero={true}
        toolbarOnly={true}
        {onChooseFirstStep}
        {onBuildPath}
        {onEditPairing}
      />
    </div>
  {/if}

  <div class="frame-wrap">
    <div class="preview-frame" role="img" aria-label={previewDescription}>
      {#if fuseState.previewSequence}
        <FuseAnimationPreview
          sequence={fuseState.previewSequence}
          currentStep={fuseState.currentStep}
          isPlaying={fuseState.clockRunning}
          decomposed={previewDecomposed}
          onToggle={() => fuseState.toggleClock()}
          onToggleDecomposed={toggleDecomposition}
          onError={(failure) => fuseState.reportPreviewFailure(failure)}
        />
      {:else}
        <div class="preview-placeholder" aria-hidden="true">
          <span class="orbit orbit-blue"></span>
          <span class="orbit orbit-red"></span>
          <i class="fas fa-fire-flame-curved"></i>
        </div>
      {/if}

      {#if previewRevision > 2}
        {#key previewRevision}
          <span class="preview-flash" aria-hidden="true"></span>
        {/key}
      {/if}
    </div>

    {#if !compact && fuseState.error}
      <div class="error-strip" role="alert">
        <p>{fuseState.statusMessage}</p>
        {#if fuseState.canRetry}
          <PanelButton
            variant="secondary"
            disabled={fuseState.isLoadingLength ||
              fuseState.pendingSide !== null}
            onclick={() => void fuseState.retry()}
          >
            <i class="fas fa-arrow-rotate-right" aria-hidden="true"></i>
            Retry
          </PanelButton>
        {/if}
      </div>
    {/if}
  </div>

  {#if compact}
    <FuseMobileControls {onOpenViewer} {onShare} {onSave} {isSaving} />
  {:else}
    <p
      id="fuse-action-status"
      class="sr-only"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {fuseState.statusMessage}
    </p>

    <!-- Playback pauses/resumes by tapping the canvas (tapToToggle + hover
         badge on FuseAnimationPreview). No standalone transport button — the
         app-wide direction is canvas-tap for play/pause. -->
    <div class="stage-controls">
      <div class="bpm-compact">
        <Popover.Root bind:open={tempoOpen}>
          <Popover.Trigger>
            {#snippet child({ props })}
              <button
                {...props}
                class="tempo-trigger"
                type="button"
                disabled={!fuseState.previewSequence || fuseState.isFusing}
                aria-label={`Set tempo, currently ${fuseState.bpm} BPM`}
              >
                <span class="tempo-value">{fuseState.bpm}</span>
                <span class="tempo-unit">BPM</span>
                <i class="fas fa-chevron-up" aria-hidden="true"></i>
              </button>
            {/snippet}
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              side="top"
              align="center"
              sideOffset={10}
              collisionPadding={12}
              class="fuse-tempo-popover"
            >
              <BpmChips
                bpm={fuseState.bpm}
                variant="full"
                onBpmChange={(value) => fuseState.setBpm(value)}
              />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>

      <div class="result-actions" aria-label="Combined sequence actions">
        <div class="viewer-slot">
          <ActionButton
            label="Open viewer"
            busyLabel="Opening viewer..."
            icon={fuseState.isFusing ? "fa-spinner fa-spin" : "fa-expand"}
            color="fuse"
            fullWidth={true}
            ariaDisabled={!fuseState.canFuse}
            busy={fuseState.isFusing}
            onclick={() => void onOpenViewer()}
          />
        </div>
        <div class="save-slot">
          <PanelButton
            variant="secondary"
            fullWidth={true}
            disabled={!fuseState.canFuse || isSaving}
            ariaBusy={isSaving}
            saveShortcut={true}
            onclick={() => void onSave()}
          >
            <i
              class="fas {isSaving ? 'fa-spinner fa-spin' : 'fa-bookmark'}"
              aria-hidden="true"
            ></i>
            {isSaving ? "Saving..." : "Save result"}
          </PanelButton>
        </div>
        <div class="share-slot">
          <PanelButton
            variant="secondary"
            fullWidth={true}
            disabled={!fuseState.canFuse}
            onclick={() => void onShare()}
          >
            Share
          </PanelButton>
        </div>
      </div>
    </div>
  {/if}
</section>

<style>
  /* bits-ui portals this content to the body end; without an explicit z-index
     it renders under the app chrome and reads as "the popover won't open".
     Matches PracticeBar's .pb-bpm-pop fix. */
  :global(.fuse-tempo-popover) {
    --min-touch-target: 48px;
    z-index: var(--z-dropdown, 1000);
    width: min(22rem, calc(100vw - 1.5rem));
    padding: 14px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 16px;
    background:
      linear-gradient(
        var(--theme-panel-bg, rgba(12, 14, 22, 0.96)),
        var(--theme-panel-bg, rgba(12, 14, 22, 0.96))
      ),
      color-mix(in srgb, var(--theme-text, white) 8%, black);
    box-shadow: 0 12px 40px var(--theme-shadow);
  }

  .preview-stage {
    grid-area: preview;
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--settings-spacing-md, 14px);
    min-width: 0;
    padding: var(--settings-spacing-md, 16px);
    overflow: hidden;
    border: 1px solid
      color-mix(
        in srgb,
        var(--semantic-warning, #f97316) 35%,
        var(--theme-stroke)
      );
    border-radius: var(--settings-radius-lg, 20px);
    background: var(--theme-panel-bg, rgba(12, 14, 22, 0.96));
    container: fuse-preview / inline-size;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }

  .preview-stage.compact {
    height: 100%;
    min-height: 0;
    gap: var(--settings-spacing-sm, 8px);
    padding: var(--settings-spacing-sm, 8px);
    border-color: color-mix(
      in srgb,
      var(--semantic-warning, #f97316) 42%,
      var(--theme-stroke)
    );
    border-radius: var(--settings-radius-lg, 18px);
    background: var(--theme-panel-bg);
  }

  .preview-stage.compact .preview-heading {
    display: none;
  }

  .compact .frame-wrap {
    flex: 1 1 0;
    min-height: 0;
  }

  .mobile-source-toolbar {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    flex: 0 0 auto;
    gap: var(--settings-spacing-sm, 8px);
    min-width: 0;
  }

  .mobile-source-toolbar :global(.source-card) {
    grid-area: auto;
  }

  h3 {
    margin: 0;
  }

  .preview-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--settings-spacing-md, 12px);
    min-width: 0;
  }

  .preview-heading > div {
    min-width: 0;
  }

  .preview-heading-tools {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--settings-spacing-sm, 10px);
  }

  .assembly-control {
    flex: 0 0 auto;
  }

  .assembly-control :global(.panel-btn) {
    min-height: var(--min-touch-target, 44px);
    padding: 8px 14px;
    border-radius: var(--settings-radius-md, 12px);
    white-space: nowrap;
  }

  /* Open viewer is the stage's one filled button: it builds the combined
     sequence and opens it where it can be played, saved, shared and
     exported. Save result is the direct second choice. Disassemble changes
     how the preview is drawn and Share is a shortcut into the viewer, so both
     sit in the quiet tier: no fill, faint outline, dimmer words. */
  .assembly-control :global(.panel-btn),
  .share-slot :global(.panel-btn) {
    border-color: color-mix(in srgb, var(--theme-stroke) 60%, transparent);
    background: transparent;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
  }

  .assembly-control :global(.panel-btn:hover:not(:disabled)),
  .share-slot :global(.panel-btn:hover:not(:disabled)) {
    border-color: var(--theme-stroke);
    background: var(--theme-card-bg);
    color: var(--theme-text, #fff);
  }

  .preview-heading h3 {
    color: var(--theme-text, #fff);
    font-size: 1rem;
    font-weight: 750;
  }

  .preview-meta {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.62));
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
  }

  .preview-meta {
    flex: 0 0 auto;
    font-variant-numeric: tabular-nums;
  }

  .frame-wrap {
    position: relative;
    display: flex;
    flex: 1 1 300px;
    min-width: 0;
    min-height: 260px;
  }

  .preview-frame {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--settings-radius-lg, 18px);
    background: color-mix(in srgb, var(--theme-card-bg, #161821) 76%, black);
  }

  @container fuse (min-width: 1680px) and (min-height: 900px) {
    .preview-stage {
      padding: 20px;
    }

    .preview-heading h3 {
      font-size: 1.25rem;
    }

    .preview-meta {
      font-size: 14px;
    }

    .frame-wrap {
      justify-content: center;
    }

    .preview-frame {
      flex: 0 1 auto;
      width: min(100%, calc(100cqh - 190px));
      max-width: 100%;
      aspect-ratio: 1;
      align-self: center;
    }
  }

  @container fuse (min-width: 2600px) and (min-height: 1400px) {
    .preview-stage {
      gap: var(--settings-spacing-lg, 20px);
      padding: 28px;
    }

    .preview-heading h3 {
      font-size: 1.5rem;
    }

    .preview-meta {
      font-size: var(--font-size-compact, 16px);
    }

    .stage-controls {
      gap: var(--settings-spacing-md, 14px);
    }

    .viewer-slot :global(.action-button),
    .result-actions :global(.panel-btn) {
      min-height: var(--min-touch-target, 64px);
      font-size: var(--font-size-min, 18px);
    }

    .tempo-value {
      font-size: 1.35rem;
    }

    .tempo-unit,
    .tempo-trigger i {
      font-size: var(--font-size-compact, 16px);
    }
  }

  .error-strip {
    position: absolute;
    inset-inline: 10px;
    bottom: 10px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--settings-spacing-sm, 8px);
    min-height: var(--min-touch-target, 48px);
    padding: 6px 6px 6px 12px;
    border: 1px solid
      color-mix(in srgb, var(--semantic-error, #fca5a5) 42%, transparent);
    border-radius: var(--settings-radius-md, 12px);
    background: color-mix(
      in srgb,
      var(--semantic-error, #fca5a5) 12%,
      var(--theme-panel-bg, #161821)
    );
  }

  .error-strip p {
    margin: 0;
    color: var(--semantic-error, #fca5a5);
    font-size: var(--font-size-min, 14px);
    line-height: 1.3;
  }

  .preview-placeholder {
    position: relative;
    display: grid;
    place-items: center;
    width: min(54%, 220px);
    aspect-ratio: 1;
    color: var(--semantic-warning, #f97316);
    font-size: clamp(1.8rem, 6cqw, 3.1rem);
  }

  .preview-placeholder i {
    opacity: 0.62;
  }

  .orbit {
    position: absolute;
    inset: 12%;
    border: 2px solid var(--orbit-color);
    border-radius: 50%;
    opacity: 0.35;
  }

  .orbit-blue {
    --orbit-color: var(--prop-blue, #2196f3);
    transform: translateX(-12%);
  }

  .orbit-red {
    --orbit-color: var(--prop-red, #f44336);
    transform: translateX(12%);
  }

  .preview-flash {
    position: absolute;
    inset: 3px;
    pointer-events: none;
    border: 2px solid
      color-mix(in srgb, var(--semantic-warning, #f97316) 72%, white);
    border-radius: calc(var(--settings-radius-lg, 18px) - 2px);
    animation: preview-change var(--duration-emphasis) var(--ease-out) both;
  }

  .stage-controls {
    display: grid;
    grid-template-columns: clamp(110px, 14cqw, 180px) minmax(0, 1fr);
    align-items: center;
    gap: var(--settings-spacing-sm, 10px);
    min-height: var(--min-touch-target, 44px);
  }

  /* With the standalone play/pause button gone (canvas-tap owns playback), the
     tempo control claims the freed width: it grows to a sane cap so BPM reads
     as a real control, while the Fuse button keeps the larger share and
     absorbs any remainder — prominent BPM, no leftover gap. */
  .bpm-compact {
    display: flex;
    width: 100%;
    min-width: 110px;
  }

  .result-actions {
    display: grid;
    grid-template-columns: minmax(0, 1.35fr) repeat(2, minmax(0, 1fr));
    gap: var(--settings-spacing-sm, 10px);
    min-width: 0;
  }

  .share-slot,
  .save-slot,
  .viewer-slot {
    min-width: 0;
  }

  .viewer-slot :global(.action-button),
  .result-actions :global(.panel-btn) {
    min-width: 0;
    min-height: 54px;
    padding-inline: clamp(8px, 1.2cqw, 16px);
    border-radius: 16px;
    white-space: nowrap;
  }

  /* Really-big desktop: keep tempo visible beside a capped result action
     cluster. The previous rule hid the only BPM control at this width. */
  @container fuse (min-width: 1500px) {
    .stage-controls {
      grid-template-columns: 220px minmax(0, 1fr);
    }

    .result-actions {
      width: min(100%, 960px);
      margin-left: auto;
    }
  }

  /* A narrow result pane gives the next step its own row, then keeps tempo,
     save, and sharing equally readable beneath it. */
  @container fuse-preview (max-width: 620px) {
    .preview-heading {
      align-items: flex-start;
      flex-wrap: wrap;
    }

    .preview-heading-tools {
      width: 100%;
      justify-content: space-between;
    }

    .stage-controls {
      grid-template-columns: 110px repeat(2, minmax(0, 1fr));
      grid-template-areas:
        "viewer viewer viewer"
        "tempo save share";
    }

    .bpm-compact {
      grid-area: tempo;
    }

    .result-actions {
      display: contents;
    }

    .save-slot {
      grid-area: save;
    }

    .viewer-slot {
      grid-area: viewer;
    }

    .share-slot {
      grid-area: share;
    }
  }

  .tempo-trigger {
    display: grid;
    grid-template-columns: auto auto auto;
    align-items: baseline;
    justify-content: center;
    gap: 6px;
    width: 100%;
    min-width: 0;
    min-height: var(--min-touch-target, 44px);
    padding: 10px clamp(6px, 1cqw, 16px);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
    border-radius: var(--settings-radius-md, 12px);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.055));
    color: var(--theme-text, #fff);
    cursor: pointer;
    transition:
      background var(--duration-fast, 150ms) ease,
      border-color var(--duration-fast, 150ms) ease;
  }

  .tempo-trigger:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .tempo-trigger:focus-visible {
    outline: 2px solid var(--theme-accent, currentColor);
    outline-offset: 2px;
  }

  .tempo-value {
    font-size: 1.15rem;
    font-variant-numeric: tabular-nums;
    font-weight: 800;
  }

  .tempo-unit,
  .tempo-trigger i {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
  }

  .tempo-trigger i {
    font-size: var(--font-size-compact, 12px);
  }

  @keyframes preview-change {
    0% {
      opacity: 0;
      transform: scale(0.995);
    }
    35% {
      opacity: 0.85;
    }
    100% {
      opacity: 0;
      transform: scale(1);
    }
  }

  @media (hover: hover) and (pointer: fine) {
    .tempo-trigger:hover:not(:disabled) {
      border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.24));
      background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.09));
    }
  }

  @container fuse (max-width: 599px) {
    .preview-stage {
      padding: 14px;
    }

    .result-actions {
      grid-template-columns: minmax(0, 1fr);
    }

    .frame-wrap {
      flex-basis: 260px;
      min-height: 240px;
    }
  }

  /* One-page fit layout (mirrors FuseLayout's fr-row condition). The base
     stack is already canvas-on-top / control-bar-on-bottom: frame-wrap
     flex:1 eats the free height and pushes the control row to the bottom,
     the frame's grid background fills the full width (props center in it,
     so it reads as a wide grid, not empty gutters), and the Fuse button
     action cluster stretches across the bar. All this rule does is let
     the stage shrink into its fr row — min-height:0, which must NOT leak to
     the scroll layouts where a zero minimum collapses the grid row. */
  @container fuse (min-width: 600px) and (min-height: 600px) {
    .preview-stage:not(.compact),
    .preview-stage:not(.compact) .frame-wrap {
      min-height: 0;
    }

    /* The animation renders square. Rather than fill the wide frame and
       letterbox onto black canvas bars, hold the frame square and center it
       in the track — the leftover becomes the stage's tinted background as
       symmetric breathing room, with the full-width control bar anchoring
       the bottom. */
    .preview-stage:not(.compact) .frame-wrap {
      justify-content: center;
    }

    .preview-stage:not(.compact) .preview-frame {
      flex: 0 1 auto;
      aspect-ratio: 1;
      height: 100%;
      width: auto;
      max-width: 100%;
    }
  }

  @container fuse (min-width: 1100px) {
    .preview-stage {
      padding: clamp(16px, 1.4cqw, 24px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .preview-flash {
      animation: none;
    }

    .tempo-trigger {
      transition: none;
    }
  }
</style>
