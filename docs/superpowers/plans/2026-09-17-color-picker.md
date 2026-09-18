# Prop Color Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the orphaning 16-swatch strip in `LabeledColorPairPicker` with a 48-swatch OKLCH matrix that always fills its rows, an inline saturation/hue picker, hex field, eyedropper, swap button, and an optional live prop preview.

**Architecture:** `LabeledColorPairPicker` stays the single owner of pair-color editing. The saturation/value square and hue slider come from `svelte-awesome-color-picker@4.1.3` (already in `package.json`), rendered inline through a bare wrapper. Swatches are generated once by a script into `color-presets.ts`. Callers opt into a preview by passing a snippet.

**Tech Stack:** Svelte 5 runes, SvelteKit, `svelte-awesome-color-picker` (+ `colord`), Vitest (unit + `vitest-browser-svelte` component tests), Font Awesome icon classes already used across the app.

Spec: `docs/superpowers/specs/2026-09-17-color-picker-design.md`. Worktree: `E:/worktrees/tka-platform/color-picker`, branch `codex/color-picker`. Run every command from that directory.

---

## File map

| File | Responsibility |
| --- | --- |
| `scripts/generate-color-presets.mjs` (create) | OKLCH → sRGB, gamut clip, writes the presets module |
| `src/lib/shared/ui/color-presets.ts` (regenerate) | `COLOR_PRESETS`, `COLOR_PRESET_COLUMNS`, `ColorPreset` type |
| `tests/unit/color-presets.test.ts` (create) | Shape guarantees of the generated matrix |
| `src/lib/shared/ui/components/color-picker/BareWrapper.svelte` (create) | Plain wrapper for the library so it renders inline with no popup chrome |
| `src/lib/shared/ui/components/LabeledColorPairPicker.svelte` (rewrite) | Pair editor: preview slot, gradient bar, controls + swap, swatch matrix, fine tune, hex, eyedropper |
| `src/lib/shared/ui/components/LabeledColorPairPicker.svelte.test.ts` (create) | Interaction contract |
| `src/lib/shared/settings/components/tabs/prop-type/PrimaryPropColorSettings.svelte` (modify) | Passes preview snippet + swap |
| `src/lib/shared/settings/components/tabs/PropTypeTab.svelte` (modify) | Passes prop types down |
| `src/lib/shared/sequence-viewer/components/art-settings/TunnelColorSettings.svelte` (modify) | Wires `onswap` on both pickers |
| `src/lib/shared/sequence-viewer/components/mandala/MandalaCategoryControl.svelte` (modify) | Wires `onswap` |
| `src/routes/test/sidebar-props/+page.svelte` (modify) | Preview snippet, swap, width toggle |
| `docs/architecture/canonical-capabilities.md` (modify) | Records the owner and the vendored engine |

---

### Task 1: Preset generator, generated presets, unit test

**Files:**
- Create: `scripts/generate-color-presets.mjs`
- Regenerate: `src/lib/shared/ui/color-presets.ts`
- Create: `tests/unit/color-presets.test.ts`

- [ ] **Step 1: Write the failing unit test**

Create `tests/unit/color-presets.test.ts`:

