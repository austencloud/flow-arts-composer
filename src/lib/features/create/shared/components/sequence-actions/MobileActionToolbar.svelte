<!--
  MobileActionToolbar.svelte

  M3-inspired floating contextual toolbar for mobile sequence actions.
  Segmented category tabs (Transform | Patterns | Edit) switch which
  action buttons are visible. Long-press any button for help.
-->
<script lang="ts">
  import MobileActionButton from "./MobileActionButton.svelte";
  import SwapIcon from "$lib/shared/icons/SwapIcon.svelte";
  import type { ActionHelpId } from "../../domain/transforms/transform-help-content";

  type Category = "transform" | "patterns" | "edit";

  interface ActionDef {
    id: ActionHelpId | "edit-turns" | "edit-in-construct";
    icon: string;
    label: string;
    btnColor: string;
    action: () => void;
    disabled?: boolean;
    unavailable?: boolean;
    highlighted?: boolean;
    visible?: boolean;
    locked?: boolean;
  }

  interface Props {
    hasSequence: boolean;
    fillAvailableHeight?: boolean;
    initialCategory?: Category;
    persistCategory?: boolean;
    hasSelection: boolean;
    isTransforming: boolean;
    canExtend?: boolean;
    isExtending?: boolean;
    canShiftStart?: boolean;
    shiftStartActive?: boolean;
    swapDisabled?: boolean;
    showEditInConstructor: boolean;
    /** Guest-gated Patterns category: tiles stay tappable but show a lock and
        route to sign-up (the parent supplies gated handlers). */
    patternsLocked?: boolean;
    onHelpRequest?: (actionId: ActionHelpId) => void;
    onMirror: () => void;
    onFlip: () => void;
    onInvert: () => void;
    onRotateCW: () => void;
    onRotateCCW: () => void;
    onSwap: () => void;
    onRewind: () => void;
    onTurnPattern: () => void;
    onRotationDirection: () => void;
    onDuration: () => void;
    onExtend?: () => void;
    onShiftStart?: () => void;
    onTurns: () => void;
    onEditInConstructor: () => void;
  }

  let {
    hasSequence,
    fillAvailableHeight = false,
    initialCategory,
    persistCategory = true,
    hasSelection = false,
    isTransforming,
    canExtend = false,
    isExtending = false,
    canShiftStart = false,
    shiftStartActive = false,
    swapDisabled = false,
    showEditInConstructor,
    patternsLocked = false,
    onHelpRequest,
    onMirror,
    onFlip,
    onInvert,
    onRotateCW,
    onRotateCCW,
    onSwap,
    onRewind,
    onTurnPattern,
    onRotationDirection,
    onDuration,
    onExtend,
    onShiftStart,
    onTurns,
    onEditInConstructor,
  }: Props = $props();

  // Persist active category across panel open/close cycles
  const CATEGORY_KEY = "tka_sequence_actions_category";
  const validCategories: Category[] = ["transform", "patterns", "edit"];

  function getStoredCategory(): Category {
    if (typeof sessionStorage === "undefined") return "transform";
    const stored = sessionStorage.getItem(CATEGORY_KEY);
    return validCategories.includes(stored as Category)
      ? (stored as Category)
      : "transform";
  }

  let activeCategory = $state<Category>(initialCategory ?? getStoredCategory());

  $effect(() => {
    if (persistCategory && typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(CATEGORY_KEY, activeCategory);
    }
  });

  const disabled = $derived(isTransforming || isExtending || !hasSequence);

  const transformActions = $derived<ActionDef[]>([
    {
      id: "mirror",
      icon: "left-right",
      label: "Mirror",
      btnColor: "139, 92, 246",
      action: onMirror,
      disabled,
    },
    {
      id: "flip",
      icon: "up-down",
      label: "Flip",
      btnColor: "99, 102, 241",
      action: onFlip,
      disabled,
    },
    {
      id: "swap",
      icon: "arrows-rotate",
      label: "Swap",
      btnColor: "16, 185, 129",
      action: onSwap,
      disabled: disabled || swapDisabled,
      unavailable: swapDisabled,
    },
    {
      id: "invert",
      icon: "repeat",
      label: "Invert",
      btnColor: "245, 158, 11",
      action: onInvert,
      disabled,
    },
    {
      id: "rotate",
      icon: "rotate-left",
      label: "Rotate L",
      btnColor: "249, 115, 22",
      action: onRotateCCW,
      disabled,
    },
    {
      id: "rotate",
      icon: "rotate-right",
      label: "Rotate R",
      btnColor: "249, 115, 22",
      action: onRotateCW,
      disabled,
    },
  ]);

  const patternsActions = $derived<ActionDef[]>([
    {
      id: "turn-pattern",
      icon: "wand-magic-sparkles",
      label: "Turn Pattern",
      btnColor: "20, 184, 166",
      action: onTurnPattern,
      disabled: !hasSequence,
      locked: patternsLocked,
    },
    {
      id: "direction",
      icon: "compass",
      label: "Direction",
      btnColor: "14, 165, 233",
      action: onRotationDirection,
      disabled: !hasSequence,
      locked: patternsLocked,
    },
    {
      id: "duration",
      icon: "stopwatch",
      label: "Duration",
      btnColor: "251, 146, 60",
      action: onDuration,
      disabled: !hasSequence,
      locked: patternsLocked,
    },
    {
      id: "rewind",
      icon: "backward",
      label: "Rewind",
      btnColor: "244, 63, 94",
      action: onRewind,
      disabled,
      locked: patternsLocked,
    },
    ...(onExtend && canExtend
      ? [
          {
            id: "extend" as const,
            icon: "circle-check",
            label: "Extend",
            btnColor: "34, 197, 94",
            action: onExtend,
            disabled: !hasSequence || isExtending,
            locked: patternsLocked,
          },
        ]
      : []),
    ...(onShiftStart
      ? [
          {
            id: "shift-start" as const,
            icon: shiftStartActive ? "xmark" : "forward",
            label: shiftStartActive ? "Choosing Start" : "Choose Start",
            btnColor: "6, 182, 212",
            action: onShiftStart,
            disabled: !hasSequence || isTransforming || !canShiftStart,
            unavailable: !canShiftStart,
            highlighted: shiftStartActive,
            locked: patternsLocked,
          },
        ]
      : []),
  ]);

  const editActions = $derived<ActionDef[]>([
    {
      id: "edit-turns",
      icon: "sliders-h",
      label: "Edit Turns",
      btnColor: "59, 130, 246",
      action: onTurns,
      disabled: !hasSelection,
      highlighted: hasSelection,
    },
    ...(showEditInConstructor
      ? [
          {
            id: "edit-in-construct" as const,
            icon: "pen-to-square",
            label: "Edit in Construct",
            btnColor: "124, 58, 237",
            action: onEditInConstructor,
            disabled: !hasSequence,
          },
        ]
      : []),
  ]);

  const activeActions = $derived<ActionDef[]>(
    activeCategory === "transform"
      ? transformActions
      : activeCategory === "patterns"
        ? patternsActions
        : editActions
  );

  const categories: { id: Category; label: string }[] = [
    { id: "transform", label: "Transform" },
    { id: "patterns", label: "Patterns" },
    { id: "edit", label: "Edit" },
  ];

  function handleLongPress(actionId: string) {
    // Only trigger help for known action help IDs (not edit-turns or edit-in-construct)
    const helpIds: ActionHelpId[] = [
      "mirror",
      "flip",
      "swap",
      "invert",
      "rotate",
      "rewind",
      "turn-pattern",
      "direction",
      "duration",
      "extend",
      "shift-start",
    ];
    if (helpIds.includes(actionId as ActionHelpId)) {
      onHelpRequest?.(actionId as ActionHelpId);
    }
  }
