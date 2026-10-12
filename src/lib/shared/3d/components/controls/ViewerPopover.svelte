<script lang="ts">
  import { Popover } from "bits-ui";
  import {
    getViewer3DContext,
    type PopoverId,
  } from "../../context/viewer-3d-context";
  import {
    flyFade,
    opaqueFade,
    popIn,
  } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import type { Snippet } from "svelte";
  import {
    reportViewerControlChange,
    type ViewerControlSink,
  } from "#lib/shared/sequence-viewer/domain/viewer-control-analytics.js";

  interface Props {
    id: PopoverId;
    title: string;
    accentColor?: string;
    width?: number;
    icon: string;
    tooltip: string;
    performerScoped?: boolean;
    hasOverride?: boolean;
    children: Snippet;
    footer?: Snippet;
    onSettingChange?: ViewerControlSink;
  }

  let {
    id,
    title,
    accentColor,
    width = 420,
    icon,
    tooltip,
    performerScoped = false,
    hasOverride = false,
    children,
    footer,
    onSettingChange,
  }: Props = $props();

  const viewer = getViewer3DContext();

  let popoverOpen = $state(false);

  $effect(() => {
    popoverOpen = viewer.activePopover === id;
  });

  function handleOpenChange(next: boolean) {
    const previous = viewer.activePopover === id;
    if (next) {
      viewer.openPopover(id);
    } else {
      viewer.closePopover();
    }
    reportViewerControlChange(
      onSettingChange,
      "viewer_3d_rail",
      `${id}_open`,
      previous,
      next,
      { count: next }
    );
  }
</script>

