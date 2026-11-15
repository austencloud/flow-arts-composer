<!--
  InstallNudgeCard.svelte

  The "use it as an app" card. It rises above the bottom bar, over the tool
  panel, so the sequence and the navigation stay in view. Non-modal: nothing
  behind it is blocked, and Not now, the close button or Escape (with focus
  in the card) put it away.

  installNudge (install-nudge-state.svelte.ts) owns when it opens, which
  install path it shows and the analytics. Austen picked this design
  (option C) on 2026-11-13.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { getInAppBrowserDisplayName } from "#lib/shared/mobile/services/platform-detector.js";
  import BottomNoteCard from "#lib/shared/components/BottomNoteCard.svelte";
  import type { TranslationKey } from "#lib/shared/i18n/i18n-types.js";
  import { onMount } from "svelte";
  import { installNudge } from "../install-nudge-state.svelte";

  // Reads the device once the page is up, so the menu knows whether to show
  // "Get the app". Not from a getter: state can't change mid-render.
  onMount(() => installNudge.init());

  type StepIcon = "share" | "add" | "more" | "menu" | "open" | "check";
  interface Step {
    key: TranslationKey;
    icon: StepIcon;
  }

  const route = $derived(installNudge.route);

  const steps = $derived.by((): Step[] => {
    switch (route) {
      case "ios-safari":
        return [
          {
            key: installNudge.shareInMoreMenu
              ? "install_nudge_ios_share_more"
              : "install_nudge_ios_share",
            icon: "share",
          },
          { key: "install_nudge_ios_add", icon: "add" },
          { key: "install_nudge_ios_confirm", icon: "check" },
        ];
      case "ios-browser":
        return [
          { key: "install_nudge_ios_browser_share", icon: "share" },
          { key: "install_nudge_ios_add", icon: "add" },
          { key: "install_nudge_ios_browser_confirm", icon: "check" },
        ];
      case "android-menu":
        return [
          { key: "install_nudge_android_menu", icon: "menu" },
          { key: "install_nudge_android_install", icon: "add" },
          { key: "install_nudge_android_confirm", icon: "check" },
        ];
      case "in-app":
        // Android gets a button that opens Chrome directly; the steps are
        // for iPhone, where only the in-app browser's own menu gets out.
        return installNudge.isAndroid
          ? []
          : [
              { key: "install_nudge_in_app_more", icon: "more" },
              { key: "install_nudge_in_app_open", icon: "open" },
            ];
      default:
        return [];
    }
  });

  const inAppName = $derived(
    getInAppBrowserDisplayName(installNudge.inAppBrowser) ||
      t("install_nudge_this_app")
  );

  const primaryLabel = $derived.by(() => {
    if (route === "native") return t("install_nudge_install");
    if (route === "in-app") {
      return installNudge.isAndroid
        ? t("install_nudge_open_chrome")
        : t("install_nudge_copy_link");
    }
    return t("install_nudge_done");
  });
</script>

