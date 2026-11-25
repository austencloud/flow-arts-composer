<script lang="ts">
  import { Popover } from "bits-ui";
  import { onDestroy, tick } from "svelte";
  import { motionDuration } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import BpmChips from "#lib/shared/animation-engine/components/controls/BpmChips.svelte";
  import WordHeader from "#lib/shared/animation-engine/components/layers/WordHeader.svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import ActionButton from "#lib/shared/components/selection/ActionButton.svelte";
  import { getSequenceDisplayName } from "#lib/shared/foundation/services/word-deriver.js";
  import { simplifyRepeatedWord } from "#lib/shared/foundation/utils/word-simplifier.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { getFuseContext } from "../context/fuse-context";
  import type { FuseSide } from "../state/fuse-shuffle-pool.svelte";
  import FuseAnimationPreview from "./FuseAnimationPreview.svelte";
  import FuseCustomizeDock from "./FuseCustomizeDock.svelte";
  import FuseMobileControls from "./FuseMobileControls.svelte";
  import FuseSourceCard from "./FuseSourceCard.svelte";

  let {
    onOpenViewer,
    onShare,
    onSave,
    onBuildPath,
    onEditPath,
    onOpenSettings,
    onEditPairing,
    onToggleCustomize,
    customizeOpen = false,
    customizeDocked = false,
    compact = false,
    sideControls = false,
    isSaving = false,
  }: {
    onOpenViewer: () => Promise<void>;
    onShare: () => Promise<void>;
    onSave: () => Promise<void>;
    onBuildPath: (side: FuseSide) => void;
    onEditPath: (side: FuseSide) => void;
    onOpenSettings: (side: FuseSide) => void;
    /** Opens the Pairing editor from the derived follower's badge. */
    onEditPairing?: () => void;
    /** Opens Customize beside the result, or puts it away. */
    onToggleCustomize?: () => void | Promise<void>;
    customizeOpen?: boolean;
    /** Customize is open with no room for the side column: it docks
     *  under the result in place of its button row. */
    customizeDocked?: boolean;
    compact?: boolean;
    /** Short landscape: the compact controls sit beside the result instead of
     * below it, so the result is not squeezed into a strip. */
    sideControls?: boolean;
    isSaving?: boolean;
  } = $props();
  const { state: fuseState } = getFuseContext();
  let tempoOpen = $state(false);
  let decompositionOverride = $state<boolean | null>(null);

  // The result opens disassembled at every size: the solos are the two paths
  // it is made of. FuseAnimationPreview puts them where they cost the result
  // the least. Disassemble and Reassemble override it until the stage remounts.
  // The Customize dock takes the room the solos would use, so while it is up
  // the result is drawn whole at the full height that is left.
  const previewDecomposed = $derived(decompositionOverride ?? !customizeDocked);

  // On a wide stage the dock goes beside the result or under it at its own
  // drawer height, whichever leaves the bigger square result. Beside suits a
  // stage stacked under the paths (wide and short); in a stage standing beside
  // the paths it left the result 111px wide at 1333x1107. The stage's box is
  // set by the workspace grid, not by the dock, so the choice cannot flip-flop.
  // Beside, the dock takes only the width the square result cannot use, from
  // 300 (its narrowest before) up to 440.
  const DOCK_BESIDE_MIN_PX = 300;
  const DOCK_BESIDE_MAX_PX = 440;
  const DOCK_UNDER_PX = 360; // FuseCustomizeDock's tallest drawer height
  const STAGE_GAP_PX = 14;
  const STAGE_PAD_PX = 40; // the stage's padding on both sides, near enough
  let stageWidth = $state(0);
  let stageHeight = $state(0);
  let headingHeight = $state(0);
  const dockFit = $derived.by(() => {
    const width = stageWidth - STAGE_PAD_PX;
    const height = stageHeight - STAGE_PAD_PX - headingHeight - STAGE_GAP_PX;
    const besideWidth = Math.round(
      Math.min(
        DOCK_BESIDE_MAX_PX,
        Math.max(DOCK_BESIDE_MIN_PX, width - height - STAGE_GAP_PX)
      )
    );
    const beside = Math.min(width - besideWidth - STAGE_GAP_PX, height);
    const under = Math.min(width, height - DOCK_UNDER_PX - STAGE_GAP_PX);
    return {
      under: !compact && stageWidth > 0 && under > beside,
      besideWidth,
    };
  });

  let stageEl = $state<HTMLElement | null>(null);
  // Done replaces the dock with the button row, so focus goes back to the
  // Customize button that opened it.
  function closeCustomizeDock(): void {
    void Promise.resolve(onToggleCustomize?.())
      .then(() => tick())
      .then(() =>
        stageEl
          ?.querySelector<HTMLButtonElement>(
            `button[aria-label="${CSS.escape(t("shape_engine_customize_aria"))}"]`
          )
          ?.focus({ preventScroll: true })
      );
  }

  // Disassemble and Reassemble resize the frame and the hero through CSS
  // transitions, but only for the length of that request. Left on, the same
  // transitions would trail every window resize and every drag of the desktop
  // seam behind the pointer.
  let assemblyMoving = $state(false);
  let assemblyTimer: ReturnType<typeof setTimeout> | undefined;

  function toggleDecomposition(): void {
    clearTimeout(assemblyTimer);
    assemblyMoving = true;
    decompositionOverride = !previewDecomposed;
    assemblyTimer = setTimeout(() => {
      assemblyMoving = false;
    }, motionDuration(DURATION.emphasis));
  }

  onDestroy(() => clearTimeout(assemblyTimer));

  const leftName = $derived.by(() =>
    fuseState.left.sequence
      ? simplifyRepeatedWord(getSequenceDisplayName(fuseState.left.sequence))
      : t("fuse_side_left_path")
  );
  const rightName = $derived.by(() =>
    fuseState.right.sequence
      ? simplifyRepeatedWord(getSequenceDisplayName(fuseState.right.sequence))
      : t("fuse_side_right_path")
  );
  const previewDescription = $derived(
    fuseState.previewSequence && fuseState.appliedLength
      ? t("fuse_preview_description", {
          left: leftName,
          right: rightName,
          steps: fuseState.appliedLength,
          bpm: fuseState.bpm,
        })
      : t("fuse_preview_loading_aria")
  );
  const previewRevision = $derived(
    fuseState.left.revision + fuseState.right.revision
  );