<Popover.Root bind:open={popoverOpen} onOpenChange={handleOpenChange}>
  <Popover.Trigger>
    {#snippet child({ props })}
      <button
        {...props}
        class="rail-chip"
        class:performer-scoped={performerScoped}
        aria-label={tooltip}
        data-tooltip={tooltip}
        style:--chip-tint={accentColor}
      >
        <i class="fas {icon}"></i>
        {#if hasOverride && accentColor}
          <span class="override-dot" style:background={accentColor}></span>
        {/if}
      </button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content
    side="left"
    sideOffset={10}
    align="start"
    avoidCollisions={true}
    collisionPadding={12}
    sticky="always"
    forceMount
  >
    {#snippet child({ open, wrapperProps, props })}
      <div {...wrapperProps} style:z-index={30}>
        {#if open}
          <div
            {...props}
            class="viewer-popover-panel"
            style:--popover-width="{width}px"
            in:popIn={{
              duration: DURATION.normal,
              start: 0.92,
            }}
            out:popIn={{
              duration: DURATION.fast,
              start: 0.95,
            }}
          >
            <header
              class="pop-header"
              in:flyFade={{ y: -6, duration: DURATION.fast, delay: 40 }}
              out:opaqueFade={{ duration: DURATION.instant }}
            >
              <span class="pop-title">{title}</span>
              {#if accentColor}
                <span class="pop-badge" style:background={accentColor}></span>
              {/if}
            </header>
            <div
              class="pop-body"
              in:flyFade={{ y: 6, duration: DURATION.fast, delay: 100 }}
              out:opaqueFade={{ duration: DURATION.instant }}
            >
              {@render children()}
            </div>
            {#if footer}
              <div
                class="pop-footer"
                in:flyFade={{ y: 6, duration: DURATION.fast, delay: 140 }}
                out:opaqueFade={{ duration: DURATION.instant }}
              >
                {@render footer()}
              </div>
            {/if}
          </div>
        {/if}
      </div>
    {/snippet}
  </Popover.Content>
</Popover.Root>

<style>
  .viewer-popover-panel {
    display: flex;
    /* The panel opens to the left of the 56px scene rail. Reserving the rail,
       its 12px edge gap, the 10px popover gap, and collision breathing room
       keeps the entire control surface visible even on a 375px phone. */
    width: min(var(--popover-width, 420px), calc(100vw - 104px));
    max-height: calc(100dvh - 24px);
    flex-direction: column;
    border-radius: 18px;
    background: #0c0e16;
    border: 1px solid rgba(255, 255, 255, 0.12);
    box-shadow: 0 12px 48px rgba(0, 0, 0, 0.7);
    overflow: hidden;
  }
  .pop-header {
    padding: 14px 16px 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .pop-title {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.55);
  }
  .pop-badge {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .pop-body {
    min-height: 0;
    padding: 12px 14px 14px;
    overflow-y: auto;
  }
  .pop-footer {
    padding: 10px 14px 14px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  }
  .rail-chip {
    width: 56px;
    height: 56px;
    background: rgba(20, 22, 32, 0.78);
    backdrop-filter: blur(20px) saturate(140%);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 14px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    color: rgba(255, 255, 255, 0.62);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    transition:
      background var(--duration-fast) var(--ease-spring),
      border-color var(--duration-fast) var(--ease-spring),
      color var(--duration-fast) var(--ease-spring),
      transform var(--duration-fast) var(--ease-spring),
      box-shadow var(--duration-fast) var(--ease-spring),
      right var(--duration-fast) var(--ease-spring),
      top var(--duration-fast) var(--ease-spring),
      padding var(--duration-fast) var(--ease-spring);
  }
  .rail-chip:hover {
    transform: scale(1.08);
    border-color: rgba(255, 255, 255, 0.22);
  }
  .rail-chip:hover::after {
    content: attr(data-tooltip);
    position: absolute;
    right: calc(100% + 10px);
    top: 50%;
    background: rgba(0, 0, 0, 0.88);
    color: white;
    padding: 6px 10px;
    border-radius: 8px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    white-space: nowrap;
    pointer-events: none;
    animation: tooltip-in var(--duration-fast) var(--ease-spring)
      var(--duration-fast) both;
  }
  @keyframes tooltip-in {
    from {
      opacity: 0;
      transform: translateY(-50%) translateX(4px) scale(0.94);
    }
    to {
      opacity: 1;
      transform: translateY(-50%) translateX(0) scale(1);
    }
  }
  .rail-chip[aria-pressed="true"] {
    background: color-mix(
      in srgb,
      var(--theme-accent, #4a9eff) 18%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #4a9eff) 50%,
      transparent
    );
    color: color-mix(in srgb, var(--theme-accent, #4a9eff) 60%, #ffffff);
    box-shadow: 0 4px 20px
      color-mix(in srgb, var(--theme-accent, #4a9eff) 25%, transparent);
    animation: chip-glow 2.4s ease-in-out infinite;
  }
  @keyframes chip-glow {
    0%,
    100% {
      box-shadow: 0 4px 20px
        color-mix(in srgb, var(--theme-accent, #4a9eff) 25%, transparent);
    }
    50% {
      box-shadow: 0 4px 28px
        color-mix(in srgb, var(--theme-accent, #4a9eff) 40%, transparent);
    }
  }
  .rail-chip.performer-scoped i {
    color: var(--chip-tint, rgba(255, 255, 255, 0.62));
  }
  .rail-chip.performer-scoped[aria-pressed="true"] {
    background: color-mix(in srgb, var(--chip-tint) 18%, transparent);
    border-color: color-mix(in srgb, var(--chip-tint) 50%, transparent);
    box-shadow: 0 4px 20px color-mix(in srgb, var(--chip-tint) 25%, transparent);
    animation: chip-glow-accent 2.4s ease-in-out infinite;
  }
  @keyframes chip-glow-accent {
    0%,
    100% {
      box-shadow: 0 4px 20px
        color-mix(in srgb, var(--chip-tint) 25%, transparent);
    }
    50% {
      box-shadow: 0 4px 28px
        color-mix(in srgb, var(--chip-tint) 40%, transparent);
    }
  }
  .rail-chip i {
    font-size: 22px;
  }
  .override-dot {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    pointer-events: none;
    box-shadow: 0 0 6px currentColor;
  }
</style>