```ts
/**
 * Guards the generated swatch matrix behind LabeledColorPairPicker and
 * ProfileColorPicker. 48 = 12 x 4 so the grid fills every row at 12, 8 and
 * 6 columns; a stray entry would bring back the stranded-row bug.
 */
import { describe, expect, it } from "vitest";
import {
  COLOR_PRESETS,
  COLOR_PRESET_COLUMNS,
  type ColorPresetRow,
} from "$lib/shared/ui/color-presets";

const ROWS: ColorPresetRow[] = ["light", "vivid", "deep", "neutral"];

describe("COLOR_PRESETS", () => {
  it("is a 12 x 4 matrix", () => {
    expect(COLOR_PRESET_COLUMNS).toBe(12);
    expect(COLOR_PRESETS).toHaveLength(48);
    for (const [index, row] of ROWS.entries()) {
      const slice = COLOR_PRESETS.slice(index * 12, index * 12 + 12);
      expect(slice.map((preset) => preset.row)).toEqual(Array(12).fill(row));
    }
  });

  it("holds unique lowercase #rrggbb values with names", () => {
    const hexes = COLOR_PRESETS.map((preset) => preset.hex);
    for (const hex of hexes) expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    expect(new Set(hexes).size).toBe(hexes.length);
    for (const preset of COLOR_PRESETS) expect(preset.name.length).toBeGreaterThan(0);
  });

  it("runs the neutral row from white to black", () => {
    const neutral = COLOR_PRESETS.filter((preset) => preset.row === "neutral");
    expect(neutral[0]).toMatchObject({ hex: "#ffffff", name: "White" });
    expect(neutral[11]).toMatchObject({ hex: "#000000", name: "Black" });
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/color-presets.test.ts`
Expected: FAIL (`COLOR_PRESET_COLUMNS` is not exported; length is 16).

- [ ] **Step 3: Write the generator**

Create `scripts/generate-color-presets.mjs`:

```js
#!/usr/bin/env node
// Generates src/lib/shared/ui/color-presets.ts: 12 hues x 4 rows chosen in
// OKLCH so every swatch in a row has the same perceived lightness, then
// converted to sRGB hex. Run by hand after changing the tables below:
//   node scripts/generate-color-presets.mjs
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HUES = [
  { hue: 25, name: "red" },
  { hue: 55, name: "orange" },
  { hue: 85, name: "gold" },
  { hue: 115, name: "yellow" },
  { hue: 145, name: "green" },
  { hue: 175, name: "teal" },
  { hue: 205, name: "cyan" },
  { hue: 235, name: "sky" },
  { hue: 265, name: "blue" },
  { hue: 295, name: "violet" },
  { hue: 325, name: "magenta" },
  { hue: 355, name: "pink" },
];

const COLOR_ROWS = [
  { row: "light", lightness: 0.82, chroma: 0.11, label: (n) => `Light ${n}` },
  { row: "vivid", lightness: 0.66, chroma: 0.22, label: (n) => capitalize(n) },
  { row: "deep", lightness: 0.48, chroma: 0.16, label: (n) => `Deep ${n}` },
];

function capitalize(word) {
  return word[0].toUpperCase() + word.slice(1);
}

// Björn Ottosson's Oklab matrices: https://bottosson.github.io/posts/oklab/
function oklchToLinearSrgb(L, C, hueDegrees) {
  const h = (hueDegrees * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function inGamut(rgb) {
  return rgb.every((channel) => channel >= -1e-6 && channel <= 1 + 1e-6);
}

function toGammaByte(linear) {
  const clamped = Math.min(1, Math.max(0, linear));
  const gamma =
    clamped <= 0.0031308
      ? 12.92 * clamped
      : 1.055 * clamped ** (1 / 2.4) - 0.055;
  return Math.round(gamma * 255);
}

// Walks chroma down until the color fits sRGB; hue and lightness stay put.
function oklchToHex(L, C, hue) {
  let chroma = C;
  let rgb = oklchToLinearSrgb(L, chroma, hue);
  while (!inGamut(rgb) && chroma > 0) {
    chroma = Math.max(0, chroma - 0.002);
    rgb = oklchToLinearSrgb(L, chroma, hue);
  }
  return `#${rgb.map((channel) => toGammaByte(channel).toString(16).padStart(2, "0")).join("")}`;
}

const presets = [];
for (const { row, lightness, chroma, label } of COLOR_ROWS) {
  for (const { hue, name } of HUES) {
    presets.push({ hex: oklchToHex(lightness, chroma, hue), name: label(name), row });
  }
}
for (let step = 0; step < HUES.length; step += 1) {
  const lightness = 1 - step / (HUES.length - 1);
  const name =
    step === 0 ? "White" : step === HUES.length - 1 ? "Black" : `Grey ${Math.round(lightness * 100)}`;
  presets.push({ hex: oklchToHex(lightness, 0, 0), name, row: "neutral" });
}

