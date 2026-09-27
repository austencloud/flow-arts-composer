<!--
SpellSettingsBar.svelte - Settings using MorphChip Primitives

All 5 chips in a single MorphChipGroup split across two rows:
  Row 1: Dashes, Props, Hands (3 chips)
  Row 2: Grid, Loop (2 chips)
When Loop expands, parent collapses word input + generate button via onLoopExpandedChange.

Container-aware responsive design (2-tier):
- Mobile/Tablet (default): MorphChip expanding chips in two rows
- Desktop (>=700px tall): Vertical flex column with all options visible
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import type { SpellPreferences } from "../domain/models/spell-models";
  import type { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import {
    LOOPType,
    LOOP_TYPE_LABELS,
  } from "$lib/shared/foundation/domain/models/generation/circular-models";
  import { LOOPComponent } from "$lib/features/create/generate/shared/domain/constants/loop-components";
  import {
    parseLoopComponents,
    generateLOOPType,
  } from "$lib/shared/create/services/loop-type-utils";
  import { LOOP_COMPONENTS } from "$lib/features/create/generate/shared/domain/constants/loop-constants";
  import MorphChipGroup from "$lib/shared/foundation/ui/morph-chip/MorphChipGroup.svelte";
  import MorphChip from "$lib/shared/foundation/ui/morph-chip/MorphChip.svelte";

  let {
    gridMode,
    preferences,
    onGridModeChange,
    onPreferenceChange,
    onLoopExpandedChange,
  }: {
    gridMode: GridMode;
    preferences: SpellPreferences;
    onGridModeChange: (mode: GridMode) => void;
    onPreferenceChange: <K extends keyof SpellPreferences>(
      key: K,
      value: SpellPreferences[K]
    ) => void;
    /** Notifies parent when Loop chip expansion state changes (for full-panel takeover) */
    onLoopExpandedChange?: (expanded: boolean) => void;
  } = $props();

  const haptic = getHapticFeedback();

  // Single unified expansion state for all 5 chips
  let expandedId = $state<string | null>(null);

  // Derived: is Loop chip currently expanded?
  let isLoopExpanded = $derived(expandedId === "loop");

  // Local multi-select state for LOOP toggle chips
  let localLoopSelection = $state<Set<LOOPComponent>>(new Set());
  let isValidLoopCombo = $state(true);

  // Sync local selection from preferences on external changes
  $effect(() => {
    if (preferences.makeCircular && preferences.selectedLOOPType) {
      localLoopSelection = parseLoopComponents(preferences.selectedLOOPType);
      isValidLoopCombo = true;
    } else if (!preferences.makeCircular) {
      localLoopSelection = new Set();
      isValidLoopCombo = true;
    }
  });

  // Dashes
  let dashValue = $derived.by(() => {
    if (preferences.motionTypeFilter === "no-dash") return "no-dash";
    if (preferences.motionTypeFilter === "prefer-dash") return "prefer-dash";
    return "mixed";
  });
  const dashOptions = [
    { value: "no-dash", label: "Low" },
    { value: "mixed", label: "Mixed" },
    { value: "prefer-dash", label: "High" },
  ];

  function handleDashChange(v: string) {
    haptic.trigger("selection");
    const mapped = v === "mixed" ? null : v;
    onPreferenceChange(
      "motionTypeFilter",
      mapped as SpellPreferences["motionTypeFilter"]
    );
  }

  // Props
  let propsValue = $derived(preferences.constraintPreset ?? "mixed");
  const propsOptions = [
    { value: "smooth", label: "Smooth" },
    { value: "mixed", label: "Mixed" },
    { value: "choppy", label: "Choppy" },
  ];

  function handlePropsChange(v: string) {
    haptic.trigger("selection");
    onPreferenceChange(
      "constraintPreset",
      v as SpellPreferences["constraintPreset"]
    );
  }

  // Hands
  let handsValue = $derived(preferences.handPathMode ?? "mixed");
  const handsOptions = [
    { value: "smooth", label: "Smooth" },
    { value: "mixed", label: "Mixed" },
    { value: "choppy", label: "Choppy" },
  ];

  function handleHandsChange(v: string) {
    haptic.trigger("selection");
    onPreferenceChange("handPathMode", v as SpellPreferences["handPathMode"]);
  }

  // Grid (MorphChip with Diamond/Box options)
  let gridChipValue = $derived(gridMode === "diamond" ? "diamond" : "box");
  const gridOptions = [
    { value: "diamond", label: "Diamond" },
    { value: "box", label: "Box" },
  ];

  function handleGridChipChange(v: string) {
    haptic.trigger("selection");
    onGridModeChange(v as GridMode);
  }

  // Display values for chips
  const dashDisplayValue = $derived.by(() => {
    if (preferences.motionTypeFilter === "no-dash") return "Low";
    if (preferences.motionTypeFilter === "prefer-dash") return "High";
    return "Mixed";
  });

  const propsDisplayValue = $derived.by(() => {
    if (preferences.constraintPreset === "smooth") return "Smooth";
    if (preferences.constraintPreset === "choppy") return "Choppy";
    return "Mixed";
  });

  const handsDisplayValue = $derived.by(() => {
    if (preferences.handPathMode === "smooth") return "Smooth";
    if (preferences.handPathMode === "choppy") return "Choppy";
    return "Mixed";
  });

  const gridDisplayValue = $derived(
    gridMode === "diamond" ? "\u25C7" : "\u25A2"
  );

  /** Check if a set of components round-trips through LOOPType resolution */
  function isRoundTripValid(components: Set<LOOPComponent>): boolean {
    if (components.size === 0) return true;
    const type = generateLOOPType(components);
    if (type === null) return false; // no implemented LOOP type for this combo
    const parsed = parseLoopComponents(type);
    if (parsed.size !== components.size) return false;
    for (const c of components) {
      if (!parsed.has(c)) return false;
    }
    return true;
  }

  function handleLoopToggle(component: LOOPComponent) {
    haptic.trigger("selection");
    const newSet = new Set(localLoopSelection);
    if (newSet.has(component)) {
      newSet.delete(component);
    } else {
      newSet.add(component);
    }
    localLoopSelection = newSet;

    if (newSet.size === 0) {
      onPreferenceChange("makeCircular", false);
      onPreferenceChange("selectedLOOPType", null);
      isValidLoopCombo = true;
    } else {
      const newType = isRoundTripValid(newSet)
        ? generateLOOPType(newSet)
        : null;
      isValidLoopCombo = newType !== null;
      if (newType !== null) {
        onPreferenceChange("makeCircular", true);
        onPreferenceChange("selectedLOOPType", newType);
      }
    }
  }

  const loopDisplayValue = $derived.by(() => {
    if (localLoopSelection.size === 0) return "Off";
    if (!isValidLoopCombo) return `${localLoopSelection.size} selected`;
    if (preferences.selectedLOOPType) {
      return LOOP_TYPE_LABELS[preferences.selectedLOOPType] ?? "Custom";
    }
    return "On";
  });
</script>

<div class="settings-container" class:loop-expanded={isLoopExpanded}>
  <!-- MOBILE LAYOUT: MorphChip expanding chips -->
  <div class="mobile-layout" class:loop-expanded={isLoopExpanded}>
    <MorphChipGroup
      bind:expandedId
      gap={6}
      onExpandedChange={(id) => onLoopExpandedChange?.(id === "loop")}
    >
      <div class="chip-row">
        <MorphChip
          id="dashes"
          label={t("create_ui_dashes")}
          bind:value={dashValue}
          options={dashOptions}
          displayValue={dashDisplayValue}
          onchange={handleDashChange}
        />
        <MorphChip
          id="props"
          label={t("create_ui_props")}
          expandedLabel={t("create_ui_prop_reversals")}
          bind:value={propsValue}
          options={propsOptions}
          displayValue={propsDisplayValue}
          onchange={handlePropsChange}
        />
        <MorphChip
          id="hands"
          label={t("create_ui_hands")}
          expandedLabel={t("create_ui_hand_reversals")}
          bind:value={handsValue}
          options={handsOptions}
          displayValue={handsDisplayValue}
          onchange={handleHandsChange}
        />
      </div>
      <div class="chip-row">
        <MorphChip
          id="grid"
          label={t("generator_grid")}
          bind:value={gridChipValue}
          options={gridOptions}
          displayValue={gridDisplayValue}
          onchange={handleGridChipChange}
        />
        <MorphChip
          id="loop"
          label="Loop"
          value={"loop"}
          options={[]}
          displayValue={loopDisplayValue}
          expandedHeight={200}
        >
          {#snippet expandedContent({ collapse, morphProgress })}
            <div
              class="loop-expanded-content"
              role="group"
              aria-label={t("create_ui_loop_components")}
              onpointerdown={(e) => e.stopPropagation()}
            >
              <div class="loop-toggle-grid">
                {#each LOOP_COMPONENTS as info}
                  {@const isActive = localLoopSelection.has(info.component)}
                  <button
                    class="loop-toggle-chip"
                    class:active={isActive}
                    onclick={() => handleLoopToggle(info.component)}
                    style:--chip-color={info.color}
                    aria-pressed={isActive}
                    aria-label="{info.label}: {isActive ? 'on' : 'off'}"
                    tabindex={morphProgress > 0.5 ? 0 : -1}
                  >
                    <i class="fas fa-{info.icon}" aria-hidden="true"></i>
                    <span>{info.label}</span>
                  </button>
                {/each}
              </div>
              {#if !isValidLoopCombo}
                <div class="combo-hint" role="status">
                  <i class="fas fa-flask" aria-hidden="true"></i>
                  This combination isn't wired up yet
                </div>
              {/if}
            </div>
          {/snippet}
        </MorphChip>
      </div>
    </MorphChipGroup>
  </div>

  <!-- DESKTOP LAYOUT: Expanded sections with all options visible -->
  <div class="desktop-layout">
    <div class="setting-section">
      <span class="section-label">{t("create_ui_dashes")}</span>
      <div class="section-options" role="radiogroup">
        {#each dashOptions as option}
          <button
            class="section-option"
            class:selected={dashValue === option.value}
            onclick={() => handleDashChange(option.value)}
            role="radio"
            aria-checked={dashValue === option.value}
          >
            {option.label}
          </button>
        {/each}
      </div>
    </div>

    <div class="setting-section">
      <span class="section-label">{t("create_ui_prop_reversals")}</span>
      <div class="section-options" role="radiogroup">
        {#each propsOptions as option}
          <button
            class="section-option"
            class:selected={propsValue === option.value}
            onclick={() => handlePropsChange(option.value)}
            role="radio"
            aria-checked={propsValue === option.value}
          >
            {option.label}
          </button>
        {/each}
      </div>
    </div>

    <div class="setting-section">
      <span class="section-label">{t("create_ui_hand_reversals")}</span>
      <div class="section-options" role="radiogroup">
        {#each handsOptions as option}
          <button
            class="section-option"
            class:selected={handsValue === option.value}
            onclick={() => handleHandsChange(option.value)}
            role="radio"
            aria-checked={handsValue === option.value}
          >
            {option.label}
          </button>
        {/each}
      </div>
    </div>

    <!-- Grid section -->
    <div class="setting-section">
      <span class="section-label">{t("generator_grid")}</span>
      <div class="section-options" role="radiogroup">
        <button
          class="section-option"
          class:selected={gridMode === "diamond"}
          onclick={() => {
            haptic.trigger("selection");
            onGridModeChange("diamond" as GridMode);
          }}
          role="radio"
          aria-checked={gridMode === "diamond"}
        >
          Diamond
        </button>
        <button
          class="section-option"
          class:selected={gridMode === "box"}
          onclick={() => {
            haptic.trigger("selection");
            onGridModeChange("box" as GridMode);
          }}
          role="radio"
          aria-checked={gridMode === "box"}
        >
          Box
        </button>
      </div>
    </div>

    <!-- Loop section - multi-toggle chips in 3x2 grid -->
    <div class="setting-section loop-section">
      <span class="section-label">{t("create_ui_loop")}</span>
      <div class="loop-toggle-grid">
        {#each LOOP_COMPONENTS as info}
          {@const isActive = localLoopSelection.has(info.component)}
          <button
            class="loop-toggle-chip"
            class:active={isActive}
            onclick={() => handleLoopToggle(info.component)}
            style:--chip-color={info.color}
            aria-pressed={isActive}
            aria-label="{info.label}: {isActive ? 'on' : 'off'}"
          >
            <i class="fas fa-{info.icon}" aria-hidden="true"></i>
            <span>{info.label}</span>
          </button>
        {/each}
      </div>
      {#if !isValidLoopCombo}
        <div class="combo-hint" role="status">
          <i class="fas fa-flask" aria-hidden="true"></i>
          This combination isn't wired up yet
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .settings-container {
    display: flex;
    flex-direction: column;
    gap: var(--settings-spacing-sm, 8px);
    --scale: var(--spell-scale, 1);
    width: 100%;
  }

  /* Loop expanded: no special sizing needed - group handles it via min-height */

  .mobile-layout {
    display: flex;
    flex-direction: column;
    gap: var(--settings-spacing-sm, 8px);
  }

  .chip-row {
    display: flex;
    gap: 6px;
    width: 100%;
    /* CRITICAL: No position property - chips must measure offsetLeft/offsetTop from the group */
  }

  /* Match between-row gap to parent's fluid spacing for consistent vertical rhythm */
  .mobile-layout :global(.morph-chip-group) {
    row-gap: var(--fluid-space, 8px);
  }

  /* MorphChipGroup handles its own sizing via has-expanded min-height */

  /* LOOP EXPANDED CONTENT (inside MorphChip custom content) */

  .loop-expanded-content {
    display: flex;
    flex-direction: column;
    gap: var(--settings-spacing-sm, 8px);
  }

  .desktop-layout {
    display: none;
  }

  /* DESKTOP LAYOUT: Base styles for expanded sections */
  /* These MUST come before container queries so CQ overrides win */

  .setting-section {
    display: flex;
    flex-direction: column;
    gap: calc(8px * var(--scale));
    padding: calc(16px * var(--scale));
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: calc(18px * var(--scale));
  }

  .section-label {
    font-size: calc(12px * var(--scale));
    font-weight: 600;
    color: var(--theme-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .section-options {
    display: flex;
    gap: calc(8px * var(--scale));
  }

  .section-option {
    flex: 1;
    min-height: calc(56px * var(--scale));
    padding: calc(12px * var(--scale)) calc(16px * var(--scale));
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.6));
    border: 1.5px solid var(--theme-stroke);
    border-radius: calc(12px * var(--scale));
    color: var(--theme-text-muted);
    font-size: calc(14px * var(--scale));
    font-weight: 600;
    cursor: pointer;
    transition: all 150ms ease;
  }

  .section-option:active {
    transform: scale(0.97);
  }

  .section-option:hover:not(.selected) {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong);
    color: var(--theme-text);
  }

  .section-option.selected {
    background: color-mix(
      in srgb,
      var(--theme-accent) 25%,
      var(--theme-card-bg)
    );
    border-color: var(--theme-accent);
    color: var(--theme-text);
  }

  .loop-section {
    padding-bottom: calc(12px * var(--scale));
  }

  /* LOOP TOGGLE CHIPS (shared mobile + desktop) */

  .loop-toggle-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--settings-spacing-sm, 8px);
  }

  .loop-toggle-chip {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    min-height: 56px;
    padding: 8px;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.6));
    border: 1.5px solid var(--theme-stroke);
    border-radius: 12px;
    color: var(--theme-text-muted);
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    cursor: pointer;
    transition: all 150ms ease;
  }

  .loop-toggle-chip:hover {
    background: var(--theme-card-hover-bg);
    border-color: var(--chip-color, var(--theme-stroke-strong));
    color: var(--theme-text);
  }

  .loop-toggle-chip:active {
    transform: scale(0.96);
  }

  .loop-toggle-chip.active {
    background: color-mix(
      in srgb,
      var(--chip-color, var(--theme-accent)) 20%,
      var(--theme-card-bg)
    );
    border-color: var(--chip-color, var(--theme-accent));
    color: var(--theme-text);
  }

  .loop-toggle-chip.active i {
    color: var(--chip-color);
  }

  .loop-toggle-chip i {
    font-size: 18px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    transition: color 150ms ease;
  }

  .loop-toggle-chip:focus-visible {
    outline: 2px solid var(--chip-color, var(--theme-accent));
    outline-offset: 2px;
  }

  .combo-hint {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--font-size-compact, 12px);
    color: var(--semantic-warning, #f59e0b);
    padding: 4px 8px;
    background: color-mix(
      in srgb,
      var(--semantic-warning, #f59e0b) 10%,
      transparent
    );
    border: 1px solid
      color-mix(in srgb, var(--semantic-warning, #f59e0b) 25%, transparent);
    border-radius: 6px;
  }

  .combo-hint i {
    font-size: 12px;
    flex-shrink: 0;
  }

  /* CONTAINER QUERIES: Must come AFTER base styles to override */

  /* Desktop: tall tool panel - vertical flex column with labels + expanded options */
  @container tool-panel (min-height: 700px) {
    .mobile-layout {
      display: none;
    }

    .desktop-layout {
      display: flex;
      flex-direction: column;
      gap: calc(6px * var(--scale));
    }

    .setting-section {
      padding: calc(8px * var(--scale)) calc(12px * var(--scale));
      gap: calc(6px * var(--scale));
      border-radius: calc(14px * var(--scale));
    }

    .section-label {
      display: block;
      font-size: calc(11px * var(--scale));
    }

    .section-options {
      gap: calc(6px * var(--scale));
    }

    .section-option {
      min-height: calc(44px * var(--scale));
      padding: calc(8px * var(--scale)) calc(12px * var(--scale));
      font-size: calc(14px * var(--scale));
      border-radius: calc(10px * var(--scale));
    }

    .loop-section {
      grid-column: unset;
      padding-bottom: calc(8px * var(--scale));
    }

    .loop-toggle-grid {
      grid-template-columns: repeat(3, 1fr);
      gap: 6px;
    }

    .loop-toggle-chip {
      min-height: 44px;
      padding: 6px;
      font-size: var(--font-size-compact, 12px);
      gap: 3px;
      border-radius: 10px;
      flex-direction: column;
    }

    .loop-toggle-chip i {
      font-size: 16px;
    }
  }

  /* Reduced motion */

  @media (prefers-reduced-motion: reduce) {
    .loop-toggle-chip,
    .section-option {
      transition: none;
      animation: none;
    }
  }
</style>
