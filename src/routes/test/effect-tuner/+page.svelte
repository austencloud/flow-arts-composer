<!--
  Effect Tuner — pick sensible shipped defaults for all 16 effects (dev only).

  Built from the viewer's own pieces so the tuner shows exactly what users see:
    • Stage    — the viewer's tunnel stage (TunnelArtView). One performer is the
                 tunnel switched off; Tunnel turns on the same formation copies
                 the viewer draws, picked with the viewer's formation browser.
                 Grid, playback mode and the rest live in its right-click menu.
    • Playback — the effects panel's own tempo (BPM) and transport bar.
    • Sequence — the shared sequence picker, or a fresh generated sequence.
    • Effects  — the production EffectsPanel.
  Tune via the panel, then Save writes the active effect's intent into
  DEFAULT_EFFECTS_CONFIG (or the chosen preset) through the dev-only endpoint.

  Everything is sandboxed: effects config (persist:false), visibility and grid
  (ephemeral), trail settings (ephemeral) and the tunnel view (never saved), so
  tuning here never touches the user's real app settings.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/env";
  import EffectsPanel from "#lib/shared/animation-engine/components/effects-panel/EffectsPanel.svelte";
  import EffectsPlaybackBar from "#lib/shared/animation-engine/components/effects-panel/EffectsPlaybackBar.svelte";
  import TunnelArtView from "#lib/shared/sequence-viewer/tunnel/TunnelArtView.svelte";
  import TunnelPresetBrowser from "#lib/shared/sequence-viewer/components/art-settings/TunnelPresetBrowser.svelte";
  import { TunnelViewController } from "#lib/shared/sequence-viewer/tunnel/tunnel-view-controller.svelte.js";
  import { DEFAULT_TUNNEL_VIEW_STATE } from "#lib/shared/sequence-viewer/tunnel/tunnel-view-state.js";
  import {
    DEFAULT_CONFIG,
    type TunnelConfig,
  } from "#lib/shared/sequence-viewer/tunnel/tunnel-config.js";
  import { ensureMotionData } from "#lib/shared/sequence-viewer/services/sequence-motion-loader.js";
  import SequencePickerModal from "#lib/shared/components/sequence-picker/SequencePickerModal.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import { generationOrchestrator } from "#lib/shared/create/services/generation-orchestrator.js";
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { DifficultyLevel } from "#lib/shared/foundation/domain/models/generation/generate-models.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import {
    AnimationVisibilityStateManager,
    type GridMode as GridVisibilityMode,
  } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";
  import { createAnimationSettingsState } from "#lib/shared/animation-engine/state/animation-settings-state.svelte.js";
  import {
    createEffectsConfigState,
    isEffectId,
    type EffectId,
  } from "#lib/shared/effects/state/effects-config-state.svelte.js";
  import { setEffectsConfigContext } from "#lib/shared/effects/state/effects-config-context.js";
  import BentoPropGrid from "#lib/shared/settings/components/tabs/prop-type/BentoPropGrid.svelte";
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import { getRegistration } from "#lib/shared/animation-engine/components/effects-panel/effect-registry.js";
  import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
  import type { EffectsConfig } from "#lib/shared/effects/domain/effects-config.js";
  import type { EffectPreset } from "#lib/shared/animation-engine/components/effects-panel/presets/types.js";

  type View = "single" | "tunnel";

  /** The players' own default tempo (AnimationPlayer, TunnelArtView). */
  const DEFAULT_BPM = 60;
  /** Radial (4 copies) is a denser overlap check than the viewer's Duo default. */
  const DEFAULT_TUNNEL_CONFIG: TunnelConfig = { ...DEFAULT_CONFIG, fold: 4 };

  const viewOptions = [
    { value: "single" as const, label: "One performer" },
    { value: "tunnel" as const, label: "Tunnel" },
  ];

  // ── Recovery: survive the save-induced reload ───────────────────────────────
  // Saving writes effect source (defaults.ts / a preset file); Vite then reloads
  // this page. Mirror the tuner state into sessionStorage and rehydrate it on
  // the next mount so a save lands back on the same effect, target and motion.
  const RECOVERY_KEY = "tka_effect_tuner_recovery";
  const RECOVERY_FRESH_MS = 60_000;

  type SaveTarget =
    | { kind: "default" }
    | { kind: "preset"; id: string; name: string };

  type Recovery = {
    v: 2;
    t: number;
    view: View;
    tunnel: TunnelConfig;
    gridMode: GridVisibilityMode;
    bpm: number;
    playing: boolean;
    propType: PropType;
    saveTarget: SaveTarget;
    config: EffectsConfig;
    sequence: SequenceData | null;
  };

  function readRecovery(): Recovery | null {
    if (!browser) return null;
    try {
      const raw = sessionStorage.getItem(RECOVERY_KEY);
      if (!raw) return null;
      const r = JSON.parse(raw) as Recovery;
      if (r?.v !== 2 || typeof r.t !== "number") return null;
      if (Date.now() - r.t > RECOVERY_FRESH_MS) {
        sessionStorage.removeItem(RECOVERY_KEY);
        return null;
      }
      return r;
    } catch {
      return null;
    }
  }

  const recovered = readRecovery();

  // ── Sandboxed owners ────────────────────────────────────────────────────────
  // persist:false → never reads or writes the user's tka_effects_config.
  const effectsConfig = createEffectsConfigState(undefined, { persist: false });
  setEffectsConfigContext(effectsConfig);
  if (recovered?.config) effectsConfig.replace(recovered.config);

  // Grid, effort and playback mode from the canvas menu land here, not in the
  // user's saved visibility settings.
  const visibility = new AnimationVisibilityStateManager({ ephemeral: true });
  if (recovered?.gridMode) visibility.setGridMode(recovered.gridMode);

  // Trail tracking and length start from the shipped defaults, which is what a
  // new user sees, and never autosave.
  const tunerAnimationSettings = createAnimationSettingsState({
    ephemeral: true,
  });

  let sequence = $state<SequenceData | null>(recovered?.sequence ?? null);
  let view = $state<View>(recovered?.view ?? "single");
  let bpm = $state(recovered?.bpm ?? DEFAULT_BPM);
  let playing = $state(recovered?.playing ?? true);
  let currentStep = $state(1);
  let propType = $state<PropType>(recovered?.propType ?? PropType.STAFF);
  let pickerOpen = $state(false);
  let loading = $state<string | null>(null);
  let errorMsg = $state<string | null>(null);

  const controller = new TunnelViewController({
    getSequence: () => sequence,
    initialViewState: {
      ...DEFAULT_TUNNEL_VIEW_STATE,
      config: recovered?.tunnel ?? DEFAULT_TUNNEL_CONFIG,
    },
    persistViewState: false,
    visibilityManager: visibility,
  });

  $effect(() => {
    controller.active = view === "tunnel";
  });

  $effect(() => {
    tunerAnimationSettings.setCurrentPropType(String(propType));
  });

  // ── Sequence source ─────────────────────────────────────────────────────────
  async function generateSequence() {
    loading = "Generating a sequence…";
    errorMsg = null;
    try {
      sequence = await generationOrchestrator.generateSequence({
        length: 8,
        gridMode: GridMode.DIAMOND,
        propType: PropType.STAFF, // generation prop is irrelevant; the render prop is separate
        difficulty: DifficultyLevel.INTERMEDIATE,
        constraintPreset: "smooth",
      });
      currentStep = 1;
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : String(e);
    } finally {
      loading = null;
    }
  }

  async function pickSequence(picked: SequenceData) {
    pickerOpen = false;
    loading = `Loading ${picked.word || "sequence"}…`;
    errorMsg = null;
    try {
      const full = await ensureMotionData(picked);
      if (!full) throw new Error("That sequence has no motion data.");
      sequence = full;
      currentStep = 1;
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : String(e);
    } finally {
      loading = null;
    }
  }

  // ── Transport (the tunnel stage owns its clock; these move its playhead) ────
  function stepBy(direction: 1 | -1, size: number) {
    const loop = controller.loopSteps;
    const beat = currentStep - 1;
    const snapped =
      direction > 0
        ? Math.floor(beat / size + 1e-6) * size + size
        : Math.ceil(beat / size - 1e-6) * size - size;
    currentStep = (((snapped % loop) + loop) % loop) + 1;
  }

  // ── Save target: base default vs a specific preset (sticky) ─────────────────
  // The picker holds its OWN target so a slider tweak (which clears the panel's
  // active-preset chip) never silently retargets the base default.
  type WriteFn = (effectId: string, patch: unknown) => void;
  type PresetFn = (effectId: string, presetId: string, patch: unknown) => void;

  const activeEffect = $derived(effectsConfig.activeEffect);
  let saveTarget = $state<SaveTarget>(
    recovered?.saveTarget ?? { kind: "default" }
  );
  let menuOpen = $state(false);

  // Presets the tuner can write to: exclude "Custom" (previewColor "custom" — its
  // job is to open a blank Customize panel; a full-patch write would break that).
  const targetablePresets = $derived<EffectPreset[]>(
    activeEffect === "none"
      ? []
      : (getRegistration(activeEffect)?.presetGroup.presets ?? []).filter(
          (p) => p.previewColor !== "custom"
        )
  );
  const targetLabel = $derived(
    saveTarget.kind === "default" ? "Base default" : saveTarget.name
  );

  // Switching effect resets the target to that effect's base default. The FIRST
  // run is a no-op so a target restored after a save-induced reload survives.
  let targetEffectTracker: string | null = null;
  $effect(() => {
    const ae = activeEffect;
    if (targetEffectTracker === ae) return;
    const first = targetEffectTracker === null;
    targetEffectTracker = ae;
    if (first) return;
    saveTarget = { kind: "default" };
    menuOpen = false;
  });

  // Picking a panel "Choose a Look" chip activates a preset → follow it. A tweak
  // clears activePresets; the target intentionally stays sticky.
  $effect(() => {
    if (activeEffect === "none") return;
    const id =
      effectsConfig.activePresets[
        activeEffect as keyof typeof effectsConfig.activePresets
      ];
    if (!id) return;
    const p = targetablePresets.find((pp) => pp.id === id);
    if (p && !(saveTarget.kind === "preset" && saveTarget.id === id)) {
      saveTarget = { kind: "preset", id, name: p.name };
    }
  });

  function loadBase(fx: EffectId) {
    (effectsConfig.updateEffect as unknown as WriteFn)(
      fx,
      structuredClone(DEFAULT_EFFECTS_CONFIG[fx])
    );
  }

  function selectTarget(t: SaveTarget) {
    menuOpen = false;
    const fx = activeEffect;
    if (fx === "none" || !isEffectId(fx)) return;
    if (t.kind === "default") {
      loadBase(fx); // reset live intent to the factory default, clears the preset
      saveTarget = { kind: "default" };
      return;
    }
    const preset = targetablePresets.find((p) => p.id === t.id);
    if (!preset?.patch) return;
    loadBase(fx); // base first so non-patched fields show the true default
    (effectsConfig.applyPreset as unknown as PresetFn)(
      fx,
      t.id,
      structuredClone(preset.patch)
    );
    saveTarget = t;
  }

  // ── Recovery writes ─────────────────────────────────────────────────────────
  function persistRecovery() {
    if (!browser) return;
    try {
      const payload: Recovery = {
        v: 2,
        t: Date.now(),
        view,
        tunnel: $state.snapshot(controller.config) as TunnelConfig,
        gridMode: visibility.getGridMode(),
        bpm,
        playing,
        propType,
        saveTarget: $state.snapshot(saveTarget) as SaveTarget,
        config: $state.snapshot(effectsConfig.config) as EffectsConfig,
        sequence: $state.snapshot(sequence) as SequenceData | null,
      };
      sessionStorage.setItem(RECOVERY_KEY, JSON.stringify(payload));
    } catch {
      /* quota / non-serializable → recovery just won't fire, never crash */
    }
  }

  let persistTimer: ReturnType<typeof setTimeout> | null = null;
  $effect(() => {
    void view;
    void controller.config;
    void bpm;
    void playing;
    void propType;
    void saveTarget;
    void effectsConfig.version;
    void sequence;
    if (!browser) return;
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(persistRecovery, 250);
  });

  onMount(() => {
    // Open on a vivid effect so the stage isn't empty on first paint, unless a
    // restored session already set the active effect.
    if (!recovered) effectsConfig.setActiveEffect("bloom");
    if (!sequence) void generateSequence();

    // The canvas menu's grid choice lives on the sandboxed manager; observe it
    // so a refresh keeps it.
    const onVisibility = () => persistRecovery();
    visibility.registerObserver(onVisibility);
    const onBeforeUnload = () => persistRecovery();
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      if (persistTimer) clearTimeout(persistTimer);
      visibility.unregisterObserver(onVisibility);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  });

  // ── Save the active effect's live intent straight into defaults.ts ──────────
  // Posts to the dev-only write-back endpoint, which patches
  // DEFAULT_EFFECTS_CONFIG[<effect>] (or the preset) in place.
  let saving = $state(false);
  let saveStatus = $state("");

  async function saveAsDefault() {
    const fx = effectsConfig.activeEffect;
    if (fx === "none" || !isEffectId(fx)) {
      saveStatus = "Pick an effect first";
      return;
    }
    const intent = $state.snapshot(effectsConfig.effect(fx));
    const target =
      saveTarget.kind === "default" ? "default" : { preset: saveTarget.id };
    const label =
      saveTarget.kind === "default" ? "base default" : saveTarget.name;
    saving = true;
    saveStatus = `Saving ${fx} → ${label}…`;
    persistRecovery(); // flush a fresh snapshot NOW — the write below triggers the reload
    try {
      const res = await fetch("/test/effect-tuner/save-default", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ target, effect: fx, intent }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok)
        throw new Error(data.message ?? `${res.status} ${res.statusText}`);
      saveStatus = `Saved ${fx} → ${label} — ${data.file} ${data.changed ? "patched" : "(no change)"}`;
    } catch (e) {
      saveStatus = `Save failed: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      saving = false;
    }
  }

  // Manual paste fallback.
  function copyDefaultJson() {
    const fx = effectsConfig.activeEffect;
    if (fx === "none" || !isEffectId(fx)) {
      saveStatus = "Pick an effect first";
      return;
    }
    const json = JSON.stringify(
      $state.snapshot(effectsConfig.effect(fx)),
      null,
      2
    );
    void navigator.clipboard
      .writeText(json)
      .then(() => {
        saveStatus = `Copied ${fx} default (${json.length} chars)`;
      })
      .catch(() => {
        saveStatus = "Clipboard blocked — JSON logged to console";
        console.log(json);
      });
  }

  const sequenceLabel = $derived(
    sequence
      ? `${sequence.word || sequence.name || "Untitled"} · ${sequence.steps.length} beats`
      : "No sequence"
  );
</script>

<div class="page">
  <header>
    <h1>Effect Tuner</h1>
    <p class="sub">
      Judge on one performer, check the overlap in Tunnel, then save.
      Right-click the stage for grid and playback options.
    </p>
  </header>

  <div class="body">
    <aside class="side-col">
      <BentoPropGrid
        selectedPropType={propType}
        color="blue"
        title="Prop"
        variant="panel"
        onSelect={(p) => (propType = p)}
      />
      {#if view === "tunnel"}
        <div class="formation">
          <TunnelPresetBrowser
            {controller}
            dense={false}
            formationOnly
            presetLabel="Formation"
            showCustomCard={false}
            showCustomizeButton={false}
            showUserPresets={false}
            showGridControl={false}
          />
        </div>
      {/if}
    </aside>

    <div class="stage-col">
      <div class="toolbar">
        <div class="view-switch">
          <SegmentedControl
            options={viewOptions}
            value={view}
            onchange={(v) => (view = v)}
            size="sm"
            ariaLabel="Stage view"
          />
        </div>

        <div class="group">
          <span class="lbl">Sequence</span>
          <span class="seq-name">{sequenceLabel}</span>
          <PanelButton variant="secondary" onclick={() => (pickerOpen = true)}
            >Choose</PanelButton
          >
          <PanelButton
            variant="secondary"
            disabled={loading !== null}
            onclick={() => void generateSequence()}
          >
            New
          </PanelButton>
        </div>

        <div class="group push">
          <span class="lbl">Save to</span>
          <FilterChipBase
            mode="dropdown"
            label={targetLabel}
            active={true}
            disabled={activeEffect === "none"}
            expanded={menuOpen}
            onclick={() => (menuOpen = !menuOpen)}
          >
            <div class="target-menu">
              <button
                class="opt"
                class:sel={saveTarget.kind === "default"}
                onclick={() => selectTarget({ kind: "default" })}
              >
                <span class="opt-name">Base default</span>
                <span class="opt-sub">first value users see</span>
              </button>
              {#each targetablePresets as p (p.id)}
                <button
                  class="opt"
                  class:sel={saveTarget.kind === "preset" &&
                    saveTarget.id === p.id}
                  onclick={() =>
                    selectTarget({ kind: "preset", id: p.id, name: p.name })}
                >
                  <span class="opt-name">{p.name}</span>
                </button>
              {/each}
            </div>
          </FilterChipBase>
          <PanelButton
            variant="primary"
            disabled={activeEffect === "none" || saving}
            ariaBusy={saving}
            onclick={saveAsDefault}
          >
            {saving ? "Saving…" : "Save"}
          </PanelButton>
          <PanelButton
            variant="quiet"
            disabled={activeEffect === "none"}
            onclick={copyDefaultJson}
          >
            Copy JSON
          </PanelButton>
        </div>
      </div>

      <div class="stage-wrap">
        <div class="stage">
          {#if sequence}
            <TunnelArtView
              {sequence}
              {controller}
              {bpm}
              leftPropType={String(propType)}
              rightPropType={String(propType)}
              animationSettingsState={tunerAnimationSettings}
              visibilityManager={visibility}
              bind:playing
              bind:currentStep
              stageFit="contain"
            />
          {:else}
            <div class="placeholder">
              {loading ?? errorMsg ?? "No sequence"}
            </div>
          {/if}
        </div>
      </div>

      <div class="playback">
        <EffectsPlaybackBar
          {bpm}
          onBpmChange={(v) => (bpm = v)}
          isPlaying={playing}
          onPlaybackToggle={() => (playing = !playing)}
          onStepForward={() => stepBy(1, 1)}
          onStepBackward={() => stepBy(-1, 1)}
          onHalfStepForward={() => stepBy(1, 0.5)}
          onHalfStepBackward={() => stepBy(-1, 0.5)}
        />
      </div>

      <div class="status" aria-live="polite">
        {#if errorMsg}
          <span class="err">{errorMsg}</span>
        {:else if loading}
          {loading}
        {:else if saveStatus}
          {saveStatus}
        {/if}
      </div>
    </div>

    <aside class="panel-col">
      <EffectsPanel
        {bpm}
        onBpmChange={(v) => (bpm = v)}
        isPlaying={playing}
        onPlaybackToggle={() => (playing = !playing)}
        showPlayback={false}
        showTransport={false}
        layout="sidebar"
        animationSettingsState={tunerAnimationSettings}
      />
    </aside>
  </div>
</div>

<SequencePickerModal
  open={pickerOpen}
  onSelect={(picked) => void pickSequence(picked)}
  onClose={() => (pickerOpen = false)}
  title="Choose a sequence to tune on"
/>

<style>
  .page {
    height: 100dvh;
    display: flex;
    flex-direction: column;
    background: radial-gradient(circle at 30% 20%, #14141f 0%, #0a0a0f 70%);
    color: #e8e8f0;
    font-family: system-ui, sans-serif;
  }
  header {
    padding: 12px 20px 4px;
  }
  h1 {
    margin: 0;
    font-size: 1.3rem;
  }
  .sub {
    margin: 3px 0 0;
    opacity: 0.6;
    font-size: 0.82rem;
  }

  .body {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 232px minmax(0, 1fr) 360px;
    gap: 16px;
    padding: 8px 16px 16px;
  }

  .side-col {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-height: 0;
    overflow-y: auto;
    border-radius: 14px;
  }

  .formation {
    padding: 12px;
    border: 1px solid rgba(255 255 255 / 0.08);
    border-radius: 14px;
    background: rgba(18 18 28 / 0.55);
  }

  .stage-col {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    gap: 12px;
  }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 12px 20px;
    align-items: center;
  }
  .view-switch {
    flex: 0 0 260px;
  }
  .group {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .group.push {
    margin-left: auto;
  }
  .lbl {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    opacity: 0.55;
  }
  .seq-name {
    font-size: 0.85rem;
    opacity: 0.85;
    font-variant-numeric: tabular-nums;
  }

  /* Save-target dropdown menu (rendered into FilterChipBase's popover). */
  .target-menu {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 184px;
  }
  button.opt {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 1px;
    width: 100%;
    padding: 8px 10px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 8px;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }
  button.opt:hover {
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b7cf0) 14%,
      transparent
    );
  }
  button.opt.sel {
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b7cf0) 22%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #8b7cf0) 45%,
      transparent
    );
  }
  .opt-name {
    font-size: 0.82rem;
    font-weight: 600;
  }
  .opt-sub {
    font-size: 0.68rem;
    opacity: 0.55;
  }

  /* The square stage takes the largest side the column leaves it, so a wrapped
     toolbar or a short window never pushes it under the playback bar. */
  .stage-wrap {
    flex: 1;
    min-height: 0;
    display: grid;
    place-items: center;
    container-type: size;
  }
  .stage {
    position: relative;
    width: min(100cqw, 100cqh);
    aspect-ratio: 1 / 1;
    border-radius: 16px;
    overflow: hidden;
    border: 1px solid rgba(255 255 255 / 0.1);
    background: #07070b;
    box-shadow: 0 20px 60px rgba(0 0 0 / 0.5);
  }
  .placeholder {
    width: 100%;
    height: 100%;
    display: grid;
    place-items: center;
    opacity: 0.55;
    font-size: 0.9rem;
  }

  .playback {
    border: 1px solid rgba(255 255 255 / 0.08);
    border-radius: 14px;
    background: rgba(18 18 28 / 0.55);
  }

  /* Reserved line so status messages never shift the stage. */
  .status {
    min-height: 1.2em;
    font-size: 0.78rem;
    opacity: 0.7;
    font-variant-numeric: tabular-nums;
  }
  .err {
    color: #ffb4b4;
  }

  .panel-col {
    overflow-y: auto;
    border: 1px solid rgba(255 255 255 / 0.08);
    border-radius: 14px;
    background: rgba(18 18 28 / 0.55);
  }

  /* Narrower desktops: stack the columns and let the page scroll. */
  @media (max-width: 1100px) {
    .page {
      height: auto;
      min-height: 100dvh;
    }
    .body {
      grid-template-columns: minmax(0, 1fr);
    }
    .side-col,
    .panel-col {
      overflow: visible;
    }
    /* The page scrolls here, so the stage sizes from the width instead. */
    .stage-wrap {
      container-type: normal;
    }
    .stage {
      width: min(100%, 80vh);
    }
  }
</style>