const lines = presets.map(
  ({ hex, name, row }) => `  { hex: "${hex}", name: "${name}", row: "${row}" },`
);
const source = `// Generated by scripts/generate-color-presets.mjs. Do not edit by hand.
// 12 hues x 4 rows (light, vivid, deep, neutral) chosen in OKLCH so each row
// shares one perceived lightness. 48 divides by 12, 8 and 6, so the swatch
// grid never ends on a short row.
export type ColorPresetRow = "light" | "vivid" | "deep" | "neutral";

export interface ColorPreset {
  readonly hex: string;
  readonly name: string;
  readonly row: ColorPresetRow;
}

export const COLOR_PRESET_COLUMNS = ${HUES.length};

export const COLOR_PRESETS: readonly ColorPreset[] = [
${lines.join("\n")}
];
`;

const target = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/lib/shared/ui/color-presets.ts"
);
writeFileSync(target, source);
console.log(`wrote ${presets.length} presets to ${target}`);
```

- [ ] **Step 4: Run the generator**

Run: `node scripts/generate-color-presets.mjs`
Expected: `wrote 48 presets to .../src/lib/shared/ui/color-presets.ts`

Then open the file and eyeball it: the first entry's hex should be a pale red (around `#ffb3a8`), row 2 column 1 a strong red, row 4 starts `#ffffff` and ends `#000000`.

- [ ] **Step 5: Run the test to confirm it passes**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/color-presets.test.ts`
Expected: 3 passed.

- [ ] **Step 6: Type-check the consumers**

Run: `npm run check:fast`
Expected: no errors in `ProfileColorPicker.svelte`, `ColorOverridePicker.svelte`, `CharacterPlayground.svelte`, or `LabeledColorPairPicker.svelte` (they only read `hex` and `name`; `ColorOverridePicker` declares `presets?: readonly ColorPreset[]` with a local `{ hex; name }` type, which the new shape satisfies).

- [ ] **Step 7: Commit**

```bash
git add scripts/generate-color-presets.mjs src/lib/shared/ui/color-presets.ts tests/unit/color-presets.test.ts
git commit -m "feat(ui): generate a 12x4 OKLCH swatch matrix for color presets

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Rebuild `LabeledColorPairPicker`

**Files:**
- Create: `src/lib/shared/ui/components/color-picker/BareWrapper.svelte`
- Rewrite: `src/lib/shared/ui/components/LabeledColorPairPicker.svelte`
- Create: `src/lib/shared/ui/components/LabeledColorPairPicker.svelte.test.ts`

Context you need: the library's `ColorPicker` renders a `<span class="color-picker">` containing a wrapper component (we replace it), a `Picker` (the SV square, sized by `--picker-width` / `--picker-height`, both must resolve to lengths), and a hue `Slider`. Its `$effect` recomputes from the `hex` prop whenever it changes and calls `onInput` with the result, including once on mount, so the `onInput` handler must ignore a hex equal to the current value.

- [ ] **Step 1: Write the failing component test**

Create `src/lib/shared/ui/components/LabeledColorPairPicker.svelte.test.ts`:

