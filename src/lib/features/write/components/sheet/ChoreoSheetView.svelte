<script lang="ts">
  import { onDestroy } from "svelte";
  import {
    SequenceSelection,
    setSequenceSelection,
  } from "$lib/shared/selection/sequence-selection.svelte";
  import "$lib/shared/selection/selection.css";
  import {
    createChoreoSheetState,
    setChoreoSheetContext,
  } from "../../state/choreo-sheet-state.svelte";
  import { getChoreoSheetRepository } from "../../services/choreo-sheet-repository";
  import { createSheetSequenceResolver } from "../../services/sheet-sequence-resolver";
  import { awaitAuthSettled } from "$lib/shared/auth/state/auth-state.svelte";
  import { getErrorHandler } from "$lib/shared/application/get-error-handler";
  import {
    downloadChoreoSheetPDF,
    CHOREO_SHEET_EXPORT_CANCELLED,
  } from "../../services/sheet-pdf-exporter";
  import ExportTakeover from "$lib/shared/video-export/components/ExportTakeover.svelte";
  import { trackChoreoSheetExported } from "../../analytics/choreo-events";
  import type {
    ChoreoSheet,
    GroupSeparator,
  } from "../../domain/types/choreo-sheet";
  import ActPlayer from "./ActPlayer.svelte";
  import ActsDock from "./ActsDock.svelte";
  import { getBrowseLoader } from "$lib/shared/browse/get-browse-loader";
  import { getLibraryRepository } from "$lib/shared/library/get-library-repository";
  import ChoreoSheetToolbar from "./ChoreoSheetToolbar.svelte";
  import ChoreoSheetRail from "./ChoreoSheetRail.svelte";
  import SheetPreviewStage from "./SheetPreviewStage.svelte";
  import SheetBrowserDock from "./SheetBrowserDock.svelte";
  import { shouldStackSheetWorkspace } from "../../domain/sheet-workspace-layout";
  import { shouldDeferEscapeShortcut } from "$lib/shared/keyboard/domain/escape-shortcut-target";
  import { hasOpenDrawers } from "$lib/shared/foundation/ui/drawer/drawer-stack";

  const resolver = createSheetSequenceResolver({
    // Strict on both tiers: null must mean "the server says it's gone", never
    // "the read didn't get through" — the roster prints that difference.
    loadPrivate: (id) => getLibraryRepository().getSequenceStrict(id),
    // Strict: a public read that failed must reach the resolver as a failure it
    // can retry, not as a null the roster would print as "not in the gallery".
    loadPublic: (id) => getBrowseLoader().loadFullSequenceDataStrict(id, id),
    awaitAuthSettled,
  });

  const builder = createChoreoSheetState({
    resolveSequence: resolver.resolve,
    persistKey: "tka-choreo-sheet-draft",
  });
  setChoreoSheetContext({ state: builder });

  // Shared selection primitive. The builder stays the behavioural owner
  // (Remove / persistence / Escape); this scope mirrors its selectedId so the
  // whole-sequence selection ring + a11y match the guide by construction.
  const selection = new SequenceSelection();
  setSequenceSelection(selection);
  $effect(() => {
    selection.selectedId = builder.selectedSequenceId;
  });

  // Zoom changes only the stage drawing; the print geometry remains unchanged.
  const ZOOM_STEPS = [1, 1.25, 1.5, 2, 3] as const;
  type ViewMode = "reading" | "page";
  type WorkspaceMode = "compose" | "play";
  const VIEW_MODE_KEY = "tka-choreo-view-mode";
  const PLAYER_TRIGGER_ID = "choreo-play-act-trigger";
  type PictographSize = "large" | "standard" | "compact";
  const isAnnotated = $derived(builder.layout.packing === "aligned");
  const pictographSize = $derived<PictographSize>(
    builder.layout.columns <= 4
      ? "large"
      : builder.layout.columns <= 6
        ? "standard"
        : "compact"
  );
  function setPictographSize(size: PictographSize): void {
    const geometry =
      size === "large"
        ? { columns: 4, rowsPerPage: 3 }
        : size === "standard"
          ? { columns: 6, rowsPerPage: 4 }
          : { columns: 8, rowsPerPage: 6 };
    builder.setLayout(geometry);
  }

  /** Step the size by one, clamped — `[` shrinks the pictograph, `]` grows it. */
  function stepPictographSize(delta: number): void {
    const order: PictographSize[] = ["large", "standard", "compact"];
    const next =
      order[
        Math.min(
          order.length - 1,
          Math.max(0, order.indexOf(pictographSize) + delta)
        )
      ];
    if (next) setPictographSize(next);
  }

  // ── Docks (inline, not overlays) ────────────────────────────────────────────
  // Add sequences, Saved acts, and Play are three inline docks that share the
  // slot beside the preview — flex siblings, so the page narrows to make room
  // and stays fully visible instead of being covered. They are mutually
  // exclusive: opening one closes the others. On a narrow workspace the open
  // dock hides the preview and takes its slot instead (the preview stays
  // mounted so zoom and scroll survive). Open state and the picker engine's
  // source/sort/filters persist across reload/HMR so the workspace reopens
  // exactly as it was left.
  const PICKER_PREFS_KEY = "tka-choreo-sheet-picker-ui";
  const BROWSE_TRIGGER_ID = "choreo-browse-trigger";
  const ACTS_TRIGGER_ID = "choreo-acts-trigger";
  interface PickerPrefs {
    open: boolean;
    playerOpen: boolean;
    actsOpen: boolean;
    /** Stage zoom. 1 = Fit (whole sheet visible); above that the stage scrolls. */
    zoom: number;
  }
  function loadPickerPrefs(): PickerPrefs {
    const fallback: PickerPrefs = {
      open: false,
      playerOpen: false,
      actsOpen: false,
      zoom: 1,
    };
    if (typeof localStorage === "undefined") return fallback;
    try {
      const raw = localStorage.getItem(PICKER_PREFS_KEY);
      if (!raw) return fallback;
      const p = JSON.parse(raw) as Partial<PickerPrefs> & { fitMode?: string };
      return {
        open: !!p.open,
        playerOpen: !!p.playerOpen,
        actsOpen: !!p.actsOpen,
        // Drafts saved under the old page|width toggle land on Fit — "width" was
        // the same page as "page" on most stages anyway.
        zoom: (ZOOM_STEPS as readonly number[]).includes(p.zoom ?? 1)
          ? (p.zoom as number)
          : 1,
      };
    } catch {
      return fallback;
    }
  }
  const initialPrefs = loadPickerPrefs();

  let browseOpen = $state(initialPrefs.playerOpen ? false : initialPrefs.open);
  let workspaceMode = $state<WorkspaceMode>(
    initialPrefs.playerOpen ? "play" : "compose"
  );
  const playerOpen = $derived(workspaceMode === "play");
  let actsOpen = $state(
    initialPrefs.playerOpen ? false : initialPrefs.actsOpen
  );
  let zoom = $state<number>(initialPrefs.zoom);
  const zoomIndex = $derived(
    Math.max(0, ZOOM_STEPS.indexOf(zoom as (typeof ZOOM_STEPS)[number]))
  );
  const zoomLabel = $derived(zoom === 1 ? "Fit" : `${Math.round(zoom * 100)}%`);
  function zoomBy(delta: number): void {
    const next =
      ZOOM_STEPS[
        Math.min(ZOOM_STEPS.length - 1, Math.max(0, zoomIndex + delta))
      ];
    if (next !== undefined) zoom = next;
  }
  function zoomReset(): void {
    zoom = 1;
  }

  // Persist picker UI state on every change (the engine persists its own
  // source/sort/filters under its persistKey).
  $effect(() => {
    const prefs: PickerPrefs = {
      open: browseOpen,
      playerOpen,
      actsOpen,
      zoom,
    };
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(PICKER_PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* private-mode / quota — non-fatal */
    }
  });

  function toggleBrowse(): void {
    browseOpen = !browseOpen;
    if (!browseOpen) return;
    exitPlayback();
    actsOpen = false;
  }

  // Closing from inside a dock (its X, or Escape) sends focus back to the
  // toolbar button that opened it — the inline docks are not modal, so nothing
  // else restores focus for them.
  function focusTrigger(id: string): void {
    if (typeof document === "undefined") return;
    requestAnimationFrame(() => document.getElementById(id)?.focus());
  }

  function closeBrowse(restoreFocus = false): void {
    browseOpen = false;
    if (restoreFocus) focusTrigger(BROWSE_TRIGGER_ID);
  }

  function closeActs(restoreFocus = false): void {
    actsOpen = false;
    if (restoreFocus) focusTrigger(ACTS_TRIGGER_ID);
  }

  function togglePlayer(): void {
    if (playerOpen) {
      exitPlayback();
      return;
    }
    workspaceMode = "play";
    actStepIndex = null;
    browseOpen = false;
    actsOpen = false;
  }

  function toggleActs(): void {
    actsOpen = !actsOpen;
    if (actsOpen) {
      browseOpen = false;
      exitPlayback();
    }
  }

  // The roster recovers on its own, so an error surface is EARNED, not eager:
  // it appears once, only after the automatic retries are spent and nothing is
  // still in flight. Keyed on the exact id set so a re-render never re-toasts.
  let reportedErrorIds = $state<string>("");
  $effect(() => {
    const errorIds = builder.roster
      .filter((r) => r.status === "error")
      .map((r) => r.id);
    const key = errorIds.join(",");
    if (
      errorIds.length === 0 ||
      key === reportedErrorIds ||
      builder.isHydrating
    )
      return;
    reportedErrorIds = key;
    getErrorHandler().showUserError({
      message: `${errorIds.length} sequence${errorIds.length > 1 ? "s" : ""} didn't load — try again from the stage`,
      severity: "warning",
      context: { module: "choreo", tab: "sheet", action: "hydrate-roster" },
      technicalDetails: builder.roster
        .filter((r) => r.status !== "ready")
        .map(
          (r) => `${r.id}: ${r.status}/${r.failure ?? "-"} after ${r.attempts}`
        )
        .join("\n"),
    });
  });

  // Header meta. The page count only exists once every row resolved (the planner
  // input is complete-or-empty), so it joins the line then and not before.
  const sheetMeta = $derived.by(() => {
    const rows = builder.sequenceIds.length;
    if (rows === 0) return null;
    const parts = [`${rows} sequence${rows === 1 ? "" : "s"}`];
    // Same split the page caption uses: Annotated paginates into bands, Study
    // into plain pages. Reading the wrong one prints "2 pages" under "Page 1 of 3".
    const pages =
      builder.layout.packing === "aligned"
        ? builder.bandPages.length
        : builder.pages.length;
    if (builder.rosterComplete && pages > 0)
      parts.push(`${pages} page${pages === 1 ? "" : "s"}`);
    parts.push(
      builder.layout.orientation === "portrait"
        ? "Letter portrait"
        : "Letter landscape"
    );
    return parts.join(" · ");
  });

  let exporting = $state(false);
  let exportPct = $state(0);
  let exportCancelled = $state(false);
  async function exportPdf() {
    if (!builder.rosterComplete || builder.roster.length === 0 || exporting)
      return;
    exporting = true;
    exportCancelled = false;
    exportPct = 0;
    try {
      const filename = `${(builder.sheet.name || "choreo-sheet").trim().replace(/\s+/g, "-").toLowerCase()}.pdf`;
      await downloadChoreoSheetPDF(
        builder.sheet,
        builder.normalizedRows,
        filename,
        (done, total) => {
          exportPct = total > 0 ? Math.round((done / total) * 100) : 0;
        },
        builder.breakSequenceIds,
        () => exportCancelled
      );
      if (exportCancelled) return;
      trackChoreoSheetExported({
        sheetId: builder.sheet.id,
        pageCount: builder.pages.length,
        sequenceCount: builder.sequenceIds.length,
      });
    } catch (error) {
      if (
        exportCancelled ||
        (error instanceof Error &&
          error.message === CHOREO_SHEET_EXPORT_CANCELLED)
      ) {
        return;
      }
      // Non-blocking toast rather than an inline strip: the toolbar must never
      // reflow because something failed.
      getErrorHandler().showUserError({
        message: "PDF export failed. Try again.",
        severity: "warning",
        context: { module: "choreo", tab: "sheet", action: "export-pdf" },
        technicalDetails:
          error instanceof Error ? error.message : String(error),
      });
    } finally {
      exporting = false;
      exportCancelled = false;
    }
  }

  function cancelPdfExport() {
    exportCancelled = true;
  }

  let saving = $state(false);
  // Success feedback happens ON the Save button itself: it briefly turns
  // success-green with a check + "Saved", then settles back. Failures go to the
  // toast surface, never an inline strip that reflows the toolbar.
  let saveFlash = $state(false);
  let saveFlashTimer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => () => {
    if (saveFlashTimer) clearTimeout(saveFlashTimer);
  });

  // ── Saved acts (dock) ────────────────────────────────────────────────────────
  // Dirty = the sheet has content the cloud hasn't seen: either it was never
  // saved/loaded this session (null stamp) or it was edited after the last sync.
  // Every builder mutation bumps sheet.updatedAt, so the comparison is exact.
  let lastSyncedAt = $state<number | null>(null);
  const dirty = $derived(
    builder.sequenceIds.length > 0 &&
      (lastSyncedAt === null ||
        builder.sheet.updatedAt.getTime() > lastSyncedAt)
  );
  // Bumped on every successful save so the acts dock refetches (the saved act
  // re-sorts to the top with a fresh timestamp).
  let saveRefreshKey = $state(0);

  async function save(): Promise<boolean> {
    if (saving) return false;
    saving = true;
    try {
      // Display meta rides along so a cold open on another device can label its
      // rows before hydration resolves. Steps still come from the library.
      const meta = Object.fromEntries(
        builder.roster.filter((r) => r.meta).map((r) => [r.id, r.meta!])
      );
      await getChoreoSheetRepository().saveSheet(builder.sheet, meta);
      lastSyncedAt = Date.now();
      saveRefreshKey += 1;
      saveFlash = true;
      if (saveFlashTimer) clearTimeout(saveFlashTimer);
      saveFlashTimer = setTimeout(() => (saveFlash = false), 1600);
      return true;
    } catch (error) {
      getErrorHandler().showUserError({
        message: error instanceof Error ? error.message : "Save failed",
        severity: "warning",
        context: { module: "choreo", tab: "sheet", action: "save-sheet" },
        technicalDetails:
          error instanceof Error
            ? (error.stack ?? error.message)
            : String(error),
      });
      return false;
    } finally {
      saving = false;
    }
  }

  function openAct(act: ChoreoSheet): void {
    builder.replaceSheet(act);
    lastSyncedAt = Date.now(); // freshly loaded = in sync with the cloud copy
  }

  function newAct(): void {
    builder.newSheet();
    lastSyncedAt = null;
  }

  // Deleting the act that's open leaves the builder holding an unsaved draft.
  function handleActDeleted(id: string): void {
    if (id === builder.sheet.id) lastSyncedAt = null;
  }

  // Direct measurement avoids offsetting this view's fixed drawers/dropdowns.
  let workspaceEl = $state<HTMLElement | undefined>(undefined);
  let workspaceWidth = $state(0);
  let workspaceHeight = $state(0);

  $effect(() => {
    const el = workspaceEl;
    if (!el || typeof ResizeObserver === "undefined") return;
    const read = (entry?: ResizeObserverEntry) => {
      const box = entry?.contentBoxSize?.[0];
      workspaceWidth = box ? box.inlineSize : el.clientWidth;
      workspaceHeight = box ? box.blockSize : el.clientHeight;
    };
    const ro = new ResizeObserver((entries) => read(entries[0]));
    ro.observe(el);
    read();
    return () => ro.disconnect();
  });

  // Short landscape workspaces stay side by side to preserve preview height.
  const workspaceNarrow = $derived(
    shouldStackSheetWorkspace(workspaceWidth, workspaceHeight)
  );
  const workspacePhone = $derived(workspaceWidth > 0 && workspaceWidth <= 640);
  const dockOpen = $derived(browseOpen || actsOpen);
  const workspaceShort = $derived(workspaceHeight > 0 && workspaceHeight < 600);
  const workspaceWide = $derived(workspaceWidth >= 1680);
  const workspaceUltraWide = $derived(workspaceWidth >= 2600);

  // ── View mode ───────────────────────────────────────────────────────────────
  // A phone gets Reading by default: the page model sizes everything from
  // `--pt: 100cqw / pageWidthPt`, so a landscape letter sheet at 375px renders
  // 32px pictographs and 4px type. Uniform scaling IS the failure there, so the
  // narrow view reflows instead of shrinking.
  //
  // This is a VIEWING preference — it lives in localStorage and never touches
  // `sheet.layout`. That object is the print model; what prints must not depend
  // on how wide the window happened to be.
  //
  // null = never chosen, so the width default applies and keeps applying.
  let viewModeChoice = $state<ViewMode | null>(null);
  $effect(() => {
    const saved = localStorage.getItem(VIEW_MODE_KEY);
    if (saved === "reading" || saved === "page") viewModeChoice = saved;
  });
  const viewMode = $derived<ViewMode>(
    viewModeChoice ??
      (workspaceWidth > 0 && workspaceWidth <= 700 ? "reading" : "page")
  );
  function setViewMode(v: ViewMode) {
    viewModeChoice = v;
    localStorage.setItem(VIEW_MODE_KEY, v);
  }

  // The act's current step while it plays, 0-based into the concatenated act
  // sequence — matched against each cell's `actStepIndex` to light the
  // pictograph being animated. null when not playing.
  let actStepIndex = $state<number | null>(null);

  function exitPlayback(restoreFocus = false): void {
    workspaceMode = "compose";
    actStepIndex = null;
    if (!restoreFocus || typeof document === "undefined") return;
    requestAnimationFrame(() => {
      document.getElementById(PLAYER_TRIGGER_ID)?.focus();
    });
  }

  // Reading columns follow the stage, and the bands rebuild to match — the grid
  // renders exactly the count the bands were built with, so the two cannot drift.
  $effect(() => {
    builder.setReadingColumns(
      workspaceWidth > 0 && workspaceWidth >= 700 ? 8 : 4
    );
  });

  // ── Rail sizing ─────────────────────────────────────────────────────────────
  // Same convention as the viewer's content rail: pointer-drag through the
  // shared ResizeHandle primitive, width persisted, plus a collapse to an icon
  // strip. Range is narrow on purpose — the rail is a list of short TKA words,
  // not a content pane, so past ~360px it is just dead space the stage wants.
  const RAIL_WIDTH_KEY = "tka-choreo-rail-width";
  const RAIL_COLLAPSED_KEY = "tka-choreo-rail-collapsed";
  const RAIL_MIN = 240;
  const RAIL_MAX = 360;
  // 320, not 280: a row carries a TKA word plus a step count, a status slot, and
  // three 44px controls. At 280 the word got ~90px and the remove button sat on
  // the rail's edge.
  const RAIL_DEFAULT = 320;
  const RAIL_STRIP = 48;

  function loadRailWidth(): number {
    if (typeof localStorage === "undefined") return RAIL_DEFAULT;
    try {
      const raw = localStorage.getItem(RAIL_WIDTH_KEY);
      if (raw) {
        const n = parseInt(raw, 10);
        if (Number.isFinite(n))
          return Math.min(RAIL_MAX, Math.max(RAIL_MIN, n));
      }
    } catch {
      /* private mode — fall through to the default */
    }
    return RAIL_DEFAULT;
  }

  function loadRailCollapsed(): boolean {
    if (typeof localStorage === "undefined") return false;
    try {
      return localStorage.getItem(RAIL_COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  }

  let railWidth = $state(loadRailWidth());
  let railStackHeight = $state(220);
  let railCollapsed = $state(loadRailCollapsed());
  // Play is its own workspace state. It borrows the strip without mutating the
  // user's saved rail preference, so closing the player restores their rail.
  const railCollapsedForWorkspace = $derived(playerOpen || railCollapsed);
  const railStackMax = $derived(
    Math.max(148, Math.min(280, Math.round(workspaceHeight * 0.32)))
  );
  const railDisplaySize = $derived(
    railCollapsedForWorkspace
      ? RAIL_STRIP
      : workspaceNarrow
        ? Math.min(railStackHeight, railStackMax)
        : railWidth
  );

  function persistRail(): void {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(RAIL_WIDTH_KEY, String(railWidth));
      localStorage.setItem(RAIL_COLLAPSED_KEY, railCollapsed ? "1" : "0");
    } catch {
      /* quota / private mode — non-fatal */
    }
  }

  function toggleRailCollapse(): void {
    if (playerOpen) {
      exitPlayback();
      return;
    }
    railCollapsed = !railCollapsed;
    persistRail();
  }

  // ── Keyboard ────────────────────────────────────────────────────────────────
  // The app's shortcut manager owns key handling (capture-phase, context-scoped,
  // rebindable in Settings, listed under `?`). The definitions are registered at
  // boot with inert actions; this binds the live ones. Registering the same id
  // again updates its action — the seam Keyboard3DCoordinator uses.
  function selectByOffset(delta: number): void {
    const ids = builder.sequenceIds;
    if (ids.length === 0) return;
    const current = builder.selectedSequenceId
      ? ids.indexOf(builder.selectedSequenceId)
      : -1;
    // No selection yet: ArrowDown takes the first row, ArrowUp the last.
    const next =
      current === -1
        ? delta > 0
          ? 0
          : ids.length - 1
        : Math.min(ids.length - 1, Math.max(0, current + delta));
    const id = ids[next];
    if (id && id !== builder.selectedSequenceId)
      builder.toggleSequenceSelection(id);
    else if (id && current === -1) builder.toggleSequenceSelection(id);
  }

  function moveSelected(delta: number): void {
    const id = builder.selectedSequenceId;
    if (!id) return;
    const from = builder.sequenceIds.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= builder.sequenceIds.length) return;
    builder.move(from, to);
  }

  function removeSelected(): void {
    const id = builder.selectedSequenceId;
    if (id) builder.removeById(id);
  }

  function cycleSeparator(): void {
    const order: GroupSeparator[] = ["rule", "gap", "none"];
    const next =
      order[(order.indexOf(builder.layout.groupSeparator) + 1) % order.length];
    if (next) builder.setLayout({ groupSeparator: next });
  }

  $effect(() => {
    let dispose = () => {};
    void (async () => {
      try {
        const [{ getKeyboardShortcutManager }, { createChoreoShortcuts }] =
          await Promise.all([
            import("$lib/shared/keyboard/get-keyboard-shortcut-manager"),
            import("$lib/shared/keyboard/registration/register-choreo-shortcuts"),
          ]);
        const manager = getKeyboardShortcutManager();
        for (const shortcut of createChoreoShortcuts({
          selectPrevRow: () => selectByOffset(-1),
          selectNextRow: () => selectByOffset(1),
          selectRowAt: (i) => {
            const id = builder.sequenceIds[i];
            if (id && id !== builder.selectedSequenceId)
              builder.toggleSequenceSelection(id);
          },
          moveSelectedUp: () => moveSelected(-1),
          moveSelectedDown: () => moveSelected(1),
          removeSelected,
          save: () => void save(),
          exportPdf: () => void exportPdf(),
          toggleActs,
          togglePlayer: () => {
            if (builder.rosterComplete && builder.roster.length > 0)
              togglePlayer();
          },
          toggleBrowse,
          toggleRail: toggleRailCollapse,
          zoomIn: () => zoomBy(1),
          zoomOut: () => zoomBy(-1),
          zoomReset,
          pictographSizeDown: () => stepPictographSize(1),
          pictographSizeUp: () => stepPictographSize(-1),
          togglePacking: () =>
            builder.setLayout({ packing: isAnnotated ? "flow" : "aligned" }),
          toggleOrientation: () =>
            builder.setLayout({
              orientation:
                builder.layout.orientation === "portrait"
                  ? "landscape"
                  : "portrait",
            }),
          toggleStepNumbers: () =>
            builder.setLayout({
              showStepNumbers: !builder.layout.showStepNumbers,
            }),
          cycleSeparator,
          toggleCueRail: () =>
            builder.setLayout({ showCueRail: !builder.layout.showCueRail }),
          toggleNoteStrips: () =>
            builder.setLayout({
              showNoteStrips: !builder.layout.showNoteStrips,
            }),
        })) {
          manager.register(shortcut);
        }
        // Leave the definitions registered on unmount — they are the static set
        // Settings and `?` read from. Only the live actions go inert again.
        dispose = () => {
          void import("$lib/shared/keyboard/registration/register-choreo-shortcuts").then(
            (m) => m.registerChoreoShortcuts(manager)
          );
        };
      } catch (error) {
        console.warn(
          "[ChoreoSheetView] Keyboard shortcuts unavailable:",
          error
        );
      }
    })();
    return () => dispose();
  });

  // Two stationary handle presses replace the suppressed browser dblclick.
  const RAIL_DOUBLE_PRESS_MS = 350;
  let railDragOrigin = 0;
  let railDragMoved = false;
  let railLastPressAt = 0;
  // Disable the collapse transition while the handle is moving.
  let railDragging = $state(false);

  function onRailDragStart(): void {
    const now = Date.now();
    if (now - railLastPressAt < RAIL_DOUBLE_PRESS_MS && !railDragMoved) {
      railLastPressAt = 0;
      toggleRailCollapse();
      return;
    }
    railLastPressAt = now;
    railDragOrigin = railDisplaySize;
    railDragMoved = false;
    railDragging = true;
  }

  function onRailDrag(delta: number): void {
    if (Math.abs(delta) > 3) railDragMoved = true;
    // A collapsed rail expands from the chevron or a double-click, not a drag —
    // dragging a 48px strip has no meaningful origin width.
    if (railCollapsedForWorkspace) return;
    if (workspaceNarrow) {
      railStackHeight = Math.round(
        Math.min(railStackMax, Math.max(132, railDragOrigin + delta))
      );
    } else {
      railWidth = Math.round(
        Math.min(RAIL_MAX, Math.max(RAIL_MIN, railDragOrigin + delta))
      );
    }
  }

  function onRailDragEnd(): void {
    railDragging = false;
    if (railDragMoved) persistRail();
  }

  // Leaving the view abandons any in-flight hydration: the resolver stops
  // mid-backoff instead of retrying against a builder nobody is watching.
  onDestroy(() => builder.cancelHydration());
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key !== "Escape" || e.defaultPrevented) return;
    if (playerOpen) {
      e.preventDefault();
      exitPlayback(true);
      return;
    }
    // A focused search field owns its own Escape, and so does an open Drawer
    // (the picker's filter sheet): the docks are inline, so a modal on top of
    // them must close first.
    if (shouldDeferEscapeShortcut() || hasOpenDrawers()) return;
    if (browseOpen) {
      e.preventDefault();
      closeBrowse(true);
    } else if (actsOpen) {
      e.preventDefault();
      closeActs(true);
    } else if (builder.selectedSequenceId) builder.clearSelection();
  }}
