<script lang="ts">
  import { parseMessageText } from "../../domain/message-link-parts";
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";

  interface Props {
    content: string;
    isOwn: boolean;
    attachment?: boolean;
    linkify?: boolean;
  }

  let { content, isOwn, attachment = false, linkify = true }: Props = $props();

  const parts = $derived(
    linkify
      ? parseMessageText(content)
      : ([{ kind: "text", text: content }] as const)
  );
</script>

<p
  class="message-text"
  class:own={isOwn}
  class:attachment
  data-message-selectable="true"
>
  {#each parts as part, index (`${part.kind}-${index}`)}
    {#if part.kind === "link"}
      <LinkChip size="inline" wrap href={part.href} data-message-link="true"
        >{part.text}</LinkChip
      >
    {:else}{part.text}{/if}
  {/each}
</p>

<style>
  .message-text {
    margin: 0 0 4px;
    font-size: var(--font-size-sm);
    line-height: 1.4;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    color: var(--theme-text);
    cursor: text;
    -webkit-user-select: text;
    user-select: text;
    -webkit-touch-callout: default;
  }

  .message-text.own {
    color: white;
  }

  .message-text.attachment {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--theme-stroke);
  }

  /* A link in your own bubble sits on the accent fill, so its chip is drawn
     in white rather than in the accent it would vanish into. */
  .message-text.own {
    --theme-accent: white;
  }

  .message-text::selection,
  .message-text :global(*::selection) {
    background: color-mix(
      in srgb,
      var(--theme-accent, var(--semantic-info)) 42%,
      transparent
    );
  }

  .message-text.own::selection,
  .message-text.own :global(*::selection) {
    color: var(--theme-text, #111827);
    background: rgba(255, 255, 255, 0.82);
  }
</style>
