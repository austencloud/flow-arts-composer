<!--
  ServiceOutageNotice - tells visitors that sign-in, saving and shared content
  are down while Google has the site's Firebase project switched off.

  Shows only after a real call failed with the suspension (see
  service-outage-state). In the app shell ("inline") it sits in the flow at the
  top of the content column, so it pushes the screen down instead of covering
  any control, and it inherits the shell's status-bar inset. Share-link pages
  have no shell to push ("overlay"): there it is a strip at the top, which
  during the outage only sits over the "Loading sequence" screen. Closing it
  holds for the browser session.

  Wording lives in two message keys, site_outage_title and
  site_outage_body, in every messages/*.json.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { growFade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import { serviceOutageState } from "../state/service-outage-state.svelte";

  interface Props {
    placement?: "inline" | "overlay";
  }

  let { placement = "inline" }: Props = $props();

  $effect(() => {
    if (serviceOutageState.visible) serviceOutageState.recordShown();
  });
</script>

{#if serviceOutageState.visible}
  <div
    class="outage-notice"
    class:overlay={placement === "overlay"}
    role="status"
    aria-live="polite"
    data-testid="service-outage-notice"
    transition:growFade={{ duration: DURATION.emphasis }}
  >
    <div class="notice-row">
      <i class="fas fa-triangle-exclamation notice-icon" aria-hidden="true"></i>
      <p class="notice-text">
        <strong class="notice-title">{t("site_outage_title")}</strong>
        <span class="notice-body">{t("site_outage_body")}</span>
      </p>
      <button
        type="button"
        class="notice-close"
        onclick={() => serviceOutageState.dismiss()}
        aria-label={t("common_close")}
      >
        <i class="fas fa-xmark" aria-hidden="true"></i>
      </button>
    </div>
  </div>
{/if}

<style>
  .outage-notice {
    position: relative;
    flex-shrink: 0;
    overflow: hidden;
    /* Opaque and fixed-dark on purpose: on a share page it sits over the
       viewer, and the white words must read the same in every theme. */
    background: color-mix(in srgb, var(--semantic-warning, #f59e0b) 18%, #12121c);
    border-bottom: 1px solid
      color-mix(in srgb, var(--semantic-warning, #f59e0b) 45%, transparent);
    color: #fff;
  }

  .outage-notice.overlay {
    /* behind the status bar: the tint runs under it, the words start below it */
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: var(--z-toast);
    padding-top: var(--safe-top);
  }

  .notice-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 4px 6px 12px;
  }

  .notice-icon {
    flex-shrink: 0;
    color: var(--semantic-warning, #f59e0b);
    font-size: var(--font-size-sm, 14px);
  }

  .notice-text {
    flex: 1;
    min-width: 0;
    margin: 0;
    font-size: var(--font-size-sm, 14px);
    line-height: 1.35;
    overflow-wrap: break-word;
  }

  .notice-title {
    font-weight: 600;
    margin-inline-end: 6px;
  }

  .notice-body {
    color: rgba(255, 255, 255, 0.82);
  }

  .notice-close {
    flex-shrink: 0;
    display: grid;
    place-items: center;
    width: var(--alt-touch-target, 36px);
    height: var(--alt-touch-target, 36px);
    border: none;
    border-radius: 8px;
    background: transparent;
    color: #fff;
    font-size: var(--font-size-base, 16px);
    cursor: pointer;
  }

  .notice-close:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .notice-close:focus-visible {
    outline: 2px solid var(--semantic-warning, #f59e0b);
    outline-offset: -2px;
  }
</style>
