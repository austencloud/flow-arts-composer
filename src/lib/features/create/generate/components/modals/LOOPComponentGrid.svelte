<!--
LOOPComponentGrid.svelte - Layout for LOOP component selection buttons
- layout="grid" (default): compact 3x2 grid (icon + label), unchanged behavior.
  - layout="list": single vertical column with descriptions.
  - layout="responsive": descriptive desktop list, compact phone grid.
-->
<script lang="ts">
  import {
    LOOP_COMPONENTS,
    LOOPComponent,
  } from "$lib/features/create/generate/shared/domain/constants/loop-components";
  import type { Snippet } from "svelte";
  import LOOPComponentButton from "./LOOPComponentButton.svelte";

  let {
    selectedComponents,
    disabledComponents = null,
    disabledReasons = {},
    lockedComponents = null,
    isMultiSelectMode = false,
    layout = "grid",
    componentConfigurators = {},
    expandedComponents,
    configurableComponents = null,
    onConfigureComponent,
    onToggleComponent,
  } = $props<{
    selectedComponents: Set<LOOPComponent>;
    /** Components that can't join the current selection (combo mode gating). */
    disabledComponents?: Set<LOOPComponent> | null;
    /** Per-component reason for a hand-mode disable, shown on the button. */
    disabledReasons?: Partial<Record<LOOPComponent, string>>;
    /** Guest-gated components — still clickable, but route to sign-up. */
    lockedComponents?: Set<LOOPComponent> | null;
    isMultiSelectMode?: boolean;
    layout?: "grid" | "list" | "responsive";
    /** Transformation-owned controls rendered inside their selected cards. */
    componentConfigurators?: Partial<
      Record<LOOPComponent, Snippet | undefined>
    >;
    /** Selected components whose configurators are currently applicable. */
    expandedComponents?: Set<LOOPComponent>;
    /** Selected components with settings available in a separate detail view. */
    configurableComponents?: Set<LOOPComponent> | null;
    onConfigureComponent?: (component: LOOPComponent) => void;
    onToggleComponent: (component: LOOPComponent) => void;
  }>();

  // List layout shows descriptions per row; grid stays compact (icon + label).
  const showDescriptions = $derived(layout !== "grid");
  const compactOnMobile = $derived(layout === "responsive");
  // New selections use one Reflection component plus an explicit axis.
  // FLIPPED remains a serialized compatibility alias, not a second button.
  const visibleComponents = [
    ...LOOP_COMPONENTS.filter(
      (info) =>
        info.component !== LOOPComponent.FLIPPED &&
        info.component !== LOOPComponent.MIRRORED
    ),
    ...LOOP_COMPONENTS.filter(
      (info) => info.component === LOOPComponent.MIRRORED
    ),
  ];
  function isComponentExpanded(component: LOOPComponent): boolean {
    return (
      selectedComponents.has(component) &&
      !!componentConfigurators[component] &&
      (expandedComponents?.has(component) ?? true)
    );
  }
  const hasExpandedRotation = $derived(
    isComponentExpanded(LOOPComponent.ROTATED)
  );
  const hasExpandedInversion = $derived(
    isComponentExpanded(LOOPComponent.INVERTED)
  );
  const hasExpandedReflection = $derived(
    isComponentExpanded(LOOPComponent.MIRRORED)
  );
  const expandedCount = $derived(
    Number(hasExpandedRotation) +
      Number(hasExpandedInversion) +
      Number(hasExpandedReflection)
  );
</script>

<div
  class="loop-component-grid"
  class:list={layout !== "grid"}
  class:responsive={layout === "responsive"}
  class:with-descriptions={showDescriptions}
  class:has-expanded-rotation={hasExpandedRotation}
  class:has-expanded-inversion={hasExpandedInversion}
  class:has-expanded-reflection={hasExpandedReflection}
  data-expanded-count={expandedCount}