```ts
import { render } from "vitest-browser-svelte";
import { page, userEvent } from "vitest/browser";
import { describe, expect, it, vi } from "vitest";
import LabeledColorPairPicker from "./LabeledColorPairPicker.svelte";
import { COLOR_PRESETS } from "../color-presets";
import { expectNoA11yViolations } from "$test-helpers/component-a11y";

const LEFT = "#ef4444";
const RIGHT = "#3b82f6";

function renderPicker(overrides: Record<string, unknown> = {}) {
  const onchange = vi.fn();
  const onswap = vi.fn();
  const screen = render(LabeledColorPairPicker, {
    left: LEFT,
    right: RIGHT,
    onchange,
    onswap,
    ...overrides,
  });
  return { screen, onchange, onswap };
}

async function openLeft() {
  await page.getByRole("button", { name: `Edit Left prop, ${LEFT.toUpperCase()}` }).click();
}

describe("LabeledColorPairPicker", () => {
  it("applies a swatch to the hand being edited", async () => {
    const { onchange } = renderPicker();
    await openLeft();
    const first = COLOR_PRESETS[0]!;
    await page.getByRole("button", { name: `Left prop: ${first.name}` }).click();
    expect(onchange).toHaveBeenCalledWith("left", first.hex);
  });

  it("marks the swatch matching the current value as pressed", async () => {
    const preset = COLOR_PRESETS[5]!;
    renderPicker({ left: preset.hex });
    await page
      .getByRole("button", { name: `Edit Left prop, ${preset.hex.toUpperCase()}` })
      .click();
    await expect
      .element(page.getByRole("button", { name: `Left prop: ${preset.name}` }))
      .toHaveAttribute("aria-pressed", "true");
    await expect
      .element(page.getByRole("button", { name: `Left prop: ${COLOR_PRESETS[0]!.name}` }))
      .toHaveAttribute("aria-pressed", "false");
  });

  it("swaps through the caller", async () => {
    const { onswap } = renderPicker();
    await page.getByRole("button", { name: "Swap left and right colors" }).click();
    expect(onswap).toHaveBeenCalledTimes(1);
  });

  it("hides the swap button when the caller cannot swap", async () => {
    renderPicker({ onswap: undefined });
    await expect
      .element(page.getByRole("button", { name: "Swap left and right colors" }))
      .not.toBeInTheDocument();
  });

  it("accepts a full hex from the field and ignores a partial one", async () => {
    const { onchange } = renderPicker();
    await openLeft();
    const field = page.getByRole("textbox", { name: "Left prop hex color" });
    await field.fill("#12");
    expect(onchange).not.toHaveBeenCalledWith("left", "#12");
    await field.fill("#123456");
    expect(onchange).toHaveBeenCalledWith("left", "#123456");
  });

  it("moves the hue with the keyboard", async () => {
    const { onchange } = renderPicker();
    await openLeft();
    const hue = page.getByRole("slider", { name: "Left prop hue" });
    await hue.click();
    await userEvent.keyboard("{ArrowRight}");
    const calls = onchange.mock.calls.filter(([hand]) => hand === "left");
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.at(-1)![1]).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("has no axe violations with the editor open", async () => {
    renderPicker();
    await openLeft();
    await expectNoA11yViolations();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run --config tests/config/vitest.components.config.ts src/lib/shared/ui/components/LabeledColorPairPicker.svelte.test.ts`
Expected: FAIL (no swap button, no slider, swatch names differ).

- [ ] **Step 3: Create the bare wrapper**

Create `src/lib/shared/ui/components/color-picker/BareWrapper.svelte`:

```svelte
<script lang="ts">
  /**
   * Replaces svelte-awesome-color-picker's popup wrapper so the square and hue
   * slider render inline inside our own editor card, with no border, margin,
   * or dialog role of their own.
   */
  import type { Snippet } from "svelte";

  interface Props {
    wrapper?: HTMLElement;
    isOpen: boolean;
    isDialog: boolean;
    children: Snippet;
  }

  let { wrapper = $bindable(), isOpen, isDialog, children }: Props = $props();
</script>

<div bind:this={wrapper} class="bare" hidden={isDialog && !isOpen}>
  {@render children()}
</div>

<style>
  .bare {
    display: grid;
    gap: 6px;
    width: 100%;
  }
</style>
```

- [ ] **Step 4: Rewrite the picker**

Replace the whole of `src/lib/shared/ui/components/LabeledColorPairPicker.svelte` with:

