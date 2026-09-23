<!--
  EnhancedPWAInstallGuide.svelte

  Polished PWA installation guide with:
  - Intelligent device/browser detection
  - Platform-specific screenshots
  - Font Awesome icons
  - Glass morphism styling
  - Step-by-step visual guidance
  - Container-aware responsive layout
  - Runes-based reactive sizing

  REFACTORED: Now uses composition and configuration-driven approach
  - Platform detection separated into service
  - Instructions extracted to configuration
  - Sub-components for step display
  - Measurement logic isolated to utility
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
  import { createViewportMeasurement } from "../utils/viewport-measurement.svelte";
  import PlatformInstructions from "./PlatformInstructions.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";

  // Props
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

  // What the device actually is, detected once on mount. Never changes after.
  let detected = $state<{ platform: Platform; browser: Browser }>({
    platform: "desktop",
    browser: "other",
  });

  // Which pill is selected right now. Starts on the detected platform and
  // can be changed by tapping a pill; the choice round-trips through the
  // ?install= URL param.
  let selectedPill = $state<Platform>("desktop");

  // Viewport measurement
  const viewport = createViewportMeasurement({ initialDelay: 100 });

  onMount(() => {
    const info = detectPlatformAndBrowser();
    detected = { platform: info.platform, browser: info.browser };
    selectedPill = detected.platform;
  });

  // Reading the URL only matters once the sheet is actually open — the app
  // shell can also open this sheet, and a stale ?install= param from a
  // previous visit shouldn't silently override the detected default before
  // the visitor ever sees a pill.
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
      <span class="pill-device-tag">(this device)</span>
    {/if}
  </span>
{/snippet}

