<script lang="ts">
  import type { Snippet } from "svelte";
  import ColorPicker from "svelte-awesome-color-picker";
  import { COLOR_PRESETS, COLOR_PRESET_COLUMNS } from "../color-presets";
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
  }

  let {
    left,
    right,
    leftLabel = "Left prop",
    rightLabel = "Right prop",
    groupLabel = "Prop colors",
    preview,
    onchange,
    onswap,
  }: Props = $props();

  let editing = $state<HandSide | null>(null);
  const editorId = $props.id();

  let leftInput = $state<HTMLInputElement>();
  let rightInput = $state<HTMLInputElement>();

  const entries = $derived([
    { hand: "left" as const, label: leftLabel, value: left, input: leftInput },
    { hand: "right" as const, label: rightLabel, value: right, input: rightInput },
  ]);

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
</script>

<div class="color-pair" role="group" aria-label={groupLabel}>
  {#if preview}
    <div class="pair-preview-art">{@render preview({ left, right })}</div>
  {/if}
  <span
    class="pair-preview"
    style:background={`linear-gradient(90deg, ${left}, ${right})`}
    aria-hidden="true"
  ></span>
  <div class="pair-controls" class:has-swap={!!onswap}>
    {#each entries as entry, index (entry.hand)}
      {#if index === 1 && onswap}
        <button
          type="button"
          class="swap"
          aria-label="Swap left and right colors"
          title="Swap"
          onclick={onswap}
        >
          <i class="fas fa-right-left" aria-hidden="true"></i>
        </button>
      {/if}
      <button
        type="button"
        class="color-control"
        style:--color={entry.value}
        aria-label={`Edit ${entry.label}, ${entry.value.toUpperCase()}`}
        aria-expanded={editing === entry.hand}
        aria-controls={editing === entry.hand ? editorId : undefined}
        onclick={() => (editing = editing === entry.hand ? null : entry.hand)}
      >
        <span class="color-swatch" aria-hidden="true">
          <i class="fas fa-eye-dropper"></i>
        </span>
        <span class="color-meta">
          <span class="color-label">{entry.label}</span>
          <span class="color-value">{entry.value.toUpperCase()}</span>
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
    <div class="color-editor" id={editorId} role="group" aria-label={`${entry.label} color`}>
      <div class="preset-block">
        <div
          class="preset-grid"
          role="group"
          aria-label={`${entry.label} presets`}
          style:--columns={COLOR_PRESET_COLUMNS}
        >
          {#each COLOR_PRESETS as preset (preset.hex)}
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
            <span>Hex color</span>
            <input
              aria-label={`${entry.label} hex color`}
              type="text"
              value={entry.value.toUpperCase()}
              maxlength="7"
              pattern={"#[0-9a-fA-F]{6}"}
              spellcheck="false"
              autocomplete="off"
              oninput={(event) => {
                const value = event.currentTarget.value;
                if (/^#[0-9a-f]{6}$/i.test(value)) onchange(entry.hand, value.toLowerCase());
              }}
              onblur={(event) => {
                event.currentTarget.value = entry.value.toUpperCase();
              }}
            />
          </label>
          {#if eyeDropper}
            <button
              class="custom-button"
              type="button"
              aria-label="Pick a color from the screen"
              title="Pick from screen"
              onclick={() => pickFromScreen(entry.hand)}
            >
              <i class="fas fa-eye-dropper" aria-hidden="true"></i>
            </button>
          {:else}
            <button class="custom-button" type="button" onclick={() => entry.input?.click()}>
              More colors
            </button>
          {/if}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .color-pair {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
    container: color-pair / inline-size;
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
      border-color var(--transition-fast, 150ms),
      box-shadow var(--transition-fast, 150ms);
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
    container: preset-grid / inline-size;
  }

  /* The matrix picks its column count from the block width so no row is
     ever short (48 divides by 12, 8 and 6) and every swatch stays at the
     44px touch floor: 6 columns from 284px, 8 from 24rem, 12 from 36rem. */
  .preset-grid {
    --cols: 6;
    display: grid;
    grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
    gap: 4px;
    align-content: start;
  }

  @container preset-grid (min-width: 24rem) {
    .preset-grid {
      --cols: 8;
    }
  }

  @container preset-grid (min-width: 36rem) {
    .preset-grid {
      --cols: var(--columns, 12);
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

  @container color-pair (max-width: 19rem) {
    .pair-controls,
    .pair-controls.has-swap {
      grid-template-columns: 1fr;
    }

    .swap {
      justify-self: center;
    }
  }
</style>