```svelte
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
    } catch {
      // Escape aborts the pick; nothing to apply.
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

  /* Editor: swatch matrix + fine tune. Stacks until there is room for a
     12-column matrix (33rem) beside the 16rem fine-tune column. */
  .color-editor {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
    padding: 12px;
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
    background: var(--theme-card-bg);
    container: color-editor / inline-size;
  }

  @container color-editor (min-width: 52rem) {
    .color-editor {
      grid-template-columns: minmax(0, 1fr) 16rem;
    }
  }

  /* The matrix picks its column count from its own width so no row is ever
     short: 48 swatches divide evenly by 12, 8 and 6. */
  .preset-grid {
    --cols: 6;
    display: grid;
    grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
    gap: 4px;
    align-content: start;
    container: preset-grid / inline-size;
  }

  @container preset-grid (min-width: 22rem) {
    .preset-grid {
      --cols: 8;
    }
  }

  @container preset-grid (min-width: 33rem) {
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
    gap: 10px;
    align-content: start;
    min-width: 0;
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
```

- [ ] **Step 5: Run the component test**

Run: `npx vitest run --config tests/config/vitest.components.config.ts src/lib/shared/ui/components/LabeledColorPairPicker.svelte.test.ts`
Expected: 7 passed. If the axe test reports a violation inside the library's slider markup, print the violation ids in the failure message and stop; do not disable rules.

- [ ] **Step 6: Type-check**

Run: `npm run check:fast`
Expected: no new errors. The existing callers still compile because every new prop is optional.

- [ ] **Step 7: Commit**

```bash
git add src/lib/shared/ui/components/color-picker/BareWrapper.svelte src/lib/shared/ui/components/LabeledColorPairPicker.svelte src/lib/shared/ui/components/LabeledColorPairPicker.svelte.test.ts
git commit -m "feat(ui): swatch matrix, inline hue picker, eyedropper and swap in the pair color picker

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Wire callers, preview, test route, capability index

**Files:**
- Modify: `src/lib/shared/settings/components/tabs/prop-type/PrimaryPropColorSettings.svelte`
- Modify: `src/lib/shared/settings/components/tabs/PropTypeTab.svelte:395-399`
- Modify: `src/lib/shared/sequence-viewer/components/art-settings/TunnelColorSettings.svelte:115-129,169-178`
- Modify: `src/lib/shared/sequence-viewer/components/mandala/MandalaCategoryControl.svelte:426-436`
- Modify: `src/routes/test/sidebar-props/+page.svelte`
- Modify: `docs/architecture/canonical-capabilities.md`

- [ ] **Step 1: Settings tab preview and swap**

Replace `src/lib/shared/settings/components/tabs/prop-type/PrimaryPropColorSettings.svelte` script and markup (keep the existing `<style>` block) with:

```svelte
<script lang="ts">
  import LabeledColorPairPicker from "$lib/shared/ui/components/LabeledColorPairPicker.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import PropCompositionPreview from "$lib/shared/pictograph/prop/components/PropCompositionPreview.svelte";
  import {
    resolveViewerCustomColorPair,
    type ViewerCustomColorPair,
  } from "$lib/shared/sequence-viewer/domain/viewer-custom-colors";
  import { getMotionColor } from "$lib/shared/utils/svg-color-utils";
  import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

  let {
    colors,
    darkMode = true,
    leftPropType,
    rightPropType,
    onchange,
  }: {
    colors?: ViewerCustomColorPair | null;
    darkMode?: boolean;
    /** When both are given, the picker shows the real props in the chosen colors. */
    leftPropType?: PropType;
    rightPropType?: PropType;
    onchange: (colors: ViewerCustomColorPair | null) => void;
  } = $props();

  const palette = $derived(
    resolveViewerCustomColorPair(colors, {
      left: getMotionColor(HandSide.LEFT, darkMode ? "dark" : "light"),
      right: getMotionColor(HandSide.RIGHT, darkMode ? "dark" : "light"),
    })
  );
</script>

