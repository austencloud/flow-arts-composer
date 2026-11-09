<!--
  ReleaseTourArrival - what a highlight's "Show me" leaves on the page.

  Draws the arrival ring on whichever element carries `data-release-arrived`
  (set by releaseTourState on the highlight's `data-release-anchor`), and shows
  the highlight's one-line callout when there was no anchor to ring. The
  callout stays until dismissed or until the reader moves to another tab.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { flyFade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import { navigationState } from "#lib/shared/navigation/state/navigation-state.svelte.js";
  import { releaseTourState } from "../state/release-tour-state.svelte";

  // Moving on is a dismissal: the callout belongs to the tab it describes.
  $effect(() => {
    const at = releaseTourState.calloutAt;
    if (!at) return;
    if (
      navigationState.currentModule !== at.module ||
      (navigationState.activeTab ?? null) !== at.tab
    ) {
      releaseTourState.dismiss();
    }
  });
</script>

{#if releaseTourState.callout}
  <div
    class="release-callout"
    role="status"
    transition:flyFade={{ y: -12, duration: DURATION.normal }}
  >
    <i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i>
    <p>{releaseTourState.callout}</p>
    <button
      type="button"
      class="callout-close"
      aria-label={t("action_close")}
      onclick={() => releaseTourState.dismiss()}
    >
      <i class="fas fa-times" aria-hidden="true"></i>
    </button>
  </div>
{/if}

<style>
  .release-callout {
    position: fixed;
    top: calc(env(safe-area-inset-top, 0px) + 16px);
    left: 50%;
    translate: -50% 0;
    z-index: 900;
    display: flex;
    align-items: center;
    gap: 10px;
    box-sizing: border-box;
    width: max-content;
    max-width: min(36rem, calc(100vw - 32px));
    padding: 6px 6px 6px 16px;
    border: 1px solid
      color-mix(in srgb, var(--theme-accent, #6ea8fe) 45%, transparent);
    border-radius: 999px;
    background: color-mix(
      in srgb,
      var(--theme-panel-bg, rgb(18, 18, 28)) 92%,
      var(--theme-accent, #6ea8fe)
    );
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
    color: var(--theme-text, #ececf2);
  }

  .release-callout > i {
    flex: none;
    color: var(--theme-accent, #6ea8fe);
  }

  .release-callout p {
    margin: 0;
    font-size: var(--font-size-sm, 14px);
    line-height: 1.4;
  }

  .callout-close {
    flex: none;
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border: none;
    border-radius: 50%;
    background: color-mix(in srgb, var(--theme-text, #fff) 8%, transparent);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    cursor: pointer;
    transition: background-color var(--duration-fast) var(--ease-standard);
  }

  .callout-close:hover {
    background: color-mix(in srgb, var(--theme-text, #fff) 16%, transparent);
  }

  .callout-close:focus-visible {
    outline: 2px solid var(--theme-accent, #6ea8fe);
    outline-offset: 2px;
  }

  /* The arrival ring: it swells out twice and fades. An outline paints
     outside the box, so nothing around the element moves. */
  :global([data-release-arrived]) {
    outline: 2px solid transparent;
    outline-offset: 4px;
    animation: release-arrive calc(var(--duration-dramatic) * 6)
      var(--ease-standard);
  }

  @keyframes -global-release-arrive {
    0% {
      outline-color: transparent;
      outline-offset: 2px;
    }
    15%,
    60% {
      outline-color: var(--theme-accent, #6ea8fe);
      outline-offset: 4px;
    }
    35% {
      outline-color: color-mix(in srgb, var(--theme-accent, #6ea8fe) 55%, transparent);
      outline-offset: 9px;
    }
    100% {
      outline-color: transparent;
      outline-offset: 10px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    /* A still outline instead of the ring, lifted after a few seconds. */
    :global([data-release-arrived]) {
      animation: none;
      outline-color: var(--theme-accent, #6ea8fe);
    }
    .callout-close {
      transition: none;
    }
  }
</style>
