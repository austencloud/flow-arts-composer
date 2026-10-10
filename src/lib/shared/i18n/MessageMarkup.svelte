<!--
  MessageMarkup renders a translated sentence's <strong>, <em>, and <br> tags
  as real elements, so emphasis and line breaks survive translation without
  {@html}. message-markup.ts owns which tags count.

  These elements belong to this component, so a parent's scoped CSS cannot
  reach them. Style them from the parent with :global(strong) or :global(em).
-->
<script lang="ts">
  import { toMessageSegments } from "#lib/shared/i18n/message-markup.js";

  let { text }: { text: string } = $props();

  const segments = $derived(toMessageSegments(text));
</script>

<!-- Svelte drops the whitespace at the edges of each branch, so this layout
     adds no spaces between words and their punctuation. -->
{#each segments as segment}
  {#if segment.kind === "break"}
    <br />
  {:else if segment.strong && segment.em}
    <strong><em>{segment.text}</em></strong>
  {:else if segment.strong}
    <strong>{segment.text}</strong>
  {:else if segment.em}
    <em>{segment.text}</em>
  {:else}
    {segment.text}
  {/if}
{/each}
