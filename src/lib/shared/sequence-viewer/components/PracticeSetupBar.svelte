<!--
  PracticeSetupBar.svelte

  The practice setup config, laid out as a horizontal bar that lives in the
  bottom workstation row during the SETUP phase (replacing the old right-column
  card). On Start it conveyors out as the running cockpit (PracticeBar) slides in.

  Default-ready: pick a ramp preset (or Custom) and hit Start. The animation
  canvas + read-ahead lane stay put — only this bar swaps for the cockpit.

  Preset logic mirrors the retired PracticeSetupPane; Custom opens the existing
  PracticeConfigPopover for the full ramp form (so the bar height never grows).
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import PracticeConfigPopover from "./PracticeConfigPopover.svelte";
  import type { TempoPracticeConfig } from "../services/tempo-practice-orchestrator";

  interface Props {
    config: Partial<TempoPracticeConfig>;
    onSetConfig: (patch: Partial<TempoPracticeConfig>) => void;
    onStart: () => void;
  }

  let { config, onSetConfig, onStart }: Props = $props();

  type PresetId = "creep" | "staircase" | "custom";

  const PRESETS = $derived<{ value: PresetId; label: string }[]>([
    { value: "creep", label: t("viewer_ui_creep") },
    { value: "staircase", label: t("viewer_ui_staircase") },
    { value: "custom", label: t("viewer_ui_custom") },
  ]);

  // Which preset does the persisted config correspond to? (Creep = +1 every loop,
  // Staircase = +5 every 5 loops; anything else is Custom.)
  function matchPreset(c: Partial<TempoPracticeConfig>): PresetId {
    const inc = c.increment ?? 1;
    const rounds = c.roundsPerLevel ?? 1;
    if (inc === 1 && rounds === 1) return "creep";
    if (inc === 5 && rounds === 5) return "staircase";
    return "custom";
  }

  let selected = $state<PresetId>(matchPreset(config));
  let cfgOpen = $state(false);

  // When the Custom preset opens the ramp popover, anchor it over the preset
  // cluster (where the tap happened) instead of the far-right gear. Reset on
  // close so a direct gear tap still anchors to the gear.
  let presetsEl = $state<HTMLElement>();
  let configAnchor = $state<HTMLElement | null>(null);
  $effect(() => {
    if (!cfgOpen) configAnchor = null;
  });

  function pick(p: PresetId) {
    selected = p;
    if (p === "creep") onSetConfig({ increment: 1, roundsPerLevel: 1 });
    else if (p === "staircase")
      onSetConfig({ increment: 5, roundsPerLevel: 5 });
    else {
      configAnchor = presetsEl ?? null;
      cfgOpen = true; // Custom → open the ramp popover anchored at the preset
    }
  }

  let presetHint = $derived(
    selected === "creep"
      ? t("viewer_ui_creep_hint")
      : selected === "staircase"
        ? t("viewer_ui_staircase_hint")
        : t("viewer_ui_custom_ramp_hint")
  );

  // Read reduced-motion synchronously so the Start glow doesn't race a flag flip.
  let reduceMotion = $state(
    typeof matchMedia !== "undefined" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches
  );
</script>

<div class="practice-setup-bar">
  <div class="setup-inner">
    <!-- Left: how the tempo climbs -->
    <div class="bar-left" bind:this={presetsEl}>
      <SegmentedControl
        options={PRESETS}
        value={selected}
        onchange={pick}
        color="accent"
        size="sm"
      />
      <p class="bar-hint">{presetHint}</p>
    </div>

    <!-- Center: the hero. Biggest, most central control — this is the one action. -->
    <button
      class="setup-start"
      class:no-glow={reduceMotion}
      type="button"
      onclick={onStart}
    >
      <i class="fas fa-play" aria-hidden="true"></i>
      <span>Start practice</span>
    </button>

    <!-- Right: fine-tune (also opened by the Custom preset) -->
    <div class="bar-right">
      <PracticeConfigPopover
        {config}
        onUpdate={onSetConfig}
        bind:open={cfgOpen}
        customAnchor={configAnchor}
      />
    </div>
  </div>
</div>

