<!-- Tunnel settings route each substantial rail section to its presentation owner. -->
<script lang="ts">
  import { onDestroy, type Snippet } from "svelte";
  import AnimatorInspectorShell from "$lib/shared/animation-panel/components/AnimatorInspectorShell.svelte";
  import AnimatorInspectorFooter from "$lib/shared/animation-panel/components/AnimatorInspectorFooter.svelte";
  import BentoPropGrid from "$lib/shared/settings/components/tabs/prop-type/BentoPropGrid.svelte";
  import { createGlobalChiralitySeam } from "$lib/shared/settings/components/tabs/prop-type/prop-chirality-seam";
  import HandPropToolbar, {
    type HandPropToolbarProps,
  } from "$lib/shared/settings/components/tabs/prop-type/HandPropToolbar.svelte";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { getPropTypeDisplayInfo } from "$lib/shared/pictograph/prop/domain/prop-type-display-registry";
  import { viewingPropLabel } from "$lib/shared/foundation/services/prop-viewing";
  import type { FanAppearance } from "$lib/shared/pictograph/prop/domain/fan-appearance";
  import { EFFORTS } from "$lib/shared/effort/domain/effort-types";
  import { getAnimationVisibilityManager } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
  import { getAnimationVisibilityContext } from "$lib/shared/animation-engine/state/animation-visibility-context";
  import {
    computeDisplaySummary,
    computePlaybackSummary,
  } from "$lib/shared/animation-panel/pill-nav/pill-summaries";
  import { RAIL_CATEGORY_ACCENTS } from "$lib/shared/animation-panel/pill-nav/rail-category-accents";
  import ControlDock, {
    type ControlDockAction,
    type ControlDockTab,
  } from "../ControlDock.svelte";
  import type { TunnelViewController } from "../../tunnel/tunnel-view-controller.svelte";
  import type { PlaybackMode } from "$lib/shared/animation-engine/state/animation-panel-state.svelte";
  import TunnelEffectsSettings from "./TunnelEffectsSettings.svelte";
  import TunnelDisplaySettings from "./TunnelDisplaySettings.svelte";
  import TunnelLookSettings from "./TunnelLookSettings.svelte";
  import TunnelMotionSettings from "./TunnelMotionSettings.svelte";
  import TunnelPlaybackSettings from "./TunnelPlaybackSettings.svelte";
  import TunnelSpeedSettings from "./TunnelSpeedSettings.svelte";
  import { reportArtSetting } from "./art-setting-change";
  import type {
    ArtSettingChangeHandler,
    ArtSettingValue,
  } from "./art-settings-types";
  import type { PropChiralitySeam } from "$lib/shared/settings/components/tabs/prop-type/prop-chirality-seam";
  import {
    animationSettings,
    type AnimationSettingsState,
  } from "$lib/shared/animation-engine/state/animation-settings-state.svelte";
  import { getOptionalViewerAnimatorInspectorContext } from "../../context/viewer-animator-inspector-context";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

  type TunnelRailId =
    | "tunnel"
    | "props"
    | "speed"
    | "effects"
    | "motion"
    | "display"
    | "effort"
    | "playback";

  interface Props {
    controller: TunnelViewController;
    layout: "sidebar" | "bottom";
    bottomStartsOpen?: boolean;
    onExport: () => void;
    showExport: boolean;
    showTitle?: boolean;
    onSaveTunnel?: () => void;
    saveTunnelLabel?: string;
    bpm: number;
    playbackMode: PlaybackMode;
    isPlaying: boolean;
    onBpmChange: (bpm: number) => void;
    onPlaybackModeChange: (mode: PlaybackMode) => void;
    onPlaybackToggle: () => void;
    leftPropType: string | null;
    onPropChange?: (propType: PropType) => void;
    /** Per-hand picking for hosts that keep a local pair (Tunnel creator). */
    handProps?: HandPropToolbarProps;
    fanAppearance?: FanAppearance;
    onFanAppearanceChange?: (appearance: FanAppearance) => void;
    propChirality?: PropChiralitySeam;
    animationSettingsState?: AnimationSettingsState;
    onArtSettingChange?: ArtSettingChangeHandler;
    exporting: boolean;
    reduceMotion: boolean;
    formationContent?: Snippet<[boolean]>;
    formationSummaryOverride?: string;
    stageAware?: boolean;
    sequence?: SequenceData;
  }

  let {
    controller,
    layout,
    bottomStartsOpen = false,
    onExport,
    showExport,
    showTitle = true,
    onSaveTunnel,
    saveTunnelLabel = "Save tunnel",
    bpm,
    playbackMode,
    isPlaying,
    onBpmChange,
    onPlaybackModeChange,
    onPlaybackToggle,
    leftPropType,
    onPropChange,
    handProps,
    fanAppearance,
    propChirality = createGlobalChiralitySeam(),
    animationSettingsState = animationSettings,
    onArtSettingChange,
    exporting,
    reduceMotion,
    formationContent,
    formationSummaryOverride,
    stageAware = false,
    sequence,
  }: Props = $props();

  const viewerAnimatorInspector = getOptionalViewerAnimatorInspectorContext();

  function reportSetting(
    group: string,
    setting: string,
    previousValue: ArtSettingValue,
    value: ArtSettingValue,
    coalesce = false
  ): void {
    reportArtSetting(
      onArtSettingChange,
      group,
      setting,
      previousValue,
      value,
      coalesce
    );
  }

  // The active prop for the Props grid's highlight: the addressed hand's prop
  // when the host passes handProps, otherwise the left prop.
  const selectedPropType = $derived<PropType>(
    (leftPropType as PropType | null) ?? PropType.STAFF
  );
  const visibility =
    getAnimationVisibilityContext() ?? getAnimationVisibilityManager();
  let visibilityVersion = $state(0);
  function onVisibilityChanged(): void {
    visibilityVersion++;
  }
  visibility.registerObserver(onVisibilityChanged);
  onDestroy(() => visibility.unregisterObserver(onVisibilityChanged));

  const activeEffort = $derived.by(() => {
    void visibilityVersion;
    const id = visibility.getEffortPreset();
    return EFFORTS.find((effort) => effort.id === id) ?? EFFORTS[0]!;
  });
  const formationSummary = $derived(
    formationSummaryOverride ??
      `${controller.presetRecipe?.name ?? "Custom"} · ${controller.performerCount} ${controller.performerCount === 1 ? "instance" : "instances"}`
  );
  const displaySummary = $derived.by(() => {
    void visibilityVersion;
    const settings = visibility.getSettings();
    return computeDisplaySummary({
      tkaGlyph: settings.tkaGlyph,
      elementalGlyph: settings.elementalGlyph,
      propElementalGlyph: settings.propElementalGlyph,
      stepNumbers: settings.stepNumbers,
      props: settings.props,
      wordHeader: settings.wordHeader,
      mandala: settings.mandala,
      pathLines: settings.leftPathLines || settings.rightPathLines,
      grid: visibility.isGridVisible(),
    });
  });
  const motionMerged = $derived(layout === "sidebar");
  const tunnelRail = $derived<
    {
      id: TunnelRailId;
      icon?: string;
      propType?: PropType;
      fanAppearance?: FanAppearance;
      label: string;
      summary?: string;
      accentColor?: string;
    }[]
  >([
    // Shared pages lead in the same order as 2D Animation. Their component,
    // selection state, and section bodies now survive the mode switch; the
    // two Tunnel-only destinations follow them instead of reshuffling the rail.
    {
      id: "effects",
      icon: "fa-wand-magic-sparkles",
      label: "Effects",
      summary: "Effects",
      accentColor: RAIL_CATEGORY_ACCENTS.effects,
    },
    ...(onPropChange
      ? [
          {
            id: "props" as const,
            propType: selectedPropType,
            fanAppearance,
            label: "Props",
            summary: handProps
              ? viewingPropLabel({
                  leftPropType: handProps.leftPropType,
                  rightPropType: handProps.rightPropType,
                  catDogMode: handProps.catDog,
                })
              : getPropTypeDisplayInfo(selectedPropType).label,
            accentColor: RAIL_CATEGORY_ACCENTS.props,
          },
        ]
      : []),
    ...(motionMerged
      ? [
          {
            id: "motion" as const,
            icon: "fa-gauge-high",
            label: "Motion",
            summary: activeEffort.label,
            accentColor: activeEffort.color,
          },
        ]
      : [
          {
            id: "effort" as const,
            label: "Effort",
            summary: activeEffort.label,
            accentColor: activeEffort.color,
          },
          {
            id: "playback" as const,
            icon: "fa-route",
            label: "Playback",
            summary: computePlaybackSummary(bpm, playbackMode),
            accentColor: RAIL_CATEGORY_ACCENTS.playback,
          },
        ]),
    {
      id: "display",
      icon: "fa-eye",
      label: "Display",
      summary: displaySummary,
      accentColor: RAIL_CATEGORY_ACCENTS.display,
    },
    {
      id: "tunnel",
      icon: "fa-shapes",
      label: "Formation",
      summary: formationSummary,
      accentColor: RAIL_CATEGORY_ACCENTS.formation,
    },
    {
      id: "speed",
      icon: "fa-gauge-high",
      label: stageAware ? "Stage Speed" : "Copy Speed",
      summary: controller.hasSpeedOverrides ? "Mixed rates" : "Uniform",
      accentColor: RAIL_CATEGORY_ACCENTS.speed,
    },
  ]);

  const tunnelOrder = $derived(tunnelRail.map((pill) => pill.id));
  const controllerRailSection = $derived<TunnelRailId>(
    motionMerged &&
      (controller.section === "effort" || controller.section === "playback")
      ? "motion"
      : controller.section
  );
  const tunnelSection = $derived<TunnelRailId>(
    layout === "sidebar" && viewerAnimatorInspector
      ? ((viewerAnimatorInspector.resolve(tunnelOrder) ??
          "effects") as TunnelRailId)
      : controllerRailSection
  );
  const tunnelSectionLabel = $derived(
    tunnelRail.find((p) => p.id === tunnelSection)?.label ?? ""
  );

  let flyDir = $state(1);

  function rememberTunnelSection(id: TunnelRailId): void {
    if (id === "motion") {
      controller.section = "effort";
    } else if (id !== "display") {
      controller.section = id;
    }
  }

  function selectTunnel(id: TunnelRailId): void {
    const previous = tunnelSection;
    const prev = tunnelOrder.indexOf(tunnelSection);
    const next = tunnelOrder.indexOf(id);
    flyDir = next >= prev ? 1 : -1;
    rememberTunnelSection(id);
    if (layout === "sidebar") viewerAnimatorInspector?.select(id);
    reportSetting("art_navigation", "desktop_tunnel_section", previous, id);
  }

  // The creator's dedicated phone surface opens the saved section immediately.
  let openTunnelTab = $state<TunnelRailId | null>(
    bottomStartsOpen ? controller.section : null
  );

  function selectTunnelDock(id: string): void {
    if (exporting) return;
    const tid = id as TunnelRailId;
    const previous = openTunnelTab;
    openTunnelTab = previous === tid ? null : tid;
    if (openTunnelTab) rememberTunnelSection(openTunnelTab);
    reportSetting(
      "art_navigation",
      "mobile_tunnel_section",
      previous ?? "closed",
      openTunnelTab ?? "closed"
    );
  }

  const tunnelDockTabs = $derived<ControlDockTab[]>(
    tunnelRail.map((p) => ({
      id: p.id,
      label: p.label,
      icon: p.icon,
      propType: p.propType,
      fanAppearance: p.fanAppearance,
      accentColor: p.accentColor,
    }))
  );
  const tunnelDockExport = $derived<ControlDockAction>({
    icon: "fa-film",
    label: "Export Video",
    accent: true,
    onClick: onExport,
    disabled: exporting,
    busy: exporting,
  });