{#if showGuide}
  <!-- Backdrop -->
  <div
    class="guide-backdrop"
    onclick={handleClose}
    transition:fade={{ duration: 250 }}
    role="presentation"
  ></div>

  <!-- Guide Bottom Sheet -->
  <div
    class="guide-sheet"
    class:compact={viewport.needsCompactMode}
    bind:this={viewport.sheetElement}
    transition:fly={{ y: 500, duration: 350 }}
  >
    <!-- Handle bar for swipe affordance -->
    <div class="sheet-handle"></div>

    <div class="guide-header">
      <div class="header-title">
        <i class="{instructions.icon} title-icon" aria-hidden="true"></i>
        <h2>{instructions.title}</h2>
      </div>
      <button class="close-btn" onclick={handleClose} aria-label="Close guide">
        <i class="fas fa-times" aria-hidden="true"></i>
      </button>
    </div>

    <div class="platform-picker" class:compact={viewport.needsCompactMode}>
      <SegmentedControl
        options={PILLS}
        value={selectedPill}
        onchange={selectPill}
        semantics="radiogroup"
        color="accent"
        size={viewport.needsCompactMode ? "sm" : "md"}
        ariaLabel="Choose a device to see its install steps"
        optionContent={pillContent}
      />
    </div>

    <div class="guide-content" bind:this={viewport.contentElement}>
      <PlatformInstructions
        {instructions}
        compact={viewport.needsCompactMode}
      />
    </div>

    <!-- Sticky Footer -->
    <div class="guide-footer">
      <button
        class="got-it-btn"
        onclick={handleClose}
        aria-label="Dismiss install guide"
      >
        <i class="fas fa-check" aria-hidden="true"></i>
        <span>Got It</span>
      </button>
    </div>
  </div>
{/if}

<style>
  /* Backdrop */
  .guide-backdrop {
    position: fixed;
    inset: 0;
    /* Dim scrim behind the sheet; theme-shadow is the closest dark-overlay token. */
    background: color-mix(in srgb, var(--theme-shadow, #000) 75%, transparent);
    backdrop-filter: blur(8px);
    z-index: var(--z-priority);
  }

  /* Bottom Sheet */
  .guide-sheet {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    /* Sit one layer above the backdrop in the shared z-index scale (see app.css). */
    z-index: calc(var(--z-priority) + 1);

    /* Use dynamic viewport height for true adaptability */
    max-height: 95vh;
    max-height: 95dvh;
    display: flex;
    flex-direction: column;
    overflow: hidden;

    /* Glass morphism matching app design */
    background: color-mix(
      in srgb,
      var(--theme-panel-bg, #1a1a2e) 95%,
      transparent
    );
    backdrop-filter: blur(24px) saturate(180%);
    border-top-left-radius: 20px;
    border-top-right-radius: 20px;
    border-top: 1px solid var(--theme-stroke-strong);
    border-left: 1px solid var(--theme-stroke);
    border-right: 1px solid var(--theme-stroke);
    box-shadow:
      0 -8px 32px color-mix(in srgb, var(--theme-shadow, #000) 40%, transparent),
      0 -2px 8px var(--theme-shadow),
      0 0 0 1px color-mix(in srgb, var(--theme-text, #fff) 5%, transparent) inset;

    padding-bottom: env(safe-area-inset-bottom);
  }

  /* Compact mode - reduce all spacing */
  .guide-sheet.compact {
    max-height: 98vh;
    max-height: 98dvh;
  }

  /* Handle bar for swipe affordance */
  .sheet-handle {
    width: var(--min-touch-target);
    height: 5px;
    background: color-mix(in srgb, var(--theme-text, #fff) 30%, transparent);
    border-radius: 3px;
    margin: 12px auto 8px;
    flex-shrink: 0;
    cursor: grab;
    transition: background var(--duration-normal) ease;
  }

  .sheet-handle:hover {
    background: color-mix(in srgb, var(--theme-text, #fff) 50%, transparent);
  }

  /* Header */
  .guide-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 24px;
    border-bottom: 1px solid var(--theme-stroke);
    flex-shrink: 0;
  }

  /* Compact mode header */
  .compact .guide-header {
    padding: 14px 20px;
  }

  .header-title {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .title-icon {
    font-size: var(--font-size-xl);
    color: var(--theme-accent);
  }

  .guide-header h2 {
    margin: 0;
    font-size: var(--font-size-lg);
    font-weight: 700;
    color: var(--theme-text);
  }

  .compact .guide-header h2 {
    font-size: var(--font-size-base);
  }

  /* Platform picker */
  .platform-picker {
    padding: 14px 24px 0;
    flex-shrink: 0;
  }

  .platform-picker.compact {
    padding: 10px 20px 0;
  }

  .pill-label {
    display: flex;
    flex-direction: column;
    align-items: center;
    line-height: 1.2;
  }

  .pill-device-tag {
    font-size: var(--font-size-compact, 0.7rem);
    font-weight: 500;
    color: var(--theme-text-dim);
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    min-width: var(--min-touch-target);
    min-height: var(--min-touch-target);
    background: var(--theme-card-bg, var(--theme-card-bg));
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    color: var(--theme-text-dim);
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .close-btn:hover {
    background: var(--theme-card-hover-bg);
    color: var(--theme-text);
  }

  /* Scrollable Content */
  .guide-content {
    flex: 1;
    overflow-y: auto;
    padding: 20px 24px;
    min-height: 0;
    overscroll-behavior: contain;
  }

  /* Compact mode content */
  .compact .guide-content {
    padding: 12px 16px;
  }

  /* Sticky Footer - Fluid sizing */
  .guide-footer {
    flex-shrink: 0;
    display: flex;
    justify-content: center;
    padding: clamp(10px, 2.5cqh, 16px) clamp(14px, 4cqw, 20px);
    background: color-mix(
      in srgb,
      var(--theme-panel-bg, #1a1a2e) 98%,
      transparent
    );
    border-top: 1px solid var(--theme-stroke);
  }

  .compact .guide-footer {
    padding: clamp(8px, 2cqh, 12px) clamp(12px, 3cqw, 16px);
  }

  .got-it-btn {
    display: flex;
    align-items: center;
    gap: clamp(6px, 1.5cqw, 8px);
    padding: clamp(10px, 2.5cqh, 12px) clamp(20px, 6cqw, 32px);
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--theme-accent) 90%, transparent) 0%,
      color-mix(in srgb, var(--theme-accent) 90%, transparent) 100%
    );
    color: white;
    border: 1px solid color-mix(in srgb, var(--theme-text, #fff) 20%, transparent);
    border-radius: clamp(8px, 2cqw, 10px);
    font-size: clamp(13px, 3cqw, 15px);
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-normal) cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 4px 12px
      color-mix(in srgb, var(--theme-accent) 30%, transparent);
  }

  .compact .got-it-btn {
    padding: clamp(8px, 2cqh, 10px) clamp(16px, 5cqw, 24px);
    font-size: clamp(12px, 2.5cqw, 14px);
  }

  .got-it-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px
      color-mix(in srgb, var(--theme-accent) 40%, transparent);
  }

  .got-it-btn:active {
    transform: translateY(0);
  }
</style>
