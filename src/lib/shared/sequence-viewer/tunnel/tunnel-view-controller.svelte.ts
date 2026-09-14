import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { PropState } from "$lib/shared/foundation/domain/types/prop-state";
import type { AdditionalLayerProps } from "$lib/shared/animation-engine/domain/types/trail-capture-types";
import { applyEffort } from "$lib/shared/effort/domain/effort-easing-unified";
import {
  getAnimationVisibilityManager,
  type AnimationVisibilityStateManager,
} from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
import {
  buildTunnelCompositionLayers,
  type BuiltTunnelLayer,
} from "./tunnel-layer-builder";
import { sampleTunnelProps, tunnelStepIndexAt } from "./tunnel-prop-sampling";
import {
  DEFAULT_CONFIG,
  MAX_IMAGES,
  MAX_IMAGES_RM,
  clampConfig,
  configKey,
  copyModulators,
  effectiveSpeed,
  getPreset,
  imageCount,
  matchPreset,
  speedFill,
  type SpeedFill,
  type TunnelConfig,
} from "./tunnel-config";
import {
  builtInTunnelPresetRecipe,
  cloneTunnelPresetRecipe,
  isTunnelPresetRecipeModified,
  savedTunnelPresetRecipe,
  type TunnelPresetRecipe,
} from "./tunnel-preset-recipe";
import {
  buildTunnelRenderColors,
  normalizePerformerColors,
  tunnelPerformerPair,
  type TunnelPerformerColors,
  resolveTunnelPropColorState,
  tunnelPropColor,
  type TunnelPropColorMode,
  type TunnelPropColorPair,
  type TunnelPropColorState,
} from "./tunnel-prop-colors";
import { getBaseMotionColors } from "$lib/shared/animation-engine/services/svg-generator";
import {
  createIndependentTunnelPerformer,
  createTunnelComposition,
  tunnelLayerCycleSteps,
  type TunnelComposition,
} from "./tunnel-composition";
import {
  loadTunnelViewState,
  saveTunnelViewState,
  type TunnelViewState,
} from "./tunnel-view-state";
import {
  consumeStagedViewerCustomColors,
  ensureViewerCustomColorPreference,
  loadViewerCustomColorPreference,
  saveViewerCustomColorPreference,
} from "../services/viewer-custom-color-preferences";
import {
  createViewerCustomColorState,
  type ViewerCustomColorState,
} from "../state/viewer-custom-colors-state.svelte";

const DEFAULT_PROP_STATE: PropState = {
  centerPathAngle: 0,
  staffRotationAngle: 0,
};

export interface TunnelControllerSources {
  /** The viewer's currently open sequence. */
  getSequence: () => SequenceData | null | undefined;
  /** An authored cast. Absent keeps the classic one-sequence tunnel path. */
  getComposition?: () => TunnelComposition | null | undefined;
  /** Receives the exact baked layer objects used by the animation canvas. */
  onLayersChange?: (layers: readonly BuiltTunnelLayer[]) => void;
  /** Scoped motion-presentation owner for embedded editors. When supplied, its
   * effort and grid visibility are shared with the Tunnel. */
  visibilityManager?: AnimationVisibilityStateManager;
  /** Embedded editors must not rewrite the viewer's last-used view state. */
  persistViewState?: boolean;
  /** A URL-seeded view state (the `tn` slice). Takes the place of
   *  `loadTunnelViewState()` entirely so a shared link's kaleidoscope never
   *  reads the recipient's disk. Callers that pass this SHOULD also pass
   *  `persistViewState: false` — the seam only replaces the read; it does not
   *  itself suppress the write. */
  initialViewState?: TunnelViewState;
  /** A parent-scoped pair shared with another art controller. */
  customColorState?: ViewerCustomColorState;
  /** Keep a viewer's formation baked while 2D is showing so returning to
   * Tunnel can reverse the existing reveal instead of rebuilding in public. */
  prepareWhileInactive?: boolean;
}

