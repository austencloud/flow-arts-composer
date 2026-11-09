<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { Snippet } from "svelte";
  import ColorPicker from "svelte-awesome-color-picker";
  import { Crossfade, growFade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import { COLOR_PRESETS } from "../color-presets";
  import { COOL_PRESETS, WARM_PRESETS } from "../color-temperature";
  import BareWrapper from "./color-picker/BareWrapper.svelte";
  import type { HandSide } from "@tka/tka-types";

  interface Props {
    left: string;
    right: string;
    leftLabel?: string;
    rightLabel?: string;
    groupLabel?: string;
    /** Live render of the pair; callers whose art is already on screen omit it. */
    preview?: Snippet<[{ left: string; right: string }]>;
    onchange: (hand: HandSide, value: string) => void;
    /** One call that swaps both hands; the button only appears when provided. */
    onswap?: () => void;
    /** What the line under each tile says. "name" is for hosts where a hex
        code is noise (the viewer's dots menu): a preset's name, or "Custom".
        The hex is still there inside the open editor's field. */
    valueLabel?: "hex" | "name";
    /** The gradient bar over the tiles. A host whose tiles already carry the
        colors and has little room turns it off. */
    showPairPreview?: boolean;
    /** Names that win over the preset lookup in "name" mode. The dots menu
        passes "Default" while no pair is chosen, because the default motion
        colors aren't presets and the tiles would otherwise say "Custom". */
    valueNames?: { left?: string; right?: string };
    /** Which tile's editor is open, for a host that lays itself out around it. */
    editing?: HandSide | null;
    /** For a panel with no height to spare: tight tiles, the swatches in one
        12-column block, and the custom picker behind a button instead of under
        them, so the open editor never makes the panel scroll. */
    compact?: boolean;
  }

  let {
    left,
    right,
    leftLabel,
    rightLabel,
    groupLabel,
    preview,
    onchange,
    onswap,
    valueLabel = "hex",
    showPairPreview = true,
    valueNames,
    editing = $bindable(null),
    compact = false,
  }: Props = $props();

  const editorId = $props.id();
  let customOpen = $state(false);

  let leftInput = $state<HTMLInputElement>();
  let rightInput = $state<HTMLInputElement>();

  const entries = $derived([
    {
      hand: "left" as const,
      label: leftLabel ?? t("color_left_prop"),
      value: left,
      input: leftInput,
    },
    {
      hand: "right" as const,
      label: rightLabel ?? t("color_right_prop"),
      value: right,
      input: rightInput,
    },
  ]);

  // The cool and warm lists are cuts of the same matrix, so one lookup over
  // COLOR_PRESETS names every swatch the editor offers.
  function displayValue(hand: HandSide, value: string): string {
    if (valueLabel === "hex") return value.toUpperCase();
    const given = valueNames?.[hand];
    if (given) return given;
    const hex = value.toLowerCase();
    return (
      COLOR_PRESETS.find((preset) => preset.hex === hex)?.name ??
      t("color_value_custom")
    );
  }

  const neutralPresets = COLOR_PRESETS.filter(
    (preset) => preset.row === "neutral"
  );

  type EyeDropperCtor = new () => { open(): Promise<{ sRGBHex: string }> };
  // Chromium only. The editor never renders on the server, so a plain check
  // at init is safe; elsewhere the native input stays as the fallback.
  const eyeDropper =
    typeof window === "undefined"
      ? undefined
      : (window as Window & { EyeDropper?: EyeDropperCtor }).EyeDropper;

  async function pickFromScreen(hand: HandSide) {
    if (!eyeDropper) return;
    try {
      const { sRGBHex } = await new eyeDropper().open();
      onchange(hand, sRGBHex.toLowerCase());
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        console.warn("Eyedropper failed", error);
      }
    }
  }

  function applyPicked(hand: HandSide, current: string, hex: string | null) {
    if (!hex) return;
    const next = hex.slice(0, 7).toLowerCase();
    if (next !== current.toLowerCase()) onchange(hand, next);
  }

  /** Reads "#RRGGBB" with or without the hash. The "#RGB" shorthand only
      counts once the edit is committed, so typing a six-digit value is never
      cut short after its first three digits. */
  function parseHex(raw: string, allowShorthand: boolean): string | null {
    const digits = raw.trim().replace(/^#/, "").toLowerCase();
    if (/^[0-9a-f]{6}$/.test(digits)) return `#${digits}`;
    if (allowShorthand && /^[0-9a-f]{3}$/.test(digits)) {
      return `#${[...digits].map((digit) => digit + digit).join("")}`;
    }
    return null;
  }
</script>

{#snippet swatches(entry: (typeof entries)[number])}
  <div class="preset-block">
    <div class="hue-groups">
      {#each [{ label: t("color_cool_colors"), presets: COOL_PRESETS }, { label: t("color_warm_colors"), presets: WARM_PRESETS }] as group (group.label)}
        <div
          class="preset-group"
          role="group"
          aria-label={`${entry.label}: ${group.label}`}
        >
          <span class="preset-heading">{group.label}</span>
          <div class="preset-grid">
            {#each group.presets as preset (preset.hex)}
              {@const pressed = entry.value.toLowerCase() === preset.hex}
              <button
                type="button"
                class="preset"
                style:--preset={preset.hex}
                aria-label={`${entry.label}: ${preset.name}`}
                aria-pressed={pressed}
                title={preset.name}
                onclick={() => onchange(entry.hand, preset.hex)}
              >
                <span aria-hidden="true">{pressed ? "✓" : ""}</span>
              </button>
            {/each}
          </div>
        </div>
      {/each}
    </div>
    <div
      class="preset-group"
      role="group"
      aria-label={`${entry.label}: ${t("color_neutral_colors")}`}
    >
      <span class="preset-heading">{t("color_neutral_colors")}</span>
      <div class="preset-grid neutral-grid">
        {#each neutralPresets as preset (preset.hex)}
          {@const pressed = entry.value.toLowerCase() === preset.hex}
          <button
            type="button"
            class="preset"
            style:--preset={preset.hex}
            aria-label={`${entry.label}: ${preset.name}`}
            aria-pressed={pressed}
            title={preset.name}
            onclick={() => onchange(entry.hand, preset.hex)}
          >
            <span aria-hidden="true">{pressed ? "✓" : ""}</span>
          </button>
        {/each}
      </div>
    </div>
    {#if compact}
      {@render modeToggle()}
    {/if}
  </div>
{/snippet}

{#snippet modeToggle()}
  <button
    type="button"
    class="custom-button mode-toggle"
    aria-expanded={customOpen}
    onclick={() => (customOpen = !customOpen)}
  >
    {customOpen ? t("color_swatches") : t("color_value_custom")}
  </button>
{/snippet}

{#snippet fineTune(entry: (typeof entries)[number])}
  <div class="fine-tune">
    <ColorPicker
      hex={entry.value}
      isDialog={false}
      isAlpha={false}
      isTextInput={false}
      sliderDirection="horizontal"
      components={{ wrapper: BareWrapper }}
      texts={{
        label: {
          h: `${entry.label} hue`,
          s: `${entry.label} saturation`,
          v: `${entry.label} brightness`,
        },
      }}
      onInput={(color) => applyPicked(entry.hand, entry.value, color.hex)}
    />
    <div class="custom-row">
      <label class="hex-field">
        <span>{t("color_hex")}</span>
        <input
          aria-label={`${entry.label}, ${t("color_hex")}`}
          dir="ltr"
          type="text"
          value={entry.value.toUpperCase()}
          maxlength="7"
          pattern={"#?([0-9a-fA-F]{3}){1,2}"}
          spellcheck="false"
          autocomplete="off"
          oninput={(event) =>
            applyPicked(
              entry.hand,
              entry.value,
              parseHex(event.currentTarget.value, false)
            )}
          onchange={(event) =>
            applyPicked(
              entry.hand,
              entry.value,
              parseHex(event.currentTarget.value, true)
            )}
          onblur={(event) => {
            event.currentTarget.value = entry.value.toUpperCase();
          }}
        />
      </label>
      {#if eyeDropper}
        <button
          class="custom-button"
          type="button"
          aria-label={t("color_pick_screen_label")}
          title={t("color_pick_screen")}
          onclick={() => pickFromScreen(entry.hand)}
        >
          <i class="fas fa-eye-dropper" aria-hidden="true"></i>
        </button>
      {:else}
        <button
          class="custom-button"
          type="button"
          onclick={() => entry.input?.click()}
        >
          {t("color_more")}
        </button>
      {/if}
      {#if compact}
        {@render modeToggle()}
      {/if}
    </div>
  </div>
{/snippet}

<div
  class="color-pair"
  class:compact
  role="group"
  aria-label={groupLabel ?? t("color_prop_colors")}
>
  {#if preview}
    <div class="pair-preview-art">{@render preview({ left, right })}</div>
  {/if}
  {#if showPairPreview}
    <span
      class="pair-preview"
      style:background={`linear-gradient(90deg, ${left}, ${right})`}
      aria-hidden="true"
    ></span>
  {/if}
  <div class="pair-controls" class:has-swap={!!onswap}>
    {#each entries as entry, index (entry.hand)}
      {#if index === 1 && onswap}
        <button
          type="button"
          class="swap"
          aria-label={t("color_swap_sides")}
          title={t("keyboard_ui_swap")}
          onclick={onswap}
        >
          <i class="fas fa-right-left" aria-hidden="true"></i>
        </button>
      {/if}
      <button
        type="button"
        class="color-control"
        style:--color={entry.value}
        aria-label={t("color_edit_value", {
          label: entry.label,
          value: displayValue(entry.hand, entry.value),
        })}
        aria-expanded={editing === entry.hand}
        aria-controls={editing === entry.hand ? editorId : undefined}
        onclick={() => (editing = editing === entry.hand ? null : entry.hand)}
      >
        <span class="color-swatch" aria-hidden="true">
          <i class="fas fa-eye-dropper"></i>
        </span>
        <span class="color-meta">
          <span class="color-label">{entry.label}</span>
          <span
            class="color-value"
            class:named={valueLabel === "name"}
            dir={valueLabel === "hex" ? "ltr" : undefined}
            >{displayValue(entry.hand, entry.value)}</span
          >
        </span>
      </button>
    {/each}
    <input
      bind:this={leftInput}
      class="native-color"
      type="color"
      value={left}
      tabindex="-1"
      aria-hidden="true"
      oninput={(event) =>
        onchange("left", (event.currentTarget as HTMLInputElement).value)}
    />
    <input
      bind:this={rightInput}
      class="native-color"
      type="color"
      value={right}
      tabindex="-1"
      aria-hidden="true"
      oninput={(event) =>
        onchange("right", (event.currentTarget as HTMLInputElement).value)}
    />
  </div>
  {#if editing}
    {@const entry = entries.find((item) => item.hand === editing)!}
    <!-- One bidirectional transition, so an interrupted open or close reverses
         from where it is. Params are read as each run starts: longer open,
         shorter close. -->
    <div
      class="color-editor"
      id={editorId}
      role="group"
      aria-label={`${entry.label} color`}
      transition:growFade={{
        duration: editing ? DURATION.emphasis : DURATION.normal,
      }}
    >
      {#if compact}
        <Crossfade
          key={customOpen ? "custom" : "swatches"}
          duration={DURATION.normal}
          animateHeight
        >
          {#if customOpen}
            {@render fineTune(entry)}
          {:else}
            {@render swatches(entry)}
          {/if}
        </Crossfade>
      {:else}
        {@render swatches(entry)}
        {@render fineTune(entry)}
      {/if}
    </div>
  {/if}
</div>

<style>
  .color-pair {
    display: flex;
    flex-direction: column;
    min-width: 0;
    container: color-pair / inline-size;
  }

  /* Sibling margins instead of gap: the slide transition animates the
     editor's margin along with its height, so closing ends at zero rather
     than snapping over a leftover gap. */
  .color-pair > * + * {
    margin-top: 10px;
  }

  .pair-preview-art {
    display: flex;
    justify-content: center;
    min-width: 0;
  }

  .pair-preview {
    display: block;
    width: 100%;
    height: 14px;
    border-radius: 999px;
    box-shadow:
      inset 0 0 0 1px rgba(255, 255, 255, 0.12),
      0 2px 8px rgba(0, 0, 0, 0.35);
  }

  .pair-controls {
    position: relative;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .pair-controls.has-swap {
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  }

  .swap {
    align-self: center;
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 999px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text, #fff);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .swap:hover {
    border-color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
  }

  .color-control {
    min-width: 0;
    min-height: 52px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 12px;
    background: color-mix(
      in srgb,
      var(--theme-card-bg, rgba(255, 255, 255, 0.04)) 70%,
      transparent
    );
    color: var(--theme-text, #fff);
    cursor: pointer;
    overflow: hidden;
    -webkit-tap-highlight-color: transparent;
    transition:
      border-color var(--transition-fast, var(--duration-fast)),
      box-shadow var(--transition-fast, var(--duration-fast));
  }

  .color-control:hover {
    border-color: color-mix(
      in srgb,
      var(--color) 50%,
      var(--theme-stroke, rgba(255, 255, 255, 0.2))
    );
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--color) 40%, transparent);
  }

  .color-control[aria-expanded="true"] {
    border-color: color-mix(in srgb, var(--color) 70%, white);
  }

  .color-swatch {
    flex: 0 0 auto;
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border-radius: 9px;
    background: var(--color);
    box-shadow:
      inset 0 0 0 1px rgba(255, 255, 255, 0.25),
      0 2px 6px color-mix(in srgb, var(--color) 45%, transparent);
    color: rgba(255, 255, 255, 0.95);
    font-size: 12px;
  }

  .color-swatch i {
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6));
  }

  .color-meta {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
    text-align: left;
  }

  .color-label {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.68));
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
  }

  .color-value {
    color: var(--theme-text, #fff);
    font-family: ui-monospace, "SF Mono", monospace;
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    letter-spacing: 0.02em;
  }

  .color-value.named {
    font-family: inherit;
    font-weight: 600;
    letter-spacing: normal;
    overflow-wrap: anywhere;
  }

  /* Editor: swatch matrix + fine tune. A container query never matches the
     element that declares the container, so the editor asks the outer
     color-pair container and the matrix asks its preset-block wrapper. */
  .color-editor {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
    padding: 8px;
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
    background: var(--theme-card-bg);
  }

  /* Two columns once the preset block can hold 8 columns beside the 16rem
     fine-tune track: 42rem - 16rem - 12px gap - 18px padding and border
     leaves 24rem. */
  @container color-pair (min-width: 42rem) {
    .color-editor {
      grid-template-columns: minmax(0, 1fr) 16rem;
    }
  }

  .preset-block {
    min-width: 0;
    display: grid;
    gap: 12px;
    container: preset-block / inline-size;
  }

  .hue-groups {
    display: grid;
    gap: 12px;
  }

  .preset-group {
    min-width: 0;
    display: grid;
    gap: 5px;
  }

  .preset-heading {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
  }

  .preset-grid {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 4px;
    align-content: start;
  }

  @container preset-block (max-width: 19rem) {
    .preset-grid {
      grid-template-columns: repeat(5, minmax(0, 1fr));
    }
  }

  @container preset-block (min-width: 37rem) {
    .hue-groups {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @container preset-block (min-width: 36rem) {
    .neutral-grid {
      grid-template-columns: repeat(12, minmax(0, 1fr));
    }
  }

  .preset {
    min-width: 0;
    aspect-ratio: 1;
    padding: 3px;
    border: 2px solid transparent;
    border-radius: 10px;
    background: transparent;
    cursor: pointer;
  }

  .preset span {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    border-radius: 6px;
    background: var(--preset);
    color: white;
    font-size: 14px;
    text-shadow:
      0 1px 3px black,
      0 0 3px black;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.35);
  }

  .preset[aria-pressed="true"] {
    border-color: var(--theme-text);
  }

  .preset:focus-visible,
  .swap:focus-visible,
  .custom-button:focus-visible,
  .hex-field input:focus-visible,
  .color-control:focus-visible {
    outline: 2px solid var(--theme-text);
    outline-offset: 2px;
  }

  .fine-tune {
    display: grid;
    /* Children may not widen the track. */
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
    align-content: start;
    min-width: 0;
    /* Stacked under the matrix the block would otherwise stretch the SV
       square into a 650px strip. */
    max-width: 28rem;
    container: fine-tune / inline-size;
    /* svelte-awesome-color-picker sizing and theme hooks; cqi resolves to a
       length so the library's px arithmetic keeps working. */
    --picker-width: 100cqi;
    --picker-height: 160px;
    --picker-radius: 10px;
    --picker-indicator-size: 14px;
    --slider-width: 14px;
    --focus-color: var(--theme-text);
    --cp-border-color: var(--theme-stroke);
    --cp-text-color: var(--theme-text);
  }

  .fine-tune :global(.color-picker) {
    display: block;
    width: 100%;
  }

  /* The library's touch handlers are passive under Svelte 5, so the browser
     must be told not to scroll while dragging the square or a slider. */
  .fine-tune :global(.picker),
  .fine-tune :global(.slider) {
    touch-action: none;
  }

  .custom-row {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: 8px;
  }

  .hex-field {
    display: grid;
    gap: 4px;
    flex: 1;
    min-width: 100px;
  }

  .hex-field span {
    font-size: 14px;
    color: var(--theme-text);
  }

  .hex-field input,
  .custom-button {
    box-sizing: border-box;
    min-height: 44px;
    min-width: 44px;
    width: 100%;
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    padding: 8px;
    color: var(--theme-text);
    background: var(--theme-panel-bg);
    font-size: 14px;
  }

  .hex-field input {
    font-family: ui-monospace, monospace;
  }

  .custom-button {
    width: auto;
    cursor: pointer;
  }

  .native-color {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    border: 0;
    opacity: 0;
    pointer-events: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .color-control {
      transition: none;
    }
  }

  /* Narrow hosts (the viewer's dots menu is about 18rem) keep the pair on
     one row, with the swap between the two hands, by turning each tile
     upright: swatch on top, label and value under it. */
  @container color-pair (max-width: 22rem) {
    .pair-controls,
    .pair-controls.has-swap {
      grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
      gap: 8px;
    }

    .color-control {
      flex-direction: column;
      justify-content: center;
      gap: 6px;
      min-height: 0;
      padding: 10px 6px;
    }

    .color-meta {
      align-items: center;
      text-align: center;
    }

    .color-label {
      overflow-wrap: anywhere;
    }

    .swap {
      width: 40px;
      height: 40px;
    }
  }

  /* Only a host too narrow for two upright tiles stacks the rows. */
  @container color-pair (max-width: 13rem) {
    .pair-controls,
    .pair-controls.has-swap {
      grid-template-columns: 1fr;
    }

    .color-control {
      flex-direction: row;
    }

    .swap {
      justify-self: center;
    }
  }

  /* The compact editor. The matrix is 12 hues across and 4 rows down, so cool and
     warm sit side by side and the neutrals run underneath at the same pitch. */
  .compact.color-pair > * + * {
    margin-top: 8px;
  }

  .compact .color-editor {
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
    padding: 6px;
  }

  .compact .preset-block,
  .compact .hue-groups {
    gap: 2px;
  }

  .compact .hue-groups {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .compact .preset-group {
    gap: 0;
  }

  .compact .preset-grid {
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 2px;
  }

  .compact .neutral-grid {
    grid-template-columns: repeat(12, minmax(0, 1fr));
  }

  /* Without this the app's button floor sets the height, and aspect-ratio turns
     that into a width wider than the grid cell, so the swatches overlap. */
  .compact .preset {
    min-height: 0;
    padding: 1px;
    border-radius: 7px;
  }

  .compact .preset span {
    border-radius: 4px;
    font-size: 11px;
  }

  /* The groups keep their names for screen readers through aria-label. */
  .compact .preset-heading {
    display: none;
  }

  .compact .fine-tune {
    gap: 8px;
    justify-self: center;
    width: 100%;
    --picker-height: 84px;
  }

  /* A phone on its side has the least height of anything. */
  @media (orientation: landscape) and (max-height: 520px) {
    .compact .fine-tune {
      --picker-height: 56px;
    }
  }

  .compact .custom-row {
    flex-wrap: nowrap;
  }

  .compact .hex-field {
    min-width: 72px;
  }

  .compact .hex-field span {
    display: none;
  }

  .compact .hex-field input,
  .compact .custom-button {
    min-height: 36px;
    padding: 6px 8px;
  }

  .compact .custom-row .mode-toggle {
    flex-shrink: 0;
  }

  .compact .preset-block .mode-toggle {
    width: 100%;
    margin-top: 6px;
  }

  .compact .pair-controls,
  .compact .pair-controls.has-swap {
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    gap: 6px;
  }

  .compact .color-control {
    flex-direction: row;
    justify-content: flex-start;
    gap: 8px;
    min-height: 44px;
    padding: 4px 8px;
  }

  .compact .color-swatch {
    width: 26px;
    height: 26px;
    border-radius: 7px;
    font-size: 10px;
  }

  .compact .color-meta {
    align-items: flex-start;
    text-align: left;
  }

  .compact .color-label,
  .compact .color-value {
    line-height: 1.2;
  }

  .compact .swap {
    width: 34px;
    height: 34px;
  }

  @media (orientation: landscape) and (max-height: 520px) {
    .compact .color-control {
      min-height: 36px;
      padding: 2px 8px;
    }
  }

  /* A tall panel has room to spare, and tiny swatches would leave it half empty,
     so the swatches take their full size and the groups get their names back. */
  @media (min-width: 769px) and (min-height: 700px) {
    .compact .preset-block,
    .compact .hue-groups {
      gap: 10px;
    }

    .compact .hue-groups {
      grid-template-columns: minmax(0, 1fr);
    }

    .compact .preset-group {
      gap: 4px;
    }

    .compact .neutral-grid {
      grid-template-columns: repeat(6, minmax(0, 1fr));
    }

    .compact .preset-heading {
      display: block;
    }

    .compact .preset {
      padding: 2px;
      border-radius: 10px;
    }

    .compact .preset span {
      border-radius: 6px;
      font-size: 14px;
    }

    .compact .fine-tune {
      --picker-height: 160px;
    }
  }
</style>
