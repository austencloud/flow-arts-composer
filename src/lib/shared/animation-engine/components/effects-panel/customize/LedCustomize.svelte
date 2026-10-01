<script lang="ts">
  import { getContext } from "svelte";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { effectUiLabel } from "../effect-ui-label";
  import {
    LED_CUSTOMIZE_PAGE_CONTEXT,
    type LedCustomizePage,
    type LedCustomizePageState,
  } from "../led-customize-page-context";
  import { getEffectsConfigContext } from "$lib/shared/effects/state/effects-config-context";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import {
    CYCLE_DURATION_MAX,
    CYCLE_DURATION_MIN,
    normalizeLedDevice,
    type LedSimulatorConfig,
  } from "$lib/shared/animation-engine/domain/types/led-types";
  import {
    CAMERA_EXPOSURE_MAX_S,
    CAMERA_EXPOSURE_MIN_S,
    EYE_TIME_CONSTANT_S,
    GLARE_WEIGHT_MAX,
    GLARE_WEIGHT_MIN,
    type LedShutter,
  } from "$lib/shared/animation-engine/domain/led-photometry";
  import type { PatternParams } from "$lib/shared/poi/domain/strip-pattern";
  import { BUILT_IN_PRESETS } from "$lib/shared/poi/domain/pattern-presets";
  import { stripPatternToImageData } from "$lib/shared/poi/domain/strip-pattern-image";

  interface Props {
    onBack: () => void;
    /**
     * The inspector sidebar already carries a back action and a section title,
     * so the panel drops its own "Back to presets" row there and renders as
     * bare controls. The popover and tray layouts, which show this panel as a
     * whole view, keep it.
     */
    embedded?: boolean;
    /** Post Studio's short inspector shows one bounded control group at a time. */
    paged?: boolean;
  }

  const { onBack, embedded = false, paged = false }: Props = $props();
  const sharedPage = getContext<LedCustomizePageState | undefined>(
    LED_CUSTOMIZE_PAGE_CONTEXT
  );
  let page = $state<LedCustomizePage>(sharedPage?.current ?? "pattern");
  function selectPage(next: LedCustomizePage): void {
    page = next;
    if (sharedPage) sharedPage.current = next;
  }
  const effectsState = getEffectsConfigContext();

  const led = $derived(effectsState?.led ?? null);

  // One row of four props, not a kind-toggle plus a conditional count row: the
  // four options ARE the supported devices, and a single exactly-one control
  // can never layout-shift when the selection changes.

  type DeviceValue = "capsule" | "32" | "72" | "200";

  const DEVICE_OPTIONS: {
    value: DeviceValue;
    label: string;
    shortLabel?: string;
  }[] = [
    { value: "capsule", label: "Capsule", shortLabel: "Capsule" },
    { value: "32", label: "Pixel staff, 32 LEDs", shortLabel: "Staff 32" },
    { value: "72", label: "Pixel staff, 72 LEDs", shortLabel: "Staff 72" },
    { value: "200", label: "Pixel staff, 200 LEDs", shortLabel: "Staff 200" },
  ];

  const deviceValue = $derived<DeviceValue>(
    led?.device.kind === "pixel-staff"
      ? (String(led.device.ledCount) as DeviceValue)
      : "capsule"
  );

  function setDevice(value: DeviceValue) {
    if (!effectsState) return;
    const device =
      value === "capsule"
        ? normalizeLedDevice("capsule", 2)
        : normalizeLedDevice("pixel-staff", Number(value));
    effectsState.updateEffect("led", { device });
  }

  /** How many of the shared params each generator actually reads. */
  const COLOR_SLOTS: Record<string, number> = {
    solid: 1,
    gradient: 2,
    "rainbow-sweep": 0,
    pulse: 1,
    "prop-colors": 2,
    chase: 1,
    comet: 1,
  };

  const PATTERN_LABELS: Record<string, string> = {
    solid: "Solid",
    gradient: "Gradient",
    "rainbow-sweep": "Rainbow",
    pulse: "Pulse",
    "prop-colors": "Prop Colors",
    chase: "Chase",
    comet: "Comet",
  };

  const activeGeneratorId = $derived(
    led?.pattern.source === "generator" ? led.pattern.generatorId : null
  );

  const currentParams = $derived<PatternParams>(
    led?.pattern.source === "generator"
      ? led.pattern.params
      : {
          primaryColor: { r: 255, g: 255, b: 255 },
          speed: 1,
          brightness: 1,
        }
  );

  function setGenerator(generatorId: string) {
    if (!effectsState || !led) return;
    effectsState.updateEffect("led", {
      pattern: {
        source: "generator",
        generatorId,
        params: { ...currentParams },
      },
    });
  }

  function rgbToHex(c: { r: number; g: number; b: number }): string {
    const part = (v: number) =>
      Math.max(0, Math.min(255, Math.round(v)))
        .toString(16)
        .padStart(2, "0");
    return `#${part(c.r)}${part(c.g)}${part(c.b)}`;
  }

  function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const n = hex.replace(/^#/, "");
    return {
      r: parseInt(n.slice(0, 2), 16),
      g: parseInt(n.slice(2, 4), 16),
      b: parseInt(n.slice(4, 6), 16),
    };
  }

  function setParamColor(slot: "primaryColor" | "secondaryColor", hex: string) {
    if (!effectsState || !led || led.pattern.source !== "generator") return;
    effectsState.updateEffect("led", {
      pattern: {
        ...led.pattern,
        params: { ...led.pattern.params, [slot]: hexToRgb(hex) },
      },
    });
  }

  const colorSlots = $derived(
    activeGeneratorId ? (COLOR_SLOTS[activeGeneratorId] ?? 0) : 0
  );

  // ─── Pattern strips (space-time portraits, one per generator) ──────────────

  /** Strip canvases keyed by generator id, painted whenever colours change. */
  let stripCanvases = $state<Record<string, HTMLCanvasElement | undefined>>({});

  const STRIP_FRAMES = 64;

  $effect(() => {
    if (!led) return;
    const ledCount = led.device.ledCount;
    const params = currentParams;
    for (const generator of BUILT_IN_PRESETS) {
      const node = stripCanvases[generator.id];
      if (!node) continue;
      const ctx = node.getContext("2d");
      if (!ctx) continue;
      const pattern = generator.generate(ledCount, STRIP_FRAMES, params);
      const imageData = stripPatternToImageData(pattern);
      // imageData is frames wide x LEDs tall — time runs left to right.
      const buffer = document.createElement("canvas");
      buffer.width = imageData.width;
      buffer.height = imageData.height;
      buffer.getContext("2d")?.putImageData(imageData, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.clearRect(0, 0, node.width, node.height);
      ctx.drawImage(buffer, 0, 0, node.width, node.height);
    }
  });

  // ─── Loop duration (log-scaled slider over 0.2–30s) ────────────────────────

  const LOG_MIN = Math.log(CYCLE_DURATION_MIN);
  const LOG_MAX = Math.log(CYCLE_DURATION_MAX);

  const cycleSliderValue = $derived(
    led ? (Math.log(led.cycleDuration) - LOG_MIN) / (LOG_MAX - LOG_MIN) : 0.5
  );

  function setCycleFromSlider(t: number) {
    if (!effectsState) return;
    const seconds = Math.exp(LOG_MIN + t * (LOG_MAX - LOG_MIN));
    effectsState.updateEffect("led", {
      cycleDuration: Math.round(seconds * 10) / 10,
    });
  }

  function formatSeconds(seconds: number): string {
    return seconds >= 10 ? `${Math.round(seconds)}s` : `${seconds.toFixed(1)}s`;
  }

  // ─── Look ──────────────────────────────────────────────────────────────────

  function setLook(patch: Partial<LedSimulatorConfig["look"]>) {
    if (!effectsState || !led) return;
    effectsState.updateEffect("led", { look: { ...led.look, ...patch } });
  }

  const BRIGHTNESS_OPTIONS: { value: string; label: string }[] = [
    { value: "1", label: "1" },
    { value: "2", label: "2" },
    { value: "3", label: "3" },
    { value: "4", label: "4" },
    { value: "5", label: "5" },
  ];

  // ─── Shutter ─────────────────────────────────────────────────────────────
  // `led-photometry.ts` only exports bounds for camera exposure; the eye time
  // constant has no authored ceiling of its own, so the slider uses the same
  // plausible band `led-config-migration.ts` maps saved trails onto.
  const EYE_TIME_CONSTANT_MIN_S = 0.04;
  const EYE_TIME_CONSTANT_MAX_S = 0.4;
  const DEFAULT_CAMERA_EXPOSURE_S = 1;

  const SHUTTER_MODE_OPTIONS: { value: "eye" | "camera"; label: string }[] = [
    { value: "eye", label: "Eye" },
    { value: "camera", label: "Camera" },
  ];

  const shutterMode = $derived<"eye" | "camera">(
    led?.look.shutter.mode ?? "eye"
  );

  const eyeTimeConstant = $derived(
    led && led.look.shutter.mode === "eye"
      ? led.look.shutter.timeConstantSeconds
      : EYE_TIME_CONSTANT_S
  );

  const cameraExposure = $derived(
    led && led.look.shutter.mode === "camera"
      ? led.look.shutter.exposureSeconds
      : DEFAULT_CAMERA_EXPOSURE_S
  );

  function setShutterMode(mode: "eye" | "camera") {
    const shutter: LedShutter =
      mode === "eye"
        ? { mode: "eye", timeConstantSeconds: EYE_TIME_CONSTANT_S }
        : { mode: "camera", exposureSeconds: DEFAULT_CAMERA_EXPOSURE_S };
    setLook({ shutter });
  }

  function setEyeTimeConstant(seconds: number) {
    setLook({ shutter: { mode: "eye", timeConstantSeconds: seconds } });
  }

  function setCameraExposure(seconds: number) {
    setLook({ shutter: { mode: "camera", exposureSeconds: seconds } });
  }

  function setGlare(value: number) {
    setLook({ glare: value });
  }

  const glarePct = $derived(
    led
      ? Math.round(
          ((led.look.glare - GLARE_WEIGHT_MIN) /
            (GLARE_WEIGHT_MAX - GLARE_WEIGHT_MIN)) *
            100
        )
      : 0
  );
</script>

<div class="customize-view" class:paged>
  {#if !embedded}
    <button type="button" class="back-btn" onclick={onBack}>
      <i class="fas fa-arrow-left" aria-hidden="true"></i>
      {t("effect_deep_back_to_presets")}
    </button>
  {/if}

  {#if effectsState && led}
    {#if paged}
      <div class="group-pages" role="group" aria-label="LED controls">
        {#each [{ id: "prop", label: "Prop" }, { id: "pattern", label: "Pattern" }, { id: "color", label: "Colors & loop" }, { id: "look", label: "Look" }] as option}
          <button
            type="button"
            aria-pressed={page === option.id}
            class:active={page === option.id}
            onclick={() => selectPage(option.id as LedCustomizePage)}
            >{option.label}</button
          >
        {/each}
      </div>
    {/if}
    <div class="led-controls">
      <!-- Device -->
      {#if !paged || page === "prop"}
        <div class="group">
          <span class="group-label" id="led-device-label"
            >{t("effect_deep_prop")}</span
          >
          <SegmentedControl
            options={DEVICE_OPTIONS.map((option) => ({
              ...option,
              label: effectUiLabel(option.label),
              shortLabel: option.shortLabel
                ? effectUiLabel(option.shortLabel)
                : undefined,
            }))}
            value={deviceValue}
            onchange={(v) => setDevice(v as DeviceValue)}
            color="accent"
            size="sm"
            ariaLabelledby="led-device-label"
            semantics="radiogroup"
          />
        </div>
      {/if}

      <!-- Pattern -->
      {#if !paged || page === "pattern"}
        <div class="group">
          <span class="group-label" id="led-pattern-label"
            >{t("effect_deep_pattern")}</span
          >
          <div
            class="pattern-grid"
            role="radiogroup"
            aria-labelledby="led-pattern-label"
          >
            {#each BUILT_IN_PRESETS as generator (generator.id)}
              {@const isActive = generator.id === activeGeneratorId}
              <button
                type="button"
                class="pattern-card"
                class:active={isActive}
                role="radio"
                aria-checked={isActive}
                onclick={() => setGenerator(generator.id)}
              >
                <canvas
                  class="pattern-strip"
                  width="144"
                  height="40"
                  bind:this={stripCanvases[generator.id]}
                ></canvas>
                <span class="pattern-name">
                  {effectUiLabel(
                    PATTERN_LABELS[generator.id] ?? generator.name
                  )}
                </span>
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Colors: the slot is always reserved so switching patterns never
           shifts the rows below; pickers the pattern ignores go invisible. -->
      {#if !paged || page === "color"}
        <div class="color-row" class:reserved-hidden={colorSlots === 0}>
          <span class="color-label"
            >{colorSlots === 2
              ? t("effect_deep_colors")
              : t("effect_deep_color")}</span
          >
          <div class="color-pickers">
            <label class="color-picker">
              <input
                type="color"
                aria-label={t("effect_deep_primary_pattern_color")}
                value={rgbToHex(currentParams.primaryColor)}
                oninput={(e) =>
                  setParamColor(
                    "primaryColor",
                    (e.currentTarget as HTMLInputElement).value
                  )}
              />
            </label>
            <label class="color-picker" class:reserved-hidden={colorSlots < 2}>
              <input
                type="color"
                aria-label={t("effect_deep_secondary_pattern_color")}
                value={rgbToHex(
                  currentParams.secondaryColor ?? currentParams.primaryColor
                )}
                oninput={(e) =>
                  setParamColor(
                    "secondaryColor",
                    (e.currentTarget as HTMLInputElement).value
                  )}
              />
            </label>
          </div>
        </div>

        <!-- Loop -->
        <div class="slider-row">
          <label for="led-cycle">{t("effect_deep_loop")}</label>
          <input
            id="led-cycle"
            type="range"
            min="0"
            max="1"
            step="0.005"
            value={cycleSliderValue}
            oninput={(e) =>
              setCycleFromSlider(+(e.currentTarget as HTMLInputElement).value)}
          />
          <span class="slider-value">{formatSeconds(led.cycleDuration)}</span>
        </div>
      {/if}

      <!-- Look -->
      {#if !paged || page === "look"}
        <div class="group">
          <span class="group-label">{t("effect_deep_look")}</span>

          <div class="shutter-row">
            <span class="group-label" id="led-shutter-label"
              >{t("effect_deep_shutter")}</span
            >
            <SegmentedControl
              options={SHUTTER_MODE_OPTIONS.map((option) => ({
                ...option,
                label: effectUiLabel(option.label),
              }))}
              value={shutterMode}
              onchange={(v) => setShutterMode(v)}
              color="accent"
              size="sm"
              ariaLabelledby="led-shutter-label"
              semantics="radiogroup"
            />
            <p class="helper-text">
              Eye is what you see: a fading afterglow. Camera is what a long
              exposure captures: a solid streak.
            </p>
          </div>

          <!-- Only one of these two rows applies at a time. They share one grid
             cell, so the slot is exactly one row tall whichever is showing and
             switching shutter mode shifts nothing below it. -->
          <div class="shutter-slot">
            <div
              class="slider-row"
              class:reserved-hidden={shutterMode !== "eye"}
            >
              <label for="led-eye-persistence"
                >{t("effect_deep_persistence")}</label
              >
              <input
                id="led-eye-persistence"
                type="range"
                min={EYE_TIME_CONSTANT_MIN_S}
                max={EYE_TIME_CONSTANT_MAX_S}
                step="0.005"
                value={eyeTimeConstant}
                oninput={(e) =>
                  setEyeTimeConstant(
                    +(e.currentTarget as HTMLInputElement).value
                  )}
              />
              <span class="slider-value">
                {Math.round(eyeTimeConstant * 1000)}ms
              </span>
            </div>

            <div
              class="slider-row"
              class:reserved-hidden={shutterMode !== "camera"}
            >
              <label for="led-camera-exposure"
                >{t("effect_deep_exposure")}</label
              >
              <input
                id="led-camera-exposure"
                type="range"
                min={CAMERA_EXPOSURE_MIN_S}
                max={CAMERA_EXPOSURE_MAX_S}
                step="0.05"
                value={cameraExposure}
                oninput={(e) =>
                  setCameraExposure(
                    +(e.currentTarget as HTMLInputElement).value
                  )}
              />
              <span class="slider-value">{cameraExposure.toFixed(2)}s</span>
            </div>
          </div>

          <div class="slider-row">
            <label for="led-glare">{t("effect_deep_glare")}</label>
            <input
              id="led-glare"
              type="range"
              min={GLARE_WEIGHT_MIN}
              max={GLARE_WEIGHT_MAX}
              step="0.01"
              value={led.look.glare}
              oninput={(e) =>
                setGlare(+(e.currentTarget as HTMLInputElement).value)}
            />
            <span class="slider-value">{glarePct}%</span>
          </div>

          <div class="brightness-row">
            <span class="group-label" id="led-brightness-label"
              >{t("effect_deep_brightness")}</span
            >
            <SegmentedControl
              options={BRIGHTNESS_OPTIONS.map((option) => ({
                ...option,
                label: effectUiLabel(option.label),
              }))}
              value={String(led.look.brightness)}
              onchange={(v) => setLook({ brightness: Number(v) })}
              color="accent"
              size="sm"
              ariaLabelledby="led-brightness-label"
              semantics="radiogroup"
            />
          </div>
        </div>
      {/if}
    </div>
  {:else}
    <p class="empty">{t("effect_deep_effect_state_unavailable")}</p>
  {/if}
</div>

<style>
  .customize-view {
    display: flex;
    flex-direction: column;
    gap: 12px;
    container: effect-led / inline-size;
  }

  .group-pages {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 4px;
    min-width: 0;
  }
  .group-pages button {
    min-width: 0;
    min-height: var(--min-touch-target, 44px);
    padding: 4px 6px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text, white);
    font: inherit;
    font-size: var(--font-size-compact, 12px);
    cursor: pointer;
  }
  .group-pages button.active {
    border-color: var(--theme-accent, #8b5cf6);
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 22%,
      transparent
    );
  }
  .group-pages button:focus-visible {
    outline: 2px solid var(--theme-accent, #8b5cf6);
    outline-offset: 2px;
  }

  .back-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    min-height: 44px;
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-min, 14px);
    cursor: pointer;
    transition: all var(--duration-fast, 100ms) ease;
    -webkit-tap-highlight-color: transparent;
  }

  .back-btn:hover {
    background: color-mix(in srgb, var(--theme-text) 8%, transparent);
    color: var(--theme-text, white);
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
  }

  .back-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #8b5cf6);
    outline-offset: 2px;
  }

  .back-btn i {
    font-size: 12px;
  }

  .led-controls {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .group-label {
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.55));
  }

  .pattern-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .paged .group-label {
    display: none;
  }
  .paged .pattern-card {
    padding: 5px;
  }
  .paged .pattern-strip {
    height: 20px;
  }

  /* Seven generators against two columns leaves the last one alone on its own
     row. Let it take the full width instead — a wide card reads as the end of
     the list; a half-width one reads as a mistake. */
  .pattern-card:last-child:nth-child(odd) {
    grid-column: 1 / -1;
  }

  @container effect-led (min-width: 30rem) {
    .paged .pattern-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .paged .pattern-card:last-child:nth-child(odd) {
      grid-column: auto;
    }
  }

  .pattern-card {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
    padding: 7px;
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text, white);
    cursor: pointer;
    transition:
      border-color var(--duration-fast, 100ms) ease,
      background var(--duration-fast, 100ms) ease;
    -webkit-tap-highlight-color: transparent;
  }

  .pattern-card:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
  }

  .pattern-card.active {
    border-color: var(--theme-accent, #8b5cf6);
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 8%,
      transparent
    );
  }

  .pattern-card:focus-visible {
    outline: 2px solid var(--theme-accent, #8b5cf6);
    outline-offset: 2px;
  }

  .pattern-strip {
    display: block;
    width: 100%;
    height: 28px;
    border-radius: 5px;
    background: #05060b;
  }

  .pattern-name {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    text-align: left;
    line-height: 1.2;
  }

  .color-row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: var(--min-touch-target, 44px);
  }

  .reserved-hidden {
    visibility: hidden;
  }

  .shutter-slot {
    display: grid;
  }

  .shutter-slot > .slider-row {
    grid-area: 1 / 1;
  }

  .color-label {
    min-width: 70px;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .color-pickers {
    display: flex;
    gap: 8px;
    flex: 1;
  }

  .color-picker {
    display: flex;
    align-items: center;
    cursor: pointer;
  }

  .color-picker input[type="color"] {
    -webkit-appearance: none;
    appearance: none;
    width: 32px;
    height: 32px;
    border: 2px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    border-radius: 50%;
    background: none;
    cursor: pointer;
    padding: 0;
  }

  .color-picker input[type="color"]::-webkit-color-swatch-wrapper {
    padding: 2px;
  }

  .color-picker input[type="color"]::-webkit-color-swatch {
    border: none;
    border-radius: 50%;
  }

  .color-picker input[type="color"]::-moz-color-swatch {
    border: none;
    border-radius: 50%;
  }

  .slider-row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: var(--min-touch-target, 44px);
  }

  .slider-row label {
    min-width: 70px;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .slider-row input[type="range"] {
    flex: 1;
    accent-color: var(--theme-accent, #8b5cf6);
  }

  .slider-value {
    min-width: 48px;
    text-align: right;
    font-family: var(--font-mono, monospace);
    font-size: var(--font-size-compact, 12px);
    font-variant-numeric: tabular-nums;
    color: var(--theme-text, white);
  }

  .shutter-row {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .helper-text {
    margin: 0;
    font-size: var(--font-size-compact, 12px);
    line-height: 1.4;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .brightness-row {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .empty {
    opacity: 0.6;
    font-size: var(--font-size-min, 14px);
    padding: 4px 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .back-btn,
    .pattern-card {
      transition: none;
    }
  }
</style>
