<!--
  AnimationPanel.svelte

  Unified animation export panel with pill-nav section switcher.

  - Mobile (layout="bottom"): compact control dock + export action.
  - Desktop (layout="sidebar"): shared Animator inspector shell with a
    scrollable section body and export action pinned in its footer.
  - presentation="content": one section's page for a host that navigates from
    its own controls. The bottom layout gives the dock tray's dense page, the
    sidebar layout the inspector's page without its rail or title.

  Sections: Effects → Props → Motion → Display → Export.
-->
<script lang="ts">
  import { fade } from "svelte/transition";
  import type { ExportOptionsStateManager } from "../state/export-options-state.svelte";
  import type { VideoExportProgress } from "$lib/shared/compose/domain/video-export-types";
  import {
    formatExportDuration,
    formatExportTimeEstimate,
  } from "../state/export-timing-tracker";
  import EffectsPanel from "$lib/shared/animation-engine/components/effects-panel/EffectsPanel.svelte";
  import PlaybackModeToggle from "$lib/shared/animation-engine/components/controls/PlaybackModeToggle.svelte";
  import type { PlaybackMode } from "$lib/shared/animation-engine/state/animation-panel-state.svelte";
  import "../bento/rail-tile.css";
  import "../pill-nav/pill-nav.css";
  import TempoControl from "./TempoControl.svelte";
  import PanelSpinner from "$lib/shared/components/panel/PanelSpinner.svelte";
  import { getAnimationVisibilityManager } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
  import { getAnimationVisibilityContext } from "$lib/shared/animation-engine/state/animation-visibility-context";
  import { getEffectsConfigContext } from "$lib/shared/effects/state/effects-config-context";
  import { EFFORTS } from "$lib/shared/effort/domain/effort-types";
  import {
    EFFECT_COLORS,
    EFFECT_LABELS,
    effectNavIcon,
  } from "$lib/shared/animation-engine/components/effects-panel/effect-registry";
  import EffortPanel from "$lib/shared/animation-engine/components/settings-panels/EffortPanel.svelte";
  import DisplayPanel from "$lib/shared/animation-engine/components/settings-panels/DisplayPanel.svelte";
  import PathShapePanel from "$lib/shared/animation-engine/components/settings-panels/PathShapePanel.svelte";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { getPropTypeDisplayInfo } from "$lib/shared/pictograph/prop/domain/prop-type-display-registry";
  import type { FanAppearance } from "$lib/shared/pictograph/prop/domain/fan-appearance";
  import type { PropChiralitySeam } from "$lib/shared/settings/components/tabs/prop-type/prop-chirality-seam";
  import HandPropToolbar, {
    type HandPropToolbarProps,
  } from "$lib/shared/settings/components/tabs/prop-type/HandPropToolbar.svelte";
  import { getSettings } from "$lib/shared/application/state/app-state.svelte";
  import { viewingPropLabel } from "$lib/shared/foundation/services/prop-viewing";
  import AnimatorInspectorShell from "./AnimatorInspectorShell.svelte";
  import AnimatorInspectorFooter from "./AnimatorInspectorFooter.svelte";
  import { RAIL_CATEGORY_ACCENTS } from "../pill-nav/rail-category-accents";
  import ControlDock, {
    type ControlDockTab,
    type ControlDockAction,
    type ControlDockLink,
  } from "$lib/shared/sequence-viewer/components/ControlDock.svelte";
  import {
    animationPillOrder,
    buildPillSpecs,
    resolveActivePill,
    type PillId,
  } from "../pill-nav/pill-types";
  import {
    loadActivePill,
    saveActivePill,
  } from "../state/active-pill-persistence";
  import {
    computeDisplaySummary,
    computeEffectsSummary,
    computePlaybackSummary,
    computeExportSummary,
    computePropsSummary,
  } from "../pill-nav/pill-summaries";
  import { onDestroy, untrack } from "svelte";
  import {
    VIDEO_OPENER_OPTIONS,
    type VideoOpener,
  } from "$lib/shared/share/domain/video-opener";
  import {
    reportViewerControlChange,
    type ViewerControlSink,
    type ViewerControlValue,
  } from "$lib/shared/sequence-viewer/domain/viewer-control-analytics";
  import { getOptionalViewerAnimatorInspectorContext } from "$lib/shared/sequence-viewer/context/viewer-animator-inspector-context";

  type PanelLayout = "sidebar" | "bottom";
  type PanelPresentation = "full" | "navigation" | "content";

  interface Props {
    /** Export state. Omit (with onExport) for hosts without an export pipeline
     *  (e.g. the landing demo) — the Export pill and footer button disappear. */
    exportOptions?: ExportOptionsStateManager;
    isExporting: boolean;
    exportProgress?: VideoExportProgress | null;
    canvasReady?: boolean;
    layout?: PanelLayout;
    /** Split hosts can keep the canonical navigation beside their stage while
     *  rendering the same canonical section body in a neighboring workspace. */
    presentation?: PanelPresentation;
    /** Host-owned section used by split presentations. Omit for the panel's
     *  usual self-owned navigation state. */
    controlledSection?: PillId | null;
    singlePlayDuration?: number;
    /** Keep the editor geometry while another workspace owns export. */
    reserveExportSpace?: boolean;
    /** Show the panel's own render button (footer, dock icon, tray confirm).
     *  The sequence viewer turns it off: there Share is the one way to get
     *  the file, and the Export page only holds its settings. */
    showExportAction?: boolean;
    isPlaying?: boolean;
    bpm?: number;
    renderMode?: "2d" | "3d";
    playbackMode?: PlaybackMode;
    onPlaybackToggle?: () => void;
    onPlaybackModeChange?: (mode: PlaybackMode) => void;
    onBpmChange?: (bpm: number) => void;
    /** Hide tempo controls when the host follows a source duration instead of
     *  a sequence tempo. Path-shape controls remain available. */
    showTempoControls?: boolean;
    /** Hide the Effects section's inline playback row when the host already
     *  provides persistent playback controls beside the canvas. */
    showEffectsPlayback?: boolean;
    selectedPropType?: PropType;
    fanAppearance?: FanAppearance;
    onFanAppearanceChange?: (appearance: FanAppearance) => void;
    /** The loaded sequence. Only the Display page reads it, so the word, glyph,
     *  and mandala tiles can preview THIS sequence instead of a stand-in. */
    sequence?: {
      word?: string | null;
      steps?: ReadonlyArray<{ letter?: string | null }> | null;
    } | null;
    onPropChange?: (propType: PropType) => void;
    /** Let a host route the Props destination into its canonical picker drawer
     * instead of squeezing the catalogue into the bottom dock tray. Sidebar
     * consumers keep the inline catalogue by omitting this callback. */
    onPropPickerRequest?: () => void;
    /** The host's picker is open: the Props pill shows pressed while it is,
     * without a tray of its own, so the way back is visible. */
    propPickerActive?: boolean;
    /**
     * Buugeng chirality seam forwarded to the props pill's picker. Optional
     * because two hosts (ProfilePhotoPicker, PostStudio) keep prop type local
     * to themselves — a chirality control there would write a global setting
     * the surrounding preview never reads.
     */
    propChirality?: PropChiralitySeam;
    /**
     * Per-hand picking for hosts whose props live in settings. The Props page
     * gains the Cat Dog chip and, while it is on, Left/Right hand segments;
     * `selectedPropType` and `onPropChange` then address `hand`. Hosts with
     * one local prop (Post Studio, profile photo, landing) omit this and keep
     * the single grid.
     */
    handProps?: HandPropToolbarProps;
    /**
     * The prop grid's own primary-colour control (BentoPropGrid's
     * showColors). On by default: every canvas this panel drives draws its
     * props in the account colours unless the host passes its own pair, and
     * such a host turns this off.
     */
    showPropColors?: boolean;
    onExport?: () => void;
    /** The image the clip opens with, per choice, for the Export page's
     * "Opens" row. Omitted by hosts whose render cannot open on a chosen
     * image (3D scenes, art views), which hides the row. */
    captureVideoOpener?: (kind: VideoOpener) => Promise<string>;
    /** Bump to open the Export page from outside the panel (Share → Download
     * a file → Video lands here). Works in the sidebar and the phone dock. */
    exportSectionRequest?: number;
    onCancel?: () => void;
    secondaryActions?: (ControlDockLink | ControlDockAction)[];
    /** Compact action at the end of the bottom dock. Export still takes this
     * slot when the panel owns an export workflow. */
    dockTrailingAction?: ControlDockAction;
    /** Render the panel's own inline export progress bar while exporting. Set
     *  false when the parent shows a full ExportTakeover over the canvas — the
     *  panel sits outside the takeover scrim, so its inline bar would be a second,
     *  redundant progress UI. Default true preserves standalone consumers. */
    showInlineExportProgress?: boolean;
    /** Show per-color prop visibility (Left/Right) chips in the Display section.
     *  Only surfaces WITHOUT a header motion-visibility control should set this
     *  (the landing spinner). Viewer/export already own Left/Right in their
     *  header, so they leave it false to avoid a duplicate. */
    showMotionVisibility?: boolean;
    /** Hide the four sequence-only edge marks (TKA glyph, element, step number,
     *  word) for a host animating something with no letter and no steps. */
    showSequenceMarks?: boolean;
    /** Leave out the Word tile for a host that never draws a word header. */
    showWordToggle?: boolean;
    /** Restrict the effect roster to what the host's renderer can actually
     *  draw. Omit for the full roster. */
    availableEffects?: readonly string[];
    /** Experimental interpolation shapes stay available to study surfaces,
     * while ordinary playback hosts can retain canonical motion geometry. */
    showPathShape?: boolean;
    /** Optional semantic sink. Existing hosts keep the same behavior when absent. */
    onSettingChange?: ViewerControlSink;
    /** Reports the open bottom-dock section. Sidebar hosts never close their
     *  active page, so this callback is only meaningful for layout="bottom". */
    onActiveSectionChange?: (section: PillId | null) => void;
    /** Increment to close an open bottom tray from the host before another
     *  structural transition begins. */
    closeRequest?: number;
    /** Accessible region name for non-export hosts. */
    regionLabel?: string;
  }

  let {
    exportOptions,
    isExporting,
    exportProgress = null,
    canvasReady = true,
    layout = "bottom",
    presentation = "full",
    controlledSection,
    singlePlayDuration = 0,
    reserveExportSpace = false,
    showExportAction = true,
    isPlaying = false,
    bpm = 60,
    renderMode = "2d",
    playbackMode = "continuous",
    onPlaybackToggle,
    onPlaybackModeChange,
    onBpmChange,
    showTempoControls = true,
    showEffectsPlayback = true,
    selectedPropType,
    fanAppearance,
    sequence = null,
    onPropChange,
    onPropPickerRequest,
    propPickerActive = false,
    propChirality,
    handProps,
    showPropColors = true,
    onExport,
    captureVideoOpener,
    exportSectionRequest = 0,
    onCancel,
    secondaryActions = [],
    dockTrailingAction,
    showInlineExportProgress = true,
    showMotionVisibility = false,
    showSequenceMarks = true,
    showWordToggle = true,
    availableEffects,
    showPathShape = true,
    onSettingChange,
    onActiveSectionChange,
    closeRequest = 0,
    regionLabel = "Animation controls",
  }: Props = $props();

  const viewerAnimatorInspector = getOptionalViewerAnimatorInspectorContext();

  const exportButtonLabel = $derived(
    renderMode === "3d" ? "Record Scene" : "Download animation"
  );

  // Export is host-optional: both the state manager and the handler must be
  // wired for the Export pill, footer button, and dock trailing icon to render.
  const exportEnabled = $derived(!!exportOptions && !!onExport);

  // ── Active pill state ──
  // Desktop sidebar reopens to the last section (default Effects) for proper
  // persistence; mobile bottom sheet stays closed on mount.
  let activePill = $state<PillId | null>(
    layout === "sidebar" ? loadActivePill() : null
  );
  // The viewer shell mounts this panel once and re-lays it out in place
  // (sidebar while another mode owns the workspace, bottom once the stacked
  // motion dock opens), so the initial value above only describes the layout
  // it mounted in. A dock has to open closed: carrying the remembered sidebar
  // page across put the phone on an open Props tray, which ducks the mode bar
  // that is the only way back out of 2D.
  let appliedLayout = layout;
  $effect(() => {
    if (layout === appliedLayout) return;
    appliedLayout = layout;
    const previous = untrack(() => activePill);
    const next = layout === "bottom" ? null : loadActivePill();
    if (previous === next) return;
    activePill = next;
    if (layout === "bottom") onActiveSectionChange?.(null);
  });
  let panelDirection = $state(1);

  function handlePillSelect(id: PillId): void {
    const previous = resolvedPill;
    if (layout === "bottom" && id === "props" && onPropPickerRequest) {
      if (activePill !== null) {
        activePill = null;
        reportViewerControlChange(
          onSettingChange,
          "animation_panel",
          "section",
          previous,
          null
        );
        onActiveSectionChange?.(null);
      }
      onPropPickerRequest();
      return;
    }

    if (layout === "bottom") {
      activePill = previous === id ? null : id;
    } else {
      const prevIdx = pillSpecs.findIndex((p) => p.id === previous);
      const nextIdx = pillSpecs.findIndex((p) => p.id === id);
      if (prevIdx !== -1 && nextIdx !== -1) {
        panelDirection = nextIdx > prevIdx ? 1 : -1;
      }
      activePill = id;
      viewerAnimatorInspector?.select(id);
    }
    reportViewerControlChange(
      onSettingChange,
      "animation_panel",
      "section",
      previous,
      activePill
    );
    onActiveSectionChange?.(activePill);
  }

  let handledCloseRequest = closeRequest;
  $effect(() => {
    const request = closeRequest;
    if (request === handledCloseRequest) return;
    handledCloseRequest = request;
    if (layout !== "bottom" || activePill === null) return;

    const previous = activePill;
    activePill = null;
    reportViewerControlChange(
      onSettingChange,
      "animation_panel",
      "section",
      previous,
      null
    );
    onActiveSectionChange?.(null);
  });

  function reportSetting(
    group: string,
    setting: string,
    previousValue: ViewerControlValue,
    value: ViewerControlValue,
    coalesce = false
  ): void {
    reportViewerControlChange(
      onSettingChange,
      group,
      setting,
      previousValue,
      value,
      { coalesce }
    );
  }

  function setExportFps(value: 30 | 60 | 120): void {
    if (!exportOptions) return;
    const previous = exportOptions.videoFps;
    exportOptions.setVideoFps(value);
    reportSetting("video_export", "fps", previous, value);
  }

  function setExportResolution(value: 720 | 1080 | 2160 | 4320): void {
    if (!exportOptions) return;
    const previous = exportOptions.videoResolution;
    exportOptions.setVideoResolution(value);
    reportSetting("video_export", "resolution", previous, value);
  }

  function setExportQuality(value: "standard" | "cinema"): void {
    if (!exportOptions) return;
    const previous = exportOptions.videoQuality;
    exportOptions.setVideoQuality(value);
    reportSetting("video_export", "quality", previous, value);
  }

  function setStartHold(value: boolean): void {
    if (!exportOptions) return;
    const previous = exportOptions.videoIncludeStartPlacement;
    exportOptions.setVideoIncludeStartPlacement(value);
    reportSetting("video_export", "include_start_position", previous, value);
  }

  function setEndHold(value: boolean): void {
    if (!exportOptions) return;
    const previous = exportOptions.videoIncludeEndHold;
    exportOptions.setVideoIncludeEndHold(value);
    reportSetting("video_export", "include_end_hold", previous, value);
  }

  function setLoopCount(value: number): void {
    if (!exportOptions) return;
    const previous = exportOptions.videoLoopCount;
    exportOptions.setVideoLoopCount(value);
    reportSetting("video_export", "loop_count", previous, value);
  }

  function setVideoOpener(value: VideoOpener): void {
    if (!exportOptions) return;
    const previous = exportOptions.videoOpener;
    exportOptions.setVideoOpener(value);
    reportSetting("video_export", "opener", previous, value);
  }

  /** The row is offered only where the host can bake the image into the render. */
  const openerRowEnabled = $derived(
    !!captureVideoOpener && renderMode !== "3d" && !!exportOptions
  );
  /**
   * The mandala is the one choice the live stage cannot show, so it gets a
   * thumbnail. The current frame IS the stage, and the first beat is one
   * press of restart away; capturing it would jump the stage on every visit.
   * Redrawn when the sequence, its props, or the hand colours change.
   */
  let mandalaOpenerUrl = $state<string | null>(null);
  $effect(() => {
    if (!openerRowEnabled || resolvedPill !== "export") return;
    if (exportOptions?.videoOpener !== "mandala") return;
    void sequence;
    void selectedPropType;
    void getSettings().primaryPropColors;
    const capture = captureVideoOpener;
    if (!capture) return;
    let current = true;
    mandalaOpenerUrl = null;
    capture("mandala").then(
      (url) => {
        if (current) mandalaOpenerUrl = url || null;
      },
      (error) => {
        console.error(
          "[AnimationPanel] Could not draw the mandala opener:",
          error
        );
      }
    );
    return () => {
      current = false;
    };
  });

  let pillNavEl = $state<HTMLElement | null>(null);
  let panelScrollEl = $state<HTMLElement | null>(null);

  // Honor prefers-reduced-motion
  let reduceMotion = $state(
    typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  $effect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    )
      return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e: MediaQueryListEvent) => {
      reduceMotion = e.matches;
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  });

  function attachSpaceGuard(el: HTMLElement | null) {
    if (!el) return;
    el.addEventListener("keydown", preventSpaceActivation);
    return () => el.removeEventListener("keydown", preventSpaceActivation);
  }
  $effect(() => attachSpaceGuard(panelScrollEl));

  function preventSpaceActivation(event: KeyboardEvent) {
    if (event.key !== " " && event.code !== "Space") return;
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const tag = target.tagName;
    if (
      tag === "BUTTON" ||
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT"
    )
      return;
    if (target.isContentEditable) return;
    event.preventDefault();
  }

  // Context-first so hosts with an ephemeral per-canvas manager (landing demo)
  // drive THAT instance; everywhere else falls through to the global singleton.
  const vm = getAnimationVisibilityContext() ?? getAnimationVisibilityManager();
  let effectsConfigState: ReturnType<typeof getEffectsConfigContext> | null =
    null;
  try {
    effectsConfigState = getEffectsConfigContext();
  } catch {
    // Context may not be available in all host environments
  }
  let vmVersion = $state(0);
  function onVmChanged(): void {
    vmVersion++;
  }
  vm.registerObserver(onVmChanged);
  onDestroy(() => vm.unregisterObserver(onVmChanged));

  const activeEffort = $derived.by(() => {
    void vmVersion;
    const id = vm.getEffortPreset();
    const match = EFFORTS.find((e) => e.id === id);
    return (
      match ??
      EFFORTS[0] ?? {
        id: "linear",
        label: "Linear",
        subtitle: "",
        color: "#94a3b8",
        params: [],
      }
    );
  });

  const activeEffectId = $derived.by(() => {
    void vmVersion;
    return effectsConfigState?.activeEffect ?? "none";
  });
  const effectsSummary = $derived(
    computeEffectsSummary(activeEffectId, EFFECT_LABELS)
  );
  const effectsAccent = $derived(
    EFFECT_COLORS[activeEffectId] ?? RAIL_CATEGORY_ACCENTS.effects
  );
  // A chosen effect wears its own glyph, the way the Props pill shows the
  // chosen prop rather than a generic props icon. The wand only stands in
  // while nothing is selected.
  const effectsIcon = $derived(effectNavIcon(activeEffectId));

  const effortSummary = $derived(activeEffort.label);
  const effortAccent = $derived(activeEffort.color);

  // What the Playback page (and the merged Motion page above Effort) holds.
  const playbackHasPage = $derived(
    showTempoControls || !!onPlaybackModeChange || showPathShape
  );

  const playbackSummary = $derived.by(() => {
    void vmVersion;
    return showTempoControls
      ? computePlaybackSummary(bpm, vm.getPlaybackMode())
      : "Path shape";
  });

  const displaySummary = $derived.by(() => {
    void vmVersion;
    const s = vm.getSettings();
    return computeDisplaySummary({
      tkaGlyph: s.tkaGlyph,
      elementalGlyph: s.elementalGlyph,
      propElementalGlyph: s.propElementalGlyph,
      stepNumbers: s.stepNumbers,
      props: s.props,
      wordHeader: s.wordHeader,
      mandala: s.mandala,
      pathLines: s.leftPathLines || s.rightPathLines,
      grid: vm.isGridVisible(),
    });
  });

  const propsSummary = $derived(
    computePropsSummary(
      handProps?.catDog
        ? viewingPropLabel({
            leftPropType: handProps.leftPropType,
            rightPropType: handProps.rightPropType,
            catDogMode: true,
          })
        : selectedPropType
          ? getPropTypeDisplayInfo(selectedPropType).label
          : ""
    )
  );

  const exportSummary = $derived(
    exportOptions
      ? computeExportSummary({
          resolution: exportOptions.videoResolution,
          fps: exportOptions.videoFps,
          loopCount: exportOptions.videoLoopCount,
          renderMode: renderMode === "3d" ? "3d" : "2d",
        })
      : ""
  );

  const exportDisabled = $derived(isExporting || !canvasReady);

  // The download button asks before it renders. From any other section the
  // first press opens the Export page (opener, fps, resolution, timing, loops)
  // and the same button confirms from there; pressing it while Export is
  // already up renders at once. The bottom dock's trailing download icon
  // shares this, so it opens the Export tray first and the tray carries its
  // own confirm.
  function handleExportTrigger(): void {
    if (!onExport) return;
    if (resolvedPill !== "export") {
      handlePillSelect("export");
      return;
    }
    onExport();
  }

  let handledExportSectionRequest = exportSectionRequest;
  $effect(() => {
    const request = exportSectionRequest;
    if (request === handledExportSectionRequest) return;
    handledExportSectionRequest = request;
    untrack(() => {
      if (!exportEnabled || resolvedPill === "export") return;
      handlePillSelect("export");
    });
  });

  const timeEstimateLabel = $derived(
    exportOptions
      ? formatExportTimeEstimate(
          exportOptions.videoResolution,
          exportOptions.videoFps,
          singlePlayDuration,
          exportOptions.videoLoopCount
        )
      : ""
  );

  const totalVideoDuration = $derived.by(() => {
    if (singlePlayDuration <= 0 || !exportOptions) return "";
    const unitSeconds = bpm > 0 ? 60 / bpm : 0;
    const startHold = exportOptions.videoIncludeStartPlacement
      ? unitSeconds
      : 0;
    const endHold = exportOptions.videoIncludeEndHold ? unitSeconds : 0;
    const total =
      startHold + singlePlayDuration * exportOptions.videoLoopCount + endHold;
    return formatExportDuration(total);
  });

  // ── Pill specs ──
  // Effects leads the rail — it's the section users reach for most.
  // The sidebar collapses effort/playback into one Motion page; the mobile
  // dock keeps them as two trays. Display is its own pill in both — what the
  // canvas draws is not motion behavior, and folding it into Motion put the
  // visibility toggles under a heading that misdescribed them. Membership
  // still comes from PILL_ORDER via buildPillSpecs, so the two orders cannot
  // drift.
  // Merging is a property of the layout, not of the width. A width gate here
  // meant Post Studio's 419px inspector showed three pills while the sequence
  // viewer's 663px rail showed one Motion page in the same window — the two
  // surfaces disagreeing about what the panel even contains, which is the
  // drift this panel exists to prevent. Every sidebar merges; the @container
  // query below decides one column or two, which is a layout adaptation rather
  // than a different set of pages. A narrow rail scrolls the merged page
  // (`.panel-transition` is `overflow-y: auto`).
  const motionMerged = $derived(layout === "sidebar");

  const ANIMATION_PILL_ORDER = $derived(animationPillOrder(motionMerged));

  const pillSpecs = $derived(
    buildPillSpecs(
      {
        ...(onPropChange
          ? {
              props: {
                propType: selectedPropType,
                fanAppearance,
                label: "Props",
                summary: propsSummary,
                accentColor: RAIL_CATEGORY_ACCENTS.props,
              },
            }
          : {}),
        effects: {
          icon: effectsIcon,
          label: "Effects",
          summary: effectsSummary,
          accentColor: effectsAccent,
        },
        effort: {
          label: "Effort",
          summary: effortSummary,
          accentColor: effortAccent,
        },
        // A host whose canvas has its own transport owns tempo there and
        // passes showTempoControls={false}. With no mode and no path shape
        // either, the Playback page would be empty, so it has no pill.
        ...(playbackHasPage
          ? {
              playback: {
                icon: "fa-route",
                label: "Playback",
                summary: playbackSummary,
                accentColor: RAIL_CATEGORY_ACCENTS.playback,
              },
            }
          : {}),
        display: {
          icon: "fa-eye",
          label: "Display",
          summary: displaySummary,
          accentColor: RAIL_CATEGORY_ACCENTS.display,
        },
        // Effort alone, not effort + playback: the summary contract is ≤24
        // chars (pill-types.ts) and concatenating two live values blew past it
        // and changed width on every BPM tick, which is a shifting rail.
        // Effort is the one of the three whose value a user tracks, and it
        // carries the accent the rail glows with.
        motion: {
          icon: "fa-gauge-high",
          label: "Motion",
          summary: effortSummary,
          accentColor: effortAccent,
        },
        ...(exportEnabled
          ? {
              export: {
                icon: "fa-sliders",
                label: "Export",
                summary: exportSummary,
              },
            }
          : {}),
      },
      ANIMATION_PILL_ORDER
    )
  );

  // Persist the active section and keep it pointed at a section this host
  // actually exposes (e.g. a remembered "props" falls back to Effects where
  // there's no Props pill). Sidebar-only — see active-pill-persistence.
  // Resolving in a derived rather than an effect matters: the rail's membership
  // changes with layout and width at runtime (a shell that flips sidebar↔bottom
  // on resize, a remembered pill from before the Motion page existed), and an
  // effect corrects only after a frame has already rendered the missing
  // section. That frame put two copies of Visibility's label id in the document
  // during the crossfade, and left the mobile dock holding a tray with no tab.
  const availableIds = $derived(pillSpecs.map((p) => p.id));
  const requestedPill = $derived(
    controlledSection !== undefined
      ? controlledSection
      : layout === "sidebar" && viewerAnimatorInspector
        ? (viewerAnimatorInspector.resolve(availableIds) as PillId | null)
        : activePill
  );
  const resolvedPill = $derived(resolveActivePill(requestedPill, availableIds));

  // A host that drives the page from its own controls changes sections
  // without handlePillSelect, so the page's slide follows the change itself:
  // later in the pill order rises from below, earlier drops from above. Pre,
  // so the direction is set before the page's transition reads it.
  let directedPill: PillId | null = null;
  $effect.pre(() => {
    const next = resolvedPill;
    const previous = directedPill;
    directedPill = next;
    if (controlledSection === undefined || !previous || !next) return;
    if (previous === next) return;
    const ids = untrack(() => availableIds);
    const from = ids.indexOf(previous);
    const to = ids.indexOf(next);
    if (from !== -1 && to !== -1) panelDirection = to > from ? 1 : -1;
  });

  // The effect reads pillSpecs (through resolvedPill), which recomputes on
  // every BPM tick and effect change, so an unguarded save wrote the same
  // string to localStorage on every control tweak.
  let savedPill: PillId | null = null;
  $effect(() => {
    if (!resolvedPill) return;
    // Write back so the rail, the dock and persistence agree on one id.
    if (activePill !== resolvedPill) activePill = resolvedPill;
    // A page the host frames and navigates is the host's choice, not the
    // viewer inspector's remembered page.
    if (
      layout === "sidebar" &&
      presentation !== "content" &&
      savedPill !== resolvedPill
    ) {
      savedPill = resolvedPill;
      saveActivePill(resolvedPill);
    }
  });

  const activePillLabel = $derived(
    pillSpecs.find((p) => p.id === resolvedPill)?.label ?? ""
  );

  // ── Mobile ControlDock wiring ──
  // The pill specs become dock tabs; Export's trigger is the compact trailing
  // download icon, mirroring the mandala dock.
  const dockTabs = $derived<ControlDockTab[]>(
    pillSpecs.map((p) => ({
      id: p.id,
      label: p.label,
      icon: p.icon,
      propType: p.propType,
      fanAppearance: p.fanAppearance,
      accentColor: p.accentColor,
      pressed: p.id === "props" && propPickerActive,
    }))
  );
  const dockTrailing = $derived<ControlDockAction | undefined>(
    exportEnabled && onExport && showExportAction
      ? {
          icon: renderMode === "3d" ? "fa-circle" : "fa-download",
          label: exportButtonLabel,
          onClick: handleExportTrigger,
          active: resolvedPill === "export",
          disabled: exportDisabled,
          busy: !canvasReady,
        }
      : dockTrailingAction
  );

  // ── SR announcer ──
  let lastAnnouncement = $state("");
  $effect(() => {
    if (activePillLabel) {
      lastAnnouncement = `${activePillLabel} settings`;
    }
  });