/>

<div
  class="choreo-sheet-view"
  class:is-narrow={workspaceNarrow}
  class:is-phone={workspacePhone}
  class:is-playing={playerOpen}
  class:is-docked={dockOpen}
  class:is-wide={workspaceWide}
  class:is-ultra-wide={workspaceUltraWide}
  bind:this={workspaceEl}
  style:--workspace-w={workspaceWidth > 0 ? `${workspaceWidth}px` : undefined}
>
  <ChoreoSheetToolbar
    name={builder.sheet.name}
    sequenceCount={builder.sequenceIds.length}
    loopStatus={builder.loopStatus}
    {sheetMeta}
    {actsOpen}
    {playerOpen}
    {browseOpen}
    rosterReady={builder.rosterComplete}
    {saving}
    {saveFlash}
    {dirty}
    {exporting}
    {exportPct}
    onName={builder.setName}
    onToggleActs={toggleActs}
    onTogglePlayer={togglePlayer}
    onToggleBrowse={toggleBrowse}
    onSave={() => void save()}
    onExport={exportPdf}
  />

  <div class="sheet-body">
    <ChoreoSheetRail
      collapsed={railCollapsedForWorkspace}
      width={railDisplaySize}
      stacked={workspaceNarrow}
      dragging={railDragging}
      playbackActive={playerOpen}
      {viewMode}
      onToggle={toggleRailCollapse}
      onViewMode={setViewMode}
      onDragStart={onRailDragStart}
      onDrag={onRailDrag}
      onDragEnd={onRailDragEnd}
    />
    <SheetPreviewStage bind:zoom {viewMode} {actStepIndex} />

    {#if browseOpen}
      <SheetBrowserDock
        stacked={workspaceNarrow}
        resolveSequence={resolver.resolve}
        onClose={() => closeBrowse(true)}
      />
    {/if}

    {#if actsOpen}
      <ActsDock
        currentActId={builder.sheet.id}
        currentActName={builder.sheet.name}
        {dirty}
        refreshKey={saveRefreshKey}
        stacked={workspaceNarrow}
        onOpenAct={openAct}
        onNewAct={newAct}
        onSaveCurrent={save}
        onDeleted={handleActDeleted}
        onClose={() => closeActs(true)}
      />
    {/if}

    {#if playerOpen}
      <ActPlayer
        sequence={builder.actSequence}
        stacked={workspaceNarrow}
        playerFirst={workspacePhone}
        constrainedHeight={workspaceShort}
        wide={workspaceWide}
        ultraWide={workspaceUltraWide}
        onClose={() => exitPlayback(true)}
        onStepChange={(stepIndex) => {
          // Forwarded as-is, including while paused — the viewer keeps its
          // playback highlight lit when you pause mid-sequence, so the sheet
          // does too. AnimationPlayer already reports null once playback is
          // back before the first beat, which is what clears it on stop.
          actStepIndex = stepIndex;
        }}
      />
    {/if}
  </div>
</div>

<ExportTakeover
  phase={exporting ? "capturing" : "idle"}
  progress={exportPct / 100}
  phaseLabel="Rendering PDF pages..."
  onCancel={cancelPdfExport}
  label="Exporting choreo sheet PDF"
/>

<style>
  .choreo-sheet-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    gap: var(--spacing-sm);
    /* Dock width (picker + acts) follows the measured workspace, not the
       viewport, without layout containment. */
    --dock-w: clamp(400px, calc(var(--workspace-w, 1200px) * 0.3), 640px);
  }

  .sheet-body {
    position: relative;
    flex: 1;
    display: flex;
    gap: var(--spacing-sm);
    min-height: 0;
  }

  /* Narrow WORKSPACE, not narrow viewport: a slim module pane on a 4K screen
     stacks, and a 2560px workspace with DevTools docked stays the wide desktop
     it is. Driven by the measured width (see the script's note on why this
     isn't `@container` on the root). */
  .choreo-sheet-view.is-narrow .sheet-body {
    flex-direction: column;
  }

  /* On a phone, Play becomes the body rather than squeezing a letter page and
     the player into two unusable slivers. The preview stays mounted so zoom and
     scroll state survive the round trip back to Compose. */
  .choreo-sheet-view.is-playing.is-phone :global(.preview-pane) {
    display: none;
  }

  .choreo-sheet-view.is-playing.is-phone .sheet-body {
    overflow: hidden;
  }

  /* Narrow workspace with a dock open (Add sequences / Acts): there is no
     room for a side column, so the dock takes the preview's slot. Like Play
     on a phone, the preview stays mounted so zoom and scroll survive. */
  .choreo-sheet-view.is-narrow.is-docked :global(.preview-pane) {
    display: none;
  }

  .choreo-sheet-view.is-narrow.is-docked .sheet-body {
    overflow: hidden;
  }
</style>