</script>

<div class="mobile-toolbar" class:fill-available-height={fillAvailableHeight}>
  <!-- Segmented category tabs -->
  <div class="category-tabs" role="tablist" aria-label="Action categories">
    {#each categories as cat}
      <button
        class="category-tab"
        class:active={activeCategory === cat.id}
        role="tab"
        aria-selected={activeCategory === cat.id}
        aria-controls="panel-{cat.id}"
        onclick={() => (activeCategory = cat.id)}
      >
        {cat.label}
      </button>
    {/each}
  </div>

  <!-- Action button grid -->
  <div
    class="action-grid"
    id="panel-{activeCategory}"
    role="tabpanel"
    aria-label="{activeCategory} actions"
  >
    {#each activeActions as action (action.id + action.label)}
      {#if action.id === "swap"}
        <MobileActionButton
          icon={action.icon}
          label={action.label}
          btnColor={action.btnColor}
          disabled={action.disabled ?? false}
          unavailable={action.unavailable ?? false}
          highlighted={action.highlighted ?? false}
          locked={action.locked ?? false}
          onAction={action.action}
          onLongPress={() => handleLongPress(action.id)}
        >
          {#snippet customIcon()}<SwapIcon size="16px" />{/snippet}
        </MobileActionButton>
      {:else}
        <MobileActionButton
          icon={action.icon}
          label={action.label}
          btnColor={action.btnColor}
          disabled={action.disabled ?? false}
          unavailable={action.unavailable ?? false}
          highlighted={action.highlighted ?? false}
          locked={action.locked ?? false}
          onAction={action.action}
          onLongPress={() => handleLongPress(action.id)}
        />
      {/if}
    {/each}
  </div>
</div>

<style>
  .mobile-toolbar {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex-shrink: 0;
    padding: 4px 8px 8px;
  }

  .mobile-toolbar.fill-available-height {
    flex: 1 1 auto;
    min-height: 0;
    width: min(100%, 40rem);
    align-self: center;
    justify-content: flex-start;
    container-type: size;
  }

  .mobile-toolbar.fill-available-height .action-grid {
    grid-auto-rows: clamp(
      calc(var(--min-touch-target) * 1.5),
      18cqh,
      calc(var(--min-touch-target) * 2)
    );
  }

  /* Segmented category tabs */
  .category-tabs {
    display: flex;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    flex-shrink: 0;
  }

  .category-tab {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    height: var(--min-touch-target, 44px);
    padding: 0 8px;
    border: none;
    border-right: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    background: transparent;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-fast, 100ms) ease;
  }

  .category-tab:last-child {
    border-right: none;
  }

  .category-tab.active {
    background: rgba(139, 92, 246, 0.2);
    color: rgb(196, 167, 251);
  }

  .category-tab:not(.active):hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.06));
    color: var(--theme-text, rgba(255, 255, 255, 0.9));
  }

  .category-tab:focus-visible {
    outline: 2px solid var(--theme-accent, rgba(139, 92, 246, 0.8));
    outline-offset: -2px;
    z-index: 1;
  }

  /* Action grid: 3 columns, 2 rows max */
  .action-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-auto-rows: 1fr;
    gap: 4px;
    min-height: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .category-tab {
      transition: none;
    }
  }
</style>
