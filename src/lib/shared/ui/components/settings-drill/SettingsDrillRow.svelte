<!--
SettingsDrillRow.svelte — one row of a SettingsDrillPanel root list.

Setting name on top, its current value below, chevron on the right. Tapping
drills into that setting's detail screen.

Two lines rather than label-left/value-right: values here run from "Any" to
"Props: Choppy · Hands: Smooth · Dashes: High", and the long one does not fit
beside its label in a ~560px column. On its own line it gets the row's full
width at every size.

No ghost sizer needed (no-layout-shift.md): the row's height comes from two
fixed-size text lines and the value is clipped to one line, so no value can
change the row's box or move the rows below it.

`media` adds a small picture of the current value between the text and the
chevron (the prop picker's Buugeng pair box); it sits in a fixed box so a new
value never resizes the row. Extra attributes (aria-label, data-*) pass
through to the button.

`control` makes the same surface hold a choice in place instead of drilling:
the label on the left and the control (a two-choice toggle) at the right end,
no chevron, and no button around it. The prop picker's Size and Grip rows use
it so they read as one set with the boxes beside them.

`facts` lists several settings the row opens, each as a name over its value, in
place of the one value line. For a landing screen of a few tall boxes, where a
single line would leave each box mostly empty (Fuse's hand settings).
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLAttributes, HTMLButtonAttributes } from "svelte/elements";

  let {
    label,
    value,
    disabled = false,
    disabledReason = "",
    onclick,
    media,
    control,
    valueLines = 1,
    facts,
    ...rest
  }: {
    label: string;
    value?: string;
    disabled?: boolean;
    disabledReason?: string;
    onclick?: () => void;
    /** A small picture of the current value, beside the text. */
    media?: Snippet;
    /** A choice made in place at the row's right end, instead of drilling. */
    control?: Snippet;
    /** Lines the value may wrap onto. One (the default) clips it to a line. */
    valueLines?: number;
    /** The settings this row opens, in place of the value line. */
    facts?: readonly { name: string; value: string }[];
  } & Omit<
    HTMLButtonAttributes,
    "onclick" | "disabled" | "type" | "class" | "children"
  > = $props();
</script>

{#if control}
  <div
    {...rest as HTMLAttributes<HTMLDivElement>}
    class="drill-row has-control"
  >
    <span class="row-text">
      <span class="row-label">{label}</span>
    </span>
    <span class="row-control">{@render control()}</span>
  </div>
{:else}
  <button
    {...rest}
    class="drill-row"
    class:is-disabled={disabled}
    class:multi-line={valueLines > 1}
    class:has-facts={facts}
    style:--row-value-lines={valueLines}
    type="button"
    onclick={() => onclick?.()}
  >
    <span class="row-text">
      <span class="row-label">{label}</span>
      {#if disabled}
        <span class="row-reason">{disabledReason}</span>
      {:else if facts}
        <span class="row-facts">
          {#each facts as fact (fact.name)}
            <span class="row-fact">
              <span class="fact-name">{fact.name}</span>
              <span class="fact-value">{fact.value}</span>
            </span>
          {/each}
        </span>
      {:else}
        <span class="row-value">{value}</span>
      {/if}
    </span>

    {#if media && !disabled}
      <span class="row-media" aria-hidden="true">{@render media()}</span>
    {/if}

    {#if disabled}
      <span class="row-lock" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M12 17a2 2 0 002-2v-2a2 2 0 00-4 0v2a2 2 0 002 2zm6-9h-1V6a5 5 0 00-10 0v2H6a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V10a2 2 0 00-2-2zM8.9 6a3.1 3.1 0 016.2 0v2H8.9V6z"
          />
        </svg>
      </span>
    {:else}
      <svg
        class="row-chevron"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        aria-hidden="true"
      >
        <path d="M9 6l6 6-6 6" />
      </svg>
    {/if}
  </button>
{/if}

<style>
  .drill-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    min-height: var(--drill-row-min-height, var(--min-touch-target));
    padding: var(--drill-row-padding, 0.875rem 1rem);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 0.75rem;
    color: white;
    font-family: inherit;
    text-align: left;
    cursor: pointer;
    transition:
      background var(--duration-normal) var(--ease-standard),
      border-color var(--duration-normal) var(--ease-standard);
  }

  .drill-row:hover:not(.is-disabled):not(.has-control) {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.1));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
  }

  .drill-row:active:not(.is-disabled):not(.has-control) {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.14));
  }

  .drill-row.has-control {
    cursor: default;
  }

  .row-control {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
  }

  .drill-row.is-disabled {
    cursor: default;
    opacity: 0.55;
  }

  .row-text {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .row-label {
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: rgba(255, 255, 255, 0.5);
  }

  /* One line, clipped. A value can never change the row's height, so it can
     never move the rows below it. */
  .row-value,
  .row-reason {
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
    color: rgba(255, 255, 255, 0.92);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* A host with narrow boxes (the dock tray's two columns) passes valueLines:
     the value may wrap onto that many lines, and the box always reserves all
     of them, so a longer value never changes its height. */
  .multi-line .row-value {
    white-space: normal;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: var(--row-value-lines);
    line-clamp: var(--row-value-lines);
    min-height: calc(var(--row-value-lines) * 1.25em);
    line-height: 1.25;
    overflow-wrap: anywhere;
  }

  .multi-line .row-label {
    line-height: 1.2;
  }

  /* The label heads the facts, so it is the larger of the two. */
  .has-facts .row-text {
    gap: 0.5rem;
  }

  .has-facts .row-label {
    color: var(--theme-text, rgba(255, 255, 255, 0.92));
    font-size: var(--font-size-base, 16px);
    font-weight: 600;
    letter-spacing: 0;
    line-height: 1.25;
    text-transform: none;
  }

  .row-facts {
    display: grid;
    grid-auto-columns: minmax(0, 1fr);
    grid-auto-flow: column;
    gap: 0.5rem;
  }

  .row-fact {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .fact-name {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    font-size: var(--font-size-compact, 12px);
    line-height: 1.35;
  }

  .fact-value {
    color: var(--theme-text, rgba(255, 255, 255, 0.92));
    font-size: var(--font-size-sm, 14px);
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    line-height: 1.35;
  }

  .row-reason {
    font-weight: 500;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
  }

  .row-media {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    width: var(--drill-row-media-width, 3.5rem);
    height: var(--drill-row-media-height, 2.75rem);
    overflow: hidden;
    pointer-events: none;
  }

  .row-lock {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 50%;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.1));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
  }

  .row-lock svg {
    width: 0.875rem;
    height: 0.875rem;
  }

  .row-chevron {
    flex: 0 0 auto;
    width: 1rem;
    height: 1rem;
    opacity: 0.45;
  }

  @media (prefers-reduced-motion: reduce) {
    .drill-row {
      transition: none;
    }
  }
</style>