>
  {#each visibleComponents as componentInfo}
    {@const configurator = componentConfigurators[componentInfo.component]}
    <LOOPComponentButton
      {componentInfo}
      {isMultiSelectMode}
      {compactOnMobile}
      isSelected={selectedComponents.has(componentInfo.component)}
      isDisabled={disabledComponents?.has(componentInfo.component) ?? false}
      disabledReason={disabledReasons[componentInfo.component]}
      isLocked={lockedComponents?.has(componentInfo.component) ?? false}
      showDescription={showDescriptions}
      isExpanded={isComponentExpanded(componentInfo.component)}
      expandedContent={configurator}
      expandedContentId={configurator
        ? `${componentInfo.component.toLowerCase()}-options`
        : undefined}
      showConfigureAction={configurableComponents?.has(
        componentInfo.component
      ) ?? false}
      onConfigure={() => onConfigureComponent?.(componentInfo.component)}
      onClick={() => onToggleComponent(componentInfo.component)}
    />
  {/each}
</div>

<style>
  .loop-component-grid {
    --loop-expansion-duration: var(--duration-dramatic);
    --loop-expansion-easing: var(--ease-out);

    display: grid;
    width: 100%;
    margin: 0 auto;
    gap: 8px;
    flex-shrink: 0;
    overflow-anchor: none;
    /* Three columns keep the five compact choices above the drawer footer. */
    grid-template-columns: repeat(3, 1fr);
    grid-auto-rows: minmax(64px, auto);
  }

  /* A configured transformation owns a full compact row. Interactive controls
     never get squeezed into one third of a phone-width grid. */
  .loop-component-grid:not(.list) :global(.loop-component-shell.expanded) {
    grid-column: 1 / -1;
  }

  /* List layout: single vertical column. Rows stretch to fill a tall panel
     (desktop). Matching five-track definitions let the browser animate the
     owner row open while gently compressing its siblings. Minimum expanded
     heights guarantee that controls can never be clipped on shorter screens;
     the grid container scrolls when those minimums exceed its viewport. */
  .loop-component-grid.list {
    grid-template-columns: 1fr;
    grid-auto-rows: minmax(64px, 1fr);
    grid-template-rows:
      minmax(64px, 1fr)
      minmax(64px, 1fr)
      minmax(64px, 1fr)
      minmax(64px, 1fr)
      minmax(64px, 1fr);
    height: 100%;
    transition: grid-template-rows var(--loop-expansion-duration)
      var(--loop-expansion-easing);
  }

  /* Only the desktop list owns five explicit row tracks. Letting these rules
     leak into the phone's three-column grid made compact cards inherit the
     250–320px desktop expansion heights. */
  @media (min-width: 769px) {
    .loop-component-grid.list.has-expanded-rotation {
      grid-template-rows:
        minmax(210px, 1fr)
        minmax(64px, 1fr)
        minmax(64px, 1fr)
        minmax(64px, 1fr)
        minmax(64px, 1fr);
    }

    .loop-component-grid.list.has-expanded-inversion {
      grid-template-rows:
        minmax(64px, 1fr)
        minmax(64px, 1fr)
        minmax(320px, 1fr)
        minmax(64px, 1fr)
        minmax(64px, 1fr);
    }

    .loop-component-grid.list.has-expanded-reflection {
      grid-template-rows:
        minmax(64px, 1fr)
        minmax(64px, 1fr)
        minmax(64px, 1fr)
        minmax(64px, 1fr)
        minmax(300px, 1fr);
    }

    .loop-component-grid.list.has-expanded-inversion.has-expanded-reflection {
      grid-template-rows:
        minmax(64px, 1fr)
        minmax(64px, 1fr)
        minmax(320px, 1fr)
        minmax(64px, 1fr)
        minmax(300px, 1fr);
    }

    .loop-component-grid.list.has-expanded-rotation.has-expanded-inversion {
      grid-template-rows:
        minmax(250px, 1fr)
        minmax(64px, 1fr)
        minmax(320px, 1fr)
        minmax(64px, 1fr)
        minmax(64px, 1fr);
    }

    .loop-component-grid.list.has-expanded-rotation.has-expanded-reflection {
      grid-template-rows:
        minmax(250px, 1fr)
        minmax(64px, 1fr)
        minmax(64px, 1fr)
        minmax(64px, 1fr)
        minmax(300px, 1fr);
    }

    .loop-component-grid.list.has-expanded-rotation.has-expanded-inversion.has-expanded-reflection {
      grid-template-rows:
        minmax(250px, 1fr)
        minmax(64px, 1fr)
        minmax(320px, 1fr)
        minmax(64px, 1fr)
        minmax(300px, 1fr);
    }
  }

  /* The LOOP drawer keeps the descriptive list on desktop. A phone uses the
     existing compact 3 x 2 presentation so every choice stays above the
     footer, including on the 667px-tall iPhone SE viewport. */
  @media (max-width: 768px) {
    .loop-component-grid.responsive {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      grid-template-rows: none;
      grid-auto-rows: minmax(64px, auto);
      height: auto;
    }

    .loop-component-grid.responsive :global(.loop-component-shell.expanded) {
      grid-column: 1 / -1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .loop-component-grid.list {
      transition: none;
    }
  }
</style>
