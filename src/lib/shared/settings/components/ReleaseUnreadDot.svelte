<!--
  ReleaseUnreadDot - the dot that says release notes are waiting.

  Shown on every way into the notes while any release with notes is unread,
  and gone once What's New or Release Notes opens. Its space is always held
  and only visibility changes, so the label beside it never moves; the dot
  itself grows in and fades out rather than snapping.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { whatsNewState } from "../state/whats-new-state.svelte";

  const on = $derived(whatsNewState.hasUnread);
</script>

<span class="release-unread-dot" class:on aria-hidden="true"></span>
{#if on}<span class="sr-only">{t("settings_release_unread")}</span>{/if}

<style>
  .release-unread-dot {
    display: inline-block;
    flex: none;
    width: 8px;
    height: 8px;
    margin-inline: 6px 0;
    border-radius: 50%;
    background: var(--theme-accent, #6ea8fe);
    box-shadow: 0 0 0 2px
      color-mix(in srgb, var(--theme-accent, #6ea8fe) 25%, transparent);
    vertical-align: middle;
    visibility: hidden;
    opacity: 0;
    scale: 0.4;
    transition:
      opacity var(--duration-normal) var(--ease-standard),
      scale var(--duration-normal) var(--ease-standard),
      visibility 0s linear var(--duration-normal);
  }

  .release-unread-dot.on {
    visibility: visible;
    opacity: 1;
    scale: 1;
    transition:
      opacity var(--duration-normal) var(--ease-standard),
      scale var(--duration-normal) var(--ease-standard),
      visibility 0s;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  @media (prefers-reduced-motion: reduce) {
    .release-unread-dot,
    .release-unread-dot.on {
      transition: none;
    }
  }
</style>
