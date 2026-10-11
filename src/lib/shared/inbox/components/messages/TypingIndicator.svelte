<!--
  TypingIndicator.svelte

  Shows animated "X is typing..." indicator when other users are typing.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  let {
    typingUsers,
  } = $props<{
    typingUsers: string[];
  }>();

  const displayText = $derived.by(() => {
    if (typingUsers.length === 0) return "";
    if (typingUsers.length === 1) return t("inbox_typing_one", { name: typingUsers[0] ?? "" });
    if (typingUsers.length === 2) return t("inbox_typing_two", { first: typingUsers[0] ?? "", second: typingUsers[1] ?? "" });
    return t("inbox_typing_many", { name: typingUsers[0] ?? "", count: typingUsers.length - 1 });
  });
</script>

{#if typingUsers.length > 0}
  <div class="typing-indicator" role="status" aria-live="polite">
    <div class="dots">
      <span class="dot"></span>
      <span class="dot"></span>
      <span class="dot"></span>
    </div>
    <span class="text">{displayText}</span>
  </div>
{/if}

<style>
  .typing-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    font-size: var(--font-size-sm, 14px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    animation: fade-in var(--duration-normal) ease-out;
  }

  @keyframes fade-in {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .dots {
    display: flex;
    gap: 3px;
  }

  .dot {
    width: 6px;
    height: 6px;
    background: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    border-radius: 50%;
    animation: bounce 1.4s infinite ease-in-out both;
  }

  .dot:nth-child(1) {
    animation-delay: 0s;
  }

  .dot:nth-child(2) {
    animation-delay: 0.16s;
  }

  .dot:nth-child(3) {
    animation-delay: 0.32s;
  }

  @keyframes bounce {
    0%,
    80%,
    100% {
      transform: scale(0.6);
      opacity: 0.4;
    }
    40% {
      transform: scale(1);
      opacity: 1;
    }
  }

  .text {
    font-style: italic;
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .typing-indicator,
    .dot {
      animation: none !important;
    }

    .dot {
      opacity: 0.7;
      transform: none;
    }
  }
</style>