{#snippet propPreview(pair: { left: string; right: string })}
  {#if leftPropType && rightPropType}
    <PropCompositionPreview
      propType={leftPropType}
      {rightPropType}
      size={96}
      pairedGlyph
      darkBackground={darkMode}
      colors={pair}
    />
  {/if}
{/snippet}

<section class="primary-colors" aria-label="Primary prop colors">
  <div class="color-heading">
    <h4>Primary prop colors</h4>
    <PanelButton disabled={!colors} onclick={() => onchange(null)}
      >Use default colors</PanelButton
    >
  </div>
  <LabeledColorPairPicker
    left={palette.left}
    right={palette.right}
    preview={leftPropType && rightPropType ? propPreview : undefined}
    onchange={(hand, value) => onchange({ ...palette, [hand]: value })}
    onswap={() => onchange({ ...palette, left: palette.right, right: palette.left })}
  />
</section>
```

- [ ] **Step 2: Pass prop types from the tab**

In `src/lib/shared/settings/components/tabs/PropTypeTab.svelte`, change the call at lines 395-399 to:

```svelte
    <PrimaryPropColorSettings
      colors={settings.primaryPropColors}
      darkMode={settings.darkMode}
      leftPropType={selectedLeftPropType}
      rightPropType={selectedRightPropType}
      onchange={(value) => onUpdate?.({ key: "primaryPropColors", value })}
    />
```

- [ ] **Step 3: Tunnel swap (both pickers)**

In `src/lib/shared/sequence-viewer/components/art-settings/TunnelColorSettings.svelte`, add `onswap` to the custom-mode picker (after its `onchange` prop, around line 128):

```svelte
        onswap={() => {
          const { left, right } = controller.customPropColors;
          controller.setCustomPropColor("left", right);
          controller.setCustomPropColor("right", left);
          reportSetting("left_prop_color", left, right, true);
          reportSetting("right_prop_color", right, left, true);
        }}
```

and to the per-performer picker (after its `onchange`, around line 177):

```svelte
          onswap={() =>
            updatePerformer({
              ...editingColors,
              custom: { ...editingColors.custom, left: preview.right, right: preview.left },
            })}
```

- [ ] **Step 4: Mandala swap**

In `src/lib/shared/sequence-viewer/components/mandala/MandalaCategoryControl.svelte`, add after the picker's `onchange` block (around line 436):

```svelte
          onswap={() => {
            const left = ctrl.customLeft;
            ctrl.customLeft = ctrl.customRight;
            ctrl.customRight = left;
          }}
```

- [ ] **Step 5: Test route: preview, swap, width toggle**

In `src/routes/test/sidebar-props/+page.svelte`:

Add state after `let colors = ...`:

```ts
  let pickerWidth = $state<"full" | "mid" | "narrow">("full");
  const PICKER_MAX_WIDTH = { full: "none", mid: "30rem", narrow: "19rem" } as const;
```

Replace the `<LabeledColorPairPicker ... />` block in the header with:

```svelte
    <SegmentedControl
      options={[
        { value: "full", label: "Full width" },
        { value: "mid", label: "30rem" },
        { value: "narrow", label: "19rem" },
      ]}
      value={pickerWidth}
      onchange={(value) => (pickerWidth = value)}
      ariaLabel="Picker width"
    />
    <div class="picker-box" style:max-width={PICKER_MAX_WIDTH[pickerWidth]}>
      <LabeledColorPairPicker
        left={colors.left}
        right={colors.right}
        {preview}
        onchange={(hand, color) => (colors = { ...colors, [hand]: color })}
        onswap={() => (colors = { left: colors.right, right: colors.left })}
      />
    </div>
```

Add a snippet before `<main>`:

```svelte
{#snippet preview(pair: { left: string; right: string })}
  <PropCompositionPreview
    propType={families[0]!}
    size={96}
    pairedGlyph
    darkBackground
    useSavedOverrides={false}
    colors={pair}
  />
{/snippet}
```

Add to the page's `<style>`:

```css
  .picker-box {
    width: 100%;
    margin-inline: auto;
  }
```

- [ ] **Step 6: Record the owner**

In `docs/architecture/canonical-capabilities.md`, directly after the paragraph that ends "`LabeledColorPairPicker`, `SegmentedControl`, and `ScrubbableNumber` for editing." add:

```markdown
Pair color editing is owned by `shared/ui/components/LabeledColorPairPicker.svelte`.
Searches: color picker, color pair, prop colors, swatch, hex, eyedropper, hue.
Its saturation/hue surface is `svelte-awesome-color-picker` (MIT) rendered
inline through `color-picker/BareWrapper.svelte`; the swatch matrix is
generated by `scripts/generate-color-presets.mjs` into `shared/ui/color-presets.ts`.
Callers pass `onswap` for a one-call swap and may pass a `preview` snippet.
`ProfileColorPicker` reuses the presets for a single color.
```

- [ ] **Step 7: Type-check and run both test files**

Run: `npm run check:fast`
Expected: no errors.

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/color-presets.test.ts && npx vitest run --config tests/config/vitest.components.config.ts src/lib/shared/ui/components/LabeledColorPairPicker.svelte.test.ts`
Expected: all passed.

- [ ] **Step 8: Commit**

```bash
git add src/lib/shared/settings/components/tabs/prop-type/PrimaryPropColorSettings.svelte src/lib/shared/settings/components/tabs/PropTypeTab.svelte src/lib/shared/sequence-viewer/components/art-settings/TunnelColorSettings.svelte src/lib/shared/sequence-viewer/components/mandala/MandalaCategoryControl.svelte src/routes/test/sidebar-props/+page.svelte docs/architecture/canonical-capabilities.md
git commit -m "feat(settings): live prop preview and swap in the color picker callers

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Visual verification (session owner, in-app browser)

Not delegated. Done by the session that can drive the in-app browser.

- [ ] **Step 1: Worktree dev server on a free port**

Create `E:/worktrees/tka-platform/color-picker/tmp/dev.mjs` (`/tmp/` is gitignored):

```js
import { spawn } from "node:child_process";
const child = spawn(
  process.execPath,
  ["E:/tka-platform/node_modules/vite/bin/vite.js", "dev", "--host", "127.0.0.1", "--port", "5186", "--strictPort"],
  { cwd: "E:/worktrees/tka-platform/color-picker", stdio: "inherit" }
);
child.on("exit", (code) => process.exit(code ?? 0));
```

Add to `E:/cirque-aflame/.claude/launch.json` configurations:

```json
{
  "name": "tka-color-picker",
  "runtimeExecutable": "node",
  "runtimeArgs": ["E:/worktrees/tka-platform/color-picker/tmp/dev.mjs"],
  "port": 5186,
  "url": "https://localhost:5186"
}
```

Start it with `preview_start {name: "tka-color-picker"}` and open `/test/sidebar-props`.

- [ ] **Step 2: Tiers**

At 375×667, 960×412, 820×1180, 1440×900, 1920×1080, 2560×1440, 3840×2160: open Left, screenshot with the editor open at each of the three width-toggle settings that change the column count at that tier. Confirm with `read_page`/JS that `.preset-grid` has 12, 8 or 6 columns and that no row is short (`children.length % cols === 0` is guaranteed; verify the computed `grid-template-columns` count). Confirm swatch width >= 40px and `.swap` is 44×44.

- [ ] **Step 3: Interactions**

Drag on the SV square and the hue slider; press ArrowRight on the hue slider; click a swatch; type a hex; click swap; confirm the header preview and the gradient bar follow. Confirm the eyedropper button is present (Chromium). `read_console_messages` must be clean of errors.

- [ ] **Step 4: Real surface**

Open the app's settings prop tab on the worktree server and repeat at 375, 1440, 2560 wide. Then run `npm run check` once and `npx vitest run --config tests/config/vitest.config.ts tests/unit/color-presets.test.ts`.

- [ ] **Step 5: Stop the worktree server, finish**

`preview_stop` the server. From `E:/tka-platform`:

```powershell
npm run wt:finish -- codex/color-picker --route /settings
```

If the gate refuses, report the exact blocker and leave the branch and worktree intact.