</script>

{#snippet tunnelSectionBody(id: TunnelRailId, dense: boolean)}
  {#if id === "tunnel"}
    {#if formationContent}
      {@render formationContent(dense)}
    {:else}
      <TunnelLookSettings
        {controller}
        {dense}
        {onSaveTunnel}
        {saveTunnelLabel}
        {onArtSettingChange}
      />
    {/if}
  {:else if id === "props"}
    <!-- Prop selection: the same BentoPropGrid the 2D Download panel uses. The
         chosen prop goes to onPropChange; the host routes it (Tunnel routes it
         to the addressed hand, the viewer host keeps its own handling). -->
    {#if onPropChange && handProps}
      <HandPropToolbar {handProps} />
    {/if}
    <div class="section-pad props-pad">
      {#if onPropChange}
        <BentoPropGrid
          {selectedPropType}
          onSelect={onPropChange}
          variant="inline"
          flat
          chirality={propChirality}
        />
      {/if}
    </div>
  {:else if id === "speed"}
    <TunnelSpeedSettings
      {controller}
      {dense}
      {stageAware}
      {onArtSettingChange}
    />
  {:else if id === "effects"}
    <TunnelEffectsSettings
      {dense}
      {bpm}
      {isPlaying}
      {onBpmChange}
      {onPlaybackToggle}
      {animationSettingsState}
      {onArtSettingChange}
    />
  {:else if id === "effort"}
    <TunnelMotionSettings
      {dense}
      includePlayback={false}
      {bpm}
      {playbackMode}
      {isPlaying}
      {onBpmChange}
      {onPlaybackModeChange}
      {onPlaybackToggle}
      {onArtSettingChange}
    />
  {:else if id === "playback"}
    <TunnelPlaybackSettings
      {dense}
      {bpm}
      {playbackMode}
      {isPlaying}
      {onBpmChange}
      {onPlaybackModeChange}
      {onPlaybackToggle}
      {onArtSettingChange}
    />
  {:else if id === "motion"}
    <TunnelMotionSettings
      {bpm}
      {playbackMode}
      {isPlaying}
      {onBpmChange}
      {onPlaybackModeChange}
      {onPlaybackToggle}
      {onArtSettingChange}
    />
  {:else}
    <TunnelDisplaySettings
      {sequence}
      propType={selectedPropType}
      {dense}
      {onArtSettingChange}
    />
  {/if}
{/snippet}

{#if layout === "bottom"}
  <ControlDock
    tabs={tunnelDockTabs}
    activeTab={openTunnelTab}
    onTabSelect={selectTunnelDock}
    trailingAction={showExport ? tunnelDockExport : undefined}
    trayMaxHeight={openTunnelTab === "effects"
      ? "min(54vh, 360px)"
      : "min(33vh, 250px)"}
  >
    {#snippet tray()}
      <div class="dock-dense">
        {#if openTunnelTab}{@render tunnelSectionBody(openTunnelTab, true)}{/if}
      </div>
    {/snippet}
  </ControlDock>
{:else}
  <AnimatorInspectorShell
    pills={tunnelRail}
    activeId={tunnelSection}
    activeLabel={tunnelSectionLabel}
    onSelect={selectTunnel}
    direction={flyDir}
    {reduceMotion}
    fillBody={tunnelSection === "display" || tunnelSection === "effects"}
    {exporting}
    artPanel
    regionLabel={showTitle ? "Tunnel settings" : "Animation controls"}
  >
    {#snippet body()}{@render tunnelSectionBody(tunnelSection, false)}{/snippet}
    {#snippet footer()}
      {#if showExport}
        <AnimatorInspectorFooter
          onAction={onExport}
          label="Export Video"
          icon="fa-film"
          busy={exporting}
          disabled={exporting}
          testId="art-export-button"
        />
      {/if}
    {/snippet}
  </AnimatorInspectorShell>
{/if}

<style>
  .section-pad {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 8px 16px 20px;
  }

  /* Mobile dock tray: tighten the shared section bodies. Buttons/inputs keep
     their var(--min-touch-target) floor — only gaps and outer paddings collapse
     so the tray stays compact floating over the art. */
  .dock-dense .section-pad {
    gap: 8px;
    padding: 2px 2px 6px;
  }
</style>
