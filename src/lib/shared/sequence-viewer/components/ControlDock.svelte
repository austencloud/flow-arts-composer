<!--
  ControlDock.svelte

  Shared bottom control-dock shell, extracted from MandalaControlDock so the
  mandala viewer and the Download Animation panel present one identical chrome:

  - a single .cat-bar row of equal-width tab buttons + a compact trailing
    action (the download/export trigger),
  - an inline tray that slides up above the bar with the active tab's controls,
  - responsive: full-width sheet on phones, centered floating rounded bar at
    >=700px (matching the mandala dock),
  - icon-only tabs when the bar is too narrow for labels; the row scrolls
    before any tab can shrink below the shared touch-target floor.

  The shell owns NO domain state. Consumers pass their tabs, the active tab,
  a tray Snippet that renders the active tab's body, and the trailing action.
-->
<script lang="ts" module>
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import type { FanAppearance } from "$lib/shared/pictograph/prop/domain/fan-appearance";

  export interface ControlDockTab {
    id: string;
    label: string;
    /** FontAwesome class, e.g. "fa-wand-magic-sparkles". Omit to use a color dot. */
    icon?: string;
    /** Live prop artwork for the Props destination. Takes precedence over icon. */
    propType?: PropType;
    fanAppearance?: FanAppearance;
    /** Tints the active state (and the solo dot when there's no icon). */
    accentColor?: string;
    /** Two-color dot pair instead of an icon (mandala "Colors" tab). */
    dots?: [string, string];
    /**
     * The tab's destination is open somewhere other than the tray (a host
     * picker, an overlay). The pill shows pressed without opening a tray.
     */
    pressed?: boolean;
  }

  export interface ControlDockAction {
    icon: string;
    label: string;
    onClick: () => void;
    disabled?: boolean;
    /** Show a spinner instead of the icon (e.g. preparing export). */
    busy?: boolean;
    /** Accent-filled emphasis (primary CTA, e.g. scan-landing "Remix"). */
    accent?: boolean;
    /** Marks a trailing action whose own tray is currently open. */
    active?: boolean;
  }

  export interface ControlDockLink {
    icon?: string;
    label: string;
    href: string;
    /** Accent-filled emphasis (primary CTA). */
    accent?: boolean;
  }

  /**
   * Live count of open dock trays across every ControlDock instance. Viewer
   * chrome (e.g. the mode bottom bar) reads this to get out of the way while
   * the user is editing in a tray.
   */
  export const dockTrayState = $state({ openCount: 0 });
</script>