{#snippet stepIcon(icon: StepIcon)}
  <span class="step-icon" aria-hidden="true">
    {#if icon === "share"}
      <svg viewBox="0 0 24 24"
        ><path d="M12 3v12M8 7l4-4 4 4M5 12v8h14v-8" /></svg
      >
    {:else if icon === "add"}
      <svg viewBox="0 0 24 24"
        ><rect x="4" y="4" width="16" height="16" rx="3" /><path
          d="M12 8v8M8 12h8"
        /></svg
      >
    {:else if icon === "more"}
      <svg viewBox="0 0 24 24" class="filled"
        ><circle cx="5" cy="12" r="1.8" /><circle
          cx="12"
          cy="12"
          r="1.8"
        /><circle cx="19" cy="12" r="1.8" /></svg
      >
    {:else if icon === "menu"}
      <svg viewBox="0 0 24 24" class="filled"
        ><circle cx="12" cy="5" r="1.8" /><circle
          cx="12"
          cy="12"
          r="1.8"
        /><circle cx="12" cy="19" r="1.8" /></svg
      >
    {:else if icon === "open"}
      <svg viewBox="0 0 24 24"
        ><path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" /></svg
      >
    {:else}
      <svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10" /></svg>
    {/if}
  </span>
{/snippet}

<BottomNoteCard
  open={installNudge.open}
  class="install-card"
  data-route={route}
  titleId="install-card-title"
  title={t("install_nudge_title")}
  announce={t("install_nudge_title")}
  closeLabel={t("install_nudge_close")}
  onClose={() => installNudge.dismiss("close")}
  onEscape={() => installNudge.dismiss("escape")}
  secondaryLabel={t("install_nudge_not_now")}
  onSecondary={() => installNudge.dismiss("not_now")}
  {primaryLabel}
  onPrimary={() => void installNudge.accept()}
>
  {#snippet leading()}
    <img
      class="app-icon"
      src="/pwa/icons/icon-96x96.png"
      alt=""
      width="36"
      height="36"
    />
  {/snippet}

  {#if route === "native"}
    <div class="gain" aria-hidden="true">
      <figure>
        <div class="phone">
          <span class="bar top"></span>
          <span class="art browser"></span>
          <span class="bar bottom"></span>
        </div>
        <figcaption>{t("install_nudge_browser")}</figcaption>
      </figure>
      <span class="gain-arrow">→</span>
      <figure>
        <div class="phone app">
          <span class="art full"></span>
        </div>
        <figcaption>{t("install_nudge_app")}</figcaption>
      </figure>
    </div>
    <p class="card-text centred">{t("install_nudge_native_body")}</p>
  {:else if route === "in-app"}
    <p class="card-text">
      {t("install_nudge_in_app_body", {
        app: inAppName,
        browser: installNudge.isAndroid ? "Chrome" : "Safari",
      })}
    </p>
  {:else}
    <p class="card-text">{t("install_nudge_steps_intro")}</p>
  {/if}

  {#if steps.length > 0}
    <ol class="steps">
      {#each steps as step, index (step.key)}
        <li>
          <span class="step-number" aria-hidden="true">{index + 1}</span>
          <span class="step-text">{t(step.key)}</span>
          {@render stepIcon(step.icon)}
        </li>
      {/each}
    </ol>
  {/if}

  {#if installNudge.linkCopied}
    <p class="copied" role="status">{t("install_nudge_link_copied")}</p>
  {/if}
</BottomNoteCard>

<style>
  .app-icon {
    width: 36px;
    height: 36px;
    border-radius: 9px;
    flex-shrink: 0;
  }

  .gain {
    display: flex;
    justify-content: center;
    align-items: flex-end;
    gap: 20px;
    margin: 0;
  }

  .gain figure {
    margin: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .gain figcaption {
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim);
  }

  .gain-arrow {
    align-self: center;
    margin-bottom: 18px;
    color: var(--theme-text-dim);
  }

  .phone {
    position: relative;
    width: 50px;
    height: 88px;
    border-radius: 9px;
    border: 2px solid color-mix(in srgb, var(--theme-text) 30%, transparent);
    background: #07080d;
    overflow: hidden;
  }

  .phone.app {
    border-color: var(--theme-accent);
  }

  .bar {
    position: absolute;
    left: 0;
    right: 0;
    background: color-mix(in srgb, var(--theme-text) 26%, #07080d);
  }

  .bar.top {
    top: 0;
    height: 13px;
  }

  .bar.bottom {
    bottom: 0;
    height: 15px;
  }

  .art {
    position: absolute;
    left: 5px;
    right: 5px;
    border-radius: 4px;
    background: linear-gradient(
      160deg,
      color-mix(in srgb, var(--theme-accent) 55%, #1d2a55),
      color-mix(in srgb, var(--theme-accent-strong, #8b5cf6) 60%, #2a1840)
    );
  }

  .art.browser {
    top: 18px;
    bottom: 20px;
  }

  .art.full {
    top: 5px;
    bottom: 5px;
  }

  .card-text.centred {
    text-align: center;
  }

  .steps {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .steps li {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: var(--font-size-sm);
    line-height: 1.3;
  }

  .step-number {
    width: 22px;
    height: 22px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: color-mix(in srgb, var(--theme-accent) 25%, transparent);
    font-size: var(--font-size-compact);
    font-weight: 700;
  }

  .step-text {
    flex: 1;
    min-width: 0;
  }

  .step-icon {
    width: 28px;
    height: 28px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    border-radius: 7px;
    background: color-mix(in srgb, var(--theme-text) 10%, transparent);
  }

  .step-icon svg {
    width: 16px;
    height: 16px;
    fill: none;
    stroke: var(--theme-text);
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .step-icon svg.filled {
    fill: var(--theme-text);
    stroke: none;
  }

  .copied {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--semantic-success, #22c55e);
  }
</style>
