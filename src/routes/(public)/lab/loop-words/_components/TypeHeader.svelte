<!-- A LOOP type's icon and colour, as the app shows them, and its name. -->
<script lang="ts">
  import CopyText from "#lib/shared/copy-edit/CopyText.svelte";
  import type { PageCopy } from "#lib/shared/copy-edit/page-copy.svelte";
  import LOOPIconStrip from "#lib/shared/components/LOOPIconStrip.svelte";
  import { COMPONENT_OF, type TypeKind } from "../_data/loop-kinds";

  let {
    copy,
    kind,
    size = 22,
    level = 2,
  }: {
    copy: PageCopy;
    kind: TypeKind;
    size?: number;
    /** 2 for a screen's header, 0 for a name inside a list. */
    level?: 0 | 2;
  } = $props();

  const components = $derived(new Set([COMPONENT_OF[kind]]));
</script>

<div class="type-header" class:small={level === 0}>
  <!-- The strip labels itself with the app's older type names; the name
       beside it is the label here, so the icon stays silent and hover-free. -->
  <span class="icon" aria-hidden="true">
    <LOOPIconStrip activeComponents={components} {size} darkMode={true} />
  </span>
  {#if level === 2}
    <h2><CopyText {copy} key={`name-${kind}`} /></h2>
  {:else}
    <strong><CopyText {copy} key={`name-${kind}`} /></strong>
  {/if}
</div>

<style>
  .type-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }

  .icon {
    display: inline-flex;
    pointer-events: none;
  }

  h2 {
    margin: 0;
    font-size: var(--font-size-xl);
    font-weight: 700;
    line-height: 1.2;
  }

  strong {
    font-size: var(--font-size-sm);
    font-weight: 700;
    line-height: 1.2;
  }
</style>
