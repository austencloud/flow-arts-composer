<script lang="ts">
  interface Annotation {
    blanks: number;
    perfect: boolean;
  }

  interface Props {
    value: number;
    onchange: (n: number) => void;
    presets?: number[];
    /** Optional per-count waste readout. When provided, each chip shows a tiny
     *  badge ("fit" for zero-blank, else the blank count) and the custom field
     *  shows the live blanks for whatever is typed. */
    annotate?: (n: number) => Annotation | null;
    /** Cards-per-sheet for the current card size. The chip at this count is the
     *  "one card per page" default — the primary, most-used option — so it gets
     *  a distinct highlighted treatment and a "1 / page" label. */
    perPage?: number;
  }

  let {
    value,
    onchange,
    presets = [1, 3, 6, 9, 12],
    annotate,
    perPage,
  }: Props = $props();

  const isCustom = $derived(!presets.includes(value));

  let customText = $state(String(value));
  $effect(() => {
    if (isCustom) customText = String(value);
  });

  // The single "best" count: smallest preset that fills every sheet (zero waste).
  // Only this chip wears the FITS badge — a perfect fit can be true for several
  // counts, but flagging the smallest keeps one clear, legible "use this" marker
  // instead of a row of tiny duplicate badges.
  const bestFit = $derived.by(() => {
    if (!annotate) return null;
    for (const p of [...presets].sort((a, b) => a - b)) {
      if (annotate(p)?.perfect) return p;
    }
    return null;
  });

  function commitCustom() {
    const n = Math.max(1, Math.floor(Number(customText) || 1));
    customText = String(n);
    onchange(n);
  }

  function onCustomKey(e: KeyboardEvent) {
    if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
  }
</script>

<div class="copies-select" role="radiogroup" aria-label="Copies per card">
  {#each presets as p (p)}
    {@const a = annotate?.(p)}
    {@const isPerPage = p === perPage}
    <button
      type="button"
      class="copies-option"
      class:active={value === p}
      class:perfect={p === bestFit}
      class:per-page={isPerPage}
      role="radio"
      aria-checked={value === p}
      aria-label="{p} {p === 1 ? 'copy' : 'copies'} per card{isPerPage
        ? ', one card per page (recommended)'
        : a
          ? a.perfect
            ? ', fills every sheet'
            : `, ${a.blanks} blank cells`
          : ''}"
      title={isPerPage
        ? "One card per page: a full sheet of this card, cut into identical copies. The default."
        : a
          ? a.perfect
            ? "Fills every sheet, no wasted cards"
            : `${a.blanks} blank cells`
          : undefined}
      onclick={() => onchange(p)}
    >
      <span class="copies-num">{p}</span>
      {#if isPerPage}<span class="copies-badge">1 / page</span>
      {:else if p === bestFit}<span class="copies-badge">fits</span>{/if}
    </button>
  {/each}
  <div class="copies-custom-wrap" class:active={isCustom}>
    <input
      class="copies-custom"
      type="number"
      name="custom-copies-per-card"
      min="1"
      inputmode="numeric"
      aria-label="Custom copies per card"
      placeholder="…"
      bind:value={customText}
      onblur={commitCustom}
      onkeydown={onCustomKey}
    />
  </div>
</div>

<style>
  .copies-select {
    display: flex;
    align-items: stretch;
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    overflow: hidden;
  }

  .copies-option {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    min-width: 40px;
    min-height: 40px;
    padding: 4px 10px;
    background: transparent;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
    border: none;
    cursor: pointer;
    transition:
      background var(--duration-fast),
      color var(--duration-fast);
  }

  .copies-option:not(:last-child),
  .copies-custom-wrap {
    border-right: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .copies-num {
    font-size: var(--font-size-compact, 13px);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    line-height: 1.1;
  }

  .copies-badge {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    opacity: 0.85;
    line-height: 1.1;
  }

  .copies-option.active {
    background: var(--theme-accent, #4a9eff);
    color: var(--theme-text, #fff);
  }

  /* Perfect-fit chips get a subtle green tint when not selected. */
  .copies-option.perfect:not(.active) .copies-badge {
    color: #4ade80;
    opacity: 1;
  }

  /* The one-card-per-page chip is the primary, most-used option. Give it a
     persistent accent treatment so it stands apart from the plain counts even
     before it's selected. (per-page wins over perfect for the badge color.) */
  .copies-option.per-page:not(.active) {
    background: color-mix(
      in srgb,
      var(--theme-accent, #4a9eff) 16%,
      transparent
    );
    color: var(--theme-accent, #4a9eff);
    box-shadow: inset 0 0 0 1.5px
      color-mix(in srgb, var(--theme-accent, #4a9eff) 55%, transparent);
  }

  .copies-option.per-page:not(.active) .copies-num {
    font-weight: 700;
  }

  .copies-option.per-page .copies-badge {
    color: var(--theme-accent, #4a9eff);
    opacity: 1;
    text-transform: none;
    letter-spacing: 0;
  }

  .copies-option.per-page.active .copies-badge {
    color: var(--theme-text, #fff);
  }

  .copies-option.per-page:hover:not(.active) {
    background: color-mix(
      in srgb,
      var(--theme-accent, #4a9eff) 26%,
      transparent
    );
    color: var(--theme-accent, #4a9eff);
  }

  .copies-option:hover:not(.active) {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    color: var(--theme-text, #fff);
  }

  .copies-custom-wrap {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    border-left: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .copies-custom-wrap.active {
    background: var(--theme-accent, #4a9eff);
  }

  .copies-custom {
    width: 56px;
    min-height: 40px;
    padding: 4px 6px;
    text-align: center;
    font-size: var(--font-size-compact, 13px);
    font-variant-numeric: tabular-nums;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
    background: transparent;
    border: none;
    transition: color var(--duration-fast);
  }

  .copies-custom-wrap.active .copies-custom {
    color: var(--theme-text, #fff);
  }

  .copies-custom:focus {
    outline: none;
  }

  .copies-custom-wrap:focus-within {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
  }

  /* Strip the native spinner — TKA bans stepper controls. */
  .copies-custom::-webkit-outer-spin-button,
  .copies-custom::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  .copies-custom {
    -moz-appearance: textfield;
    appearance: textfield;
  }
</style>
