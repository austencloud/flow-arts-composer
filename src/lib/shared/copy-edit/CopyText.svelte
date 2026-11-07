<!--
  CopyText: one string from a page's copy.json, rendered as inline content
  inside the element the page puts around it. It should be that element's only
  child. `islands` are snippets drawn at {0}, {1}... for what stays in source,
  such as a LinkChip.

  This adds no wrapper, attribute or listener of its own. CopyEditBar, which
  only a dev build mounts, sets `copy.editor` while edit mode is on.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { parseCopyText } from "./copy-text-serialize";
  import type { PageCopy } from "./page-copy.svelte";

  let {
    copy,
    key,
    islands = [],
    multiline = false,
  }: {
    copy: PageCopy;
    key: string;
    islands?: readonly Snippet[];
    /** Enter adds a line break in this block instead of finishing the edit. */
    multiline?: boolean;
  } = $props();

  const tokens = $derived(parseCopyText(copy.text[key] ?? "", islands.length));
</script>

{#if copy.editor}
  <copy.editor {copy} {key} {islands} {multiline} />
{:else}
  {#each tokens as token}
    {#if token.kind === "break"}
      <br />
    {:else if token.kind === "island"}
      {#if token.strong && token.em}
        <strong><em>{@render islands[token.index]!()}</em></strong>
      {:else if token.strong}
        <strong>{@render islands[token.index]!()}</strong>
      {:else if token.em}
        <em>{@render islands[token.index]!()}</em>
      {:else}
        {@render islands[token.index]!()}
      {/if}
    {:else if token.strong && token.em}
      <strong><em>{token.text}</em></strong>
    {:else if token.strong}
      <strong>{token.text}</strong>
    {:else if token.em}
      <em>{token.text}</em>
    {:else}
      {token.text}
    {/if}
  {/each}
{/if}