/** Reduced motion caps a dense ring so a heavy kaleidoscope doesn't spin for
 *  users who asked for less motion. */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export class TunnelViewController {
  /** Prop count at/above which a config is a "large stack" (advisory frame-drop
   *  warning). */
  static readonly LARGE_STACK_PROPS = 16;

  // Tunnel sub-mode on/off (speed + play/pause ride the pane's existing transport).
  active = $state(false);

  // ── Primitive config (individual fields so the rebuild effect can depend on
  //    the SPATIAL primitives only — stagger/speed tweaks never re-bake). ──
  /** Rotational arms (cyclic order). */
  fold = $state<number>(DEFAULT_CONFIG.fold);
  /** Reflect across the vertical axis (dihedral). */
  mirror = $state<boolean>(DEFAULT_CONFIG.mirror);
  /** Reflect across the horizontal axis (N↔S). */
  flip = $state<boolean>(DEFAULT_CONFIG.flip);
  /** Alternate arms motion-invert (opposite spin). */
  invert = $state<boolean>(DEFAULT_CONFIG.invert);
  /** Alternate arms run time-reversed. */
  echo = $state<boolean>(DEFAULT_CONFIG.echo);
  /** Arm k shows the sequence offset by k×this steps (0 = off). */
  staggerSteps = $state<number>(DEFAULT_CONFIG.staggerSteps);
  /** Per-performer speed overrides (arm 1..n → multiplier); absent arm = 1×. The
   *  single source of truth for speed (fills just populate it). */
  speedOverrides = $state<Record<number, number>>({
    ...DEFAULT_CONFIG.speedOverrides,
  });
  /** The performer selected in the Speed drawer (0 = you, 1..n = copies), or null.
   *  Transient UI focus — NOT part of the config/persistence; drives the sidebar
   *  highlight + the render spotlight-dim. */
  selectedArm = $state<number | null>(null);
  /** The authored card selected in the creator. Every formation arm driven by
   * that stable performer ID stays bright together. This is workspace focus,
   * not saved choreography or presentation state. */
  selectedPerformerId = $state<string | null>(null);

  /**
   * The grid is one canvas layer, even when Tunnel adds performers to it.
   * Viewer and creator hosts provide their animation visibility owner so the
   * 2D and Tunnel controls cannot disagree. Standalone previews keep the
   * snapshot-local fallback because they have no surrounding animation scope.
   */
  #gridVisible = $state(false);

  get gridVisible(): boolean {
    return this.#gridVisible;
  }

  set gridVisible(visible: boolean) {
    if (this.#gridVisible === visible) return;
    this.#gridVisible = visible;
    this.#sources.visibilityManager?.setGridMode(visible ? "8point" : "none");
  }

  /** One explicit appearance mode plus the last authored exact pair. Keeping
   * the pair while another mode is active lets authors compare looks without
   * losing their values. */
  colorMode = $state<TunnelPropColorMode>("spectrum");
  performerColors = $state<Record<string, TunnelPerformerColors>>({});
  readonly customColorState: ViewerCustomColorState;

  get customPropColors(): TunnelPropColorPair {
    return this.customColorState.colors;
  }

  get colors(): TunnelPropColorState {
    return {
      mode: this.colorMode,
      custom: { ...this.customPropColors },
      ...(Object.keys(this.performerColors).length
        ? { performers: this.performerColors }
        : {}),
    };
  }

  set colors(value: TunnelPropColorState) {
    const resolved = resolveTunnelPropColorState(value);
    this.colorMode = resolved.mode;
    this.performerColors = resolved.performers ?? {};
    this.customColorState.hydrate(resolved.custom);
  }

  /** Compatibility for older preview/test callers. New Tunnel authoring code
   * uses `colorMode` so Custom cannot be collapsed into a boolean. */
  get spectrum(): boolean {
    return this.colorMode === "spectrum";
  }

  set spectrum(value: boolean) {
    this.colorMode = value ? "spectrum" : "hands";
  }

  get exactPropColors(): TunnelPropColorPair | null {
    return buildTunnelRenderColors(
      this.colors,
      this.colorStage.map((row) => row.id),
      getBaseMotionColors()
    );
  }

  get colorStage(): Array<{ id: string; label: string; arm: number }> {
    const composition = this.#sources.getComposition?.();
    if (composition) {
      const labels = new Map(
        composition.performers.map((p) => [p.id, p.label])
      );
      const instances = this.#layers.length
        ? this.#layers
        : composition.stage.instances;
      return instances.map((instance) => ({
        id: instance.performerId,
        arm: instance.arm,
        label: labels.get(instance.performerId) ?? "Performer",
      }));
    }
    return Array.from({ length: imageCount(this.config) }, (_, arm) => ({
      id: `arm:${arm}`,
      arm,
      label: `Performer ${arm + 1}`,
    }));
  }

  get colorPerformers(): Array<{ id: string; label: string }> {
    return [...new Map(this.colorStage.map((row) => [row.id, row])).values()];
  }

  setPerformerColors(id: string, value: TunnelPerformerColors | null): void {
    const next = value
      ? { ...this.performerColors, [id]: normalizePerformerColors(value) }
      : { ...this.performerColors };
    if (!value) delete next[id];
    this.performerColors = next;
  }

  setCustomPropColor(hand: "left" | "right", value: string): void {
    this.customColorState.setColor(hand, value);
  }

  /** Active rail section in the Art settings panel, persisted with the view
   *  state so the panel reopens on the section the user last used. */
  section = $state<TunnelViewState["section"]>("tunnel");
  /** Recipe provenance stays attached while the values are edited. It describes
   * the configuration only; it never authors extra choreography performers. */
  presetRecipe = $state<TunnelPresetRecipe | null>(null);
  /** Transient Look-panel disclosure. It is not saved choreography or a global
   * preference; the controller only keeps it stable across panel remounts. */
  lookEditorOpen = $state(false);

  #sources: TunnelControllerSources;
  #layers = $state<BuiltTunnelLayer[]>([]);
  #layersReady = $state(false);
  #buildToken = 0;
  buildError = $state<string | null>(null);

  constructor(sources: TunnelControllerSources) {
    this.#sources = sources;

    // Restore the last-left config before any effect wires up, clamped to the
    // live budget (a persisted dense ring shrinks under reduced motion). A
    // `tn`-slice seed replaces the disk read outright — never merged with it —
    // so a shared link never picks up the recipient's own leftover state.
    const view = sources.initialViewState ?? loadTunnelViewState();
    const persistViewState = sources.persistViewState ?? true;
    if (sources.customColorState) {
      this.customColorState = sources.customColorState;
    } else {
      const stagedColors = consumeStagedViewerCustomColors();
      const preferenceColors = persistViewState
        ? ensureViewerCustomColorPreference()
        : loadViewerCustomColorPreference(undefined, false);
      this.customColorState = createViewerCustomColorState(
        stagedColors ?? preferenceColors,
        persistViewState ? saveViewerCustomColorPreference : undefined
      );
    }
    if (sources.initialViewState && !sources.customColorState) {
      // A seeded link carries the sender's exact pair; the freshly built
      // (non-saving, given persistViewState:false) custom-color state must
      // show it instead of the recipient's preference. A caller-supplied
      // shared state is never overwritten from a seed.
      this.customColorState.hydrate(sources.initialViewState.colors.custom);
    }
    const requestedConfig =
      sources.getComposition?.()?.formation ?? view.config;
    const cfg = clampConfig(requestedConfig, this.#maxImages());
    this.fold = cfg.fold;
    this.mirror = cfg.mirror;
    this.flip = cfg.flip;
    this.invert = cfg.invert;
    this.echo = cfg.echo;
    this.staggerSteps = cfg.staggerSteps;
    this.speedOverrides = { ...cfg.speedOverrides };
    this.#gridVisible =
      sources.visibilityManager?.isGridVisible() ?? view.gridVisible;
    this.colorMode = view.colors.mode;
    this.performerColors = view.colors.performers ?? {};
    this.section = view.section;
    this.presetRecipe = cloneTunnelPresetRecipe(view.presetRecipe);

    if (sources.visibilityManager) {
      $effect(() => {
        const syncGridVisibility = () => {
          this.#gridVisible = sources.visibilityManager!.isGridVisible();
        };
        sources.visibilityManager!.registerObserver(syncGridVisibility);
        syncGridVisibility();
        return () =>
          sources.visibilityManager!.unregisterObserver(syncGridVisibility);
      });
    }

    // Persist the live view state on change.
    if (persistViewState) {
      $effect(() => {
        const snapshot: TunnelViewState = {
          config: this.config,
          gridVisible: this.gridVisible,
          colors: this.colors,
          section: this.section,
          presetRecipe: this.presetRecipe,
        };
        saveTunnelViewState(snapshot);
      });
    }

    // Drop a stale spotlight when the cast shrinks (e.g. fold 8 → 2) so a
    // dangling selectedArm can't dim every performer at once.
    $effect(() => {
      if (this.selectedArm != null && this.selectedArm >= this.performerCount) {
        this.selectedArm = null;
      }
      if (
        this.selectedPerformerId &&
        this.#layers.length > 0 &&
        !this.#layers.some(
          (layer) => layer.performerId === this.selectedPerformerId
        )
      ) {
        this.selectedPerformerId = null;
      }
    });

    // Re-bake the overlaid copies when the SPATIAL topology changes (sequence /
    // fold / mirror / flip / invert / echo). Stagger + Speed are read ONLY in
    // the sample path (copyModulators), so tweaking them never lands here and
    // never re-runs the transforms. Transport changes never rebuild either.
    $effect(() => {
      const seq = this.#sources.getSequence();
      const authored = this.#sources.getComposition?.() ?? null;
      const spatial: TunnelConfig = {
        fold: this.fold,
        mirror: this.mirror,
        flip: this.flip,
        invert: this.invert,
        echo: this.echo,
        staggerSteps: 0,
        speedOverrides: {},
      };
      const shouldPrepare = this.#sources.prepareWhileInactive
        ? true
        : this.active;
      if (!shouldPrepare || !seq) {
        this.#layers = [];
        this.#layersReady = false;
        this.#sources.onLayersChange?.([]);
        this.buildError = null;
        return;
      }
      const composition =
        authored ??
        createTunnelComposition(
          [createIndependentTunnelPerformer(seq, 0, "You")],
          {
            id: `viewer-${seq.id}`,
            name: seq.name || seq.word || "Untitled sequence",
            formation: spatial,
            legacyGeneratedStage: true,
          }
        );
      const token = ++this.#buildToken;
      this.#layersReady = false;
      void buildTunnelCompositionLayers(composition, spatial)
        .then((layers) => {
          if (token !== this.#buildToken) return;
          this.#layers = layers;
          this.#layersReady = true;
          this.#sources.onLayersChange?.(layers);
          this.buildError = null;
        })
        .catch((error) => {
          if (token !== this.#buildToken) return;
          this.#layers = [];
          this.#layersReady = false;
          this.#sources.onLayersChange?.([]);
          this.buildError =
            error instanceof Error
              ? error.message
              : "The tunnel could not be built.";
        });
    });
  }

  /** A reveal may start only after every copy has a sampled layer. Otherwise
   * the completed build joins an already-visible canvas as a one-frame pop. */
  get layersReady(): boolean {
    return this.#layersReady;
  }

  /** The live config as a plain object (for propCount / persistence / key). */
  get config(): TunnelConfig {
    return {
      fold: this.fold,
      mirror: this.mirror,
      flip: this.flip,
      invert: this.invert,
      echo: this.echo,
      staggerSteps: this.staggerSteps,
      speedOverrides: { ...this.speedOverrides },
    };
  }

  /** On-screen prop count. Formation capacity can be larger than occupancy. */
  propCount = $derived(this.performerCount * 2);

  /** Exact number of occupied stage positions. Classic Viewer tunnels retain
   * their historical behavior and occupy every generated formation arm.
   * A getter (not a `$derived` field) so it doesn't touch `#sources` during
   * field initialization; still reactive when read in a template/derived
   * because it reads the reactive composition and config. */
  get performerCount(): number {
    return (
      this.#sources.getComposition?.()?.stage.instances.length ??
      imageCount(this.config)
    );
  }

  /** Number of positions the current formation recipe makes available. */
  formationSlotCount = $derived(imageCount(this.config));

  /** Number of authored performers that must fit into the current formation. */
  get authoredPerformerCount(): number {
    return this.#sources.getComposition?.()?.performers.length ?? 1;
  }

  get requiredStageInstanceCount(): number {
    return this.#sources.getComposition?.()?.stage.instances.length ?? 1;
  }

  /** Stable signature (export filename suffix + build dedup). */
  configKey = $derived(configKey(this.config));

  /** Compat shim: ArtPane reads `activeLook.id` for the export-filename suffix.
   *  The named-look era is gone; the config signature is the stable key now.
   *  TODO: migrate ArtPane to `controller.configKey` and delete this. */
  get activeLook(): { id: string } {
    return { id: this.configKey };
  }

  /** Largest stagger offset that reads on the current sequence (its length − 1;
   *  a full-length offset wraps back to 0). A getter (not a `$derived` field) so
   *  it doesn't touch `#sources` during field initialization; still reactive when
   *  read in a template/derived because it reads the reactive sequence. */
  get staggerMax(): number {
    const longest = this.#layers.reduce(
      (max, layer) => Math.max(max, layer.sequence.steps.length),
      this.#sources.getSequence()?.steps?.length ?? 1
    );
    return Math.max(0, longest - 1);
  }

  /** Image budget for the live dock (reduced motion tightens it). */
  #maxImages(): number {
    return prefersReducedMotion() ? MAX_IMAGES_RM : MAX_IMAGES;
  }

  /** The selected mandala preset id, or null when the config is a custom tweak
   *  (drives the Presets surface highlight + the "Custom" card). */
  activePresetId = $derived(matchPreset(this.config));

  presetRecipeModified = $derived(
    isTunnelPresetRecipeModified(this.presetRecipe, this.config)
  );

  /** Set the whole config (clamped to the live budget). */
  #setConfig(cfg: TunnelConfig): boolean {
    const c = clampConfig(cfg, this.#maxImages());
    if (imageCount(c) < this.requiredStageInstanceCount) return false;
    this.fold = c.fold;
    this.mirror = c.mirror;
    this.flip = c.flip;
    this.invert = c.invert;
    this.echo = c.echo;
    this.staggerSteps = c.staggerSteps;
    this.speedOverrides = { ...c.speedOverrides };
    return true;
  }

  /** Select a curated built-in mandala preset (the primary surface). */
  applyPreset(id: string): void {
    const p = getPreset(id);
    const recipe = builtInTunnelPresetRecipe(id);
    if (p && recipe && this.#setConfig(p.config)) this.presetRecipe = recipe;
  }

  /** Apply a raw config. Snapshot restore supplies its retained recipe; a raw
   * edit deliberately keeps the existing recipe origin and becomes modified. */
  applyConfig(
    cfg: TunnelConfig,
    recipe: TunnelPresetRecipe | null | undefined = undefined
  ): void {
    if (this.#setConfig(cfg) && recipe !== undefined) {
      this.presetRecipe = cloneTunnelPresetRecipe(recipe);
    }
  }

  applyUserPreset(id: string, name: string, config: TunnelConfig): void {
    if (this.#setConfig(config)) {
      this.presetRecipe = savedTunnelPresetRecipe(id, name, config);
    }
  }

  resetPresetRecipe(): void {
    if (!this.presetRecipe) return;
    this.#setConfig(this.presetRecipe.config);
  }

  /** Apply a generator change (fold/mirror/flip) clamped to the live budget so a
   *  dense combo can't exceed the perf ceiling. The prop-count readout makes any
   *  clamp visible — no silent lie. */
  #applyGenerators(
    next: Partial<Pick<TunnelConfig, "fold" | "mirror" | "flip">>
  ): void {
    const clamped = clampConfig({ ...this.config, ...next }, this.#maxImages());
    if (imageCount(clamped) < this.requiredStageInstanceCount) return;
    this.fold = clamped.fold;
    this.mirror = clamped.mirror;
    this.flip = clamped.flip;
  }

  setFold(fold: number): void {
    this.#applyGenerators({ fold });
  }
  setMirror(on: boolean): void {
    this.#applyGenerators({ mirror: on });
  }
  setFlip(on: boolean): void {
    this.#applyGenerators({ flip: on });
  }

  // Modulators add no copies, so they never clamp.
  setInvert(on: boolean): void {
    this.invert = on;
  }
  setEcho(on: boolean): void {
    this.echo = on;
  }
  /** Apply a one-tap speed fill — writes concrete per-performer overrides across
   *  the current copies (the drawer then shows + edits them). */
  applySpeedFill(kind: SpeedFill): void {
    const filled = speedFill(kind, imageCount(this.config));
    const occupiedArms =
      this.#sources
        .getComposition?.()
        ?.stage.instances.map((instance) => instance.arm) ??
      Array.from({ length: imageCount(this.config) }, (_, arm) => arm);
    this.speedOverrides = Object.fromEntries(
      occupiedArms.flatMap((arm) =>
        filled[arm] === undefined ? [] : [[arm, filled[arm]!]]
      )
    );
  }
  /** Pin one visible stage appearance's speed. The UI addresses rows by their
   * display order; the override is stored against its actual formation arm. */
  setPerformerSpeed(layerIndex: number, rate: number): void {
    if (layerIndex < 0) return;
    const arm =
      this.#layers[layerIndex]?.arm ??
      this.#sources.getComposition?.()?.stage.instances[layerIndex]?.arm ??
      layerIndex;
    const next = { ...this.speedOverrides };
    if (rate === 1) delete next[arm];
    else next[arm] = rate;
    this.speedOverrides = next;
  }
  /** Back to every copy at 1× and clear the selection. */
  resetSpeed(): void {
    this.speedOverrides = {};
    this.selectedArm = null;
    this.selectedPerformerId = null;
  }
  /** True when any performer runs at a non-1× rate (drives the Reset affordance). */
  hasSpeedOverrides = $derived(Object.keys(this.speedOverrides).length > 0);
  /** Steps on the shared clock before every independently looping performer
   *  returns to its starting phase. */
  loopSteps = $derived.by(() => {
    if (this.#layers.length === 0) {
      return Math.max(1, this.#sources.getSequence()?.steps.length ?? 1);
    }
    return tunnelLayerCycleSteps(
      this.#layers.map((layer) => ({
        sequence: layer.sequence,
        speed: this.#samplingTimingForLayer(layer).speed,
      }))
    );
  });

  /** Base loops the shared playhead must span before every performer returns to
   *  its home phase together. Retained for the settings and export consumers
   *  that describe duration in base-sequence loops. */
  loopCycles = $derived.by(() => {
    const baseSteps = Math.max(
      1,
      this.#layers[0]?.sequence.steps.length ??
        this.#sources.getSequence()?.steps.length ??
        1
    );
    return Math.max(1, Math.ceil(this.loopSteps / baseSteps));
  });
  /** Toggle the spotlight selection for a performer (click again to clear). */
  selectPerformer(arm: number): void {
    this.selectedPerformerId = null;
    this.selectedArm = this.selectedArm === arm ? null : arm;
  }
  /** Select one authored card without pretending its generated formation arms
   * are additional authored performers. */
  selectAuthoredPerformer(performerId: string | null): void {
    this.selectedArm = null;
    this.selectedPerformerId =
      performerId && performerId !== this.selectedPerformerId
        ? performerId
        : null;
  }
  spotlightLayers = $derived.by(() => {
    if (!this.selectedPerformerId) return this.selectedArm;
    return this.#layers.flatMap((layer, arm) =>
      layer.performerId === this.selectedPerformerId ? [arm] : []
    );
  });
  /** Per-appearance speed rows in visible overlay order. */
  speedPerformers = $derived.by(() => {
    const cfg = this.config;
    const composition = this.#sources.getComposition?.() ?? null;
    const performerLabels = new Map(
      composition?.performers.map((performer) => [
        performer.id,
        performer.label,
      ]) ?? []
    );
    const rows =
      this.#layers.length > 0
        ? this.#layers.map((layer) => ({
            arm: layer.arm,
            label: layer.performerLabel,
          }))
        : composition
          ? composition.stage.instances.map((instance) => ({
              arm: instance.arm,
              label:
                performerLabels.get(instance.performerId) ?? "Stage appearance",
            }))
          : Array.from({ length: imageCount(cfg) }, (_, arm) => ({
              arm,
              label: arm === 0 ? "You" : `Copy ${arm}`,
            }));
    const layerCount = Math.max(0, rows.length - 1);
    const handColors = getBaseMotionColors();
    const exactColors = this.exactPropColors;
    return rows.map((row, i) => ({
      arm: i,
      label: row.label,
      rate: effectiveSpeed(cfg, row.arm),
      leftHex: exactColors
        ? tunnelPerformerPair(exactColors, i).left
        : i === 0 || !this.spectrum
          ? handColors.left
          : tunnelPropColor(i * 2, layerCount).hex,
      rightHex: exactColors
        ? tunnelPerformerPair(exactColors, i).right
        : i === 0 || !this.spectrum
          ? handColors.right
          : tunnelPropColor(i * 2 + 1, layerCount).hex,
    }));
  });
  /** Set the canon offset, clamped to the sequence (the sampler also wraps). */
  setStagger(steps: number): void {
    this.staggerSteps = Math.max(0, Math.min(steps, this.staggerMax));
  }

  /** True when the live config is a large stack — advisory (a heavy effect may
   *  drop frames on weaker devices); not a hard cap. */
  heavyLoad = $derived(
    this.active && this.propCount >= TunnelViewController.LARGE_STACK_PROPS
  );

  /** Honor the global Effort preset so the sidebar's Effort section shapes the
   *  tunnel's motion — same easing the 2D engine applies to step progress. */
  #ease = (progress: number): number =>
    applyEffort(
      (
        this.#sources.visibilityManager ?? getAnimationVisibilityManager()
      ).getEffortPreset(),
      progress
    );

  /** Base (un-transformed) sequence prop states at the playhead — the center
   *  pair of the kaleidoscope. currentStep is 1-indexed fractional (start < 1). */
  basePropsAt(currentStep: number): { left: PropState; right: PropState } {
    const layer = this.#layers[0];
    const seq = layer?.sequence ?? this.#sources.getSequence();
    if (!seq)
      return {
        left: { ...DEFAULT_PROP_STATE },
        right: { ...DEFAULT_PROP_STATE },
      };
    const timing = layer
      ? this.#samplingTimingForLayer(layer)
      : { offset: 0, speed: this.speedOverrides[0] ?? 1 };
    return sampleTunnelProps(
      seq,
      currentStep,
      this.#ease,
      timing.offset,
      timing.speed
    );
  }

  /** The performed cell for each authored card at this exact canvas frame. */
  authoredPerformerStepIndicesAt(currentStep: number): Record<string, number> {
    const indices: Record<string, number> = {};
    for (const layer of this.#layers) {
      // A generated formation copy can be staggered away from its source card.
      // One card gets one border, so follow that performer's first authored
      // stage instance rather than flashing several contradictory cells.
      if (indices[layer.performerId] !== undefined) continue;
      const timing = this.#samplingTimingForLayer(layer);
      const index = tunnelStepIndexAt(
        layer.performerSequence.steps.length,
        currentStep,
        timing.offset,
        timing.speed
      );
      if (index !== null) indices[layer.performerId] = index;
    }
    return indices;
  }

  #samplingTimingForLayer(layer: BuiltTunnelLayer): {
    offset: number;
    speed: number;
  } {
    const arm = layer.arm;
    if (arm === 0) {
      return {
        offset: layer.stepOffset,
        speed: layer.speed * (this.speedOverrides[0] ?? 1),
      };
    }
    const mod = copyModulators(this.config)[arm - 1] ?? {
      staggerSteps: 0,
      speed: 1,
    };
    return {
      offset: layer.stepOffset + mod.staggerSteps,
      speed: layer.speed * mod.speed,
    };
  }

  /** Per-copy prop states at the live playhead, each shifted by its Stagger +
   *  Speed modulator. 1-indexed fractional currentStep. The modulators align
   *  against each layer's explicit formation arm. */
  additionalLayersAt(currentStep: number): AdditionalLayerProps[] {
    if (!this.active) return [];
    return this.preparedAdditionalLayersAt(currentStep);
  }

  /**
   * The same sampled copies used by Tunnel, available while 2D is still visible.
   * The animation engine uses these only to prepare their prop sprites; they do
   * not join the rendered frame until the shared reveal starts.
   */
  preparedAdditionalLayersAt(currentStep: number): AdditionalLayerProps[] {
    return this.#layers.slice(1).map((layer) => {
      const timing = this.#samplingTimingForLayer(layer);
      const p = sampleTunnelProps(
        layer.sequence,
        currentStep,
        this.#ease,
        timing.offset,
        timing.speed
      );
      // Every copy inherits the viewer's global prop — a layer carries no explicit
      // per-hand prop type, so the engine falls back to the global prop (the same
      // rule the center pair uses). The `AdditionalLayerProps` per-layer prop-type
      // fields stay optional/unused: the shared additional-layers plumbing keeps
      // them for other callers, but the tunnel never sets them.
      return {
        leftProp: p.left,
        rightProp: p.right,
      } satisfies AdditionalLayerProps;
    });
  }
}
