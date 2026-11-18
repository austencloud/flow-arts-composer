<!--
  One LOOP type's row: its icon and name (TypeHeader) and its line. The row
  showing in the right-hand player is tinted whole in the type's own colour
  (loopOptionTint, the colour LOOPChoiceButton and the sequence badges use).

  A tap picks the type. While the dev copy editor is on, the row is a plain
  box instead of a button, so a click on its words edits them.
-->
<script lang="ts">
  import CopyText from "#lib/shared/copy-edit/CopyText.svelte";
  import type { PageCopy } from "#lib/shared/copy-edit/page-copy.svelte";
  import {
    loopComponentColors,
    loopOptionTint,
  } from "#lib/shared/components/loop-picker/loop-option-color.js";
  import { COMPONENT_OF, type TypeKind } from "../_data/loop-kinds";
  import TypeHeader from "./TypeHeader.svelte";

  let {
    copy,
    kind,
    active,
    onpick,
  }: {
    copy: PageCopy;
    kind: TypeKind;
    active: boolean;
    onpick: (kind: TypeKind) => void;
  } = $props();

  const tint = $derived(loopOptionTint(loopComponentColors([COMPONENT_OF[kind]])));
</script>

{#snippet content()}
  <TypeHeader {copy} {kind} size={20} level={0} />
  <span class="row-line"><CopyText {copy} key={`line-${kind}`} /></span>
{/snippet}

{#if copy.editor}
  <div class="row" class:active style={tint} aria-current={active ? "true" : undefined}>
    {@render content()}
  </div>
{:else}
  <button
    type="button"
    class="row"
    class:active
    style={tint}
    aria-current={active ? "true" : undefined}
    onclick={() => onpick(kind)}
  >
    {@render content()}
  </button>
{/if}

<style>
  /* The rows share two columns (see .rows on the page), so every name and
     every line starts on the same x. */
  .row {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: subgrid;
    align-items: center;
    /* Where the page has height to spare, a row fills its share up to 6rem
       (four lines of words) and sits centred in the rest. */
    align-self: center;
    height: 100%;
    max-height: 6rem;
    min-height: var(--alt-touch-target, 36px);
    padding: 0.3125rem 0.625rem;
    border: 1px solid transparent;
    border-radius: var(--radius-lg, 0.75rem);
    background-color: transparent;
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition:
      background-color var(--duration-normal) var(--ease-standard),
      border-color var(--duration-normal) var(--ease-standard);
  }

  div.row {
    cursor: auto;
  }

  .row:hover:not(.active) {
    background-color: var(--theme-card-bg, rgb(255 255 255 / 0.05));
  }

  .row.active {
    background-color: color-mix(in srgb, var(--loop-c1) 24%, transparent);
    border-color: color-mix(in srgb, var(--loop-c1) 70%, transparent);
  }

  .row:focus-visible {
    outline: 2px solid var(--loop-c1, var(--theme-accent, #7aa2ff));
    outline-offset: 2px;
  }

  .row-line {
    min-width: 0;
    font-size: var(--font-size-sm);
    line-height: 1.3;
    color: var(--theme-text-dim, rgb(255 255 255 / 0.78));
  }

  .row.active .row-line {
    color: var(--theme-text, #fff);
  }

  @media (prefers-reduced-motion: reduce) {
    .row {
      transition: none;
    }
  }
</style>