</script>

<!-- The result's word, drawn as the Sequence Viewer's header draws it. The box
     keeps its height while there is no word to show. -->
{#snippet stageWord(align: "center" | "start")}
  <div class="stage-word">
    <WordHeader
      word={fuseState.previewWord}
      presentation="chrome"
      darkMode={true}
      {align}
    />
  </div>
{/snippet}

<section
  class="preview-stage"
  class:compact
  class:side-controls={compact && sideControls}
  class:customize-docked={customizeDocked}
  class:dock-under={customizeDocked && dockFit.under}
  style:--dock-beside-width={stageWidth > 0 ? `${dockFit.besideWidth}px` : null}
  class:decomposed={previewDecomposed}
  class:assembly-moving={assemblyMoving}
  data-fuse-layout-region="preview"
  aria-labelledby="fuse-preview-heading"
  bind:this={stageEl}
  bind:clientWidth={stageWidth}
  bind:clientHeight={stageHeight}
>
  <header class="preview-heading" bind:clientHeight={headingHeight}>
    <div class="preview-title">
      {#if !compact}
        {@render stageWord("start")}
      {/if}
      <div class="preview-caption">
        <h3 id="fuse-preview-heading">{t("fuse_preview_title")}</h3>
        <span class="preview-meta">
          {t("fuse_preview_meta", {
            steps: fuseState.appliedLength ?? fuseState.requestedLength,
            bpm: fuseState.bpm,
          })}
        </span>
      </div>
    </div>
    <div class="preview-heading-tools">
      {#if !compact && onToggleCustomize}
        <div class="customize-control">
          <PanelButton
            variant="secondary"
            ariaLabel={t("shape_engine_customize_aria")}
            ariaPressed={customizeOpen}
            onclick={onToggleCustomize}
          >
            <i class="fas fa-sliders" aria-hidden="true"></i>
            {t("shape_engine_customize")}
          </PanelButton>
        </div>
      {/if}
      {#if !compact}
        <div class="assembly-control">
          <PanelButton
            variant="secondary"
            disabled={!fuseState.previewSequence}
            ariaLabel={previewDecomposed
              ? t("fuse_preview_reassemble_aria")
              : t("fuse_preview_disassemble_aria")}
            onclick={toggleDecomposition}
          >
            <i
              class="fas {previewDecomposed
                ? 'fa-compress'
                : 'fa-table-columns'}"
              aria-hidden="true"
            ></i>
            {previewDecomposed
              ? t("fuse_preview_reassemble")
              : t("fuse_preview_disassemble")}
          </PanelButton>
        </div>
      {/if}
    </div>
  </header>

  {#if compact}
    <div class="mobile-source-toolbar" aria-label={t("fuse_preview_source_controls_aria")}>
      <FuseSourceCard
        side="left"
        compactHero={true}
        toolbarOnly={true}
        {onBuildPath}
        {onEditPath}
        {onOpenSettings}
        {onEditPairing}
      />
      <FuseSourceCard
        side="right"
        compactHero={true}
        toolbarOnly={true}
        {onBuildPath}
        {onEditPath}
        {onOpenSettings}
        {onEditPairing}
      />
      {@render stageWord("center")}
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
          resizing={assemblyMoving}
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
            {t("fuse_action_retry")}
          </PanelButton>
        {/if}
      </div>
    {/if}
  </div>

  {#if customizeDocked}
    <FuseCustomizeDock onClose={closeCustomizeDock} />
  {/if}
  {#if compact && !customizeDocked}
    <FuseMobileControls
      {onOpenViewer}
      {onShare}
      {onSave}
      {isSaving}
      {onToggleCustomize}
      {customizeOpen}
    />
  {:else if !compact}
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
    <div class="stage-controls" hidden={customizeDocked}>
      <div class="bpm-compact">
        <Popover.Root bind:open={tempoOpen}>
          <Popover.Trigger>
            {#snippet child({ props })}
              <button
                {...props}
                class="tempo-trigger"
                type="button"
                disabled={!fuseState.previewSequence || fuseState.isFusing}
                aria-label={t("fuse_preview_tempo_aria", { bpm: fuseState.bpm })}
              >
                <span class="tempo-value">{fuseState.bpm}</span>
                <span class="tempo-unit">{t("fuse_preview_bpm_unit")}</span>
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

      <div class="result-actions" aria-label={t("fuse_result_actions_aria")}>
        <div class="viewer-slot">
          <ActionButton
            label={t("fuse_preview_open_viewer")}
            busyLabel={t("fuse_preview_opening_viewer")}
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
            {isSaving ? t("fuse_action_saving") : t("fuse_preview_save_result")}
          </PanelButton>
        </div>
        <div class="share-slot">
          <PanelButton
            variant="secondary"
            fullWidth={true}
            disabled={!fuseState.canFuse}
            onclick={() => void onShare()}
          >
            {t("fuse_action_share")}
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

  /* A short landscape slot has width to spare and no height. Stacking the two
     control rows under the result left it a strip about 116px tall at 960x412;
     beside it, the result keeps the full height under the source toolbar. */
  .preview-stage.side-controls {
    display: grid;
    grid-template-columns: minmax(0, 1fr) clamp(240px, 32cqw, 340px);
    grid-template-rows: auto minmax(0, 1fr);
    grid-template-areas:
      "toolbar toolbar"
      "frame controls";
  }

  .side-controls .mobile-source-toolbar {
    grid-area: toolbar;
  }

  .side-controls .frame-wrap {
    grid-area: frame;
    min-height: 0;
  }

  .side-controls :global(.mobile-controls) {
    grid-area: controls;
    align-content: center;
  }

  /* The Customize dock changes how the result looks, so the result gets the
     room the paths' own row takes until Done. */
  .compact.customize-docked .mobile-source-toolbar {
    display: none;
  }

  /* The dock needs about 215px of height under its header. Beside a short
     landscape result it takes the full height, and a wider column for four
     tiles across. */
  .preview-stage.side-controls.customize-docked {
    grid-template-columns: minmax(0, 1fr) clamp(280px, 44cqw, 400px);
    grid-template-rows: minmax(0, 1fr);
    grid-template-areas: "frame controls";
  }

  .side-controls :global(.customize-dock) {
    grid-area: controls;
    height: 100%;
  }

  /* A stacked desktop stage (paths above, preview below) is wide and short:
     under the result the dock left it a 72px square at 1029x1172. Beside it,
     the result keeps the stage's height and the dock gets the same height,
     with the tempo, viewer, save and share row away until Done. A stage
     standing beside the paths is tall instead, and there the dock stays under
     the result (dock-under, chosen in the script by the bigger result). */
  .preview-stage.customize-docked:not(.compact, .dock-under) {
    display: grid;
    grid-template-columns:
      minmax(0, 1fr)
      var(--dock-beside-width, clamp(300px, 42cqw, 440px));
    grid-template-rows: auto minmax(0, 1fr);
    grid-template-areas:
      "heading heading"
      "frame dock";
  }

  .preview-stage.customize-docked:not(.compact, .dock-under) .preview-heading {
    grid-area: heading;
  }

  .preview-stage.customize-docked:not(.compact, .dock-under) .frame-wrap {
    grid-area: frame;
    min-height: 0;
  }

  .preview-stage.customize-docked:not(.compact, .dock-under)
    :global(.customize-dock) {
    grid-area: dock;
    height: 100%;
    min-height: 0;
  }

  /* While Customize docks or undocks (FuseLayout's toggleCustomize), the page
     snaps to its new arrangement under its moving layers: the frame and the
     result glide to their new boxes, the solos and a phone's path row fade out
     or in, and on a phone the button row and the dock trade one slot, the dock
     rising out of the row like a drawer. Only one of the two is ever rendered,
     so they share a name. On a wide stage the dock opens beside the result
     instead, so it fades in there and the tempo row under the result is not
     part of it. */
  :global(html.fuse-customize-motion) .preview-frame {
    view-transition-name: fuse-customize-frame;
  }

  :global(html.fuse-customize-motion)
    .preview-stage
    :global(.fuse-animation-preview > .preview-unit > .canvas-wrap) {
    view-transition-name: fuse-customize-hero;
  }

  :global(html.fuse-customize-motion) .preview-stage :global(.split-canvases) {
    view-transition-name: fuse-customize-solos;
  }

  :global(html.fuse-customize-motion) .mobile-source-toolbar {
    view-transition-name: fuse-customize-paths;
  }

  :global(html.fuse-customize-motion) .preview-stage :global(.mobile-controls),
  :global(html.fuse-customize-motion) .preview-stage :global(.customize-dock) {
    view-transition-name: fuse-customize-slot;
  }

  :global(
    html.fuse-customize-motion::view-transition-group(fuse-customize-frame)
  ),
  :global(
    html.fuse-customize-motion::view-transition-group(fuse-customize-hero)
  ),
  :global(
    html.fuse-customize-motion::view-transition-group(fuse-customize-solos)
  ),
  :global(
    html.fuse-customize-motion::view-transition-group(fuse-customize-slot)
  ) {
    animation-duration: var(--duration-emphasis);
    animation-timing-function: var(--ease-in-out);
  }

  /* The frame is an empty box once its contents have their own layers, so it
     stretches to its new size rather than keeping its old height. */
  :global(
    html.fuse-customize-motion::view-transition-old(fuse-customize-frame)
  ),
  :global(
    html.fuse-customize-motion::view-transition-new(fuse-customize-frame)
  ) {
    height: 100%;
    object-fit: fill;
    animation-duration: var(--duration-emphasis);
  }

  /* The slot keeps both pictures at their own size, pinned to its bottom edge
     and cut to its box, so the dock is uncovered from the button row upward
     instead of being squashed into the row's height. */
  :global(
    html.fuse-customize-motion::view-transition-image-pair(fuse-customize-slot)
  ) {
    overflow: clip;
  }

  :global(html.fuse-customize-motion::view-transition-old(fuse-customize-slot)),
  :global(
    html.fuse-customize-motion::view-transition-new(fuse-customize-slot)
  ) {
    inset-block: auto 0;
    animation-duration: var(--duration-emphasis);
  }

  .stage-controls[hidden] {
    display: none;
  }

  .mobile-source-toolbar {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    flex: 0 0 auto;
    gap: 4px var(--settings-spacing-sm, 8px);
    min-width: 0;
  }

  /* On a phone held upright the word has a line of its own under the two
     paths. Where there is room it stands between them and costs no height. */
  .mobile-source-toolbar .stage-word {
    --word-size: 24px;
    grid-column: 1 / -1;
  }

  @container fuse-preview (min-width: 600px) {
    .mobile-source-toolbar {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr) minmax(0, 1fr);
      align-items: center;
    }

    .mobile-source-toolbar > :global(.source-card:last-of-type) {
      grid-column: 3;
      grid-row: 1;
    }

    .mobile-source-toolbar .stage-word {
      --word-size: 28px;
      grid-column: 2;
      grid-row: 1;
    }
  }

  .stage-word {
    min-width: 0;
    height: var(--word-size, 28px);
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

  /* Two lines, the word over what the panel is and how long it runs, in the
     height of the buttons beside them. */
  .preview-title {
    --word-size: 26px;
    display: grid;
    gap: 4px;
    flex: 1 1 0;
    min-width: 0;
  }

  @container fuse-preview (min-width: 1200px) {
    .preview-title {
      --word-size: 36px;
    }
  }

  /* One line. The length and tempo drop out of it when the panel's name leaves
     them no room. */
  .preview-caption {
    display: flex;
    flex-wrap: wrap;
    column-gap: var(--settings-spacing-sm, 10px);
    height: 18px;
    overflow: hidden;
    line-height: 18px;
  }

  .preview-heading-tools {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--settings-spacing-sm, 10px);
  }

  .customize-control,
  .assembly-control {
    flex: 0 0 auto;
  }

  .customize-control :global(.panel-btn),
  .assembly-control :global(.panel-btn) {
    min-height: var(--min-touch-target, 44px);
    padding: 8px 14px;
    border-radius: var(--settings-radius-md, 12px);
    white-space: nowrap;
  }

  /* Open viewer is the stage's one filled button: it builds the combined
     sequence and opens it where it can be played, saved, shared and
     exported. Save result is the direct second choice. Disassemble changes
     how the preview is drawn and Share opens the share sheet without the
     viewer, so both sit in the quiet tier: no fill, faint outline, dimmer
     words. */
  .customize-control :global(.panel-btn),
  .assembly-control :global(.panel-btn),
  .share-slot :global(.panel-btn) {
    border-color: color-mix(in srgb, var(--theme-stroke) 60%, transparent);
    background: transparent;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
  }

  .customize-control :global(.panel-btn:hover:not(:disabled)),
  .assembly-control :global(.panel-btn:hover:not(:disabled)),
  .share-slot :global(.panel-btn:hover:not(:disabled)) {
    border-color: var(--theme-stroke);
    background: var(--theme-card-bg);
    color: var(--theme-text, #fff);
  }

  /* While Customize is open beside the result, its button stays lit
     so it reads as the way to put the panel away. */
  .customize-control :global(.panel-btn[aria-pressed="true"]) {
    border-color: color-mix(in srgb, var(--theme-accent) 55%, transparent);
    background: color-mix(in srgb, var(--theme-accent) 14%, transparent);
    color: var(--theme-text, #fff);
  }

  .preview-heading h3 {
    color: var(--theme-text, #fff);
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
    line-height: inherit;
    white-space: nowrap;
  }

  .preview-meta {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.62));
    font-size: var(--font-size-compact, 12px);
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    white-space: nowrap;
  }

  /* The frame track is the size container FuseAnimationPreview measures, in
     every layout: it holds still while the frame inside it changes shape. */
  .frame-wrap {
    container: fuse-frame / size;
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

  /* Wide tiers recompose Fuse; they do not enlarge its type or controls
     (4k-native-layout). Only the stage's breathing room grows here. */
  @container fuse (min-width: 1680px) and (min-height: 900px) {
    .preview-stage {
      padding: 20px;
    }
  }

  @container fuse (min-width: 2600px) and (min-height: 1400px) {
    .preview-stage {
      gap: var(--settings-spacing-lg, 20px);
      padding: 28px;
    }

    .stage-controls {
      gap: var(--settings-spacing-md, 14px);
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

  /* Above the preview's canvases (z-index 1), so the outline closes all the
     way round. Invisible at rest: reduced motion shows no outline at all. */
  .preview-flash {
    position: absolute;
    z-index: 2;
    inset: 3px;
    opacity: 0;
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
      background var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard);
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

    /* The assembled animation renders square. Rather than fill the wide frame
       and letterbox onto black canvas bars, hold the frame square and center
       it in the track — the leftover becomes the stage's tinted background as
       symmetric breathing room, with the full-width control bar anchoring
       the bottom. Disassembled, the frame widens to seat a solo on each side
       of the result. Both are explicit lengths of the frame track, so the
       frame travels between them rather than jumping. */
    .preview-stage:not(.compact) .frame-wrap {
      align-items: center;
      justify-content: center;
    }

    .preview-stage:not(.compact) .preview-frame {
      flex: 0 0 auto;
      width: min(100cqw, 100cqh);
      height: min(100cqw, 100cqh);
    }

    .preview-stage.assembly-moving:not(.compact) .preview-frame {
      transition:
        width var(--duration-emphasis) var(--ease-out),
        height var(--duration-emphasis) var(--ease-out);
    }

    .preview-stage.decomposed:not(.compact) .preview-frame {
      width: 100cqw;
      height: 100cqh;
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

    .preview-stage.assembly-moving:not(.compact) .preview-frame {
      transition: none;
    }

    .tempo-trigger {
      transition: none;
    }
  }
</style>