</script>

{#snippet pillBody()}
  {#if resolvedPill === "props" && onPropChange && selectedPropType !== undefined}
    {#if handProps}
      <HandPropToolbar {handProps} />
    {/if}
    {#await import("$lib/shared/settings/components/tabs/prop-type/BentoPropGrid.svelte")}
      <!-- Reserve space while the chunk loads so the body doesn't render
           as a blank slot and then jump when the grid arrives. -->
      <div class="pill-pending">
        <PanelSpinner />
      </div>
    {:then mod}
      <!-- The wide sidebar hands the picker its whole page, so the tiles
           share the height instead of huddling in the top third of it. The
           tray and the compact sheet grow with their content and keep the
           dense grid. -->
      <mod.default
        {selectedPropType}
        onSelect={onPropChange}
        chirality={propChirality}
        showColors={showPropColors}
        variant="inline"
        flat
        fill={layout === "sidebar"}
      />
    {/await}
  {:else if resolvedPill === "effects"}
    <EffectsPanel
      layout={layout === "bottom" ? "strip" : "sidebar"}
      showHeading={layout === "bottom" || presentation === "content"}
      {bpm}
      onBpmChange={onBpmChange ?? (() => {})}
      {isPlaying}
      onPlaybackToggle={onPlaybackToggle ?? (() => {})}
      showPlayback={!!(
        showEffectsPlayback &&
        showTempoControls &&
        onPlaybackToggle &&
        onBpmChange
      )}
      {availableEffects}
      onSettingChange={(setting, previous, value, coalesce) =>
        reportSetting("effects", setting, previous, value, coalesce)}
    />
  {:else if resolvedPill === "effort"}
    {@render effortBody()}
  {:else if resolvedPill === "playback"}
    {@render playbackBody()}
  {:else if resolvedPill === "display"}
    {@render displayBody()}
  {:else if resolvedPill === "motion"}
    <!-- Effort and Playback measured at 44% / 36% of the rail on their own, so
         the sidebar spent two pages to show two mostly empty columns. Stacked
         they fill it and they read as one idea: how the motion behaves —
         tempo, playback mode, the shape the hands travel, and how each step
         speeds up and slows down. Display used to be folded in here too, which
         put visibility toggles under a heading that claimed they were motion;
         it has its own pill again. Sidebar only; the mobile dock still gets
         separate tabs, where one tall merged tray would not fit. -->
    <div class="motion-scope">
      <!-- A host with its own transport bar owns tempo there and passes
           showTempoControls={false}; with no playback mode either, Tempo and
           Mode have nothing to hold and Paths runs the full width above
           Effort instead of stranding an empty second column. -->
      <div class="motion-stack">
        {#if showPathShape}
          {#if showTempoControls || onPlaybackModeChange}
            <div class="motion-col">
              {@render tempoModeBody()}
            </div>
            <div class="motion-col">
              {@render pathsBody()}
            </div>
          {:else}
            {@render pathsBody()}
          {/if}
        {:else if showTempoControls || onPlaybackModeChange}
          <div class="motion-col motion-col-solo">
            {@render tempoModeBody()}
          </div>
        {/if}
        <!-- Effort alone is the whole page, so it needs no label of its own. -->
        {@render effortBody(playbackHasPage)}
      </div>
    </div>
  {:else if resolvedPill === "export" && exportOptions}
    {@render exportBody()}
  {/if}
{/snippet}

<!-- `labelled` is set only by a merged Motion page with more than Effort on it.
     On its own page the h2 names the section and a label under it would say
     the same word twice; on the merged page Tempo, Mode and Visibility all
     carry one, and the effort tiles were the single unlabelled block under a
     heading named for something else. -->
{#snippet effortBody(labelled = false)}
  <div class="section-pad">
    {#if labelled}
      <span class="rt-section-label">Effort</span>
    {/if}
    {#if layout === "sidebar"}
      <p class="section-hint">How each beat speeds up and slows down.</p>
    {/if}
    <EffortPanel
      columns={layout === "sidebar" ? 2 : 4}
      showSubtitles={layout === "sidebar"}
      onSettingChange={(previous, value) =>
        reportSetting("effort", "preset", previous, value)}
    />
  </div>
{/snippet}

{#snippet playbackBody()}
  {@render tempoModeBody()}
  {#if showPathShape}
    {@render pathsBody()}
  {/if}
{/snippet}

<!-- Split out of playbackBody so the merged Motion page can put Paths in the
     right-hand column under Visibility. Stacked all three in the left column,
     Tempo + Mode + Paths ran ~440px against Visibility's ~230px and left a
     column-height hole under it. On its own Playback page the two render back
     to back and read as one section, as before. -->
{#snippet tempoModeBody()}
  {#if showTempoControls || onPlaybackModeChange}
    <div class="section-pad playback-rows">
      {#if showTempoControls}
        <div class="rt-section">
          <span class="rt-section-label">Tempo</span>
          <TempoControl
            {bpm}
            onBpmChange={onBpmChange ?? (() => {})}
            showPresets={layout === "sidebar"}
            showPractice={false}
            presetsMode={layout === "sidebar" ? "inline" : "popover"}
            vertical={layout === "sidebar"}
          />
        </div>
      {/if}
      {#if onPlaybackModeChange}
        <div class="rt-section">
          <span class="rt-section-label">Mode</span>
          <PlaybackModeToggle
            {playbackMode}
            {isPlaying}
            {onPlaybackModeChange}
            onPlaybackToggle={onPlaybackToggle ?? (() => {})}
            showDescriptions={layout === "sidebar"}
          />
        </div>
      {/if}
    </div>
  {/if}
{/snippet}

<!-- Motion paths live with Playback, not Display: the shape changes how the
     props TRAVEL (prop-interpolator physics), a playback behavior — only the
     "Paths" chip in Display is visibility. PathShapePanel brings its own
     header row (label + live caption). -->
{#snippet pathsBody()}
  <div class="section-pad">
    <PathShapePanel
      onSettingChange={(previous, value) =>
        reportSetting("playback", "path_shape", previous, value)}
    />
  </div>
{/snippet}

{#snippet displayBody()}
  <!-- No inner "Visibility" label: Display is its own page in the sidebar and
       its own tab in the dock, and both already name it. The label was earned
       back when this block sat inside the merged Motion page, where a heading
       named for something else needed correcting. -->
  <div class="section-pad display-rows">
    <div class="rt-section" role="region" aria-label="Visibility">
      <DisplayPanel
        {showMotionVisibility}
        {showSequenceMarks}
        {showWordToggle}
        {sequence}
        propType={selectedPropType}
        fill={layout === "sidebar"}
        {onSettingChange}
      />
    </div>
  </div>
{/snippet}

{#snippet exportBody()}
  {#if exportOptions}
    <div class="section-pad export-fields">
      {#if openerRowEnabled}
        <div class="field">
          <span class="field-label">Opens</span>
          <div class="rt-chip-row opener-row">
            {#each VIDEO_OPENER_OPTIONS as option (option.value)}
              <button
                type="button"
                class="rt-chip"
                aria-pressed={exportOptions.videoOpener === option.value}
                onclick={() => setVideoOpener(option.value)}
                >{option.label}</button
              >
            {/each}
          </div>
        </div>
        <div class="opener-note">
          {#if exportOptions.videoOpener === "mandala"}
            {#if mandalaOpenerUrl}
              <img
                class="opener-thumb"
                src={mandalaOpenerUrl}
                alt="Mandala the clip opens with"
              />
            {/if}
            <span>Holds the sequence's mandala for a beat, then plays.</span>
          {:else if exportOptions.videoOpener === "this-frame"}
            <span
              >Holds the frame on the stage when you press Download. Pause where
              it looks right.</span
            >
          {:else}
            <span>Opens on the start position.</span>
          {/if}
        </div>
      {/if}

      <div class="field">
        <span class="field-label">FPS</span>
        <div class="rt-chip-row">
          <button
            type="button"
            class="rt-chip"
            aria-pressed={exportOptions.videoFps === 30}
            onclick={() => setExportFps(30)}>30 fps</button
          >
          <button
            type="button"
            class="rt-chip"
            aria-pressed={exportOptions.videoFps === 60}
            onclick={() => setExportFps(60)}>60 fps</button
          >
          <button
            type="button"
            class="rt-chip"
            aria-pressed={exportOptions.videoFps === 120}
            onclick={() => setExportFps(120)}>120 fps</button
          >
        </div>
      </div>

      <div class="field">
        <span class="field-label">Res</span>
        <div class="rt-chip-row res-row">
          <button
            type="button"
            class="rt-chip"
            aria-pressed={exportOptions.videoResolution === 720}
            onclick={() => setExportResolution(720)}
            >{renderMode === "3d" ? "720×720" : "720p"}</button
          >
          <button
            type="button"
            class="rt-chip"
            aria-pressed={exportOptions.videoResolution === 1080}
            onclick={() => setExportResolution(1080)}
            >{renderMode === "3d" ? "1080×1080" : "1080p"}</button
          >
          <button
            type="button"
            class="rt-chip"
            aria-pressed={exportOptions.videoResolution === 2160}
            onclick={() => setExportResolution(2160)}
            >{renderMode === "3d" ? "2160×2160" : "4K"}</button
          >
          <button
            type="button"
            class="rt-chip"
            aria-pressed={exportOptions.videoResolution === 4320}
            onclick={() => setExportResolution(4320)}
            >{renderMode === "3d" ? "4320×4320" : "8K"}</button
          >
        </div>
      </div>

      {#if renderMode === "3d"}
        <div class="field">
          <span class="field-label">Quality</span>
          <div class="rt-chip-row">
            <button
              type="button"
              class="rt-chip"
              aria-pressed={exportOptions.videoQuality === "standard"}
              onclick={() => setExportQuality("standard")}>Standard</button
            >
            <button
              type="button"
              class="rt-chip"
              aria-pressed={exportOptions.videoQuality === "cinema"}
              onclick={() => setExportQuality("cinema")}
              ><i class="fas fa-film" aria-hidden="true"></i> Cinema</button
            >
          </div>
        </div>
      {/if}

      <div class="field">
        <span class="field-label">Timing</span>
        <div class="rt-chip-row">
          <button
            type="button"
            class="rt-chip"
            aria-pressed={exportOptions.videoIncludeStartPlacement}
            onclick={() =>
              setStartHold(!exportOptions.videoIncludeStartPlacement)}
          >
            <i class="fas fa-step-backward" aria-hidden="true"></i> Start Hold
          </button>
          <button
            type="button"
            class="rt-chip"
            aria-pressed={exportOptions.videoIncludeEndHold}
            onclick={() => setEndHold(!exportOptions.videoIncludeEndHold)}
          >
            <i class="fas fa-step-forward" aria-hidden="true"></i> End Hold
          </button>
        </div>
      </div>

      <div class="field">
        <span class="field-label">Loops</span>
        <div class="rt-stepper">
          <button
            type="button"
            class="rt-step-btn"
            onclick={() => setLoopCount(exportOptions.videoLoopCount - 1)}
            disabled={exportOptions.videoLoopCount <= 1}
            aria-label="Decrease loop count"
            ><i class="fas fa-minus" aria-hidden="true"></i></button
          >
          <span class="rt-val">{exportOptions.videoLoopCount}×</span>
          <button
            type="button"
            class="rt-step-btn"
            onclick={() => setLoopCount(exportOptions.videoLoopCount + 1)}
            disabled={exportOptions.videoLoopCount >= 10}
            aria-label="Increase loop count"
            ><i class="fas fa-plus" aria-hidden="true"></i></button
          >
        </div>
      </div>

      {#if timeEstimateLabel || totalVideoDuration}
        <div class="export-meta">
          {#if totalVideoDuration}<span
              ><i class="fas fa-film" aria-hidden="true"></i>
              {totalVideoDuration}</span
            >{/if}
          {#if timeEstimateLabel}<span
              ><i class="fas fa-clock" aria-hidden="true"></i>
              {timeEstimateLabel}</span
            >{/if}
        </div>
      {/if}

      {#if layout === "bottom" && onExport && showExportAction}
        <!-- The dock's download icon opened this tray, so the confirm sits on
             the same surface as the options it applies. The sidebar keeps its
             footer button instead. -->
        <div class="export-confirm">
          <AnimatorInspectorFooter
            onAction={onExport}
            label={exportButtonLabel}
            icon={renderMode === "3d" ? "fa-circle" : "fa-download"}
            busy={isExporting}
            disabled={exportDisabled}
            ready={canvasReady}
          />
        </div>
      {/if}
    </div>
  {/if}
{/snippet}

<!-- SR announcer -->
<span class="sr-only" aria-live="polite" aria-atomic="true">
  {lastAnnouncement}
</span>

{#snippet dockTray()}
  <div class="dock-dense">
    {@render pillBody()}
  </div>
{/snippet}

{#if presentation === "content" && layout === "bottom"}
  <div
    class="external-section-body dock-dense"
    role="region"
    aria-label={activePillLabel || regionLabel}
  >
    {@render pillBody()}
  </div>
{:else if layout === "bottom"}
  <!-- ============================================================
       MOBILE: pill bar + download button at bottom;
       tapping a pill opens a sheet with that section's body.
       ============================================================ -->
  <div
    class="mobile-export"
    transition:fade={{ duration: reduceMotion ? 0 : 200 }}
    role="region"
    aria-label={regionLabel}
  >
    {#if isExporting && showInlineExportProgress}
      <div class="mobile-progress" role="status" aria-live="polite">
        <div class="progress-info">
          <span class="progress-stage">
            {#if !exportProgress}Starting...{:else}Exporting{/if}
          </span>
          <span class="progress-pct"
            >{exportProgress
              ? Math.round(exportProgress.progress * 100)
              : 0}%</span
          >
        </div>
        <div
          class="progress-bar"
          role="progressbar"
          aria-valuenow={exportProgress
            ? Math.round(exportProgress.progress * 100)
            : 0}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Export progress"
        >
          <div
            class="progress-fill"
            style="width: {exportProgress ? exportProgress.progress * 100 : 0}%"
          ></div>
        </div>
        {#if onCancel}
          <button
            type="button"
            class="cancel-btn"
            onclick={onCancel}
            aria-label="Cancel export"
          >
            <i class="fas fa-times" aria-hidden="true"></i>
            Cancel
          </button>
        {/if}
      </div>
    {:else}
      <ControlDock
        tabs={dockTabs}
        activeTab={resolvedPill}
        onTabSelect={(id) => handlePillSelect(id as PillId)}
        trailingAction={dockTrailing}
        {secondaryActions}
        trayMaxHeight={resolvedPill === "effects"
          ? "min(54vh, 360px)"
          : "min(35vh, 250px)"}
        tray={presentation === "full" ? dockTray : undefined}
      />
    {/if}
  </div>
{:else}
  <AnimatorInspectorShell
    pills={pillSpecs}
    activeId={resolvedPill}
    activeLabel={activePillLabel}
    onSelect={handlePillSelect}
    direction={panelDirection}
    {reduceMotion}
    fillBody={resolvedPill === "display" ||
      resolvedPill === "effects" ||
      resolvedPill === "props"}
    fluidBody={resolvedPill === "props"}
    pageOnly={presentation === "content"}
    regionLabel={presentation === "content"
      ? activePillLabel || regionLabel
      : "Animation export settings"}
    onNavMount={(element) => {
      pillNavEl = element;
    }}
    onScrollMount={(element) => {
      panelScrollEl = element;
    }}
  >
    {#snippet body()}{@render pillBody()}{/snippet}
    {#snippet footer()}
      {#if (exportEnabled && onExport && showExportAction) || reserveExportSpace}
        <AnimatorInspectorFooter
          onAction={handleExportTrigger}
          concealed={reserveExportSpace}
          label={exportButtonLabel}
          icon={renderMode === "3d" ? "fa-circle" : "fa-download"}
          busy={isExporting}
          disabled={exportDisabled}
          ready={canvasReady}
          meta={timeEstimateLabel}
          showProgress={showInlineExportProgress}
          progress={exportProgress}
          {onCancel}
        />
      {/if}
    {/snippet}
  </AnimatorInspectorShell>
{/if}

<style>
  .external-section-body {
    min-width: 0;
    min-height: 0;
    height: 100%;
    overflow: hidden auto;
  }
  .section-pad {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 8px 16px 20px;
  }

  /* A container query cannot style its own container, so the stack gets a
     scope wrapper to measure and the grid rules land on the stack itself. */
  .motion-scope {
    container-name: motion-stack;
    container-type: inline-size;
  }

  /* The merged sections keep their own internal padding; the stack only
     supplies the rules between them, and opens the gap a little past the
     sections' own 20px so a rule reads as a divider rather than a boundary the
     content is crowding.

     One column below 528px, two above. The two `.motion-col` wrappers are the
     columns and in single-column mode they simply stack; Effort spans the
     stack under them either way. Wrappers rather than bare grid items, because
     grid rows are shared: with Tempo, Mode and Paths placed individually, the
     row holding Paths stretched to Tempo + Mode's height and left a hole
     under it.

     Effort is last because it is the least self-explanatory thing here. Tempo
     is a control anyone recognises on sight; Effort and Motion Paths are TKA
     concepts. Effort held the top slot at full width and was the tallest block
     on the page, so a rail that had to scroll spent its visible half on the
     one section a first-time viewer cannot read. */
  .motion-stack {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-content: start;
    column-gap: var(--spacing-md, 12px);
  }

  .motion-col {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  /* Full-width blocks: Effort always, and Paths too on a host whose transport
     bar owns tempo and mode. `:not(:first-child)` because a divider belongs
     between blocks, not above the page's first one — Paths leads the stack on
     those hosts. */
  .motion-stack > :global(.section-pad) {
    grid-column: 1 / -1;
  }

  .motion-stack > :global(.section-pad:not(:first-child)) {
    margin-top: 4px;
    padding-top: 20px;
    border-top: 1px solid var(--theme-stroke);
  }

  /* Stacked into one column, the second column follows the first rather than
     sitting beside it, so it needs the same rule its own siblings get. */
  @container motion-stack (max-width: 527.98px) {
    .motion-col + .motion-col > :global(.section-pad:first-child) {
      margin-top: 4px;
      padding-top: 20px;
      border-top: 1px solid var(--theme-stroke);
    }

    /* One column has no room to spend 8 subtitled tiles on the section a
       first-time viewer understands last. Four across in two rows instead of
       two across in four, without the descriptions: 386px down to ~150px,
       which is what keeps a 315px rail from scrolling. Both come back with the
       second column, where the room exists. */
    .motion-stack :global(.effort-sub) {
      display: none;
    }

    .motion-stack :global(.effort-btn.with-sub) {
      padding: 8px 4px;
      min-height: 40px;
    }

    .motion-stack :global(.effort-grid) {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }

  @container motion-stack (min-width: 528px) {
    .motion-stack {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    /* A host with no Paths page (the shape matrix traces a fixed figure) has
       nothing for the second column. Tempo and Mode take a column each on
       the one row instead of stacking beside a hole the width of the page. */
    .motion-col-solo {
      grid-column: 1 / -1;
    }

    .motion-col-solo > :global(.playback-rows) {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      column-gap: var(--spacing-md, 12px);
      align-items: start;
    }
  }

  /* Pending state for the lazy-loaded BentoPropGrid chunk. Fills the
     available body height (fixed in the dock tray) and reserves roughly a
     label + tile row otherwise, so the loaded grid doesn't shove siblings. */
  .pill-pending {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    min-height: 140px;
  }

  /* Compact Export body: label-left rows instead of stacked sections. */
  .export-fields .field {
    display: grid;
    /* 64px fits the widest label ("QUALITY") at the 12px floor. */
    grid-template-columns: 64px 1fr;
    align-items: center;
    gap: 10px;
  }
  .export-fields .field-label {
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.55));
  }
  .export-fields .rt-chip-row {
    display: flex;
    flex: 1;
    gap: 6px;
  }
  .export-fields .rt-chip-row.res-row,
  .export-fields .rt-chip-row.opener-row {
    flex-wrap: wrap;
  }
  /* Under the Opens chips, aligned with the chip column like the meta row. */
  .export-fields .opener-note {
    display: flex;
    align-items: center;
    gap: 10px;
    padding-left: 74px;
    font-size: var(--font-size-compact, 12px);
    line-height: 1.35;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
  }
  .export-fields .opener-thumb {
    width: 56px;
    height: 56px;
    flex-shrink: 0;
    border-radius: 8px;
    object-fit: cover;
    background: #000;
  }
  .export-fields .export-meta {
    display: flex;
    gap: 16px;
    /* Label column (64px) + grid gap (10px) keeps the meta row aligned
       with the chip column above it. */
    padding-left: 74px;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-variant-numeric: tabular-nums;
  }
  .export-fields .export-meta i {
    opacity: 0.6;
    margin-right: 2px;
  }

  /* ============================================================
   * Dock-tray densification (mobile). Scoped to .dock-dense so these
   * shared panels stay full-size in their other usages. Touch targets
   * stay >=44px — we only collapse gaps, paddings, and >44px tiles.
   * ============================================================ */
  .dock-dense :global(.section-pad) {
    gap: 8px;
    padding: 4px 12px 10px;
  }
  /* Visibility in the dock: four columns, so the four square-layer tiles hold
     the first row and the four edge-mark tiles hold the second — the same
     grouping the sidebar shows, in the shortest tray that can carry it. The
     previews come along; they are the point of the tile, and shrinking one is
     better than replacing it with a word. */
  .dock-dense :global(.vis-grid) {
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
  }
  .dock-dense :global(.vis-grid > *:nth-child(n + 5)) {
    margin-top: 6px;
  }
  /* The cap is set above the column width on purpose, so the COLUMN binds and
     the picture takes the whole tile minus its padding. A 2.25rem cap fit the
     tray with room to spare and rendered a 36px picture — small enough that
     the grid read as eight smudges, which is the state this redesign replaced.
     4rem is the largest picture whose two rows still land inside the capped
     tray without scrolling. */
  .dock-dense :global(.vis-grid .rt-chip) {
    gap: 4px;
    padding: 6px 3px;
    --tile-art: 4rem;
  }
  .dock-dense :global(.vis-grid .chip-label) {
    font-size: 0.68rem;
  }
  /* A tablet's dock is 776px wide with a 250px tray — 4rem is a phone's cap
     and leaves a 64px picture inside a 190px tile. 5rem is the largest picture
     whose two rows still clear that tray. */
  @container (min-width: 30rem) {
    .dock-dense :global(.vis-grid .rt-chip) {
      --tile-art: 5rem;
    }
  }
  /* A folded Fold in landscape puts the dock under a 932px-wide, 139px-tall
     tray. Four columns there is 230px tiles carrying a small picture AND a
     scroll, because two rows are taller than the tray. Eight columns is one
     row: the tile narrows to ~114px, the picture GROWS to 6rem because height
     stops being the binding constraint, and the whole page lands inside the
     tray. The group boundary moves from a row break to a gap beside the fifth
     tile, so the four square-field layers still read apart from the four edge
     marks. A tablet's tall dock takes the same treatment for the same reason
     read the other way: one row is a SHORTER tray, so the picture ends up
     bigger AND less of the canvas is covered. The seam is 42rem rather than a
     rounder 44 because a 820x1180 tablet's dock measures 696px — six pixels
     under 44rem, which put it back on four columns of 171px tiles carrying an
     80px picture. */
  @container (min-width: 42rem) {
    .dock-dense :global(.vis-grid) {
      grid-template-columns: repeat(8, minmax(0, 1fr));
    }
    .dock-dense :global(.vis-grid > *:nth-child(n + 5)) {
      margin-top: 0;
    }
    .dock-dense :global(.vis-grid > *:nth-child(5)) {
      margin-left: 8px;
    }
    .dock-dense :global(.vis-grid .rt-chip) {
      --tile-art: 6rem;
    }
  }
  /* Squeeze the last ~15px so Visibility + Motion paths land inside the capped
     tray with NO scroll (the whole tab on one screen). */
  .dock-dense .display-rows {
    gap: 5px;
    padding: 2px 12px 4px;
  }
  .dock-dense .display-rows .rt-section {
    gap: 4px;
  }
  /* The sidebar hands these rows a height to divide, so they fill it. The dock
     tray is the other way round — it takes its height FROM the content — and a
     `flex: 1 1 0` child reports zero, which collapsed the whole Display tab to
     its own padding. Here the rows measure themselves. */
  .dock-dense .display-rows,
  .dock-dense .display-rows .rt-section {
    flex: 0 0 auto;
  }
  /* Playback: 5 controls don't need four stacked bands. Label-left rows, and
     the two mode buttons sit side-by-side. Dock only — the sidebar keeps the
     descriptive vertical stack. */
  .dock-dense .playback-rows {
    padding-bottom: 6px;
  }
  .dock-dense .playback-rows .rt-section {
    flex-direction: row;
    align-items: center;
    gap: 10px;
  }
  .dock-dense .playback-rows .rt-section-label {
    flex: 0 0 52px;
  }
  .dock-dense .playback-rows :global(.tempo-wrapper) {
    flex: 1;
    min-width: 0;
  }
  .dock-dense .playback-rows :global(.mode-toggle) {
    flex-direction: row;
    flex: 1;
    min-width: 0;
  }
  .dock-dense .playback-rows :global(.mode-toggle .mode-btn) {
    flex: 1;
    min-width: 0;
  }
  /* BentoPropGrid */
  .dock-dense :global(.grid-scroll) {
    padding: 6px 12px;
  }
  .dock-dense :global(.section-label) {
    padding: 4px 4px 2px;
  }
  .dock-dense :global(.section-buttons) {
    gap: 4px;
  }
  .dock-dense :global(.grid-content) {
    gap: 2px;
  }
  /* Shrink prop tiles ~79->60px (square) so more fit per row + shorter rows.
     Higher specificity than BentoPropGrid's own width + container-query rules. */
  .dock-dense :global(.section-buttons .prop-button),
  .dock-dense :global(.popover-trigger-wrap .prop-button),
  .dock-dense :global(.popover-trigger-wrap) {
    width: 60px;
  }
  .dock-dense :global(.prop-button) {
    aspect-ratio: 1 / 1;
    padding: 5px 3px 4px;
    gap: 2px;
  }
  /* .prop-label keeps its base var(--font-size-compact, 12px); it ellipsizes
     (nowrap + hidden overflow) inside the 60px tile, so no sub-floor override. */
  /* EffortPanel (56px tile -> 48, still >=44) */
  .dock-dense :global(.effort-btn) {
    min-height: 48px;
    padding: 10px 6px;
  }
  .dock-dense :global(.effort-grid) {
    gap: 4px;
  }
  /* PathShapePanel */
  .dock-dense :global(.path-shape-grid) {
    gap: 4px;
  }
  .dock-dense :global(.path-btn) {
    padding: 6px;
  }
  .dock-dense :global(.hybrid-btn) {
    padding: 6px 10px;
    margin-top: 4px;
  }
  .dock-dense :global(.motion-hint) {
    margin-top: 2px;
  }
  /* DisplayPanel */
  .dock-dense :global(.display-chips) {
    gap: 4px;
  }
  /* TempoControl popover */
  .dock-dense :global(.bpm-popover) {
    padding: 10px;
    gap: 8px;
  }
  .dock-dense :global(.bpm-popover-presets) {
    gap: 6px;
  }

  .mobile-export {
    position: relative;
    flex-shrink: 0;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    z-index: 10;
  }

  .mobile-progress {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 16px 12px;
  }

  .display-rows,
  .display-rows .rt-section {
    flex: 1 1 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .section-hint {
    font-size: var(--font-size-compact, 12px);
    color: rgba(255, 255, 255, 0.6);
    text-align: center;
    line-height: 1.4;
    margin: 0;
    padding: 0 8px;
  }

  .export-progress-row {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 100%;
  }

  .progress-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .progress-stage {
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.75));
  }

  .progress-pct {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: var(--theme-text, white);
  }

  .progress-bar {
    width: 100%;
    height: 6px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border-radius: 3px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--theme-accent, #6366f1);
    border-radius: 3px;
    transition: width 0.2s ease;
  }

  .cancel-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    min-height: var(--min-touch-target);
    padding: 10px 20px;
    background: transparent;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 12px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.75));
    font-size: var(--font-size-min, 14px);
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .cancel-btn:hover {
    background: color-mix(
      in srgb,
      var(--semantic-error, #f87171) 15%,
      transparent
    );
    border-color: var(--semantic-error, #f87171);
    color: var(--semantic-error, #f87171);
  }

  @media (prefers-reduced-motion: reduce) {
    .cancel-btn,
    .progress-fill {
      transition: none !important;
      animation: none !important;
    }
  }
</style>
