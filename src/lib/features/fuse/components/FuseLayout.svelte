<script lang="ts">
  import { onDestroy, tick, untrack } from "svelte";
  import { motionDuration } from "$lib/shared/transitions/motion";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import { createLayoutMotion } from "$lib/shared/transitions/layout-flip";
  import { holdBackgroundFor } from "$lib/shared/background/shared/state/background-hold.svelte";
  import {
    BREAKPOINTS,
    LANDSCAPE_THRESHOLDS,
  } from "$lib/shared/device/domain/constants/device-constants";
  import { openSequenceViewer } from "$lib/shared/sequence-viewer/services/sequence-viewer-navigator";
  import { getLibrarySaveService } from "$lib/features/library/get-library-save-service";
  import { getSettings } from "$lib/shared/application/state/app-state.svelte";
  import { createSequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import { showToast } from "$lib/shared/toast/state/toast-state.svelte";
  import { LibraryError } from "$lib/shared/library/domain/library-error";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import {
    fitsFuseRecipeColumn,
    fitsFuseTallPortraitWorkspace,
    getBestFuseStepColumns,
    negotiateFuseColumnWidths,
    resolveBalancedFuseWorkspaceSplit,
    resolveFuseWingWorkspace,
  } from "../services/fuse-workspace-split";
  import { getFuseContext } from "../context/fuse-context";
  import type { FuseSettingsDestination } from "../domain/fuse-recipe-destination";
  import { fuseRecipePanel } from "../state/fuse-recipe-panel.svelte";
  import type { FuseMode } from "../state/fuse-state.svelte";
  import type { FuseSide } from "../state/fuse-shuffle-pool.svelte";
  import FusePreviewStage from "./FusePreviewStage.svelte";
  import FuseRecipeColumn from "./FuseRecipeColumn.svelte";
  import FuseSettingsDrawer from "./FuseSettingsDrawer.svelte";
  import FuseSourceCard from "./FuseSourceCard.svelte";
  import FuseFirstStepPanel from "./FuseFirstStepPanel.svelte";
  import FusePathBuilderDialog from "./FusePathBuilderDialog.svelte";
  import FuseWorkspaceHeader from "./FuseWorkspaceHeader.svelte";

  const { state: fuseState } = getFuseContext();
  const settings = getSettings();
  let containerElement = $state<HTMLDivElement | null>(null);
  let compact = $state(true);
  let landscapeSplit = $state(false);
  let shortLandscape = $state(false);
  let tallPortrait = $state(false);
  // Open state and destination live in a module so they outlast this
  // component: a hot-module replacement of the layout, or the full reload Vite
  // falls back to, used to shut the Rule editor mid-edit. A Pairing editor
  // restored into a workspace whose paths are no longer linked has nothing to
  // edit, so that one lands on the recipe list instead.
  const recipePanel = fuseRecipePanel;
  if (recipePanel.destination === "pairing" && fuseState.mode !== "symmetry") {
    recipePanel.destination = null;
  }
  let actionSide = $state<FuseSide | null>(null);
  let firstStepOpen = $state(false);
  let inlineFirstStepSide = $state<FuseSide | null>(null);
  let pathBuilderOpen = $state(false);
  let pathBuilderSide = $state<FuseSide | null>(null);
  let isSavingResult = $state(false);
  // Full desktop cards include their start position and mandala. Smaller
  // workspaces keep the lean, big-cell view; especially wide ones can seat the
  // two complete cards on opposite sides of the result.
  let fullCard = $state(false);
  let wideWorkspace = $state(false);

  // Desktop-only draggable seam between the path column and the animation
  // canvas — same pattern as the sequence viewer's sidebar resize
  // (ViewerContentRail): pointer-capture drag, col-resize handle, double-click
  // reset. Drives the grid's left track via --fuse-left.
  //
  // Default is COMPUTED, not a fixed fraction. The source cards and the square
  // animation frame each derive an ideal width from the available height, then
  // share any surplus or deficit proportionally. A user drag is saved per
  // approximate device size and wins over the computed default on the next
  // visit at that size.
  const SPLIT_KEY = "tka-fuse-splits"; // JSON map: deviceBucket -> px
  const MIN_LEFT = 340; // path column never narrower than this
  const LAPTOP_MIN_LEFT = 560;
  const WIDE_COMFORT = 720; // wide screens: what the paths AND the result each want
  const WIDE_COMFORT_CAP = 1050;
  const WIDE_MAX_LEFT = 1400;
  const NATIVE_4K_MAX_LEFT = 2000;
  const NATIVE_4K_CANVAS_FLOOR = 1200;
  const CANVAS_FLOOR = 560; // canvas never narrower than this
  // Recipe editing is temporary and benefits from keeping all three regions in
  // view. These slightly tighter floors let a 1440px laptop keep the source,
  // result, and settings side by side instead of covering the result with a
  // drawer. The ordinary two-column workspace keeps the roomier floors above.
  const RECIPE_PATH_FLOOR = 330;
  const RECIPE_CANVAS_FLOOR = 548;
  const RECIPE_MIN_W = 400; // recipe column: narrow enough for a laptop...
  const RECIPE_MAX_W = 620; // ...wide enough that its editors don't stack at 4K
  const CARD_GAP = 14; // vertical gap between the stacked left/right cards
  const CARD_HPAD = 44; // card horizontal padding, both sides
  const CARD_CHROME_V = 96; // card vertical chrome: padding + the Back/Shuffle row
  const PREVIEW_CHROME_V = 190; // matches FusePreviewStage's square frame cap
  const PREVIEW_HPAD = 48; // maximum desktop stage padding, both sides
  const TALL_PORTRAIT_SPLIT_WIDTH = 520;
  const TALL_PORTRAIT_NARROW_MIN_HEIGHT = 1480;
  const TALL_PORTRAIT_SPLIT_MIN_HEIGHT = 1280;
  const TALL_PORTRAIT_MIN_ASPECT = 2.1;
  const WING_SOURCE_FLOOR = 520;
  const WING_SOURCE_CAP = 820;
  const WING_PREVIEW_FLOOR = 760;
  const WING_MIN_HEIGHT = 900;

  let containerWidth = $state(0);
  let containerHeight = $state(0);
  let workspaceGridWidth = $state(0);
  let workspaceColumnGap = $state(0);
  let contentH = $state(0); // measured height of the complete result row
  let overrides = $state<Record<string, number>>(loadOverrides());
  let splitPx = $state<number | null>(null);
  let dragging = $state(false);
  let workspaceEl = $state<HTMLDivElement | null>(null);
  let layoutRecomposing = $state(false);

  function loadOverrides(): Record<string, number> {
    try {
      const raw = localStorage.getItem(SPLIT_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          return parsed as Record<string, number>;
        }
      }
    } catch {
      /* ignore */
    }
    return {};
  }
  function persistOverrides(): void {
    try {
      localStorage.setItem(SPLIT_KEY, JSON.stringify(overrides));
    } catch {
      /* ignore */
    }
  }

  // Desktop shows the recipe as the workspace's own third column; everything
  // narrower keeps the sheet. The gate is arithmetic, not a breakpoint, and it
  // lives in the split service with the rest of the width negotiation — see
  // `fuseRecipeColumnFloor` for why it measures hard floors rather than
  // comfortable ones.
  const RECIPE_COLUMN_FIT = {
    recipeMinWidth: RECIPE_MIN_W,
    pathHardMinWidth: RECIPE_PATH_FLOOR,
    canvasFloor: RECIPE_CANVAS_FLOOR,
    columnGap: CARD_GAP,
  };
  // Measured against the grid's own content box, not the outer container: the
  // workspace has padding, and gating on the wider number let three columns
  // open into a grid ~40px too narrow to seat them. Every column landed on its
  // hard floor and the row still overflowed.
  const recipeColumn = $derived(
    fullCard &&
      recipePanel.open &&
      fitsFuseRecipeColumn(
        workspaceGridWidth || containerWidth,
        RECIPE_COLUMN_FIT
      )
  );
  // What the three columns are worth to each other. Each states the width it
  // wants and the width it can survive on, and any shortfall is shared between
  // all three rather than dropped on whichever one has no floor of its own —
  // see `negotiateFuseColumnWidths`.
  const columnBudget = (recipeOpen: boolean) =>
    Math.max(
      0,
      (workspaceGridWidth || containerWidth) -
        (recipeOpen ? 2 : 1) * (workspaceColumnGap || CARD_GAP)
    );

  // The two work areas want the same width as each other, and on wide screens
  // that want grows with the window: a fixed 720 left a 4K workspace looking
  // like a laptop layout with dead rail on both sides.
  const workComfort = (budget: number) =>
    wideWorkspace
      ? Math.round(
          Math.min(WIDE_COMFORT_CAP, Math.max(WIDE_COMFORT, budget * 0.3))
        )
      : containerWidth >= 1180
        ? LAPTOP_MIN_LEFT
        : MIN_LEFT;
  const settleColumnWidths = (recipeOpen: boolean) => {
    const budget = columnBudget(recipeOpen);
    const work = workComfort(budget);
    return negotiateFuseColumnWidths(budget, {
      path: {
        comfort: work,
        floor: recipeOpen ? RECIPE_PATH_FLOOR : MIN_LEFT,
      },
      canvas: {
        comfort: Math.max(CANVAS_FLOOR, work),
        floor: recipeOpen ? RECIPE_CANVAS_FLOOR : CANVAS_FLOOR,
      },
      // A recipe that always took its flat quarter of the window was not a
      // party to the negotiation at all — it simply billed the other two. It
      // now concedes with them, down to the width its editors stop fitting in.
      recipe: recipeOpen
        ? {
            comfort: Math.min(
              RECIPE_MAX_W,
              Math.max(RECIPE_MIN_W, containerWidth * 0.26)
            ),
            floor: RECIPE_MIN_W,
          }
        : { comfort: 0, floor: 0 },
    });
  };
  // Two settlements: the recipe panel has to be laid out at its open width even
  // while it is shut, so the panel can be revealed by the growing track instead
  // of sizing to it. A panel that sized to a 0→620px track would spend the
  // whole animation squished, reflowing its own contents every frame.
  const openColumnWidths = $derived(settleColumnWidths(true));
  const columnWidths = $derived(
    recipeColumn ? openColumnWidths : settleColumnWidths(false)
  );
  const recipeTargetWidth = $derived(openColumnWidths.recipe);
  const recipeColumnWidth = $derived(recipeColumn ? recipeTargetWidth : 0);

  const previewIdealWidth = () =>
    Math.max(
      WING_PREVIEW_FLOOR,
      containerHeight - PREVIEW_CHROME_V + PREVIEW_HPAD
    );
  const wingLayout = $derived(
    resolveFuseWingWorkspace({
      availableWidth: workspaceGridWidth || containerWidth,
      availableHeight: containerHeight,
      previewIdealWidth: previewIdealWidth(),
      sourceFloor: WING_SOURCE_FLOOR,
      sourceCap: WING_SOURCE_CAP,
      previewFloor: WING_PREVIEW_FLOOR,
      recipeWidth: recipeColumnWidth,
      columnGap: workspaceColumnGap || CARD_GAP,
      minHeight: WING_MIN_HEIGHT,
    })
  );
  const wingWorkspace = $derived(fullCard && wingLayout.fits);

  // Crossing the wide-workbench seam moves three surviving regions at once.
  // The shared layout-motion owner lets Left travel left, Right travel right,
  // and the result grow between them instead of making the workspace blink
  // into a new arrangement. The initial measured layout is first paint, not a
  // user-visible change, so it settles without animation.
  const workspaceLayoutMotion = createLayoutMotion({
    getRoot: () => workspaceEl,
    groups: [
      {
        selector: "[data-fuse-layout-region]",
        datasetKey: "fuseLayoutRegion",
      },
    ],
    getDuration: () => motionDuration(DURATION.emphasis),
  });
  let previousWingWorkspace = false;
  let wingLayoutResolved = false;
  let layoutMotionToken = 0;

  $effect.pre(() => {
    const nextWingWorkspace = wingWorkspace;
    if ((workspaceGridWidth || containerWidth) <= 0) {
      previousWingWorkspace = nextWingWorkspace;
      return;
    }
    if (!wingLayoutResolved) {
      wingLayoutResolved = true;
      previousWingWorkspace = nextWingWorkspace;
      // The first composition is a starting state, not a change: a recipe
      // panel restored open would otherwise slide in from a zero-width track
      // on every load, and the wings would fly to the column beside it.
      // Held across a painted frame, not just the flush: a CSS transition
      // starts at the style recalc that sees the new track widths, so the
      // class has to still be there for that recalc.
      layoutRecomposing = true;
      const token = ++layoutMotionToken;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (token === layoutMotionToken) layoutRecomposing = false;
        });
      });
      return;
    }
    if (nextWingWorkspace === previousWingWorkspace) return;

    previousWingWorkspace = nextWingWorkspace;
    const captured = workspaceLayoutMotion.capture();
    layoutRecomposing = captured;
    const token = ++layoutMotionToken;
    void tick().then(() => {
      if (token !== layoutMotionToken) return;
      if (captured) workspaceLayoutMotion.play();
      layoutRecomposing = false;
    });
  });

  onDestroy(() => workspaceLayoutMotion.cancel());

  // The grid track animating open is the one moment on this page where the
  // frame budget is fully spoken for, and the animated backdrop repaints a
  // viewport-sized canvas on every one of those frames. It holds its last
  // frame instead, for slightly longer than the transition so the final frame
  // — the one the eye actually lands on — is protected too.
  const RECIPE_TRANSITION_MS = 280;
  const BACKDROP_HOLD_MS = RECIPE_TRANSITION_MS + 60;
  $effect(() => {
    // Reading the width, not the boolean: the track also animates when the
    // column resizes under an open panel.
    recipeColumnWidth;
    untrack(() => holdBackgroundFor("fuse-recipe-track", BACKDROP_HOLD_MS));
  });

  // Closing the recipe collapses its track back to nothing over the same 280ms
  // the opening took, so the panel has to stay on screen for that long — wiped
  // away by its own shrinking track. Unmounting it the instant it closed left
  // those 280ms as an empty widening gap: the result card slid out over blank
  // space instead of over the panel it was replacing, which is the same pop the
  // opening was written to avoid, played backwards.
  //
  // Reopening during the collapse cancels the unmount, so a double-click on the
  // recipe button never tears the panel down and rebuilds it.
  let recipeMounted = $state(false);
  $effect(() => {
    if (recipeColumn) {
      recipeMounted = true;
      return;
    }
    const timer = setTimeout(() => {
      recipeMounted = false;
      // Deferred with the unmount rather than run at close: nulling it while
      // the panel is still visible swaps the open editor back to the settings
      // list for the length of the collapse. Guarded on the recipe actually
      // being shut, because the column also goes away when the window narrows
      // past the fit — there the recipe did not close, it moved into the sheet,
      // and it has to arrive there still showing the editor you had open.
      if (!recipePanel.open) recipePanel.destination = null;
    }, motionDuration(RECIPE_TRANSITION_MS));
    return () => clearTimeout(timer);
  });

  function closeRecipe(): void {
    recipePanel.open = false;
  }

  // Widening past the column threshold with the sheet open closes the sheet,
  // and Drawer reports that as a close. Ignore it: the recipe did not close, it
  // moved into the column. Only a real dismissal while the sheet is the host
  // puts the recipe away.
  function dismissDrawer(): void {
    if (recipeColumn) return;
    closeRecipe();
  }

  // requested length shows before the load settles so the seam is right away.
  const stepCount = $derived(
    fuseState.appliedLength ?? fuseState.requestedLength
  );

  // Pictograph cell size for one card at a given path-column width and step
  // column count. Grid = step columns + 1 context column. The context column
  // holds Start above the mandala, so full cards always distribute beats across
  // at least two rows instead of stranding the mandala in a row by itself.
  // Each card owns half the content row minus the gap and its own chrome.
  const cardBoxH = $derived(
    Math.max(
      0,
      (contentH - (workspaceColumnGap || CARD_GAP)) / 2 - CARD_CHROME_V
    )
  );
  function bestStepCols(leftW: number): number {
    return getBestFuseStepColumns(leftW, cardBoxH, stepCount, CARD_HPAD);
  }
  // Step columns the visible cards render with: whichever maximizes cell size for
  // the resolved seam. Recomputed live as the seam is dragged, so a wide box
  // takes more columns and a narrow box fewer.
  const stepCols = $derived(bestStepCols(splitPx ?? containerWidth * 0.4));

  // 160px granularity AND step count: a saved seam restores on the same screen,
  // but a different window OR a different length (differently shaped card) each
  // gets its own default and its own remembered override.
  //
  // Whether the recipe is showing is part of the identity too. A seam dragged
  // with two columns on screen is a preference about two columns; replaying it
  // over three handed the paths the width they had to themselves and left the
  // result whatever was after it, which at 2560 was its bare floor. Each layout
  // now remembers its own seam.
  const bucketOf = (w: number, h: number, steps: number, withRecipe: boolean) =>
    `${Math.round(w / 160) * 160}x${Math.round(h / 160) * 160}x${steps}${
      withRecipe ? "r" : ""
    }`;
  const deviceBucket = $derived(
    bucketOf(containerWidth, contentH, stepCount, recipeColumn)
  );

  // The recipe column takes its settled width off the top before the seam is
  // solved, so opening it narrows the paths and the result instead of pushing
  // the result off the edge.
  const splitAvailableWidth = () =>
    Math.max(
      (recipeColumn ? RECIPE_CANVAS_FLOOR : CANVAS_FLOOR) +
        (recipeColumn ? RECIPE_PATH_FLOOR : MIN_LEFT),
      columnBudget(recipeColumnWidth > 0) - recipeColumnWidth
    );
  const activePathFloor = () => (recipeColumn ? RECIPE_PATH_FLOOR : MIN_LEFT);
  const activeCanvasFloor = () =>
    recipeColumn ? RECIPE_CANVAS_FLOOR : CANVAS_FLOOR;
  const minLeft = () =>
    Math.min(
      columnWidths.path,
      Math.max(activePathFloor(), splitAvailableWidth() - activeCanvasFloor())
    );
  const maxLeft = () => {
    if (!wideWorkspace)
      return Math.max(
        activePathFloor(),
        splitAvailableWidth() - activeCanvasFloor()
      );

    const nativeFourK = containerWidth >= 2600 && contentH >= 1400;
    return Math.max(
      minLeft(),
      Math.min(
        nativeFourK ? NATIVE_4K_MAX_LEFT : WIDE_MAX_LEFT,
        splitAvailableWidth() -
          (nativeFourK ? NATIVE_4K_CANVAS_FLOOR : CANVAS_FLOOR)
      )
    );
  };
  const clampSplit = (px: number) =>
    Math.round(Math.min(maxLeft(), Math.max(minLeft(), px)));

  // Default seam: jointly solve each source-card arrangement and the preview's
  // height-capped square. Both sides receive the same proportion of their ideal
  // width before the usability floors apply, so resizing never privileges one
  // pane merely because it was scored first.
  //
  // The result's settled width bounds the seam from the other side. Without it
  // the paths column had a floor beneath it and the result had none, so opening
  // the recipe pushed the seam right until the animation was the only thing
  // that had given anything up. A drag can still pass this — reaching for the
  // handle is the user saying which pane they want the space in — but nothing
  // the layout decides on its own crosses it.
  const defaultMaxLeft = () =>
    Math.max(
      minLeft(),
      Math.min(maxLeft(), splitAvailableWidth() - columnWidths.canvas)
    );
  function optimalSplit(): number {
    return resolveBalancedFuseWorkspaceSplit({
      availableWidth: splitAvailableWidth(),
      cardBoxHeight: cardBoxH,
      stepCount,
      previewIdealWidth: previewIdealWidth(),
      minLeft: minLeft(),
      maxLeft: defaultMaxLeft(),
      cardHorizontalChrome: CARD_HPAD,
    }).splitPx;
  }

  // Resolve the seam whenever the layout changes and the user isn't dragging:
  // a saved per-device override wins, otherwise the computed optimum. Writing
  // splitPx here never re-triggers this effect (splitPx isn't read in it).
  $effect(() => {
    if (!fullCard || wingWorkspace || dragging) return;
    const saved = overrides[deviceBucket];
    splitPx = saved != null ? clampSplit(saved) : optimalSplit();
  });

  // Read the grid's content box instead of guessing from the outer container.
  // ResizeObserver excludes padding, so this is the whole width the tracks
  // divide up — gap tracks included, which the column negotiation then spends.
  //
  // The gap is read off `row-gap` rather than `column-gap`: the seams between
  // these columns are real tracks, not a uniform gap, precisely so the recipe's
  // seam can collapse to nothing on its own, and that left `column-gap` at 0.
  // Both are the same spacing token, so the row gap still reports it.
  $effect(() => {
    const el = workspaceEl;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = (contentWidth: number) => {
      const style = getComputedStyle(el);
      workspaceColumnGap =
        Number.parseFloat(style.columnGap) ||
        Number.parseFloat(style.rowGap) ||
        CARD_GAP;
      workspaceGridWidth = Math.max(0, Math.round(contentWidth));
    };
    const initialStyle = getComputedStyle(el);
    measure(
      el.clientWidth -
        (Number.parseFloat(initialStyle.paddingLeft) || 0) -
        (Number.parseFloat(initialStyle.paddingRight) || 0)
    );
    const ro = new ResizeObserver(([entry]) => {
      measure(entry?.contentRect.width ?? 0);
    });
    ro.observe(el);
    return () => ro.disconnect();
  });

  // The result spans the complete content row in both desktop arrangements,
  // so its real box is the stable height authority for the split solver.
  $effect(() => {
    const el = workspaceEl?.querySelector<HTMLElement>(
      '[data-fuse-layout-region="preview"]'
    );
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      contentH = Math.round(entry?.contentRect.height ?? el.clientHeight);
    });
    ro.observe(el);
    contentH = Math.round(el.clientHeight);
    return () => ro.disconnect();
  });

  function onSplitDown(e: PointerEvent): void {
    e.preventDefault();
    dragging = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onSplitMove(e: PointerEvent): void {
    if (!dragging || !workspaceEl) return;
    const rect = workspaceEl.getBoundingClientRect();
    const paddingLeft = Number.parseFloat(
      getComputedStyle(workspaceEl).paddingLeft
    );
    splitPx = clampSplit(e.clientX - rect.left - (paddingLeft || 0));
  }
  function onSplitUp(): void {
    if (!dragging) return;
    dragging = false;
    if (splitPx !== null) {
      overrides = { ...overrides, [deviceBucket]: splitPx };
      persistOverrides();
    }
  }
  function onSplitReset(): void {
    const { [deviceBucket]: _cleared, ...rest } = overrides;
    overrides = rest;
    persistOverrides();
    splitPx = optimalSplit();
  }

  function commitSplit(px: number): void {
    splitPx = clampSplit(px);
    overrides = { ...overrides, [deviceBucket]: splitPx };
    persistOverrides();
  }

  function onSplitKeyDown(event: KeyboardEvent): void {
    const current = splitPx ?? optimalSplit();
    const step = event.shiftKey ? 64 : 24;
    let next: number | null = null;

    if (event.key === "ArrowLeft") next = current - step;
    else if (event.key === "ArrowRight") next = current + step;
    else if (event.key === "Home") next = minLeft();
    else if (event.key === "End") next = maxLeft();

    if (next === null) return;
    event.preventDefault();
    commitSplit(next);
  }

  // The phone layout is a different interaction, not a squeezed desktop grid.
  // Measuring the tab's actual slot also handles split-screen and foldable
  // layouts where the viewport width says little about the room Fuse receives.
  $effect(() => {
    const element = containerElement;
    if (!element || typeof ResizeObserver === "undefined") return;

    const updateLayoutMode = (width: number, height: number) => {
      const useShortLandscape =
        width >= BREAKPOINTS.PORTRAIT_MOBILE &&
        width > height &&
        height < LANDSCAPE_THRESHOLDS.MAX_PHONE_HEIGHT;
      const useTallPortrait = fitsFuseTallPortraitWorkspace({
        width,
        height,
        mobileMaxWidth: BREAKPOINTS.PORTRAIT_MOBILE,
        splitMinWidth: TALL_PORTRAIT_SPLIT_WIDTH,
        narrowMinHeight: TALL_PORTRAIT_NARROW_MIN_HEIGHT,
        splitMinHeight: TALL_PORTRAIT_SPLIT_MIN_HEIGHT,
        minAspectRatio: TALL_PORTRAIT_MIN_ASPECT,
      });
      const useCompactLayout =
        (width < BREAKPOINTS.MOBILE && !useTallPortrait) || useShortLandscape;
      const useFullCards = width >= 1100 && height >= 780;
      const aspectRatio = height > 0 ? width / height : 1;
      compact = useCompactLayout;
      shortLandscape = useShortLandscape;
      tallPortrait = useTallPortrait;
      fullCard = useFullCards;
      wideWorkspace = width >= 1680 && height >= 900;
      // Use the measured Fuse slot, not the physical screen: Android chrome and
      // the app nav can pull an unfolded Fold's content height below 600px.
      // Phone-shaped landscape screens stay on the existing scroll layout.
      landscapeSplit =
        !useFullCards &&
        !useCompactLayout &&
        width > height &&
        aspectRatio <= LANDSCAPE_THRESHOLDS.WIDE_ASPECT_RATIO;
      containerWidth = width;
      containerHeight = height;
    };
    updateLayoutMode(element.clientWidth, element.clientHeight);

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const width =
        entry.contentBoxSize[0]?.inlineSize ?? entry.contentRect.width;
      const height =
        entry.contentBoxSize[0]?.blockSize ?? entry.contentRect.height;
      updateLayoutMode(width, height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  });

  async function handleOpenViewer(): Promise<void> {
    await openBuiltResult(false);
  }

  async function handleShare(): Promise<void> {
    await openBuiltResult(true);
  }

  async function openBuiltResult(shareOnOpen: boolean): Promise<void> {
    const sequence = await fuseState.buildFusedSequence();
    if (!sequence) return;

    try {
      openSequenceViewer(sequence, {
        source: "fuse",
        returnPath: "/app/create",
        returnLabel: "Fuse",
        initialBpm: fuseState.bpm,
        shareOnOpen,
      });
    } catch (failure) {
      fuseState.reportViewerFailure(failure);
    }
  }

  async function handleSaveResult(): Promise<void> {
    if (isSavingResult) return;
    const sequence = await fuseState.buildFusedSequence();
    if (!sequence) return;
    isSavingResult = true;
    try {
      const intended = createSequenceData({
        ...sequence,
        intendedProp: {
          leftPropType: settings.leftPropType ?? PropType.STAFF,
          rightPropType: settings.rightPropType ?? PropType.STAFF,
          catDogMode: settings.catDogMode ?? false,
        },
      });
      const name = intended.word || intended.name || "Fused LOOP";
      await getLibrarySaveService().saveSequence(intended, {
        name,
        visibility: "private",
        tags: [],
        notes: "Created in Fuse",
        analyticsSource: "fuse",
      });
      showToast("Fused LOOP saved to your library", "success");
    } catch (failure) {
      if (
        failure instanceof LibraryError &&
        failure.code === "ALREADY_EXISTS"
      ) {
        showToast("That fused LOOP is already in your library", "info");
        return;
      }
      console.error("[FuseLayout] Failed to save fused LOOP", failure);
      const message =
        failure instanceof Error
          ? failure.message
          : "Couldn't save the fused LOOP";
      showToast(message, "error");
    } finally {
      isSavingResult = false;
    }
  }

  function openFirstStep(side: FuseSide): void {
    if (compact) {
      actionSide = side;
      firstStepOpen = true;
      return;
    }
    inlineFirstStepSide = side;
  }

  function closeFirstStep(): void {
    firstStepOpen = false;
    actionSide = null;
  }

  function closeInlineFirstStep(): void {
    inlineFirstStepSide = null;
  }

  function openPathBuilder(side: FuseSide): void {
    pathBuilderSide = side;
    pathBuilderOpen = true;
  }

  function closePathBuilder(): void {
    pathBuilderOpen = false;
    pathBuilderSide = null;
  }

  function openSettings(destination: FuseSettingsDestination): void {
    recipePanel.destination = destination;
    recipePanel.open = true;
  }

  // The header trigger is the one door to the recipe, so it is also the way
  // back out. Opening always lands on the list rather than resuming whichever
  // editor was last open — the door is labelled "Fuse recipe", and it should
  // give you the recipe.
  function toggleRecipe(): void {
    if (recipePanel.open) closeRecipe();
    else openSettings(null);
  }

  // Linking the paths is the act of choosing a rule, so the switch opens the
  // rule editor. Separating them retires it: there is no rule to look at, and a
  // recipe standing open on an empty editor is what this replaced.
  function changeMode(mode: FuseMode): void {
    fuseState.setMode(mode);
    if (mode === "symmetry") openSettings("pairing");
    else if (recipePanel.destination === "pairing") closeRecipe();
  }

  // The follower card's footer states the rule that built it, so clicking it
  // opens the editor for that rule — the drawer, already scoped to Pairing.
  function editPairing(): void {
    openSettings("pairing");
  }
</script>

<div class="fuse-container" bind:this={containerElement}>
  <div
    class="fuse-workspace themed-scrollbar"
    bind:this={workspaceEl}
    class:compact-workspace={compact}
    class:short-landscape-workspace={shortLandscape}
    class:tall-portrait-workspace={tallPortrait}
    class:landscape-workspace={landscapeSplit}
    class:full-card-workspace={fullCard}
    class:wide-workspace={wideWorkspace}
    class:wing-workspace={wingWorkspace}
    class:recipe-workspace={recipeColumn}
    class:dragging
    class:layout-recomposing={layoutRecomposing}
    style:--fuse-left={fullCard && splitPx !== null ? `${splitPx}px` : null}
    style:--fuse-wing={`${wingLayout.sourceWidth}px`}
    style:--fuse-recipe-w={`${recipeColumnWidth}px`}
    style:--fuse-recipe-open-w={`${recipeTargetWidth}px`}
    aria-busy={fuseState.isLoadingLength ||
      fuseState.pendingSide !== null ||
      fuseState.isFusing}
  >
    <FuseWorkspaceHeader
      recipeOpen={recipePanel.open}
      flatRecipeRail={wideWorkspace}
      onOpenRecipe={toggleRecipe}
      onOpenSetting={openSettings}
      onModeChange={changeMode}
    />
    {#if recipeMounted && fullCard}
      <FuseRecipeColumn
        bind:destination={recipePanel.destination}
        singleDestination={wideWorkspace}
        onClose={closeRecipe}
      />
    {/if}
    {#if fullCard}
      <FuseSourceCard
        side="left"
        full={true}
        stepCols={wingWorkspace ? null : stepCols}
        onChooseFirstStep={openFirstStep}
        onBuildPath={openPathBuilder}
        firstStepPickerActive={inlineFirstStepSide === "left"}
        onFirstStepComplete={closeInlineFirstStep}
        onCancelFirstStep={closeInlineFirstStep}
        onEditPairing={editPairing}
      />
      <FuseSourceCard
        side="right"
        full={true}
        stepCols={wingWorkspace ? null : stepCols}
        onChooseFirstStep={openFirstStep}
        onBuildPath={openPathBuilder}
        firstStepPickerActive={inlineFirstStepSide === "right"}
        onFirstStepComplete={closeInlineFirstStep}
        onCancelFirstStep={closeInlineFirstStep}
        onEditPairing={editPairing}
      />
      <div
        class="split-handle"
        role="slider"
        tabindex="0"
        aria-label="Resize path panel"
        aria-orientation="vertical"
        aria-valuemin={minLeft()}
        aria-valuemax={maxLeft()}
        aria-valuenow={splitPx ?? 0}
        aria-valuetext={`${splitPx ?? 0} pixels for source paths`}
        onpointerdown={onSplitDown}
        onpointermove={onSplitMove}
        onpointerup={onSplitUp}
        onpointercancel={onSplitUp}
        ondblclick={onSplitReset}
        onkeydown={onSplitKeyDown}
      >
        <span class="split-flow" aria-hidden="true">
          <span class="pair-dots">
            <span class="path-dot blue-dot"></span>
            <span class="path-dot red-dot"></span>
          </span>
          <i class="fas fa-plus"></i>
          <i class="fas fa-arrow-right"></i>
        </span>
      </div>
    {:else if landscapeSplit}
      <div class="fuse-left-col">
        <FuseSourceCard
          side="left"
          full={false}
          onChooseFirstStep={openFirstStep}
          onBuildPath={openPathBuilder}
          firstStepPickerActive={inlineFirstStepSide === "left"}
          onFirstStepComplete={closeInlineFirstStep}
          onCancelFirstStep={closeInlineFirstStep}
          onEditPairing={editPairing}
        />
        <FuseSourceCard
          side="right"
          full={false}
          onChooseFirstStep={openFirstStep}
          onBuildPath={openPathBuilder}
          firstStepPickerActive={inlineFirstStepSide === "right"}
          onFirstStepComplete={closeInlineFirstStep}
          onCancelFirstStep={closeInlineFirstStep}
          onEditPairing={editPairing}
        />
      </div>
    {:else if !compact}
      <FuseSourceCard
        side="left"
        full={false}
        onChooseFirstStep={openFirstStep}
        onBuildPath={openPathBuilder}
        firstStepPickerActive={inlineFirstStepSide === "left"}
        onFirstStepComplete={closeInlineFirstStep}
        onCancelFirstStep={closeInlineFirstStep}
        onEditPairing={editPairing}
      />
      <FuseSourceCard
        side="right"
        full={false}
        onChooseFirstStep={openFirstStep}
        onBuildPath={openPathBuilder}
        firstStepPickerActive={inlineFirstStepSide === "right"}
        onFirstStepComplete={closeInlineFirstStep}
        onCancelFirstStep={closeInlineFirstStep}
        onEditPairing={editPairing}
      />
    {/if}
    <FusePreviewStage
      onOpenViewer={handleOpenViewer}
      onShare={handleShare}
      onSave={handleSaveResult}
      isSaving={isSavingResult}
      onChooseFirstStep={openFirstStep}
      onBuildPath={openPathBuilder}
      onEditPairing={editPairing}
      {compact}
    />
  </div>

  <FuseSettingsDrawer
    isOpen={recipePanel.open && !recipeColumn}
    bind:destination={recipePanel.destination}
    onDismiss={dismissDrawer}
  />
  <FuseFirstStepPanel
    bind:isOpen={firstStepOpen}
    side={actionSide}
    onClose={closeFirstStep}
  />
  <FusePathBuilderDialog
    bind:isOpen={pathBuilderOpen}
    side={pathBuilderSide}
    desktopModal={fullCard}
    onClose={closePathBuilder}
  />
</div>

<style>
  .fuse-container {
    --min-touch-target: 48px;
    container: fuse / size;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background:
      radial-gradient(
        circle at 72% 42%,
        color-mix(in srgb, var(--semantic-warning, #f97316) 5%, transparent),
        transparent 38%
      ),
      var(--theme-page-bg, transparent);
  }

  .fuse-workspace {
    /* One source for the gap so the full-card grid can spend it as explicit
       tracks instead of `column-gap` — see the seven-track list below. */
    --fuse-col-gap: var(--settings-spacing-md, 12px);
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    /* max-content rows, NOT auto: the workspace is a definite-height scroll
       container, and auto rows in an overflowing grid collapse to the items'
       minimum contribution (zero for the overflow-hidden cards), stacking the
       cards on top of each other. max-content rows never shrink below content. */
    grid-template-rows: repeat(4, max-content);
    grid-template-areas:
      "header"
      "left"
      "right"
      "preview";
    align-content: start;
    gap: var(--fuse-col-gap);
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    padding: clamp(10px, 2.5cqw, 20px);
    overflow-x: hidden;
    overflow-y: auto;
  }

  .fuse-workspace.compact-workspace {
    --fuse-col-gap: var(--settings-spacing-sm, 8px);
    grid-template-rows: auto minmax(0, 1fr);
    grid-template-areas:
      "header"
      "preview";
    gap: var(--fuse-col-gap);
    padding: var(--settings-spacing-sm, 8px);
    overflow: hidden;
  }

  /* A phone-width slot can still be a tall workspace. Once there is enough
     height for both lean source cards and a useful result, spend that space on
     the full Fuse story instead of stretching one compact preview through the
     entire column. Ordinary phones remain animation-first. */
  .fuse-workspace.tall-portrait-workspace {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows:
      max-content minmax(360px, 0.9fr) minmax(360px, 0.9fr)
      minmax(500px, 1.2fr);
    grid-template-areas:
      "header"
      "left"
      "right"
      "preview";
    align-content: start;
    overflow-x: hidden;
    overflow-y: hidden;
  }

  /* Once a portrait pane is wide enough for two lean cards, stop paying for
     their height twice. This is the seam visible when the Browser sidebar is
     widened a few pixels: sources share one row and the result owns the rest. */
  @container fuse (min-width: 520px) and (max-width: 599px) {
    .fuse-workspace.tall-portrait-workspace {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      grid-template-rows: max-content minmax(0, 0.9fr) minmax(0, 1.1fr);
      grid-template-areas:
        "header header"
        "left right"
        "preview preview";
      align-content: stretch;
    }
  }

  @container fuse (min-width: 600px) {
    .fuse-workspace:not(.compact-workspace) {
      --fuse-col-gap: clamp(10px, 1.4cqw, 14px);
      grid-template-columns: repeat(2, minmax(0, 1fr));
      grid-template-rows: repeat(3, max-content);
      grid-template-areas:
        "header header"
        "left right"
        "preview preview";
      gap: var(--fuse-col-gap);
    }
  }

  /* One-page fit layout: any container with real height locks to the viewport
     — no scrolling. Header stays content-sized; the card row and preview row
     split the rest (fr rows). FuseSourceCard and FusePreviewStage mirror this
     exact condition to apply min-height: 0 (a zero minimum contribution
     collapses auto rows in the scroll layouts, so it must not leak there). */
  @container fuse (min-width: 600px) and (min-height: 600px) {
    .fuse-workspace:not(.compact-workspace) {
      grid-template-rows: max-content minmax(0, 1.05fr) minmax(0, 1.45fr);
      align-content: stretch;
      overflow: hidden;
    }
  }

  /* Unfolded foldables and landscape tablets: reuse the desktop source column,
     but keep the lean source cards so the notation remains the hero. The
     preview now owns the full content-row height instead of a shallow row. */
  .fuse-workspace.landscape-workspace {
    grid-template-columns: minmax(300px, 0.95fr) minmax(0, 1.15fr);
    grid-template-rows: max-content minmax(0, 1fr);
    grid-template-areas:
      "header header"
      "left preview";
    align-content: stretch;
    overflow: hidden;
  }

  /* A short landscape screen cannot carry two detailed source cards plus the
     result vertically. Keep both live source beats together in a compact rail
     and give the result the wider pane, all inside the available height. */
  .fuse-workspace.compact-workspace.short-landscape-workspace {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: max-content minmax(0, 1fr);
    grid-template-areas:
      "header"
      "preview";
  }

  /* Full-card markup and its grid must change as one state transition. Keeping
     the layout behind a second CSS threshold let browser zoom put the markup
     and grid on opposite sides of the seam, creating implicit columns. */
  /* The recipe opens as a track on the RIGHT, and the other two give way rather
     than being covered — the thing a drawer over the result could never do.

     Right, because every door onto the recipe is on the right: the Fuse recipe
     button sits at the right end of the header, and Rule — the one card that
     opens the editor rather than holding its own control — is the last card in
     the rail. A panel that answered a right-hand control by growing out of the
     opposite edge of the screen made you look away from what you just clicked.

     The seven tracks are stable in both desktop compositions: paths, result,
     and Recipe each keep a named place while unused seams collapse to zero.
     Recipe can therefore open without snapping, and the wide workbench can put
     Right on the far side of the result without introducing another grid owner. */
  .fuse-workspace.full-card-workspace {
    grid-template-columns:
      var(--fuse-left, 1.8fr) var(--fuse-col-gap) minmax(0, 1fr) 0px
      0px var(--fuse-recipe-seam, 0px) var(--fuse-recipe-w, 0px);
    grid-template-rows: auto repeat(2, minmax(0, 1fr));
    grid-template-areas:
      "header header header header header header header"
      "left . preview preview preview . recipe"
      "right . preview preview preview . recipe";
    align-content: stretch;
    column-gap: 0;
    row-gap: var(--fuse-col-gap);
    overflow: hidden;
    transition: grid-template-columns var(--duration-emphasis, 280ms)
      var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1));
  }

  .fuse-workspace.full-card-workspace.recipe-workspace {
    --fuse-recipe-seam: var(--fuse-col-gap);
  }

  /* On a genuinely wide workbench the two inputs become spatial operands:
     Left + combined result + Right. The assembled animation receives every
     pixel the side cards do not need, while Recipe remains an optional fourth
     column on the same track list. */
  .fuse-workspace.full-card-workspace.wing-workspace {
    grid-template-columns:
      var(--fuse-wing) var(--fuse-col-gap) minmax(0, 1fr)
      var(--fuse-col-gap) var(--fuse-wing) var(--fuse-recipe-seam, 0px)
      var(--fuse-recipe-w, 0px);
    grid-template-rows: auto minmax(0, 1fr);
    grid-template-areas:
      "header header header header header header header"
      "left . preview . right . recipe";
  }

  /* A dragged seam must sit under the pointer, not ease toward it: the same
     transition that carries the recipe open would make every pointermove a
     280ms catch-up and the handle would swim. */
  .fuse-workspace.full-card-workspace.dragging,
  .fuse-workspace.full-card-workspace.layout-recomposing {
    transition: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .fuse-workspace.full-card-workspace {
      transition: none;
    }
  }

  /* Landscape tablets still group their lean source cards in one column. Full
     desktop cards participate directly in the workspace grid. */
  .fuse-left-col {
    position: relative;
    grid-area: left;
    display: flex;
    flex-direction: column;
    gap: clamp(10px, 1.4cqw, 14px);
    min-width: 0;
    min-height: 0;
  }

  .fuse-left-col :global(.source-card) {
    flex: 1 1 0;
    min-height: 0;
  }

  .split-handle {
    position: relative;
    grid-column: 2;
    grid-row: 2 / -1;
    justify-self: center;
    width: 14px;
    height: 100%;
    cursor: col-resize;
    z-index: 10;
    touch-action: none;
  }

  .wing-workspace .split-handle {
    display: none;
  }

  .split-handle::before {
    content: "";
    position: absolute;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 2px;
    height: 100%;
    background: color-mix(in srgb, var(--theme-text, #fff) 8%, transparent);
    border-radius: 1px;
    transition:
      background 150ms ease,
      width 150ms ease;
  }

  .split-handle:focus-visible::before {
    width: 4px;
    background: var(--theme-accent, #8b6cff);
  }

  /* 4K gives the result the additional room. The source workbench stops
     growing once its full LOOP cards are comfortably readable. */
  @container fuse (min-width: 1680px) and (min-height: 900px) {
    .fuse-workspace {
      --min-touch-target: 48px;
      /* Columns and areas stay with .full-card-workspace, which is always the
         layout in force at this size — a second track list here would fight the
         recipe's seven-track one. */
      --fuse-col-gap: 18px;
      gap: var(--fuse-col-gap);
      padding: 24px;
    }

    /* Only the three-across composition has one content row. Applying this to
       the ordinary stacked desktop grid left its Right path in an implicit
       max-content row, which made 1920x1080 taller than its viewport. */
    .fuse-workspace.full-card-workspace.wing-workspace {
      grid-template-rows: max-content minmax(0, 1fr);
    }

    .fuse-left-col {
      gap: 18px;
    }

    .split-flow {
      display: flex;
    }
  }

  /* At native 4K the two halves become a real workbench rather than a 1080p
     layout surrounded by pixels. The source tools scale for arm's-length use,
     while the result keeps the larger share of the canvas. */
  @container fuse (min-width: 2600px) and (min-height: 1400px) {
    .fuse-workspace {
      --min-touch-target: 64px;
      --fuse-col-gap: 24px;
      gap: var(--fuse-col-gap);
      padding: 32px;
    }

    .fuse-left-col {
      gap: 24px;
    }
  }

  .split-handle::after {
    content: "";
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 4px;
    height: 44px;
    border-radius: 2px;
    background: color-mix(in srgb, var(--theme-text, #fff) 18%, transparent);
    transition:
      background 150ms ease,
      height 150ms ease;
  }

  .split-flow {
    position: absolute;
    z-index: 2;
    top: 50%;
    left: 50%;
    display: none;
    align-items: center;
    justify-content: center;
    gap: 7px;
    width: 82px;
    height: 54px;
    transform: translate(-50%, -50%);
    border: 1px solid
      color-mix(
        in srgb,
        var(--semantic-warning, #f97316) 48%,
        var(--theme-stroke)
      );
    border-radius: 999px;
    color: color-mix(
      in srgb,
      var(--semantic-warning, #f97316) 78%,
      var(--theme-text, #fff)
    );
    background: var(--theme-panel-bg, #0c0e16);
    box-shadow: 0 10px 28px var(--theme-shadow, rgba(0, 0, 0, 0.4));
    font-size: 13px;
    pointer-events: none;
  }

  .pair-dots {
    display: grid;
    gap: 4px;
  }

  .path-dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    box-shadow: 0 0 8px currentColor;
  }

  .blue-dot {
    color: var(--prop-blue, #2196f3);
    background: currentColor;
  }

  .red-dot {
    color: var(--prop-red, #f44336);
    background: currentColor;
  }

  .split-handle:hover::before,
  .dragging .split-handle::before {
    background: var(--semantic-warning, #f97316);
    width: 3px;
  }

  .split-handle:hover::after,
  .dragging .split-handle::after {
    background: color-mix(
      in srgb,
      var(--semantic-warning, #f97316) 70%,
      transparent
    );
    height: 60px;
  }

  .split-handle:focus-visible {
    outline: 2px solid var(--semantic-warning, #f97316);
    outline-offset: 2px;
  }

  .fuse-workspace.dragging {
    cursor: col-resize;
    user-select: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .fuse-container {
      scroll-behavior: auto;
    }
    .split-handle::before,
    .split-handle::after {
      transition: none;
      animation: none;
    }
  }
</style>
