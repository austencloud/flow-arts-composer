<!--
  EnhancedPWAInstallGuide.svelte

  Bottom sheet with add-to-home-screen steps. Platform pills pick the steps;
  the detected device is the default, and a manual pick round-trips through
  the ?install= URL param. Step copy and screenshots live in
  config/pwa-install-instructions.ts.
-->
<script lang="ts">
  import { detectPlatformAndBrowser } from "$lib/shared/mobile/services/platform-detector";
  import { onMount } from "svelte";
  import { fade, fly } from "svelte/transition";
  import { replaceState } from "$app/navigation";
  import { page } from "$app/state";
  import type { Platform, Browser } from "../config/pwa-install-instructions";
  import {
    getInstallInstructions,
    resolveInstallVariant,
  } from "../config/pwa-install-instructions";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";

  let {
    showGuide = $bindable(false),
  }: {
    showGuide?: boolean;
  } = $props();

  const PILLS: { value: Platform; label: string }[] = [
    { value: "ios", label: "iPhone" },
    { value: "android", label: "Android" },
    { value: "desktop", label: "Computer" },
  ];

  // What the device actually is, detected once on mount.
  let detected = $state<{ platform: Platform; browser: Browser }>({
    platform: "desktop",
    browser: "other",
  });

  let selectedPill = $state<Platform>("desktop");

  onMount(() => {
    const info = detectPlatformAndBrowser();
    detected = { platform: info.platform, browser: info.browser };
    selectedPill = detected.platform;
  });

  // Read ?install= only while the sheet is open, so a stale param never
  // overrides the detected default before the visitor sees a pill.
  $effect(() => {
    if (!showGuide) return;
    const param = page.url.searchParams.get("install");
    if (param === "ios" || param === "android" || param === "desktop") {
      selectedPill = param;
    } else {
      selectedPill = detected.platform;
    }
  });

  const variant = $derived(resolveInstallVariant(selectedPill, detected));
  const instructions = $derived(
    getInstallInstructions(variant.platform, variant.browser)
  );

  function selectPill(value: Platform) {
    selectedPill = value;
    const url = new URL(page.url);
    url.searchParams.set("install", value);
    replaceState(url, page.state);
  }

  function handleClose() {
    showGuide = false;
    if (page.url.searchParams.has("install")) {
      const url = new URL(page.url);
      url.searchParams.delete("install");
      replaceState(url, page.state);
    }
  }
</script>

{#snippet pillContent(value: Platform)}
  {@const pill = PILLS.find((p) => p.value === value)}
  <span class="pill-label">
    {pill?.label}
    {#if value === detected.platform}
      <span class="pill-device-tag">this device</span>
    {/if}
  </span>
{/snippet}

{#if showGuide}
  <div
    class="guide-backdrop"
    onclick={handleClose}
    transition:fade={{ duration: 250 }}
    role="presentation"
  ></div>

  <div
    class="guide-sheet"
    role="dialog"
    aria-modal="true"
    aria-labelledby="install-guide-title"
    transition:fly={{ y: 500, duration: 350 }}
  >
    <div class="guide-header">
      <h2 id="install-guide-title">Add to your home screen</h2>
      <button class="close-btn" onclick={handleClose} aria-label="Close">
        <i class="fas fa-times" aria-hidden="true"></i>
      </button>
    </div>

    <div class="platform-picker">
      <SegmentedControl
        options={PILLS}
        value={selectedPill}
        onchange={selectPill}
        semantics="radiogroup"
        color="accent"
        size="sm"
        ariaLabel="Choose a device"
        optionContent={pillContent}
      />
    </div>

    <ol class="steps">
      {#each instructions.steps as step, index (step.text)}
        <li class="step">
          <span class="step-number" aria-hidden="true">{index + 1}</span>
          <div class="step-body">
            <!--
              SANITIZATION CONTRACT: step.text is rendered with {@html} and
              MUST stay trusted, static, developer-authored markup from
              pwa-install-instructions.ts. Never wire it to user input, URL
              params, or network responses.
            -->
            <p class="step-text">{@html step.text}</p>
            {#if step.image}
              <img
                class="step-image"
                src={step.image}
                alt={step.alt ?? `Step ${index + 1}`}
                loading="lazy"
              />
            {/if}
          </div>
        </li>
      {/each}
    </ol>
  </div>
{/if}

<style>
  .guide-backdrop {
    position: fixed;
    inset: 0;
    background: rgb(0 0 0 / 0.6);
    backdrop-filter: blur(6px);
    z-index: var(--z-priority);
  }

  /* Phone-width sheet, centered on wider screens so screenshots stay at
     roughly the size they are on a phone. */
  .guide-sheet {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    margin: 0 auto;
    width: 100%;
    max-width: 440px;
    max-height: 90dvh;
    z-index: calc(var(--z-priority) + 1);
    display: flex;
    flex-direction: column;
    /* --theme-panel-bg is translucent; the blur keeps the page behind it
       from reading through. */
    background: var(--theme-panel-bg, #1a1a2e);
    backdrop-filter: blur(24px) saturate(160%);
    border: 1px solid var(--theme-stroke);
    border-bottom: none;
    border-radius: 16px 16px 0 0;
    padding-bottom: env(safe-area-inset-bottom);
  }

  .guide-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 12px 4px 20px;
    flex-shrink: 0;
  }

  .guide-header h2 {
    margin: 0;
    font-size: var(--font-size-base);
    font-weight: 600;
    color: var(--theme-text);
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    background: none;
    border: none;
    border-radius: 8px;
    color: var(--theme-text-dim);
    cursor: pointer;
  }

  .close-btn:hover {
    color: var(--theme-text);
    background: var(--theme-card-hover-bg);
  }

  .platform-picker {
    padding: 4px 16px 12px;
    flex-shrink: 0;
  }

  .pill-label {
    display: flex;
    flex-direction: column;
    align-items: center;
    line-height: 1.15;
  }

  .pill-device-tag {
    font-size: 0.65rem;
    font-weight: 400;
    color: var(--theme-text-dim);
  }

  .steps {
    list-style: none;
    margin: 0;
    padding: 4px 20px 20px;
    overflow-y: auto;
    overscroll-behavior: contain;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .step {
    display: flex;
    gap: 12px;
  }

  .step-number {
    flex-shrink: 0;
    width: 22px;
    height: 22px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: color-mix(in srgb, var(--theme-accent) 25%, transparent);
    color: var(--theme-text);
    font-size: 0.75rem;
    font-weight: 600;
  }

  .step-body {
    min-width: 0;
    flex: 1;
  }

  .step-text {
    margin: 1px 0 0;
    color: var(--theme-text);
    font-size: 0.9rem;
    line-height: 1.45;
  }

  .step-text :global(strong) {
    font-weight: 600;
  }

  .step-image {
    display: block;
    width: 100%;
    max-width: 320px;
    height: auto;
    margin-top: 8px;
    border-radius: 8px;
    border: 1px solid var(--theme-stroke);
  }
</style>