<script lang="ts">
  import { untrack } from "svelte";
  import { slide, fly, fade } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import type { Snippet } from "svelte";
  import { SwipeToDismiss } from "$lib/shared/foundation/ui/drawer/swipe-to-dismiss";
  import RailPropGlyph from "$lib/shared/components/RailPropGlyph.svelte";

  interface Props {
    tabs: ControlDockTab[];
    /** Currently open tab id, or null for a collapsed bar (no tray). */
    activeTab: string | null;
    onTabSelect: (id: string) => void;
    /** Renders the active tab's controls. Only shown while activeTab is set. */
    tray?: Snippet;
    /** Compact trailing trigger (download / record). */
    trailingAction?: ControlDockAction;
    /** Optional secondary trailing slot(s): links (e.g. scan-landing
     *  "Open Flow Arts Composer") and/or action buttons (e.g. choreo-card "Print"),
     *  rendered in order before the trailing trigger. */
    secondaryActions?: (ControlDockLink | ControlDockAction)[];
    /** Reports the dock's measured height so the stage can reserve room. */
    onHeightChange?: (px: number) => void;
    /** Bar width (px) below which tab labels hide and tabs go icon-only. */
    labelMinWidth?: number;
    /**
     * Overlay mode: the dock floats over a stage (absolute, bottom-anchored,
     * and a centered floating bar >=700px) — the mandala model. Default false:
     * the dock sits in normal flow and reserves its own height, for panels
     * stacked below a canvas.
     */
    overlay?: boolean;
    /**
     * CSS length capping the open tray's height. Tall docks (the animation
     * Props/Visibility/Effects tabs) pass a low value so a big tab scrolls
     * instead of crushing the media hero above the dock; short docks (card
     * export, mandala) inherit the generous default. Any valid CSS `max-height`.
     */
    trayMaxHeight?: string;
  }

  let {
    tabs,
    activeTab,
    onTabSelect,
    tray,
    trailingAction,
    secondaryActions = [],
    onHeightChange,
    labelMinWidth = 380,
    overlay = false,
    trayMaxHeight,
  }: Props = $props();

  // Reduced-motion gate for the Svelte slide transition.
  let reduceMotion = $state(false);
  $effect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reduceMotion = mq.matches;
    const onChange = () => (reduceMotion = mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  });
  const dur = (ms: number) => (reduceMotion ? 0 : ms);

  // A secondary slot entry is a link if it carries an href, else an action.
  const isLink = (
    a: ControlDockLink | ControlDockAction
  ): a is ControlDockLink => "href" in a;

  const trayOpen = $derived(!!(activeTab && tray));
  function closeTray(): void {
    if (activeTab) onTabSelect(activeTab); // every consumer toggles on re-select
  }

  // Publish tray-open to the shared counter so viewer chrome (mode bottom bar)
  // can duck out of the way while the user edits.
  $effect(() => {
    if (!trayOpen) return;
    // untrack: `++` READS openCount too — tracked, it retriggers this effect
    // forever. The counter is write-only from here.
    untrack(() => dockTrayState.openCount++);
    return () => {
      untrack(() => dockTrayState.openCount--);
    };
  });

  // Swipe-down dismiss on the tray — the shared drawer gesture primitive, with
  // the sheet following the finger. `ignoreSwipeBlock` because the dock root
  // is (deliberately) swipe-blocked against the parent viewer drawer.
  let trayEl = $state<HTMLDivElement>();
  let trayDragOffset = $state(0);
  let trayDragging = $state(false);
  $effect(() => {
    const el = trayEl;
    if (!el) return;
    const swipe = new SwipeToDismiss({
      placement: "bottom",
      dismissible: true,
      ignoreSwipeBlock: true,
      onDismiss: () => closeTray(),
      onDragChange: (offset, _progress, isDragging) => {
        trayDragging = isDragging;
        trayDragOffset = isDragging ? offset : 0;
      },
    });
    swipe.attach(el);
    return () => swipe.detach();
  });

  // The tray content swaps (tab -> tab) and grows/shrinks in place (revealing
  // options within a tab). Both used to snap the tray — and the media hero above
  // it — to the new height instantly. Measure the active content's natural
  // height off a child that is NOT the height-constrained element (no feedback
  // loop), and tween `.tray-anim` to it. First set is auto -> px (browsers don't
  // animate from auto), so the entrance slide isn't doubled; later px -> px
  // changes tween. Reset to null when the tray unmounts so the next open starts
  // clean.
  let trayMeasureEl = $state<HTMLDivElement>();
  let trayBodyH = $state<number | null>(null);
  $effect(() => {
    const el = trayMeasureEl;
    if (!el) {
      trayBodyH = null;
      return;
    }
    const ro = new ResizeObserver((entries) => {
      const e = entries[0];
      if (e) trayBodyH = Math.ceil(e.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  });

  // Touch browsers use overlay scrollbars that only fade in DURING a scroll, so
  // a capped tray gave no signal that more options exist below the fold. This
  // custom rail is visible from the moment an overflowing tray opens (the
  // affordance IS the point), synced to the native scroll. The native scrollbar
  // is hidden so there aren't two thumbs.
  let trayScrollEl = $state<HTMLDivElement>();
  let scrollFrac = $state(0); // scrollTop / scrollHeight
  let thumbFrac = $state(1); // clientHeight / scrollHeight
  $effect(() => {
    const el = trayScrollEl;
    if (!el) return;
    const update = () => {
      const sh = el.scrollHeight;
      thumbFrac = sh > 0 ? el.clientHeight / sh : 1;
      scrollFrac = sh > 0 ? el.scrollTop / sh : 0;
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    // Re-measure when the viewport resizes OR the tray content grows/shrinks
    // (the height-tweened .tray-anim child).
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  });
  // 0.99, not 0.999: sub-pixel rounding can report 1px of phantom overflow on
  // a ~200px tray — don't show a scroll rail for content that visibly fits.
  const trayScrollable = $derived(thumbFrac < 0.99);
  // Clamp: a floored thumb (12% min, so it stays grabbable-looking) would
  // otherwise poke past the track bottom at full scroll.
  const thumbPct = $derived(Math.max(thumbFrac * 100, 12));
  const thumbTopPct = $derived(Math.min(scrollFrac * 100, 100 - thumbPct));

  // Measure: own height (-> stage padding) and own width (-> label-hide).
  // Parent width drives the desktop floating layout (measuring the parent
  // avoids a feedback loop with the dock's own width changing under .wide).
  let dockEl: HTMLDivElement | undefined = $state();
  let wide = $state(false);
  let compact = $state(false);
  // Secondary CTAs (Remix / Open Flow Arts Composer) + the download trigger eat ~260px of a
  // single-row bar, starving the tab strip on phones. Below this width the bar
  // stacks: tabs own the top row, CTAs share the bottom row. Docks without
  // secondary actions (mandala) never stack.
  let stacked = $state(false);
  $effect(() => {
    if (!dockEl) return;
    const parent = dockEl.parentElement;
    const hRo = new ResizeObserver((entries) => {
      const e = entries[0];
      if (!e) return;
      onHeightChange?.(Math.ceil(e.contentRect.height));
      stacked = secondaryActions.length > 0 && e.contentRect.width < 620;
      // Stacked tabs have the full row to themselves — labels fit far narrower.
      compact = e.contentRect.width < (stacked ? 300 : labelMinWidth);
    });
    hRo.observe(dockEl);
    let wRo: ResizeObserver | undefined;
    if (parent) {
      wRo = new ResizeObserver((entries) => {
        const e = entries[0];
        if (e) wide = e.contentRect.width >= 700;
      });
      wRo.observe(parent);
    }
    return () => {
      hRo.disconnect();
      wRo?.disconnect();
    };
  });
</script>

<div
  class="dock"
  class:overlay
  class:wide={overlay && wide}
  class:compact
  style:--dock-tray-max={trayMaxHeight}
  data-swipe-block
  bind:this={dockEl}
  in:fly={{ y: 80, duration: dur(250), easing: cubicOut }}
  out:fly={{ y: 80, duration: dur(200), easing: cubicOut }}
>
  {#if activeTab && tray}
    <!-- Sheet behavior: swipe down anywhere on the tray (scroll-aware — only
         dismisses when the inner scroll sits at its top) or tap the handle.
         While dragging, the sheet follows the finger and slides in under the
         opaque tab bar below it. -->
    <div
      class="tray"
      class:tray-dragging={trayDragging}
      style:transform={trayDragOffset > 0
        ? `translateY(${trayDragOffset}px)`
        : ""}
      bind:this={trayEl}
      transition:slide={{ duration: dur(260), easing: cubicOut }}
    >
      <button
        type="button"
        class="tray-handle"
        onclick={closeTray}
        aria-label="Hide controls"
      >
        <span class="grab" aria-hidden="true"></span>
      </button>
      <div class="tray-body">
        <div class="tray-scroll" bind:this={trayScrollEl}>
          <!-- Height-animated body: .tray-measure reports the active content's
               natural height; .tray-anim tweens to it so switching tabs or
               revealing options resizes the tray (and the hero above) smoothly
               instead of snapping. Content dissolve/reveal is the consumer's job
               (Crossfade in the tray snippet). -->
          <div
            class="tray-anim"
            style:height={trayBodyH == null ? "auto" : `${trayBodyH}px`}
            style:--tray-anim-dur={`${dur(260)}ms`}
          >
            <div class="tray-measure" bind:this={trayMeasureEl}>
              {@render tray()}
            </div>
          </div>
        </div>
        {#if trayScrollable}
          <div
            class="scroll-rail"
            aria-hidden="true"
            transition:fade={{ duration: dur(150) }}
          >
            <div
              class="scroll-thumb"
              style:height={`${thumbPct}%`}
              style:top={`${thumbTopPct}%`}
            ></div>
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <div class="cat-bar" class:stacked class:tray-open={trayOpen}>
    <div class="cat-scroll">
      {#each tabs as t, i (t.id)}
        <button
          class="dock-btn cat"
          class:active={activeTab === t.id || !!t.pressed}
          class:open={activeTab === t.id && trayOpen}
          style:--cat-accent={t.accentColor ?? null}
          style:--btn-i={i}
          onclick={() => onTabSelect(t.id)}
          aria-pressed={activeTab === t.id || !!t.pressed}
          aria-expanded={activeTab === t.id && trayOpen}
          aria-label={activeTab === t.id && trayOpen
            ? `Close ${t.label}`
            : t.label}
        >
          {#if activeTab === t.id && trayOpen}
            <!-- Open: this tab has become the tray's folder tab — its glyph is a
                 collapse chevron, and re-tapping it closes the tray (restoring
                 the ducked nav). -->
            <i class="fas fa-chevron-down" aria-hidden="true"></i>
          {:else if t.propType}
            <RailPropGlyph
              propType={t.propType}
              fanAppearance={t.fanAppearance}
              size={20}
            />
          {:else if t.dots}
            <span class="cat-dots">
              <span class="dot" style:background={t.dots[0]}></span>
              <span class="dot" style:background={t.dots[1]}></span>
            </span>
          {:else if t.accentColor && !t.icon}
            <span class="cat-dots"
              ><span class="dot solo" style:background={t.accentColor}
              ></span></span
            >
          {:else}
            <i class="fas {t.icon}" aria-hidden="true"></i>
          {/if}
          <span class="cat-label">{t.label}</span>
        </button>
      {/each}
    </div>

    {#if secondaryActions.length > 0 || trailingAction}
      <div class="dock-actions">
        {#each secondaryActions as action, i (action.label)}
          {#if isLink(action)}
            <a
              class="dock-btn trailing-link"
              class:accent={action.accent}
              style:--btn-i={tabs.length + i}
              href={action.href}
              aria-label={action.label}
            >
              {#if action.icon}<i class="fas {action.icon}" aria-hidden="true"
                ></i>{/if}
              <span class="trailing-label">{action.label}</span>
            </a>
          {:else}
            <button
              class="dock-btn trailing-link"
              class:accent={action.accent}
              style:--btn-i={tabs.length + i}
              onclick={action.onClick}
              disabled={action.disabled}
              aria-label={action.label}
            >
              {#if action.busy}
                <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
              {:else if action.icon}
                <i class="fas {action.icon}" aria-hidden="true"></i>
              {/if}
              <span class="trailing-label">{action.label}</span>
            </button>
          {/if}
        {/each}

        {#if trailingAction}
          <button
            class="dock-btn download"
            class:active={trailingAction.active}
            style:--btn-i={tabs.length + secondaryActions.length}
            onclick={trailingAction.onClick}
            disabled={trailingAction.disabled}
            aria-label={trailingAction.label}
            aria-pressed={trailingAction.active ?? false}
          >
            {#if trailingAction.busy}
              <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
            {:else}
              <i class="fas {trailingAction.icon}" aria-hidden="true"></i>
            {/if}
          </button>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  /* Each button rises + fades on dock mount, staggered by --btn-i, so every
     dock (download / mandala / choreo / scan / transforms) gets a little
     entrance flourish layered over the root slide-up. */
  @keyframes dockBtnIn {
    from {
      opacity: 0;
      transform: translateY(10px) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .dock {
    display: flex;
    flex-direction: column;
    /* One glass fill shared by the tray and the merged "open" folder tab, so
       the open tab reads as a continuous surface with the panel above it. */
    --tray-fill: color-mix(
      in srgb,
      var(--theme-panel-bg, rgba(18, 18, 28, 0.96)) 92%,
      transparent
    );
    /* Clip the tray while a swipe drags it down past the tab bar. */
    overflow: hidden;
  }
  /* Overlay model (mandala): float over the stage, bottom-anchored. */
  .dock.overlay {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 5;
  }
  /* Desktop: centered floating bar instead of a full-width sheet. */
  .dock.wide {
    left: 50%;
    right: auto;
    transform: translateX(-50%);
    width: min(640px, calc(100% - 32px));
    bottom: 16px;
    border-radius: 18px;
    overflow: hidden;
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.45);
  }
  .dock.wide .cat-bar {
    border-top: none;
  }

  .tray {
    display: flex;
    flex-direction: column;
    /* Capped so a tall tab can't crush the media hero — beyond this the
       tray-scroll scrolls instead of eating the canvas. Per-dock overridable via
       the trayMaxHeight prop (--dock-tray-max): the tall animation/art docks
       pass a low value; short docks (card export, mandala) keep this default.
       Default trimmed from 58vh/440px, which let the dock swallow >55% of an
       iPhone SE. */
    max-height: var(--dock-tray-max, min(42vh, 340px));
    background: var(--tray-fill);
    backdrop-filter: blur(16px);
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    /* Snap-back after a below-threshold swipe; disabled while the finger owns it. */
    transition: transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1);
    /* Descendant rails can claim horizontal touch panning. The drawer handler
       still owns downward swipes outside those rails. */
    touch-action: auto;
  }
  .tray.tray-dragging {
    transition: none;
  }
  /* Hosts the scroller + the persistent scroll rail overlay. */
  .tray-body {
    position: relative;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  /* Content scrolls under the pinned handle. Native scrollbar hidden — the
     custom .scroll-rail is the one thumb (overlay scrollbars on touch only
     appear mid-scroll, which defeats the "there's more below" affordance). */
  .tray-scroll {
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0 14px 8px;
    scrollbar-width: none;
  }
  .tray-scroll::-webkit-scrollbar {
    display: none;
  }
  /* Always-visible scroll rail: advertises overflow from the moment the tray
     opens and tracks the scroll position. Purely indicative (pointer-events
     none) — the tray itself is the touch scroller. */
  .scroll-rail {
    position: absolute;
    top: 2px;
    bottom: 10px;
    right: 4px;
    width: 4px;
    border-radius: 2px;
    background: var(--scrollbar-track, rgba(255, 255, 255, 0.1));
    pointer-events: none;
  }
  .scroll-thumb {
    position: absolute;
    left: 0;
    right: 0;
    border-radius: 2px;
    background: var(--scrollbar-thumb, rgba(255, 255, 255, 0.4));
  }
  /* Height-tween wrapper: clips while it interpolates between content states so
     the tray resizes smoothly. --tray-anim-dur collapses to 0ms under reduced
     motion (set inline via dur()). */
  .tray-anim {
    overflow: hidden;
    transition: height var(--tray-anim-dur, 260ms)
      cubic-bezier(0.2, 0.8, 0.2, 1);
  }

  /* Full-width dismiss row pinned at the tray top: grab bar + down chevron.
     Slim, but the whole row is the hit area. */
  .tray-handle {
    width: 100%;
    /* Slim grab strip — the sheet's vertical budget belongs to the media hero,
       not chrome. Swipe-down + re-tapping the tab also dismiss, so a thin handle
       is enough (bottom-sheet convention). */
    min-height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 2px 0 3px;
    background: transparent;
    border: none;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.45));
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: color 150ms ease;
  }
  .tray-handle .grab {
    width: 40px;
    height: 4px;
    border-radius: 2px;
    background: var(--theme-stroke-strong, rgba(255, 255, 255, 0.25));
  }
  @media (hover: hover) {
    .tray-handle:hover {
      color: var(--theme-text, #fff);
    }
  }
  .cat-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    /* Trimmed 8->6: the dock bar is always on screen, so every px here is a px
       the media hero never gets back. */
    padding: 6px;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.96));
    backdrop-filter: blur(16px);
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }
  .cat-scroll {
    display: flex;
    flex: 1 1 auto;
    min-width: 0;
    gap: 4px;
    /* The viewer transition temporarily narrows this surface. Keep every tab
       pressable through that handoff and let the strip carry the overflow. */
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
  }
  .cat-scroll::-webkit-scrollbar {
    display: none;
  }

  /* Secondary CTAs + download live in one group so the bar can stack them
     onto their own row on narrow screens. */
  .dock-actions {
    display: flex;
    align-items: stretch;
    gap: 6px;
    flex: 0 0 auto;
  }

  /* Narrow + secondary CTAs: two rows — tabs on top at full width, the
     CTA group below sharing the row. No more smushed tab chips. */
  .cat-bar.stacked {
    flex-wrap: wrap;
  }
  .stacked .cat-scroll {
    flex: 1 1 100%;
  }
  .stacked .dock-actions {
    flex: 1 1 100%;
  }
  .stacked .dock-actions .dock-btn.trailing-link {
    flex: 1 1 0;
  }

  .dock-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    /* 46px: still clears the 44px touch floor and fits icon + label, but reclaims
       ~6px of always-on chrome per the hero-space goal. */
    min-height: 46px;
    border-radius: 12px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: color-mix(
      in srgb,
      var(--theme-card-bg, rgba(255, 255, 255, 0.04)) 70%,
      transparent
    );
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    cursor: pointer;
    text-decoration: none;
    -webkit-tap-highlight-color: transparent;
    transition:
      background 220ms ease,
      border-color 220ms ease,
      color 220ms ease,
      transform 150ms cubic-bezier(0.2, 0.8, 0.2, 1),
      box-shadow 220ms ease;
    animation: dockBtnIn 360ms cubic-bezier(0.2, 0.8, 0.2, 1) backwards;
    animation-delay: calc(var(--btn-i, 0) * 45ms + 90ms);
  }
  .dock-btn:active {
    transform: scale(0.92);
  }
  .dock-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
  .dock-btn i {
    font-size: 16px;
    transition: transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .dock-btn.cat {
    flex: 1 0 var(--min-touch-target, 44px);
    min-width: var(--min-touch-target, 44px);
    padding: 6px 2px;
    color: color-mix(
      in srgb,
      var(--cat-accent, var(--theme-text-dim, rgba(255, 255, 255, 0.6))) 42%,
      var(--theme-text-dim, rgba(255, 255, 255, 0.6))
    );
  }
  .dock-btn.cat.active i {
    transform: translateY(-1px) scale(1.08);
  }

  .cat-label {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.02em;
    white-space: nowrap;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* Too narrow for legible labels -> icon-only, no cramming. */
  .compact .cat-label {
    display: none;
  }

  .cat-dots {
    display: flex;
    gap: 2px;
  }
  .dot {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
  }
  .dot.solo {
    width: 16px;
    height: 16px;
  }

  .dock-btn.cat.active {
    background: color-mix(
      in srgb,
      var(--cat-accent, var(--theme-accent, #6366f1)) 35%,
      var(--theme-card-bg, rgba(0, 0, 0, 0.4))
    );
    border-color: color-mix(
      in srgb,
      var(--cat-accent, var(--theme-accent, #6366f1)) 60%,
      transparent
    );
    color: white;
    transform: translateY(-1px);
  }

  /* ── Open folder tab ──────────────────────────────────────────────────
     While its tray is open, the active tab fuses to the panel above it: the
     cat-bar's top border clears, the tab takes the tray's glass fill, squares
     its top corners, and a ::before bridge fills the cat-bar's top gap so the
     seam vanishes — the open tab hangs off the tray like a folder tab. The
     accent survives as an underline (fill now matches the tray). Its glyph is
     a chevron; re-tapping collapses the tray. Fill/border/shadow ride the
     .dock-btn transition, so the merge eases in with the tray's slide. */
  .cat-bar.tray-open {
    border-top-color: transparent;
  }
  .dock-btn.cat.open {
    position: relative;
    background: var(--tray-fill);
    border-color: var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-top-color: transparent;
    border-top-left-radius: 0;
    border-top-right-radius: 0;
    color: var(--theme-text, #fff);
    transform: none;
    box-shadow: inset 0 -2px 0
      color-mix(
        in srgb,
        var(--cat-accent, var(--theme-accent, #6366f1)) 70%,
        transparent
      );
  }
  /* Bridge across the cat-bar's top padding (6px) + border (1px) so the tab's
     fill runs continuously up into the tray bottom above it. */
  .dock-btn.cat.open::before {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    top: -7px;
    height: 8px;
    background: var(--tray-fill);
  }

  .dock-btn.download {
    flex: 0 0 auto;
    width: 46px;
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 50%,
      transparent
    );
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 25%,
      var(--theme-card-bg, rgba(0, 0, 0, 0.4))
    );
    color: white;
  }
  .dock-btn.download.active {
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 45%,
      var(--theme-card-bg, rgba(0, 0, 0, 0.4))
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 75%,
      transparent
    );
  }

  .dock-btn.trailing-link {
    flex: 0 0 auto;
    flex-direction: row;
    gap: 6px;
    padding: 0 12px;
    color: var(--theme-text, #fff);
  }
  .trailing-label {
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
  }
  .compact .dock-btn.trailing-link {
    padding: 0;
    width: 46px;
  }
  .compact .trailing-label {
    display: none;
  }

  /* Accent emphasis: the dock's primary CTA (mirrors .download's fill). */
  .dock-btn.trailing-link.accent {
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 50%,
      transparent
    );
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 25%,
      var(--theme-card-bg, rgba(0, 0, 0, 0.4))
    );
    color: white;
  }

  @media (hover: hover) {
    .dock-btn.cat:hover {
      background: color-mix(
        in srgb,
        var(--theme-card-bg, rgba(255, 255, 255, 0.04)) 88%,
        white 8%
      );
      border-color: color-mix(
        in srgb,
        var(--cat-accent, var(--theme-accent, #6366f1)) 35%,
        var(--theme-stroke, rgba(255, 255, 255, 0.12))
      );
      color: var(--theme-text, #fff);
      transform: translateY(-2px);
    }
    .dock-btn.cat.active:hover {
      background: color-mix(
        in srgb,
        var(--cat-accent, var(--theme-accent, #6366f1)) 45%,
        var(--theme-card-bg, rgba(0, 0, 0, 0.4))
      );
      transform: translateY(-2px);
    }
    /* An open folder tab stays merged on hover — no accent pop, no lift. */
    .dock-btn.cat.open:hover {
      background: var(--tray-fill);
      transform: none;
    }
    .dock-btn.cat:hover i {
      transform: translateY(-1px) scale(1.08);
    }
    .dock-btn.download:hover:not(:disabled) {
      background: color-mix(
        in srgb,
        var(--theme-accent, #6366f1) 42%,
        var(--theme-card-bg, rgba(0, 0, 0, 0.4))
      );
      border-color: color-mix(
        in srgb,
        var(--theme-accent, #6366f1) 75%,
        transparent
      );
      transform: translateY(-2px);
      box-shadow: 0 6px 18px
        color-mix(in srgb, var(--theme-accent, #6366f1) 35%, transparent);
    }
    .dock-btn.trailing-link:hover {
      background: color-mix(
        in srgb,
        var(--theme-card-bg, rgba(255, 255, 255, 0.04)) 88%,
        white 8%
      );
      transform: translateY(-2px);
    }
    .dock-btn.trailing-link.accent:hover:not(:disabled) {
      background: color-mix(
        in srgb,
        var(--theme-accent, #6366f1) 42%,
        var(--theme-card-bg, rgba(0, 0, 0, 0.4))
      );
      border-color: color-mix(
        in srgb,
        var(--theme-accent, #6366f1) 75%,
        transparent
      );
      box-shadow: 0 6px 18px
        color-mix(in srgb, var(--theme-accent, #6366f1) 35%, transparent);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .dock-btn:active {
      transform: none;
    }
    .dock-btn {
      animation: none;
    }
  }
</style>