<style>
  /* Container for the inner grid so it (a descendant) can respond to the bar's
     own width via a container query — the bar spans the drawer, which is narrower
     than the viewport when embedded, so query the bar not the viewport. */
  .practice-setup-bar {
    container-type: inline-size;
    container-name: setup-bar;
    width: 100%;
    height: 100%;
  }

  /* 3-column grid centers the Start hero regardless of the left/right widths:
     presets (start) · Start (center) · gear (end). */
  .setup-inner {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 18px;
    width: 100%;
    height: 100%;
    padding: 0 24px;
    box-sizing: border-box;
  }

  .bar-left {
    justify-self: start;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    min-width: 0;
    max-width: 100%;
  }

  /* Clamps so a long preset line never overflows the left cell. */
  .bar-hint {
    margin: 0;
    max-width: 100%;
    font-size: var(--font-size-sm, 0.875rem);
    line-height: 1.3;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bar-right {
    justify-self: end;
    display: flex;
    align-items: center;
  }

  /* Start CTA — the hero: centered, large, breathing glow says "press me". */
  .setup-start {
    justify-self: center;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    min-height: 60px;
    padding: 0 40px;
    border-radius: 16px;
    border: 2px solid
      color-mix(in srgb, var(--theme-accent, #8b5cf6) 60%, transparent);
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 34%,
      transparent
    );
    color: #fff;
    font-size: 1.22rem;
    font-weight: 800;
    letter-spacing: 0.01em;
    cursor: pointer;
    transition:
      background var(--duration-fast, 150ms) ease,
      border-color var(--duration-fast, 150ms) ease,
      transform var(--duration-fast, 150ms) ease,
      box-shadow var(--duration-fast, 150ms) ease;
    -webkit-tap-highlight-color: transparent;
    animation: setup-start-ready 2.6s ease-in-out infinite;
  }
  .setup-start i {
    font-size: 1.05rem;
    transition: transform var(--duration-fast, 150ms)
      var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1));
  }
  @keyframes setup-start-ready {
    0%,
    100% {
      box-shadow: 0 0 0 0
        color-mix(in srgb, var(--theme-accent, #8b5cf6) 0%, transparent);
    }
    50% {
      box-shadow: 0 0 22px 2px
        color-mix(in srgb, var(--theme-accent, #8b5cf6) 35%, transparent);
    }
  }
  @media (hover: hover) and (pointer: fine) {
    .setup-start:hover {
      background: color-mix(
        in srgb,
        var(--theme-accent, #8b5cf6) 42%,
        transparent
      );
      border-color: color-mix(
        in srgb,
        var(--theme-accent, #8b5cf6) 70%,
        transparent
      );
      box-shadow: 0 0 24px
        color-mix(in srgb, var(--theme-accent, #8b5cf6) 40%, transparent);
    }
    .setup-start:hover i {
      transform: translateX(2px);
    }
  }
  .setup-start:active {
    transform: scale(0.98);
  }
  .setup-start:focus-visible {
    outline: 3px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  .setup-start.no-glow {
    transition: none;
    animation: none;
  }
  .setup-start.no-glow i {
    transition: none;
  }
  .setup-start.no-glow:active {
    transform: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .setup-start {
      transition: none;
      animation: none;
    }
    .setup-start i {
      transition: none;
    }
    .setup-start:active {
      transform: none;
    }
  }

  /* Mobile: the desktop 3-column grid crushes the presets against the big center
     Start on a phone (they overlap). Stack instead — presets + gear on top, the
     hint under them, Start as a full-width hero below. Lives AFTER the base rules:
     container queries add no specificity, so source order is what lets these win. */
  @container setup-bar (max-width: 600px) {
    .setup-inner {
      grid-template-columns: 1fr auto;
      grid-template-areas:
        "left  right"
        "start start";
      gap: 10px 12px;
      align-content: center;
      padding: 12px 16px;
    }
    .bar-left {
      grid-area: left;
    }
    .bar-right {
      grid-area: right;
      align-self: start;
    }
    /* Stacked layout has vertical room — wrap the hint instead of ellipsizing it. */
    .bar-hint {
      white-space: normal;
      overflow: visible;
      text-overflow: clip;
    }
    .setup-start {
      grid-area: start;
      justify-self: stretch;
      width: 100%;
      min-height: 52px;
      padding: 0 20px;
      font-size: 1.1rem;
    }
  }
</style>
