<!--
  Effect Tuner — pick sensible shipped defaults for all 16 effects (throwaway).

  Gallery layout for ultrawide: big square stage on the left, the REAL
  production EffectsPanel on the right (EffectSelector + Choose-a-Look presets +
  Customize + primary slider) so the tuner shows exactly what the end user sees.

  Two scenes off the SAME base motion (flipping reuses base — no regeneration):
    • Clean  — single blue+red pair. Honest single-effect read.
    • Tunnel — rotated/mirrored kaleidoscope copies. Additive-overlap gate.
  Tune via the panel, then "Copy default JSON" → paste into
  DEFAULT_EFFECTS_CONFIG[effect] in src/lib/shared/effects/domain/defaults.ts.

  Driven by an ISOLATED effects config (persist:false → never touches the
  user's global tka_effects_config). Default prop = STAFF (2 tip ends reveal
  coverage/blowout). Spec: docs/superpowers/specs/active/2026-06-23-effect-tuner-design.md
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/env";
  import AnimatorCanvas from "#lib/shared/animation-engine/components/AnimatorCanvas.svelte";
  import EffectsPanel from "#lib/shared/animation-engine/components/effects-panel/EffectsPanel.svelte";
  import type { AdditionalLayerProps } from "#lib/shared/animation-engine/domain/types/trail-capture-types.js";
  import { interpolatePropAngles } from "#lib/shared/animation-engine/services/prop-interpolator.js";
  import { rotateSequence, mirrorSequence } from "#lib/shared/create/services/sequence-transforms.js";
  import { motionQueryHandler } from "#lib/shared/pictograph/shared/services/motion-query-handler.js";
  import { generationOrchestrator } from "#lib/shared/create/services/generation-orchestrator.js";
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { DifficultyLevel } from "#lib/shared/foundation/domain/models/generation/generate-models.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import type { PropState } from "#lib/shared/foundation/domain/types/prop-state.js";
  import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
  import type { TipEffectMap, EffectType } from "#lib/shared/animation-engine/domain/types/tip-effect-types.js";

  // Isolated effects config — drives the real EffectsPanel via context.
  import {
    createEffectsConfigState,
    isEffectId,
    type EffectId,
  } from "#lib/shared/effects/state/effects-config-state.svelte.js";
  import { setEffectsConfigContext } from "#lib/shared/effects/state/effects-config-context.js";
  import BentoPropGrid from "#lib/shared/settings/components/tabs/prop-type/BentoPropGrid.svelte";
  import { settingsService } from "#lib/shared/settings/state/settings-state.svelte.js";
  import { animationSettings } from "#lib/shared/animation-engine/state/animation-settings-state.svelte.js";
  import { isBilateralProp } from "#lib/shared/pictograph/prop/domain/enums/prop-classification.js";
  import { TrackingMode } from "#lib/shared/animation-engine/domain/types/trail-types.js";
  import { foldTrailIntentIntoSettings } from "#lib/shared/effects/translators/canvas2d-translator.js";
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import { getRegistration } from "#lib/shared/animation-engine/components/effects-panel/effect-registry.js";
  import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
  import type { EffectsConfig } from "#lib/shared/effects/domain/effects-config.js";
  import type { EffectPreset } from "#lib/shared/animation-engine/components/effects-panel/presets/types.js";

  const DEFAULT_PROP_STATE: PropState = { centerPathAngle: 0, staffRotationAngle: 0 };

  // Warm every heavy webgl effect's GL context/FBOs/programs at engine startup
  // (before the loop free-runs) so switching to any of them never freezes the
  // props. fire + charcoal park warm via the generic webgl path; led via its
  // dedicated keep-warm path (kind:"led"). Desktop tuner → holding the extra
  // contexts is free, and this is the surface the no-freeze goal is tuned on.
  const PREWARM_EFFECTS: EffectType[] = ["fire", "charcoal", "led"];

  type Fold = 2 | 4 | 8;
  type Scene = "clean" | "tunnel";

  // persist:false → fully isolated; never touches the user's tka_effects_config.
  const effectsConfig = createEffectsConfigState(undefined, { persist: false });
  setEffectsConfigContext(effectsConfig);

  let scene = $state<Scene>("clean");
  let fold = $state<Fold>(4);
  let mirror = $state(false);
  let speed = $state(0.3); // beats per second
  let isPlaying = $state(true);
  let showGrid = $state(true);
  let status = $state("loading…");
  let errorMsg = $state<string | null>(null);
  let layerCount = $state(1);
  let copyStatus = $state("");
  let bpm = $state(120); // EffectsPanel requires it; playback is driven by our own loop

  const folds: Fold[] = [2, 4, 8];

  // Prop selection flows through the REAL production source of truth
  // (settingsService) so the trail system + TrailsPanel gating + bilateral
  // tracking all see the same prop the canvas renders.
  const propType = $derived<PropType>(settingsService.settings.leftPropType ?? PropType.STAFF);

  function selectProp(p: PropType) {
    // In-memory only (NOT updateSetting) → picking a prop here never persists to
    // the user's real app settings (no localStorage / Firebase write). The
    // originals are snapshotted on mount and restored on unmount.
    settingsService.settings.leftPropType = p;
    settingsService.settings.rightPropType = p;
    animationSettings.setCurrentPropType(String(p));
  }

  // trackingMode + tailLength live in animationSettings (NOT effectsConfig), so
  // AnimatorCanvas only respects them when we pass an explicit trailSettings.
  // Replicates AnimationPlayer: BOTH_ENDS collapses to one end on unilateral props.
  const trailSettings = $derived.by(() => {
    // Fold the effects-config trail visuals (thickness/brightness/colors — the
    // store the Choose-a-Look presets + sliders write) onto the rendering params
    // (trackingMode/tailLength) that live on animationSettings. Without this the
    // canvas reads only animationSettings.trail and trail presets never take.
    const settings = foldTrailIntentIntoSettings(animationSettings.trail, effectsConfig.trails);
    if (settings.trackingMode === TrackingMode.BOTH_ENDS) {
      const left = settingsService.settings.leftPropType;
      const right = settingsService.settings.rightPropType;
      const hasBilateral =
        (left != null && isBilateralProp(String(left))) ||
        (right != null && isBilateralProp(String(right)));
      if (!hasBilateral) settings.trackingMode = TrackingMode.RIGHT_END;
    }
    return settings;
  });

  // EffectsPanel owns effect selection through the config — read it back.
  const activeEffect = $derived(effectsConfig.activeEffect);
  const activeTipEffectMap = $derived<TipEffectMap | undefined>(
    activeEffect === "none" ? undefined : effectsConfig.tipEffectMap,
  );

  // ── Save target: base default vs a specific preset (sticky) ─────────────────
  // The picker holds its OWN target so a slider tweak (which clears the panel's
  // active-preset chip) never silently retargets the base default. The chip is
  // always visible and labelled — "Save to <target>" is never a guess.
  type SaveTarget = { kind: "default" } | { kind: "preset"; id: string; name: string };
  type WriteFn = (effectId: string, patch: unknown) => void;
  type PresetFn = (effectId: string, presetId: string, patch: unknown) => void;

  let saveTarget = $state<SaveTarget>({ kind: "default" });
  let menuOpen = $state(false);

  // Presets the tuner can write to: exclude "Custom" (previewColor "custom" — its
  // job is to open a blank Customize panel; a full-patch write would break that).
  const targetablePresets = $derived<EffectPreset[]>(
    activeEffect === "none"
      ? []
      : (getRegistration(activeEffect)?.presetGroup.presets ?? []).filter(
          (p) => p.previewColor !== "custom",
        ),
  );
  const targetLabel = $derived(
    saveTarget.kind === "default" ? "Base default" : saveTarget.name,
  );

  // Switching effect resets the target to that effect's base default. The FIRST
  // run is a no-op (tracker starts null) so a saveTarget restored after a
  // save-induced reload survives; only a genuine effect switch resets it.
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
  // sets activePresets→null; we intentionally ignore that (target stays sticky).
  $effect(() => {
    if (activeEffect === "none") return;
    const id =
      effectsConfig.activePresets[activeEffect as keyof typeof effectsConfig.activePresets];
    if (!id) return;
    const p = targetablePresets.find((pp) => pp.id === id);
    if (p && !(saveTarget.kind === "preset" && saveTarget.id === id)) {
      saveTarget = { kind: "preset", id, name: p.name };
    }
  });

  function loadBase(fx: EffectId) {
    (effectsConfig.updateEffect as unknown as WriteFn)(
      fx,
      structuredClone(DEFAULT_EFFECTS_CONFIG[fx]),
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
      structuredClone(preset.patch),
    ); // base + patch, also highlights the panel chip
    saveTarget = t;
  }

  let base = $state<SequenceData | null>(null);
  let rotated = $state<SequenceData[]>([]); // additional layers beyond base
  let playheadBeat = $state(0);

  function rotAmountsFor(f: Fold): number[] {
    if (f === 8) return [1, 2, 3, 4, 5, 6, 7]; // 45° steps
    if (f === 4) return [2, 4, 6]; // 90 / 180 / 270
    return [4]; // 180 only
  }

  // Generate a fresh base sequence, then build the scene's layers from it.
  async function generateBase() {
    status = "generating sequence…";
    errorMsg = null;
    base = null;
    rotated = [];
    try {
      const seq = await generationOrchestrator.generateSequence({
        length: 8,
        gridMode: GridMode.DIAMOND,
        propType: PropType.STAFF, // generation prop irrelevant; render prop is separate
        difficulty: DifficultyLevel.INTERMEDIATE,
        constraintPreset: "smooth",
      });
      base = seq;
      playheadBeat = 0;
      await rebuildLayers();
    } catch (e) {
      errorMsg = String(e instanceof Error ? (e.stack ?? e.message) : e);
      status = "error";
    }
  }

  // Build the additional layers for the current scene from the EXISTING base —
  // no regeneration, so Clean⇄Tunnel judges identical motion.
  async function rebuildLayers() {
    const seq = base;
    if (!seq) return;
    if (scene === "clean") {
      rotated = [];
      layerCount = 1;
      status = `clean · single pair · ${seq.steps.length} steps`;
      return;
    }
    status = "building tunnel layers…";
    const amounts = rotAmountsFor(fold);
    const rotExtras = await Promise.all(
      amounts.map((amt) => rotateSequence(seq, amt, motionQueryHandler)),
    );
    const layers: SequenceData[] = [...rotExtras];
    if (mirror) {
      const mirroredBase = await mirrorSequence(seq, motionQueryHandler);
      const mirroredExtras = await Promise.all(
        rotExtras.map((r) => mirrorSequence(r, motionQueryHandler)),
      );
      layers.push(mirroredBase, ...mirroredExtras);
    }
    rotated = layers;
    layerCount = layers.length + 1;
    status = `tunnel · ${layerCount} layers · ${fold}-fold${mirror ? " + mirror" : ""} · ${seq.steps.length} steps`;
  }

  // Rebuild when the scene topology changes (scene / fold / mirror). First run
  // (no base yet) generates one; later runs reuse base. Prop / effect / speed
  // are instant — no rebuild.
  let lastTopo = "";
  $effect(() => {
    const topo = `${scene}|${fold}|${mirror}`;
    if (topo !== lastTopo) {
      lastTopo = topo;
      if (!base) void generateBase();
      else void rebuildLayers();
    }
  });

  // ── Survive the save-induced reload ─────────────────────────────────────────
  // Saving writes effect source (defaults.ts / a preset file); Vite then reloads
  // this page, which would otherwise snap back to bloom + a fresh random sequence
  // and throw away where the user was. Mirror the volatile tuner state into
  // sessionStorage and rehydrate it on the next mount so a save is seamless.
  const RECOVERY_KEY = "tka_effect_tuner_recovery";
  const RECOVERY_FRESH_MS = 60_000;
  let restored = false;

  type Recovery = {
    v: 1;
    t: number;
    scene: Scene;
    fold: Fold;
    mirror: boolean;
    speed: number;
    showGrid: boolean;
    isPlaying: boolean;
    saveTarget: SaveTarget;
    config: EffectsConfig;
    base: SequenceData | null;
  };

  function persistRecovery() {
    if (!browser) return;
    try {
      const payload: Recovery = {
        v: 1,
        t: Date.now(),
        scene,
        fold,
        mirror,
        speed,
        showGrid,
        isPlaying,
        // $state.snapshot returns a deep-readonly Snapshot<T>; cast back to the
        // mutable shape (structurally identical) for the typed payload literal.
        saveTarget: $state.snapshot(saveTarget) as SaveTarget,
        config: $state.snapshot(effectsConfig.config) as EffectsConfig,
        base: $state.snapshot(base) as SequenceData | null,
      };
      sessionStorage.setItem(RECOVERY_KEY, JSON.stringify(payload));
    } catch {
      /* quota / non-serializable → recovery just won't fire, never crash */
    }
  }

  function readRecovery(): Recovery | null {
    if (!browser) return null;
    try {
      const raw = sessionStorage.getItem(RECOVERY_KEY);
      if (!raw) return null;
      const r = JSON.parse(raw) as Recovery;
      if (r?.v !== 1 || typeof r.t !== "number") return null;
      if (Date.now() - r.t > RECOVERY_FRESH_MS) {
        sessionStorage.removeItem(RECOVERY_KEY);
        return null;
      }
      return r;
    } catch {
      return null;
    }
  }

  // Rehydrate synchronously in the script body — runs before any $effect flush or
  // onMount, so the topo-effect (above) sees lastTopo already set and skips
  // regeneration, and the config is in place before the panel first reads it.
  {
    const r = readRecovery();
    if (r) {
      restored = true;
      scene = r.scene;
      fold = r.fold;
      mirror = r.mirror;
      speed = r.speed;
      showGrid = r.showGrid;
      isPlaying = r.isPlaying;
      saveTarget = r.saveTarget;
      if (r.config) effectsConfig.replace(r.config);
      if (r.base) {
        base = r.base;
        lastTopo = `${r.scene}|${r.fold}|${r.mirror}`; // "already built" → no regen
      }
    }
  }

  // Mirror volatile state to sessionStorage (debounced) so any reload — the save
  // round-trip or a manual refresh — lands back on the same effect/target/motion.
  let persistTimer: ReturnType<typeof setTimeout> | null = null;
  $effect(() => {
    // track the discrete knobs + every config edit + the base sequence
    void scene;
    void fold;
    void mirror;
    void speed;
    void showGrid;
    void isPlaying;
    void saveTarget;
    void effectsConfig.version;
    void base;
    if (!browser) return;
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(persistRecovery, 250);
  });

  onMount(() => {
    // Tuner is a SANDBOX. effectsConfig is already isolated (persist:false →
    // effect tuning never touches the user's tka_effects_config). Prop + trail
    // trackingMode/tailLength route through GLOBAL singletons because the trail
    // system reads them (settingsService / animationSettings, the latter
    // auto-persists). So snapshot the user's originals now and restore on leave
    // — tuning here must never stick to their real app.
    const origLeft = settingsService.settings.leftPropType;
    const origRight = settingsService.settings.rightPropType;
    const origTrail = { ...animationSettings.trail };
    const origPropType = animationSettings.currentPropType;

    // Open on a vivid effect so the stage isn't empty on first paint — unless a
    // prior session was restored, which already set the active effect + config.
    if (restored) {
      if (base) void rebuildLayers(); // rebuild tunnel layers from the restored base
    } else {
      effectsConfig.setActiveEffect("bloom");
    }
    // Tell the trail system which prop is active (panel labels + bilateral gate).
    animationSettings.setCurrentPropType(String(propType));

    // A manual refresh also keeps the user's place (the save round-trip is
    // already covered by the eager persist in saveAsDefault).
    const onBeforeUnload = () => persistRecovery();
    if (browser) window.addEventListener("beforeunload", onBeforeUnload);

    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      if (isPlaying && base && base.steps.length > 0) {
        playheadBeat = (playheadBeat + dt * speed) % base.steps.length;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      if (persistTimer) clearTimeout(persistTimer);
      if (browser) window.removeEventListener("beforeunload", onBeforeUnload);
      // Restore the user's real prop + trail settings. Prop is in-memory;
      // updateSettings re-persists the original trail, undoing any in-session
      // auto-save the trail singleton made.
      settingsService.settings.leftPropType = origLeft;
      settingsService.settings.rightPropType = origRight;
      animationSettings.updateSettings({ trail: origTrail });
      animationSettings.setCurrentPropType(origPropType);
    };
  });

  // ── Per-layer prop derivation at the shared playhead ────────
  type LayerProps = { left: PropState; right: PropState; step: StepData | null; stepOneBased: number };

  function propsFor(seq: SequenceData | null): LayerProps {
    if (!seq || seq.steps.length === 0) {
      return { left: { ...DEFAULT_PROP_STATE }, right: { ...DEFAULT_PROP_STATE }, step: null, stepOneBased: 1 };
    }
    const n = seq.steps.length;
    const idx = Math.min(n - 1, Math.max(0, Math.floor(playheadBeat)));
    const progress = Math.max(0, Math.min(0.9999, playheadBeat - Math.floor(playheadBeat)));
    const step = seq.steps[idx] ?? null;
    if (!step) {
      return { left: { ...DEFAULT_PROP_STATE }, right: { ...DEFAULT_PROP_STATE }, step: null, stepOneBased: idx + 1 };
    }
    const r = interpolatePropAngles(step, progress);
    return {
      left: r.isValid ? (r.leftAngles ?? { ...DEFAULT_PROP_STATE }) : { ...DEFAULT_PROP_STATE },
      right: r.isValid ? (r.rightAngles ?? { ...DEFAULT_PROP_STATE }) : { ...DEFAULT_PROP_STATE },
      step,
      stepOneBased: idx + 1,
    };
  }

  const baseLayer = $derived(propsFor(base));
  const additionalLayers = $derived<AdditionalLayerProps[]>(
    rotated.map((seq) => {
      const p = propsFor(seq);
      return { leftProp: p.left, rightProp: p.right };
    }),
  );
  const propTypeStr = $derived(String(propType));
  const gridMode = $derived(base?.gridMode ?? GridMode.DIAMOND);

  // ── Save the active effect's live intent straight into defaults.ts ──────────
  // Posts to the dev-only write-back endpoint, which patches
  // DEFAULT_EFFECTS_CONFIG[<effect>] in place. Vite then HMR-reloads the file.
  let saving = $state(false);
  async function saveAsDefault() {
    const fx = effectsConfig.activeEffect;
    if (fx === "none" || !isEffectId(fx)) {
      copyStatus = "Pick an effect first";
      return;
    }
    const intent = $state.snapshot(effectsConfig.effect(fx));
    const target = saveTarget.kind === "default" ? "default" : { preset: saveTarget.id };
    const label = saveTarget.kind === "default" ? "base default" : saveTarget.name;
    saving = true;
    copyStatus = `Saving ${fx} → ${label}…`;
    persistRecovery(); // flush a fresh snapshot NOW — the write below triggers the reload
    try {
      const res = await fetch("/test/effect-tuner/save-default", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ target, effect: fx, intent }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.message ?? `${res.status} ${res.statusText}`);
      copyStatus = `Saved ${fx} → ${label} ✓ — ${data.file} ${data.changed ? "patched" : "(no change)"}`;
    } catch (e) {
      copyStatus = `Save failed: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      saving = false;
    }
  }

  // ── Copy the active effect's live intent (manual paste fallback) ────────────
  function copyDefaultJson() {
    const fx = effectsConfig.activeEffect;
    if (fx === "none" || !isEffectId(fx)) {
      copyStatus = "Pick an effect first";
      return;
    }
    const intent = $state.snapshot(effectsConfig.effect(fx));
    const json = JSON.stringify(intent, null, 2);
    void navigator.clipboard
      .writeText(json)
      .then(() => { copyStatus = `Copied ${fx} default (${json.length} chars)`; })
      .catch(() => { copyStatus = "Clipboard blocked — JSON logged to console"; console.log(json); });
  }
</script>

<div class="page">
  <header>
    <h1>Effect Tuner</h1>
    <p class="sub">
      Real production panel · judge in Clean, confirm in Tunnel · Copy default JSON →
      <code>defaults.ts</code>. {scene === "tunnel" ? `${layerCount} layers · ${fold}-fold${mirror ? " + mirror" : ""}` : "single pair"}.
    </p>
  </header>

  <div class="body">
    <aside class="prop-col">
      <BentoPropGrid
        selectedPropType={propType}
        color="blue"
        title="Prop"
        variant="panel"
        onSelect={selectProp}
      />
    </aside>

    <div class="stage-col">
      <div class="toolbar">
        <div class="group">
          <span class="lbl">Scene</span>
          <div class="row">
            <button class:active={scene === "clean"} onclick={() => (scene = "clean")}>Clean</button>
            <button class:active={scene === "tunnel"} onclick={() => (scene = "tunnel")}>Tunnel</button>
          </div>
        </div>

        {#if scene === "tunnel"}
          <div class="group">
            <span class="lbl">Fold</span>
            <div class="row">
              {#each folds as f (f)}
                <button class:active={fold === f} onclick={() => (fold = f)}>{f}×</button>
              {/each}
              <button class:active={mirror} onclick={() => (mirror = !mirror)}>Mirror</button>
            </div>
          </div>
        {/if}

        <div class="group">
          <span class="lbl">Speed</span>
          <input type="range" min="0.1" max="2.5" step="0.1" bind:value={speed} />
          <span class="val">{speed.toFixed(1)}</span>
        </div>

        <div class="group">
          <button class:active={isPlaying} onclick={() => (isPlaying = !isPlaying)}>{isPlaying ? "Pause" : "Play"}</button>
          <button class:active={showGrid} onclick={() => (showGrid = !showGrid)}>Grid</button>
          <button onclick={() => void generateBase()}>Regenerate</button>
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
                  class:sel={saveTarget.kind === "preset" && saveTarget.id === p.id}
                  onclick={() => selectTarget({ kind: "preset", id: p.id, name: p.name })}
                >
                  <span class="opt-name">{p.name}</span>
                </button>
              {/each}
            </div>
          </FilterChipBase>
          <button class="save" disabled={activeEffect === "none" || saving} onclick={saveAsDefault}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button class="copy" disabled={activeEffect === "none"} onclick={copyDefaultJson}>Copy JSON</button>
          {#if copyStatus}<span class="copy-status">{copyStatus}</span>{/if}
        </div>
      </div>

      <div class="stage-wrap">
        <div class="stage">
          {#if base}
            <AnimatorCanvas
              leftProp={baseLayer.left}
              rightProp={baseLayer.right}
              {additionalLayers}
              leftPropType={propTypeStr}
              rightPropType={propTypeStr}
              sequenceData={base}
              stepData={baseLayer.step}
              currentStep={baseLayer.stepOneBased}
              {isPlaying}
              {gridMode}
              {trailSettings}
              tipEffectMap={activeTipEffectMap}
              effectsConfigState={effectsConfig}
              gridVisible={showGrid}
              hideHeader={true}
              hideProgressBar={true}
              hideTkaGlyph={true}
              hideStepNumbers={true}
              fillContainer={true}
              fireConfig={{ disableFrameCache: true }}
              prewarmEffects={PREWARM_EFFECTS}
            />
          {:else}
            <div class="placeholder">{status}</div>
          {/if}
        </div>
      </div>

      <div class="status">{status}</div>
      {#if errorMsg}
        <pre class="err">{errorMsg}</pre>
      {/if}
    </div>

    <aside class="panel-col">
      <EffectsPanel
        {bpm}
        onBpmChange={(v) => (bpm = v)}
        {isPlaying}
        onPlaybackToggle={() => (isPlaying = !isPlaying)}
        showPlayback={false}
        showTransport={false}
        layout="sidebar"
      />
    </aside>
  </div>
</div>

<style>
  .page {
    height: 100dvh;
    display: flex;
    flex-direction: column;
    background: radial-gradient(circle at 30% 20%, #14141f 0%, #0a0a0f 70%);
    color: #e8e8f0;
    font-family: system-ui, sans-serif;
  }
  header { padding: 12px 20px 4px; }
  h1 { margin: 0; font-size: 1.3rem; }
  .sub { margin: 3px 0 0; opacity: 0.55; font-size: 0.82rem; }
  .sub code { background: rgba(255 255 255 / 0.1); padding: 1px 5px; border-radius: 5px; }

  .body {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 232px minmax(0, 1fr) 360px;
    gap: 16px;
    padding: 8px 16px 16px;
  }

  .prop-col {
    overflow-y: auto;
    border-radius: 14px;
  }

  .stage-col {
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: 12px;
  }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: center;
  }
  .group { display: flex; align-items: center; gap: 8px; }
  .group.push { margin-left: auto; }
  .lbl { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.5; }
  .row { display: flex; gap: 6px; flex-wrap: wrap; }
  .val { font-variant-numeric: tabular-nums; width: 2.2ch; opacity: 0.7; }
  .copy-status { font-size: 0.78rem; opacity: 0.7; font-variant-numeric: tabular-nums; }

  /* Save-target dropdown menu (rendered into FilterChipBase's popover). */
  .target-menu { display: flex; flex-direction: column; gap: 2px; min-width: 184px; }
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
    text-align: left;
  }
  button.opt:hover { background: color-mix(in srgb, var(--theme-accent, #8b7cf0) 14%, transparent); }
  button.opt.sel {
    background: color-mix(in srgb, var(--theme-accent, #8b7cf0) 22%, transparent);
    border-color: color-mix(in srgb, var(--theme-accent, #8b7cf0) 45%, transparent);
  }
  .opt-name { font-size: 0.82rem; font-weight: 600; }
  .opt-sub { font-size: 0.68rem; opacity: 0.55; }

  .stage-wrap {
    flex: 1;
    min-height: 0;
    display: grid;
    place-items: center;
  }
  .stage {
    width: min(100%, 82vh);
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
    opacity: 0.5;
    font-size: 0.9rem;
  }

  .panel-col {
    overflow-y: auto;
    border: 1px solid rgba(255 255 255 / 0.08);
    border-radius: 14px;
    background: rgba(18 18 28 / 0.55);
  }

  button {
    background: rgba(255 255 255 / 0.06);
    border: 1px solid rgba(255 255 255 / 0.12);
    color: inherit;
    padding: 7px 12px;
    border-radius: 9px;
    font-size: 0.82rem;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s, transform 0.12s;
  }
  button:hover { background: rgba(255 255 255 / 0.12); }
  button:active { transform: scale(0.96); }
  button:disabled { opacity: 0.4; cursor: not-allowed; }
  button.active {
    background: linear-gradient(135deg, #6d5ef0, #b14ddb);
    border-color: transparent;
    color: #fff;
  }
  button.copy { background: rgba(150 120 240 / 0.18); border-color: rgba(150 120 240 / 0.5); }
  button.copy:hover:not(:disabled) { background: rgba(150 120 240 / 0.3); }
  button.save {
    background: linear-gradient(135deg, #22c55e, #16a34a);
    border-color: transparent;
    color: #fff;
    font-weight: 600;
  }
  button.save:hover:not(:disabled) { filter: brightness(1.1); }

  .status { font-size: 0.78rem; opacity: 0.6; font-variant-numeric: tabular-nums; }
  .err {
    max-width: 100%;
    white-space: pre-wrap;
    background: rgba(220 60 60 / 0.12);
    border: 1px solid rgba(220 60 60 / 0.4);
    color: #ffb4b4;
    padding: 12px;
    border-radius: 10px;
    font-size: 0.72rem;
  }
</style>
