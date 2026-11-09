<script lang="ts">
  import { claimedViewTransitionName } from "#lib/shared/transitions/claimed-view-transition-name.js";
  import {
    SHAPE_MATRIX_BAR_LEAD_NAME,
    SHAPE_MATRIX_BAR_SURFACE_NAME,
    SHAPE_MATRIX_BAR_SWAP_NAME,
    SHAPE_MATRIX_BAR_TURNS_NAME,
  } from "../../services/shape-matrix-artwork";
  import { s as t } from "../../strings.svelte.js";
  import { tick, untrack } from "svelte";
  import { getEscapeLayerManager } from "#lib/shared/keyboard/get-escape-layer-manager.js";
  import PanelGroup from "#lib/shared/panels/PanelGroup.svelte";
  import DualSourceCrossfade from "#lib/shared/components/DualSourceCrossfade.svelte";
  import { DURATION } from "@austencloud/motion";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import type { MatrixLabelMode } from "@tka/shape-domain";
  import type { Flower } from "@tka/shape-domain";
  import { KINETIC_SHAPE_ENGINE_NAME } from "../shape-engine-identity";
  import { shareOrCopyLink } from "#lib/shared/share/services/link-share.js";
  import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";
  import { goto } from "$app/navigation";
  import { saveSequenceRouteHandoff } from "#lib/shared/coordinators/sequence-handoff.svelte.js";
  import { generateSequenceRoutePath } from "#lib/shared/navigation/services/sequence-encoder.js";
  import type { ModeRealization } from "../../services/build-mode-realizations.js";

  import { getShapeMatrixAppContext } from "../context/shape-matrix-app-context";
  import {
    getShapeEngineHostContext,
    type ShapeEngineVariant,
  } from "../context/shape-engine-host-context";
  import { createShapeMatrixAnimationState } from "../state/shape-matrix-animation-state.svelte.js";
  import { customizeSection } from "../state/shape-matrix-customize";
  import { setShapeMatrixAnimationContext } from "../context/shape-matrix-animation-context";
  import { setAnimationScopeContext } from "#lib/shared/animation-engine/state/animation-scope-context.js";
  import { setAnimationVisibilityContext } from "#lib/shared/animation-engine/state/animation-visibility-context.js";
  import { SequenceViewerVisibilityState } from "#lib/shared/sequence-viewer/state/viewer-visibility-state.svelte.js";
  import { setViewerVisibilityContext } from "#lib/shared/sequence-viewer/context/viewer-visibility-context.js";
  import { setEffectsConfigContext } from "#lib/shared/effects/state/effects-config-context.js";
  import ShapeMatrixCustomizeWorkspace from "./ShapeMatrixCustomizeWorkspace.svelte";
  import ShapeMatrixDetailPane from "./ShapeMatrixDetailPane.svelte";
  import ShapeMatrixDifficultyControl from "./ShapeMatrixDifficultyControl.svelte";
  import ShapeMatrixMatrixPane from "./ShapeMatrixMatrixPane.svelte";
  import ShapeMatrixTurnPopover from "./ShapeMatrixTurnPopover.svelte";
  import ShapeMatrixSurfaceControl from "./ShapeMatrixSurfaceControl.svelte";
  import ShapeMatrixTheoryDetail from "./ShapeMatrixTheoryDetail.svelte";
  import ShapeMatrixTheoryPane from "./ShapeMatrixTheoryPane.svelte";
  import { runMandalaMorph } from "../services/shape-matrix-mandala-morph";
  import { runShapeMatrixDetailReveal } from "../services/shape-matrix-reveal";
  import { growFade, motionDuration } from "@austencloud/motion";
  import ShapeMatrixFocusWorkspace from "./ShapeMatrixFocusWorkspace.svelte";
  import { createLayoutMotion } from "#lib/shared/transitions/layout-flip.js";

  interface Props {
    /** Embedded hosts (the Create module's Shape tab) get their name from
        module chrome, so the header drops the identity block and leads with
        the controls. Mirror hosts trace a pick themselves and may ask for a
        Back action that returns to them. */
    variant?: ShapeEngineVariant;
  }

  const { variant = "standalone" }: Props = $props();
  const appState = getShapeMatrixAppContext();
  const host = getShapeEngineHostContext();
  const mirror = $derived(variant === "mirror");
  let appElement: HTMLElement | undefined;
  const focusMotion = createLayoutMotion({
    getRoot: () => appElement,
    groups: [{ selector: "[data-focus-layout]", datasetKey: "focusLayout" }],
    getDuration: () => motionDuration(DURATION.emphasis),
  });
  $effect(() => () => focusMotion.cancel());
  let turnPopover: ShapeMatrixTurnPopover | undefined;

  /** Native Back uses the same dismissal owners as the web interface. */
  export function handleBack(): boolean {
    if (getEscapeLayerManager().dismissTopLayer() !== "unhandled") return true;
    if (turnPopover?.dismiss()) return true;
    if (appState.aboutOpen) {
      appState.closeAbout();
      return true;
    }
    if (appState.propPickerOpen) {
      appState.closePropPicker();
      return true;
    }
    if (animationState.activeSection !== null) {
      animationState.showRelationships();
      return true;
    }
    if (appState.compact && appState.activeView === "detail") {
      showMatrix();
      return true;
    }
    return false;
  }

  /* Share hands the address on directly, on the press itself: the phone's own
     share sheet where there is one, the clipboard everywhere else. Both need
     that gesture, so nothing may await before the call. The app never builds
     the address; the route host does, through appState.shareLink(). */
  async function shareThisView(): Promise<void> {
    const url = appState.shareLink();
    if (url === null) return;
    const outcome = await shareOrCopyLink({
      url,
      title: KINETIC_SHAPE_ENGINE_NAME,
    });
    if (outcome === "copied") toast.success(t("shape_engine_link_copied"));
    else if (outcome === "failed")
      toast.error(t("shape_engine_copy_link_failed"));
  }

  function openRealization(
    realization: ModeRealization,
    action: "open" | "save"
  ): void {
    if (variant === "embedded") {
      // Only the Create module's Shape tab opens the viewer in place. Loading
      // the navigator on this click keeps it, and the sign-in and Firebase
      // code behind it, off the public /shape-engine page's first download.
      void import("#lib/shared/sequence-viewer/services/sequence-viewer-navigator.js").then(
        ({ openSequenceViewer }) =>
          openSequenceViewer(realization.seq, {
            source: "shape_engine",
            returnPath: "/create/shape-engine",
            returnLabel: t("shape_engine_name"),
            saveOnOpen: action === "save",
          })
      );
      return;
    }

    const returnUrl = new URL(appState.shareLink() ?? window.location.href);
    saveSequenceRouteHandoff({
      sequence: realization.seq,
      returnPath: `${returnUrl.pathname}${returnUrl.search}${returnUrl.hash}`,
      returnLabel: t("shape_engine_name"),
    });
    const params = new URLSearchParams({ from: "shape-engine" });
    if (action === "save") params.set("save", "1");
    void goto(`${generateSequenceRoutePath(realization.seq)}?${params}`);
  }

  async function shareRealization(realization: ModeRealization): Promise<void> {
    const url = new URL(
      generateSequenceRoutePath(realization.seq),
      window.location.origin
    ).href;
    const outcome = await shareOrCopyLink({
      url,
      title: `${realization.word} · ${KINETIC_SHAPE_ENGINE_NAME}`,
    });
    if (outcome === "copied")
      toast.success(t("shape_engine_sequence_link_copied"));
    else if (outcome === "failed")
      toast.error(t("shape_engine_copy_link_failed"));
  }
  // The hero's animation state lives here, above both panes, so both surfaces
  // share one animation scope while their workspaces crossfade.
  const animationState = setShapeMatrixAnimationContext(
    createShapeMatrixAnimationState()
  );
  const focusMode = $derived(
    appState.compact &&
      (appState.propPickerOpen || animationState.activeSection !== null)
  );
  // This pre-effect must stay below focusMode. Mounted during a client-side
  // navigation, Svelte runs it during component setup, so reading focusMode
  // above its declaration throws "Cannot access before initialization".
  let previousFocusMode: boolean | undefined;
  $effect.pre(() => {
    const next = focusMode;
    if (previousFocusMode === undefined) {
      previousFocusMode = next;
      return;
    }
    if (previousFocusMode === next) return;
    previousFocusMode = next;
    untrack(() => focusMotion.capture());
    void tick().then(() => focusMotion.play());
  });
  setAnimationScopeContext(animationState.scope);
  setAnimationVisibilityContext(animationState.scope.visibility);

  /* Which hands the canvas draws. The animator already owns per-hand motion
     visibility for the viewer; the Shape Engine scopes its own instance so a
     header's solo hides the other prop and its trail through that owner
     rather than a second mechanism. It follows the solo and nothing else, so
     the Display page can still change it afterwards. */
  const motionVisibility = new SequenceViewerVisibilityState(true);
  setViewerVisibilityContext(motionVisibility);
  $effect(() => {
    // Each surface keeps its own solo; the stage shows the one on screen.
    const solo =
      appState.surface === "theory"
        ? appState.theorySoloHand
        : appState.soloHand;
    untrack(() => {
      motionVisibility.leftMotion = solo !== "right";
      motionVisibility.rightMotion = solo !== "left";
    });
  });
  setEffectsConfigContext(animationState.scope.effects);
  /* Both surfaces are a grid of pairs with a detail beside it, so the shell
     runs one layout and swaps what fills the panes. Matrix adds a Kinetic
     Alphabet difficulty choice; Theory's typed ratios need no second bound. */
  const theory = $derived(appState.surface === "theory");

  /* The app always mounts on the Matrix and restores its saved or linked
     surface immediately afterwards, so a deep link into Theory would dissolve
     one ribbon into the other while the page is still arriving. Chrome does
     not animate into place on first paint: the restore lands instantly, and
     every surface change the user makes after that crossfades. */
  let booted = $state(false);
  $effect(() => {
    const frame = requestAnimationFrame(() => {
      booted = true;
    });
    return () => cancelAnimationFrame(frame);
  });
  const hasPair = $derived(
    theory ? appState.theoryPair !== null : appState.selectedPair !== null
  );
  const LABEL_OPTIONS = $derived([
    {
      value: "turns" as const,
      label: t("shape_engine_tka_turns"),
      shortLabel: t("shape_engine_turns"),
    },
    {
      value: "ratios" as const,
      label: t("shape_engine_vtg_ratios"),
      shortLabel: t("shape_engine_ratios"),
    },
  ]);
  /* One split for both surfaces. The panes stay where they are while the
     grid and the detail inside them crossfade, so a split set on one surface
     is the split on the other. */
  let sizes = $state([1.28, 0.82]);
  let gridPaneElement: HTMLDivElement;
  let detailPaneElement: HTMLDivElement;
  let theoryEditingAxis = $state<"left" | "right" | "both" | null>(null);
  let workspaceElement: HTMLDivElement;

  $effect(() => {
    if (!theory) theoryEditingAxis = null;
  });

  /* Customizing rebalances the split toward the animation. The grid pane
     leads while a pair is being chosen; once the workspace covers it, the
     pages inside need only a rail and one sidebar-width column, and the
     animation is what every change is judged against. So the workspace pane
     takes what its pages use and never more than 45% of the room, the stage
     takes the rest, and the split the user had comes back on the way out.
     The panel group already eases flex shares, so both moves are animated. */
  const PANE_GAP = 8;
  const STAGE_MIN = 380;
  const CUSTOMIZE_MIN = 440;
  const customizeOpen = $derived(
    customizeSection(appState, animationState) !== null
  );
  let restingSizes: number[] | null = null;
  let customizeApplied = false;

  function customizeSplit(): number[] | null {
    if (!workspaceElement) return null;
    const styles = getComputedStyle(workspaceElement);
    const width =
      workspaceElement.clientWidth -
      parseFloat(styles.paddingLeft) -
      parseFloat(styles.paddingRight) -
      PANE_GAP;
    if (!(width > CUSTOMIZE_MIN + STAGE_MIN)) return null;

    // The workspace has mounted by the time this runs, so its rail and page
    // are measured rather than guessed from the inspector's breakpoints.
    const rail = workspaceElement.querySelector<HTMLElement>(
      ".customize-workspace .icon-rail"
    );
    const scroll = workspaceElement.querySelector<HTMLElement>(
      ".customize-workspace .panel-scroll"
    );
    const page = workspaceElement.querySelector<HTMLElement>(
      ".customize-workspace .panel-center-inner"
    );
    const railWidth = rail?.offsetWidth ?? 136;
    const pageWidth =
      (page ? parseFloat(getComputedStyle(page).maxWidth) : 0) || 560;
    const scrollStyles = scroll ? getComputedStyle(scroll) : null;
    const gutters = scrollStyles
      ? parseFloat(scrollStyles.paddingLeft) +
        parseFloat(scrollStyles.paddingRight)
      : 32;
    const need = railWidth + pageWidth + gutters;

    const customize = Math.max(
      CUSTOMIZE_MIN,
      Math.min(need, width * 0.45, width - STAGE_MIN)
    );
    return [customize, width - customize];
  }

  $effect(() => {
    const target = customizeOpen;
    if (target === customizeApplied) return;
    untrack(() => {
      if (customizeApplied && restingSizes) sizes = restingSizes;
      if (target) {
        restingSizes = [...sizes];
        const split = customizeSplit();
        if (split) sizes = split;
      }
      customizeApplied = target;
    });
  });

  // Compact navigation runs as a shared-element morph between the selected
  // tile and the hero. Wide layouts show both panes at once, so the same
  // calls fall through to the plain state mutation.
  /* A morph snapshots the frame it changes, so a button growing in or out at
     that moment would be caught half size. */
  function topSwapMotion() {
    return appState.mandalaHandoff
      ? { axis: "x" as const, x: 4, duration: 0 }
      : { axis: "x" as const, x: 4 };
  }

  /* A header, on a wide host, changes what the hero plays without leaving
     the grid. A compact host travels to the detail view, and the pressed
     header is the flower that flies there. */
  function selectSolo(hand: "left" | "right", flower: Flower): void {
    if (!appState.compact || theory) {
      appState.selectSolo(hand, flower);
      return;
    }
    runMandalaMorph(appState, () => appState.showDetail(), {
      before: () => appState.selectSolo(hand, flower, { navigate: false }),
    });
  }

  function selectPair(pair: { left: Flower; right: Flower }): void {
    if (!appState.compact) {
      appState.selectPair(pair);
      return;
    }
    runMandalaMorph(appState, () => appState.showDetail(), {
      before: () => appState.selectPair(pair, { navigate: false }),
    });
  }
  // The morph is a shared-element handoff between the matrix tile and the
  // matrix hero. Theory tiles do not own that name, so theory navigates
  // plainly rather than capturing the hidden matrix behind it.
  function showDetail(): void {
    if (!appState.compact || theory) {
      appState.showDetail();
      return;
    }
    runMandalaMorph(appState, () => appState.showDetail());
  }
  function showMatrix(): void {
    if (!appState.compact || theory) {
      appState.showMatrix();
      return;
    }
    runMandalaMorph(appState, () => appState.showMatrix(), { back: true });
  }

  function surpriseMe(): void {
    if (!appState.compact || theory || appState.activeView === "detail") {
      appState.surpriseMe();
      return;
    }
    runMandalaMorph(appState, () => appState.showDetail(), {
      before: () => appState.surpriseMe(Math.random, { navigate: false }),
    });
  }

  /* The result half of the reveal: the chosen relationship lands, then the
     hero breathes in. Compact layouts fly the tile to the hero instead, so
     only the chip beat applies there. Keyed on the roll, never on an edit. */
  let revealedToken: number | null = null;
  $effect(() => {
    const token = appState.revealToken;
    const previous = revealedToken;
    revealedToken = token;
    if (previous === null || previous === token) return;
    const pane = detailPaneElement;
    if (!pane) return;
    void tick().then(() => {
      runShapeMatrixDetailReveal(pane, { hero: !appState.compact });
    });
  });

  $effect(() => {
    const request = appState.compactFocusRequest;
    if (!request || !appState.compact) return;

    let frame = 0;
    let cancelled = false;
    void tick().then(() => {
      if (cancelled) return;
      frame = requestAnimationFrame(() => {
        const pane =
          request.target === "matrix" ? gridPaneElement : detailPaneElement;
        if (!pane) return;
        const focusTarget =
          request.target === "matrix"
            ? pane.querySelector<HTMLButtonElement>(
                'button.cell[aria-pressed="true"], button.cell.sel'
              )
            : pane.querySelector<HTMLButtonElement>(
                'button[role="radio"][aria-checked="true"]'
              );
        focusTarget?.focus({ preventScroll: true });
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  });
</script>

{#snippet matrixGrid()}
  <!-- The crossfade lays its sources out as absolutely positioned blocks. Each
       pane root fills by height, so each source gets one block that is the
       source's whole box for the root to fill. -->
  <div class="pane-source">
    <ShapeMatrixMatrixPane
      onselect={selectPair}
      onsolo={selectSolo}
      onsurprise={surpriseMe}
    />
  </div>
{/snippet}

{#snippet theoryGrid()}
  <div class="pane-source">
    <ShapeMatrixTheoryPane
      emphasizedAxis={theoryEditingAxis}
      onsurprise={surpriseMe}
    />
  </div>
{/snippet}

<!-- One grid pane for both surfaces. The surface changes what the grid is
     made of, not where it is: the Matrix grid and the Theory grid crossfade
     inside the pane, and the customize workspace covers the pane once,
     whichever grid is showing. -->
{#snippet gridPane()}
  <div
    class="workspace-pane"
    bind:this={gridPaneElement}
    inert={appState.compact && appState.activeView !== "matrix"}
    aria-hidden={appState.compact && appState.activeView !== "matrix"}
  >
    <DualSourceCrossfade
      active={theory ? "second" : "first"}
      duration={booted ? DURATION.normal : 0}
      first={matrixGrid}
      second={theoryGrid}
    />
    <ShapeMatrixCustomizeWorkspace />
  </div>
{/snippet}

<!-- "Surprise me" lives in the recipe bar above the grid. The header keeps a
     dice only while a compact detail view has hidden that bar. -->
{#snippet compactSurpriseAction()}
  <button
    type="button"
    class="top-action surprise-action compact"
    use:claimedViewTransitionName={{
      name: SHAPE_MATRIX_BAR_SWAP_NAME,
      enabled: appState.mandalaHandoff,
    }}
    aria-label={t("shape_engine_surprise_aria")}
    title={t("shape_engine_surprise_title")}
    disabled={!theory && !appState.data}
    onclick={surpriseMe}
    transition:growFade={topSwapMotion()}
  >
    <i class="fas fa-dice" aria-hidden="true"></i>
  </button>
{/snippet}

{#snippet matrixDetail()}
  <div class="pane-source">
    <ShapeMatrixDetailPane
      onrealizationAction={openRealization}
      onshareRealization={shareRealization}
    />
  </div>
{/snippet}

{#snippet theoryDetail()}
  <div class="pane-source">
    <ShapeMatrixTheoryDetail />
  </div>
{/snippet}

<!-- One detail pane, the same way: the two details crossfade inside it. -->
{#snippet detailPane()}
  <div
    class="workspace-pane"
    bind:this={detailPaneElement}
    inert={appState.compact && appState.activeView !== "detail"}
    aria-hidden={appState.compact && appState.activeView !== "detail"}
  >
    <DualSourceCrossfade
      active={theory ? "second" : "first"}
      duration={booted ? DURATION.normal : 0}
      first={matrixDetail}
      second={theoryDetail}
    />
  </div>
{/snippet}

<main
  class="shape-app"
  bind:this={appElement}
  class:focus-mode={focusMode}
  data-shape-matrix-app
  data-shape-engine={variant}
  data-level={appState.level}
  class:mirror
  class:compact-detail={appState.compact && appState.activeView === "detail"}
  class:theory
>
  <header class="topbar" inert={focusMode} aria-hidden={focusMode}>
    {#if appState.compact}
      <div class="compact-context">
        {#if appState.activeView === "detail"}
          <button
            type="button"
            class="back-to-matrix"
            use:claimedViewTransitionName={{
              name: SHAPE_MATRIX_BAR_LEAD_NAME,
              enabled: appState.mandalaHandoff,
            }}
            aria-label={theory
              ? t("shape_engine_back_theory_matrix")
              : t("shape_engine_back_shape_matrix")}
            onclick={showMatrix}
          >
            <i class="fas fa-arrow-left" aria-hidden="true"></i>
            <span
              >{theory
                ? t("shape_engine_playground")
                : t("shape_engine_matrix")}</span
            >
          </button>
        {:else}
          <strong
            use:claimedViewTransitionName={{
              name: SHAPE_MATRIX_BAR_LEAD_NAME,
              enabled: appState.mandalaHandoff,
            }}
            >{theory
              ? t("shape_engine_ratio_playground")
              : t("shape_engine_level_matrix")}</strong
          >
        {/if}
        <!-- The compact value editor keeps the grid as the hero. Matrix opens
             its level and turns; Theory names ratio editing directly and
             opens both axis ratios together. -->
        <div
          class="bar-slot"
          use:claimedViewTransitionName={{
            name: SHAPE_MATRIX_BAR_SURFACE_NAME,
            enabled: appState.mandalaHandoff,
          }}
        >
          <ShapeMatrixSurfaceControl compact />
        </div>
        <div
          class="bar-slot"
          use:claimedViewTransitionName={{
            name: SHAPE_MATRIX_BAR_TURNS_NAME,
            enabled: appState.mandalaHandoff,
          }}
        >
          <ShapeMatrixTurnPopover
            bind:this={turnPopover}
            onratiofocuschange={(hand) => (theoryEditingAxis = hand)}
          />
        </div>
      </div>
    {:else if variant === "standalone"}
      <div class="identity">
        <strong>{t("shape_engine_name")}</strong>
      </div>
    {:else if mirror && host.onBack}
      <div class="identity">
        {@render backAction()}
      </div>
    {/if}

    {#if !appState.compact}
      <!-- The surface choice outranks everything below it. The Matrix adds
           the two settings that shape its whole surface: Difficulty, which
           reshapes the grid, and Notation, which re-reads it. Both leave
           with the Matrix, so the Ratio Playground's band is the surface
           choice alone and its grid pane is nothing but the grid; the
           Matrix's pane is the same, which is the point. -->
      <div class="header-meta">
        <div class="surface-control-cell">
          <ShapeMatrixSurfaceControl />
        </div>
        {#if !theory}
          <!-- The wrapper owns the gap as well as the cell widths, so leaving
               the Matrix releases one continuous piece of space instead of
               leaving a final half-rem gap to snap away at teardown. -->
          <div
            class="level-presence"
            transition:growFade={{
              axis: "x",
              duration: booted ? DURATION.normal : 0,
            }}
          >
            <ShapeMatrixDifficultyControl />
            <!-- The axis values themselves are edited in the recipe bar above
                 the grid; the header keeps only the settings that shape the
                 whole surface. -->
            <div class="control-cell label-control neutral-accent">
              <span class="control-label">{t("shape_engine_notation")}</span>
              <SegmentedControl
                options={LABEL_OPTIONS}
                value={appState.labelMode}
                onchange={(mode: MatrixLabelMode) =>
                  appState.setLabelMode(mode)}
                size="sm"
                density="tight"
                color="accent"
                semantics="radiogroup"
                ariaLabel={t("shape_engine_turn_label_system")}
              />
            </div>
          </div>
        {/if}
      </div>
    {/if}

    <div class="top-actions">
      {#if appState.compact && mirror && host.onBack}
        {@render backAction()}
      {/if}
      {#if appState.compact}
        {#if appState.activeView === "detail"}
          {@render compactSurpriseAction()}
        {/if}
        {#if appState.activeView === "matrix" && hasPair}
          <button
            type="button"
            class="top-action compact-detail-action"
            use:claimedViewTransitionName={{
              name: SHAPE_MATRIX_BAR_SWAP_NAME,
              enabled: appState.mandalaHandoff,
            }}
            onclick={showDetail}
            transition:growFade={topSwapMotion()}
          >
            <span>{t("shape_engine_detail")}</span>
            <i class="fas fa-arrow-right" aria-hidden="true"></i>
          </button>
        {/if}
      {/if}
      <!-- The link to this view. One press: the phone's own share sheet
           where there is one, the clipboard everywhere else. Only a host with
           a route has a link at all. -->
      {#if appState.canShare && !mirror}
        <button
          class="top-action"
          type="button"
          aria-label={t("shape_engine_share_this_view")}
          onclick={shareThisView}
        >
          <i class="fas fa-share-nodes" aria-hidden="true"></i>
          {#if !appState.compact}<span>{t("shape_engine_share")}</span>{/if}
        </button>
      {/if}
      <button
        class="top-action"
        type="button"
        aria-label={t("shape_engine_about_name")}
        onclick={() => appState.openAbout()}
      >
        <i class="fas fa-circle-info" aria-hidden="true"></i>
        {#if !appState.compact}<span>{t("shape_engine_about")}</span>{/if}
      </button>
    </div>
  </header>

  <div class="workspace" bind:this={workspaceElement}>
    <div class="workspace-source">
      <PanelGroup
        direction="horizontal"
        bind:sizes
        gap={appState.compact ? 0 : 8}
        panels={[
          {
            id: "matrix",
            resizeLabel: t("shape_engine_resize_matrix_realization"),
            content: gridPane,
            defaultSize: 1.28,
            minSize: 440,
            fixedSize: appState.compact
              ? appState.activeView === "matrix"
                ? "100%"
                : "0px"
              : undefined,
            resizable: !appState.compact,
          },
          {
            id: "realization",
            content: detailPane,
            defaultSize: 0.82,
            minSize: 380,
            fixedSize: appState.compact
              ? appState.activeView === "detail"
                ? "100%"
                : "0px"
              : undefined,
          },
        ]}
      />
    </div>
  </div>

  {#if focusMode}
    <div class="focus-workspace-slot" data-focus-layout="picker">
      <ShapeMatrixFocusWorkspace />
    </div>
  {/if}

  {#if mirror}
    <!-- A host outside the Composer still credits the matrix and its maker,
         in the words the About panel uses. -->
    <footer class="attribution" inert={focusMode} aria-hidden={focusMode}>
      {t("shape_engine_attribution")}
    </footer>
  {/if}
</main>

{#snippet backAction()}
  <button type="button" class="top-action" onclick={() => host.onBack?.()}>
    <i class="fas fa-arrow-left" aria-hidden="true"></i>
    <span>{t("shape_engine_back")}</span>
  </button>
{/snippet}

<style>
  /* The same renderer survives this recomposition. FLIP moves its existing
     frame and grows the picker from the dock; only surrounding chrome fades. */
  .shape-app.focus-mode {
    grid-template-rows: minmax(0, min(50cqh, 100cqw)) minmax(0, 1fr);
    gap: 0.5rem;
  }
  .focus-mode .topbar {
    position: absolute;
    inset: 0 0 auto;
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
  }
  .focus-mode .workspace {
    grid-row: 1;
    padding: 0;
    overflow: visible;
  }
  .focus-workspace-slot {
    grid-row: 2;
    min-width: 0;
    min-height: 0;
    z-index: 3;
  }
  .focus-mode :global(.drill-stage),
  .focus-mode :global(.theory-detail) {
    padding: 0;
  }
  .focus-mode :global(.drill),
  .focus-mode :global(.detail-body) {
    grid-template-rows: minmax(0, 1fr);
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: "media";
    gap: 0;
  }
  .focus-mode :global(.media-stage) {
    grid-template-rows: minmax(0, 1fr);
    grid-template-areas: "hero";
    place-items: stretch;
  }
  .focus-mode :global(.detail-flow) {
    grid-area: hero;
    overflow: hidden;
    gap: 0;
  }
  .focus-mode :global(.hero-stage) {
    grid-template-rows: minmax(0, 1fr);
    width: min(100cqw, 100cqh);
    height: 100%;
    justify-self: center;
  }
  .focus-mode :global(.stage-frame) {
    width: min(100cqw, 100cqh);
    height: 100%;
    align-self: center;
    min-height: 0;
  }
  .focus-mode :global(.stage-window) {
    min-height: 0;
  }
  .topbar,
  .shape-app :global([data-focus-mode-chrome]) {
    transition:
      opacity var(--transition-normal),
      visibility var(--transition-normal);
  }
  .focus-mode :global([data-focus-mode-chrome]) {
    position: absolute;
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
  }
  @container shape-matrix-app (min-aspect-ratio: 1.25) {
    .shape-app.focus-mode {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      grid-template-rows: minmax(0, 1fr);
    }
    .focus-mode .workspace {
      grid-column: 1;
    }
    .focus-workspace-slot {
      grid-row: 1;
      grid-column: 2;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .topbar,
    .shape-app :global([data-focus-mode-chrome]) {
      transition: none;
    }
  }
  .shape-app {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background:
      radial-gradient(
        circle at 75% 0%,
        color-mix(in srgb, var(--theme-accent, #f59e0b) 8%, transparent),
        transparent 30rem
      ),
      var(--theme-panel-bg, #0a0f14);
    color: var(--theme-text, #f5f7fa);
  }

  .shape-app.mirror {
    grid-template-rows: auto minmax(0, 1fr) auto;
  }

  .attribution {
    padding: 0.35rem 0.75rem 0.45rem;
    border-top: 1px solid var(--theme-stroke, rgb(255 255 255 / 0.11));
    color: var(--theme-text-dim, rgb(255 255 255 / 0.62));
    font-size: var(--font-size-min, 0.875rem);
    text-align: center;
  }

  /* Focus mode recomposes the rows around the stage and its picker; the
     credit steps out of the grid the same way the topbar does. */
  .focus-mode .attribution {
    position: absolute;
    inset: auto 0 0;
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
  }

  .topbar {
    display: grid;
    /* The control pair always gets its full width (an `auto` track let the
       fr columns bite into it), and the side columns share the slack
       equally, so the pair sits centred whenever the row has room. The
       actions column can never shrink below its buttons: a 6rem floor let
       it, and the About button then left the row on small laptops. The
       identity column's floor holds the title; its note truncates inside. */
    grid-template-columns:
      minmax(11rem, 1fr)
      max-content
      minmax(max-content, 1fr);
    grid-template-areas: "identity meta actions";
    align-items: center;
    gap: 0.3rem 0.8rem;
    padding: 0.3rem 0.75rem 0.45rem;
    border-bottom: 1px solid var(--theme-stroke, rgb(255 255 255 / 0.11));
    background: var(--theme-panel-bg, rgb(10 15 20 / 0.94));
  }

  .top-action {
    min-height: var(--min-touch-target, 44px);
    border: 1px solid var(--theme-stroke, rgb(255 255 255 / 0.12));
    border-radius: 10px;
    background: var(--theme-card-bg, rgb(255 255 255 / 0.05));
    color: var(--theme-text-dim, rgb(255 255 255 / 0.72));
    text-decoration: none;
    cursor: pointer;
    transition:
      color var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard),
      background var(--duration-fast) var(--ease-standard);
  }

  .top-action,
  .top-actions {
    display: flex;
    align-items: center;
  }

  .top-action {
    flex: 0 0 auto;
    min-width: var(--min-touch-target, 44px);
    max-width: 11rem;
    justify-content: center;
    gap: 0.45rem;
    padding: 0.45rem 0.8rem;
    font: inherit;
    font-size: var(--font-size-min, 0.875rem);
    white-space: nowrap;
    overflow: hidden;
  }

  .top-action span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .top-action:hover,
  .top-action.open {
    color: var(--theme-text, #fff);
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #f59e0b) 55%,
      transparent
    );
    background: color-mix(
      in srgb,
      var(--theme-accent, #f59e0b) 8%,
      transparent
    );
  }

  .top-action:focus-visible {
    outline: 2px solid var(--theme-accent, #f59e0b);
    outline-offset: 2px;
  }

  .surprise-action {
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #f59e0b) 58%,
      var(--theme-stroke, transparent)
    );
    background: color-mix(
      in srgb,
      var(--theme-accent, #f59e0b) 13%,
      var(--theme-card-bg, transparent)
    );
    color: var(--theme-text, #fff);
    font-weight: 750;
  }

  .surprise-action i {
    color: var(--theme-accent, #f59e0b);
  }

  .surprise-action:disabled {
    border-color: var(--theme-stroke, rgb(255 255 255 / 0.09));
    background: transparent;
    color: var(--theme-text-dim, rgb(255 255 255 / 0.42));
    cursor: wait;
    opacity: 0.6;
  }

  .surprise-action.compact {
    width: var(--min-touch-target, 44px);
    max-width: none;
    padding: 0;
  }

  .identity {
    grid-area: identity;
    min-width: 0;
  }

  .identity strong {
    font-size: 1.2rem;
    font-weight: 750;
    letter-spacing: 0.005em;
    white-space: nowrap;
  }

  .compact-context {
    grid-area: context;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .bar-slot {
    display: flex;
    min-width: 0;
    align-items: center;
  }

  .compact-context > strong {
    overflow: hidden;
    font-size: var(--font-size-min, 0.875rem);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .back-to-matrix {
    display: inline-flex;
    min-width: 0;
    min-height: var(--min-touch-target, 44px);
    flex: 0 0 auto;
    align-items: center;
    gap: 0.5rem;
    padding: 0.35rem 0.75rem;
    border: 1px solid
      color-mix(
        in srgb,
        var(--theme-accent, #f59e0b) 44%,
        var(--theme-stroke, transparent)
      );
    border-radius: 10px;
    background: color-mix(
      in srgb,
      var(--theme-accent, #f59e0b) 9%,
      var(--theme-card-bg, transparent)
    );
    box-shadow: inset 0 1px 0
      color-mix(in srgb, var(--theme-text, #fff) 5%, transparent);
    color: var(--theme-text, #fff);
    cursor: pointer;
    font: inherit;
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 650;
    transition:
      color var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard),
      background var(--duration-fast) var(--ease-standard);
  }

  .back-to-matrix:hover {
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #f59e0b) 72%,
      var(--theme-stroke, transparent)
    );
    background: color-mix(
      in srgb,
      var(--theme-accent, #f59e0b) 16%,
      var(--theme-card-hover-bg, transparent)
    );
  }

  .back-to-matrix:focus-visible {
    outline: 2px solid var(--theme-accent, #f59e0b);
    outline-offset: 2px;
  }

  /* The title-line pair. It carries the ribbon's control height so the two
     cells match the band below rather than shrinking to the title's line box. */
  .header-meta {
    grid-area: meta;
    --ribbon-control-h: 3.25rem;
    display: flex;
    align-items: stretch;
    justify-self: center;
    gap: 0;
    min-width: 0;
  }

  .surface-control-cell {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
  }

  /* The bento cell: a caption row over its control, each cell carrying its
     own card chrome. The caption names the control so the band reads as
     labeled instruments instead of a strip of anonymous widgets. The band
     owns the grammar, so a cell a child component renders (Difficulty)
     wears the same chrome as one written here (Notation). */
  .header-meta :global(.control-cell) {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    align-items: center;
    justify-items: start;
    gap: 0.3rem;
    min-width: 0;
    padding: 0.45rem 0.55rem 0.5rem;
    border: 1px solid var(--theme-stroke, rgb(255 255 255 / 0.09));
    border-radius: 12px;
    background: color-mix(
      in srgb,
      var(--theme-panel-bg, #101721) 82%,
      transparent
    );
    box-shadow: inset 0 1px 0
      color-mix(in srgb, var(--theme-text, #fff) 3.5%, transparent);
  }

  .level-presence {
    display: flex;
    flex: 0 0 auto;
    align-items: stretch;
    gap: 0.5rem;
    margin-left: 0.5rem;
  }

  .header-meta :global(.control-label) {
    color: var(--theme-text-dim, rgb(255 255 255 / 0.52));
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 650;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .label-control {
    grid-area: labels;
    flex: 0 0 auto;
  }

  /* SegmentedControl's sliding indicator assumes equal-width segments, so
     each wrapper hands it a definite width sized to its longest label. */
  .label-control :global(.segmented-control) {
    width: 12rem;
  }

  .top-actions {
    grid-area: actions;
    min-width: max-content;
    justify-content: flex-end;
    gap: 0.4rem;
  }

  /* The narrowest wide hosts (small laptops, just above the compact seam):
     the title, the Explore-and-Difficulty pair, and About add up to more than
     the row. About keeps its glyph and aria-label and drops the word until the
     row can hold it. The height clause keeps this out of the compact tier,
     whose Detail pill needs its word. */
  @container shape-matrix-app (75rem <= width < 84.5rem) and (height >= 42rem) {
    .top-actions .top-action {
      max-width: none;
      padding-inline: 0;
    }

    .top-actions .top-action span {
      display: none;
    }
  }

  .compact-detail-action {
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #f59e0b) 56%,
      transparent
    );
    background: color-mix(
      in srgb,
      var(--theme-accent, #f59e0b) 13%,
      transparent
    );
    color: var(--theme-text, #fff);
  }

  .workspace {
    display: flex;
    min-width: 0;
    min-height: 0;
    padding: 0.6rem;
    overflow: hidden;
  }

  .workspace-source {
    display: flex;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }

  .workspace-pane {
    /* The customize workspace covers the grid pane from here. */
    position: relative;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .pane-source {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }

  /* The compact seam. ShapeMatrixApp decides `compact` in script from the
     same two rem bounds, so the markup and this stylesheet always change
     tiers together, whatever the root font size. Keep the two in step. */
  @container shape-matrix-app (width < 75rem) or (height < 42rem) {
    .topbar {
      grid-template-columns: minmax(0, 1fr) auto auto;
      grid-template-areas: "context meta actions";
      gap: 0.3rem 0.5rem;
      padding: 0.3rem 0.45rem 0.45rem;
    }

    .header-meta {
      gap: 0;
    }

    .level-presence {
      margin-left: 0.4rem;
    }

    /* Compact hosts trade the captions for canvas; the cells keep their
       card chrome so the band still reads as grouped instruments. */
    .header-meta :global(.control-label) {
      display: none;
    }

    .header-meta :global(.control-cell) {
      gap: 0;
      padding: 0.25rem 0.35rem;
      border-radius: 10px;
    }

    .top-actions {
      grid-area: actions;
    }

    .workspace {
      padding: 0;
    }

    .compact-detail .topbar {
      padding-block: 0.2rem;
    }
  }

  @container shape-matrix-app (max-width: 25rem) {
    .topbar {
      gap: 0.3rem;
    }
  }
  @container shape-matrix-app (max-width: 30rem) {
    /* The chip already names the surface; a title that truncates to
       "Sha..." beside it is noise. */
    .compact-context > strong {
      display: none;
    }

    /* The back button drops its word for the same reason, and it has one more:
       the surface control sitting right beside it already says Matrix or
       Theory, so the word was printed twice. Theory is where the row actually
       ran out of width, because two ratios are wider than two turn values. */
    .back-to-matrix {
      padding-inline: 0.6rem;
    }

    .back-to-matrix span {
      display: none;
    }
  }

  @container shape-matrix-app (max-width: 25rem) {
    .topbar {
      gap: 0.3rem;
    }
  }

  @container shape-matrix-app (min-width: 50.01rem) and (max-height: 30rem) {
    .shape-app:not(.compact-detail) .topbar {
      padding-block: 0.3rem;
    }
  }

  /* While the tile-to-hero morph runs, the panes must land in place at once:
     the browser snapshots the new layout the frame it changes, and a pane
     still sliding open would be captured at zero width. The morph is the
     continuity cue; PanelGroup keeps owning the geometry. */
  :global(html.shape-matrix-morph) .workspace :global(.panel-wrapper) {
    transition: none;
  }

  /* The flight between the Matrix and a stage is staged, not faded. Everything
     keeps one clock, --flight, and has one job in it.

     Leaving the Matrix: the grid steps back first and alone, so the flower is
     the only thing moving. The stage's surface grows out of the tile with the
     flower riding it, and it arrives quickly and settles slowly. Once the
     flower has nearly landed the page assembles around it, from the outside
     in: side card, controls and carousel, then the grid and prop on the stage,
     then the stage's small furniture.

     Coming back is the same story faster: the page clears out of the way at
     once, the flower flies home, and the grid comes up around it as it lands.

     Each layer has a name on one side only, so its old and new rules are its
     exit and its entrance; only the flower, the surface and the top bar's
     controls exist on both sides and travel. */
  :global(html.shape-matrix-morph) {
    --flight: calc(var(--duration-dramatic) * 1.6);
  }

  /* A name that exists on only the arriving side is painted after the ones that
     existed before, so on the way back the Matrix would cover the flower
     landing on it. The flight always rides on top, in the page's own order. */
  :global(
    html.shape-matrix-morph::view-transition-group(shape-matrix-active-stage)
  ) {
    z-index: 1;
  }
  :global(
    html.shape-matrix-morph::view-transition-group(shape-matrix-active-mandala)
  ) {
    z-index: 2;
  }
  :global(html.shape-matrix-morph::view-transition-group(shape-matrix-figure)) {
    z-index: 3;
  }
  :global(
    html.shape-matrix-morph::view-transition-group(shape-matrix-stage-head)
  ),
  :global(
    html.shape-matrix-morph::view-transition-group(shape-matrix-stage-transport)
  ),
  :global(
    html.shape-matrix-morph::view-transition-group(shape-matrix-stage-rotate)
  ) {
    z-index: 4;
  }

  /* The flower and its surface share one path, without overshoot: a spring
     would swing the flower past the square the live canvas paints in. So do the
     top bar's controls, which slide to their new places instead of showing
     both places at once. */
  :global(
    html.shape-matrix-morph::view-transition-group(shape-matrix-active-stage)
  ),
  :global(
    html.shape-matrix-morph::view-transition-group(shape-matrix-active-mandala)
  ),
  :global(
    html.shape-matrix-morph::view-transition-group(shape-matrix-bar-lead)
  ),
  :global(
    html.shape-matrix-morph::view-transition-group(shape-matrix-bar-surface)
  ),
  :global(
    html.shape-matrix-morph::view-transition-group(shape-matrix-bar-turns)
  ) {
    animation-duration: calc(var(--flight) * 0.85);
    animation-timing-function: var(--ease-surface-travel);
  }

  /* One picture changing size, and the eye should only ever see the larger
     raster: a tile's picture stretched to the stage's size is a blur. Opening,
     the tile hands over to the stage's picture in the first moments, while the
     flower is still small. Going back, the stage's picture holds until the
     flower is about twice a tile, and the swap is over before the slow end of
     the landing, where the tile's bolder line would read as a late sharpening.
     They stay complementary so the flower never dips. */
  :global(
    html.shape-matrix-morph::view-transition-old(shape-matrix-active-mandala)
  ),
  :global(
    html.shape-matrix-morph::view-transition-new(shape-matrix-active-mandala)
  ) {
    mix-blend-mode: plus-lighter;
  }
  :global(
    html.shape-matrix-morph::view-transition-old(shape-matrix-active-mandala)
  ) {
    animation: shape-matrix-page-out calc(var(--flight) * 0.14) linear both;
  }
  /* Landed, the bright still gives way to the live figure blooming over it, so
     the flight ends on exactly what the page shows. */
  :global(
    html.shape-matrix-morph::view-transition-new(shape-matrix-active-mandala)
  ) {
    animation:
      shape-matrix-page-in calc(var(--flight) * 0.14) linear both,
      shape-matrix-floor-rest calc(var(--flight) * 0.55) var(--ease-standard)
        calc(var(--flight) * 0.68) forwards;
  }
  @keyframes -global-shape-matrix-floor-rest {
    from {
      opacity: 1;
    }
    to {
      opacity: var(--shape-matrix-floor-rest);
    }
  }
  @keyframes -global-shape-matrix-floor-wake {
    from {
      opacity: var(--shape-matrix-floor-rest);
    }
    to {
      opacity: 1;
    }
  }
  /* Going back, the live figure clears first and the still takes its place
     where it stands, so one flower leaves, not two. */
  :global(
    html.shape-matrix-morph-back::view-transition-group(
        shape-matrix-active-stage
      )
  ),
  :global(
    html.shape-matrix-morph-back::view-transition-group(
        shape-matrix-active-mandala
      )
  ) {
    animation-delay: calc(var(--flight) * 0.12);
  }
  :global(
    html.shape-matrix-morph-back::view-transition-old(
        shape-matrix-active-mandala
      )
  ) {
    animation:
      shape-matrix-floor-wake calc(var(--flight) * 0.16) linear both,
      shape-matrix-page-out calc(var(--flight) * 0.16) linear
        calc(var(--flight) * 0.36) forwards;
  }
  :global(
    html.shape-matrix-morph-back::view-transition-new(
        shape-matrix-active-mandala
      )
  ) {
    animation: shape-matrix-page-in calc(var(--flight) * 0.16) linear
      calc(var(--flight) * 0.36) both;
  }

  /* The tile's wash becomes the stage's surface early in the flight. */
  :global(
    html.shape-matrix-morph::view-transition-old(shape-matrix-active-stage)
  ),
  :global(
    html.shape-matrix-morph::view-transition-new(shape-matrix-active-stage)
  ) {
    animation-duration: calc(var(--flight) * 0.5);
    animation-timing-function: linear;
  }
  /* The tile and the stage are different rectangles. Each snapshot fills the
     travelling box for the whole flight instead of keeping its own aspect
     and leaving the box partly empty. */
  :global(
    html.shape-matrix-morph::view-transition-old(shape-matrix-active-stage)
  ),
  :global(
    html.shape-matrix-morph::view-transition-new(shape-matrix-active-stage)
  ) {
    inline-size: 100%;
    block-size: 100%;
    object-fit: cover;
  }

  /* What is left in the page snapshots is the backdrop and the bar behind the
     controls, nearly the same on both sides. Complementary linear ramps with
     `plus-lighter` sum to exactly one, so that part holds perfectly still. The
     old ease-in against ease-out held both pages near full strength through
     the middle, which read as a double exposure. */
  @keyframes -global-shape-matrix-page-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  @keyframes -global-shape-matrix-page-out {
    from {
      opacity: 1;
    }
    to {
      opacity: 0;
    }
  }
  :global(html.shape-matrix-morph::view-transition-old(root)),
  :global(html.shape-matrix-morph::view-transition-new(root)) {
    mix-blend-mode: plus-lighter;
  }
  :global(html.shape-matrix-morph::view-transition-old(root)) {
    animation: shape-matrix-page-out calc(var(--flight) * 0.5) linear both;
  }
  :global(html.shape-matrix-morph::view-transition-new(root)) {
    animation: shape-matrix-page-in calc(var(--flight) * 0.5) linear both;
  }

  /* The Matrix itself: out first and quickly, back in only once the flower is
     most of the way home. It breathes a little, so it recedes rather than
     blinks. */
  @keyframes -global-shape-matrix-recede {
    from {
      opacity: 1;
      scale: 1;
    }
    to {
      opacity: 0;
      scale: 0.985;
    }
  }
  @keyframes -global-shape-matrix-return {
    from {
      opacity: 0;
      scale: 0.985;
    }
    to {
      opacity: 1;
      scale: 1;
    }
  }
  :global(html.shape-matrix-morph::view-transition-old(shape-matrix-pane)) {
    animation: shape-matrix-recede calc(var(--flight) * 0.3)
      var(--ease-standard) both;
  }
  :global(html.shape-matrix-morph::view-transition-new(shape-matrix-pane)) {
    animation: shape-matrix-return calc(var(--flight) * 0.7) var(--ease-out)
      calc(var(--flight) * 0.3) both;
  }

  /* The top bar's words that change hands swap while the controls beside them
     slide, the old word gone before the new one shows. */
  :global(html.shape-matrix-morph::view-transition-old(shape-matrix-bar-lead)) {
    animation: shape-matrix-page-out calc(var(--flight) * 0.25) linear both;
  }
  :global(html.shape-matrix-morph::view-transition-new(shape-matrix-bar-lead)) {
    animation: shape-matrix-page-in calc(var(--flight) * 0.35) linear
      calc(var(--flight) * 0.25) both;
  }
  :global(
    html.shape-matrix-morph::view-transition-old(shape-matrix-bar-surface)
  ),
  :global(
    html.shape-matrix-morph::view-transition-new(shape-matrix-bar-surface)
  ),
  :global(html.shape-matrix-morph::view-transition-old(shape-matrix-bar-turns)),
  :global(
    html.shape-matrix-morph::view-transition-new(shape-matrix-bar-turns)
  ) {
    animation-duration: calc(var(--flight) * 0.5);
    animation-timing-function: linear;
  }

  /* The button on the bar's far side changes with the page the same way. */
  :global(
    html.shape-matrix-morph::view-transition-group(shape-matrix-bar-swap)
  ) {
    animation-duration: calc(var(--flight) * 0.85);
    animation-timing-function: var(--ease-surface-travel);
  }
  :global(html.shape-matrix-morph::view-transition-old(shape-matrix-bar-swap)) {
    animation: shape-matrix-page-out calc(var(--flight) * 0.25) linear both;
  }
  :global(html.shape-matrix-morph::view-transition-new(shape-matrix-bar-swap)) {
    animation: shape-matrix-page-in calc(var(--flight) * 0.35) linear
      calc(var(--flight) * 0.25) both;
  }

  /* The action row arrives with the controls. */
  :global(html.shape-matrix-morph::view-transition-new(shape-matrix-actions)) {
    animation: shape-matrix-settle-in var(--duration-emphasis) var(--ease-out)
      calc(var(--flight) * 0.4) both;
    --settle-y: 0.625rem;
  }
  :global(html.shape-matrix-morph::view-transition-old(shape-matrix-actions)) {
    animation: shape-matrix-settle-out calc(var(--flight) * 0.3)
      var(--ease-standard) both;
    --settle-y: 0.625rem;
  }

  /* The frames around the stage settle from the side they sit on, each a beat
     after the last, and clear out together on the way back. */
  @keyframes -global-shape-matrix-settle-in {
    from {
      opacity: 0;
      transform: translate(var(--settle-x, 0), var(--settle-y, 0));
    }
    to {
      opacity: 1;
      transform: translate(0, 0);
    }
  }
  @keyframes -global-shape-matrix-settle-out {
    from {
      opacity: 1;
      transform: translate(0, 0);
    }
    to {
      opacity: 0;
      transform: translate(var(--settle-x, 0), var(--settle-y, 0));
    }
  }
  :global(html.shape-matrix-morph::view-transition-new(shape-matrix-modes)),
  :global(html.shape-matrix-morph::view-transition-new(shape-matrix-solo-card)),
  :global(html.shape-matrix-morph::view-transition-new(shape-matrix-strip)),
  :global(html.shape-matrix-morph::view-transition-new(shape-matrix-controls)),
  :global(
    html.shape-matrix-morph::view-transition-new(shape-matrix-stage-head)
  ),
  :global(
    html.shape-matrix-morph::view-transition-new(shape-matrix-stage-transport)
  ),
  :global(
    html.shape-matrix-morph::view-transition-new(shape-matrix-stage-rotate)
  ) {
    animation: shape-matrix-settle-in var(--duration-emphasis) var(--ease-out)
      both;
  }
  :global(html.shape-matrix-morph::view-transition-old(shape-matrix-modes)),
  :global(html.shape-matrix-morph::view-transition-old(shape-matrix-solo-card)),
  :global(html.shape-matrix-morph::view-transition-old(shape-matrix-strip)),
  :global(html.shape-matrix-morph::view-transition-old(shape-matrix-controls)),
  :global(
    html.shape-matrix-morph::view-transition-old(shape-matrix-stage-head)
  ),
  :global(
    html.shape-matrix-morph::view-transition-old(shape-matrix-stage-transport)
  ),
  :global(
    html.shape-matrix-morph::view-transition-old(shape-matrix-stage-rotate)
  ) {
    animation: shape-matrix-settle-out calc(var(--flight) * 0.3)
      var(--ease-standard) both;
  }
  :global(html.shape-matrix-morph::view-transition-new(shape-matrix-modes)),
  :global(html.shape-matrix-morph::view-transition-old(shape-matrix-modes)),
  :global(html.shape-matrix-morph::view-transition-new(shape-matrix-solo-card)),
  :global(html.shape-matrix-morph::view-transition-old(shape-matrix-solo-card)),
  :global(
    html.shape-matrix-morph::view-transition-new(shape-matrix-stage-head)
  ),
  :global(
    html.shape-matrix-morph::view-transition-old(shape-matrix-stage-head)
  ) {
    --settle-y: -0.625rem;
  }
  :global(html.shape-matrix-morph::view-transition-new(shape-matrix-strip)),
  :global(html.shape-matrix-morph::view-transition-old(shape-matrix-strip)),
  :global(html.shape-matrix-morph::view-transition-new(shape-matrix-controls)),
  :global(html.shape-matrix-morph::view-transition-old(shape-matrix-controls)),
  :global(
    html.shape-matrix-morph::view-transition-new(shape-matrix-stage-transport)
  ),
  :global(
    html.shape-matrix-morph::view-transition-old(shape-matrix-stage-transport)
  ) {
    --settle-y: 0.625rem;
  }
  /* With room beside the stage, the solo card is a column to its left. */
  @media (min-width: 42rem) and (min-aspect-ratio: 5 / 6) {
    :global(
      html.shape-matrix-morph::view-transition-new(shape-matrix-solo-card)
    ),
    :global(
      html.shape-matrix-morph::view-transition-old(shape-matrix-solo-card)
    ) {
      --settle-x: -0.75rem;
      --settle-y: 0;
    }
  }
  :global(html.shape-matrix-morph::view-transition-new(shape-matrix-modes)),
  :global(
    html.shape-matrix-morph::view-transition-new(shape-matrix-solo-card)
  ) {
    animation-delay: calc(var(--flight) * 0.35);
  }
  :global(html.shape-matrix-morph::view-transition-new(shape-matrix-controls)) {
    animation-delay: calc(var(--flight) * 0.45);
  }
  :global(html.shape-matrix-morph::view-transition-new(shape-matrix-strip)) {
    animation-delay: calc(var(--flight) * 0.55);
  }
  :global(
    html.shape-matrix-morph::view-transition-new(shape-matrix-stage-head)
  ) {
    animation-delay: calc(var(--flight) * 0.7);
  }
  :global(
    html.shape-matrix-morph::view-transition-new(shape-matrix-stage-transport)
  ) {
    animation-delay: calc(var(--flight) * 0.8);
  }
  :global(
    html.shape-matrix-morph::view-transition-new(shape-matrix-stage-rotate)
  ) {
    animation-delay: calc(var(--flight) * 0.85);
  }

  /* The stage's grid and prop bloom in place around the flower once it is down,
     and clear first on the way back. They hold still: the live figure draws the
     same lines as the flower beneath it, and a scale would pull them apart. */
  :global(html.shape-matrix-morph::view-transition-new(shape-matrix-figure)) {
    animation: shape-matrix-page-in calc(var(--flight) * 0.55)
      var(--ease-standard) calc(var(--flight) * 0.68) both;
  }
  :global(html.shape-matrix-morph::view-transition-old(shape-matrix-figure)) {
    animation: shape-matrix-page-out calc(var(--flight) * 0.16) linear both;
  }

  @media (prefers-reduced-motion: reduce) {
    .top-action,
    .back-to-matrix {
      transition: none;
    }

    /* Without the crossfade there is nothing for the additive blend to sum,
       and both page snapshots would burn through each other. */
    :global(html.shape-matrix-morph::view-transition-old(root)),
    :global(html.shape-matrix-morph::view-transition-new(root)) {
      mix-blend-mode: normal;
    }

    :global(html.shape-matrix-morph::view-transition-old(root)),
    :global(html.shape-matrix-morph::view-transition-new(root)),
    :global(
      html.shape-matrix-morph::view-transition-group(shape-matrix-bar-lead)
    ),
    :global(
      html.shape-matrix-morph::view-transition-group(shape-matrix-bar-surface)
    ),
    :global(
      html.shape-matrix-morph::view-transition-group(shape-matrix-bar-turns)
    ),
    :global(
      html.shape-matrix-morph::view-transition-new(shape-matrix-bar-surface)
    ),
    :global(
      html.shape-matrix-morph::view-transition-old(shape-matrix-bar-surface)
    ),
    :global(
      html.shape-matrix-morph::view-transition-new(shape-matrix-bar-turns)
    ),
    :global(
      html.shape-matrix-morph::view-transition-old(shape-matrix-bar-turns)
    ),
    :global(
      html.shape-matrix-morph::view-transition-group(shape-matrix-bar-swap)
    ),
    :global(
      html.shape-matrix-morph::view-transition-new(shape-matrix-bar-swap)
    ),
    :global(
      html.shape-matrix-morph::view-transition-old(shape-matrix-bar-swap)
    ),
    :global(html.shape-matrix-morph::view-transition-new(shape-matrix-actions)),
    :global(html.shape-matrix-morph::view-transition-old(shape-matrix-actions)),
    :global(html.shape-matrix-morph::view-transition-new(shape-matrix-pane)),
    :global(html.shape-matrix-morph::view-transition-old(shape-matrix-pane)),
    :global(
      html.shape-matrix-morph::view-transition-new(shape-matrix-solo-card)
    ),
    :global(
      html.shape-matrix-morph::view-transition-old(shape-matrix-solo-card)
    ),
    :global(html.shape-matrix-morph::view-transition-new(shape-matrix-figure)),
    :global(html.shape-matrix-morph::view-transition-old(shape-matrix-figure)),
    :global(
      html.shape-matrix-morph::view-transition-new(shape-matrix-stage-head)
    ),
    :global(
      html.shape-matrix-morph::view-transition-old(shape-matrix-stage-head)
    ),
    :global(
      html.shape-matrix-morph::view-transition-new(shape-matrix-stage-transport)
    ),
    :global(
      html.shape-matrix-morph::view-transition-old(shape-matrix-stage-transport)
    ),
    :global(
      html.shape-matrix-morph::view-transition-new(shape-matrix-stage-rotate)
    ),
    :global(
      html.shape-matrix-morph::view-transition-old(shape-matrix-stage-rotate)
    ),
    :global(
      html.shape-matrix-morph::view-transition-new(shape-matrix-bar-lead)
    ),
    :global(
      html.shape-matrix-morph::view-transition-old(shape-matrix-bar-lead)
    ),
    :global(html.shape-matrix-morph::view-transition-new(shape-matrix-modes)),
    :global(html.shape-matrix-morph::view-transition-old(shape-matrix-modes)),
    :global(html.shape-matrix-morph::view-transition-new(shape-matrix-strip)),
    :global(html.shape-matrix-morph::view-transition-old(shape-matrix-strip)),
    :global(
      html.shape-matrix-morph::view-transition-new(shape-matrix-controls)
    ),
    :global(
      html.shape-matrix-morph::view-transition-old(shape-matrix-controls)
    ) {
      animation: none;
    }

    :global(
      html.shape-matrix-morph::view-transition-group(
          shape-matrix-active-mandala
        )
    ),
    :global(
      html.shape-matrix-morph::view-transition-old(shape-matrix-active-mandala)
    ),
    :global(
      html.shape-matrix-morph::view-transition-new(shape-matrix-active-mandala)
    ),
    :global(
      html.shape-matrix-morph::view-transition-group(shape-matrix-active-stage)
    ),
    :global(
      html.shape-matrix-morph::view-transition-old(shape-matrix-active-stage)
    ),
    :global(
      html.shape-matrix-morph::view-transition-new(shape-matrix-active-stage)
    ) {
      animation: none;
    }
  }
</style>
