<!--
  EffectQuickSwitch - the effect button at the end of a small player's
  scrubber row, and the picker it opens.

  The button names the effect that is on. The picker changes it in place,
  without leaving the player: tap a look and the animation behind it switches
  while the picker stays open for the next comparison. Its close button,
  Escape, the effect button, or a tap anywhere else closes it.

  The picker composes EffectSelector (the tiles, their selection and prewarm)
  and EffectPresetThumbnail (the same pictures as the Effects panel, from
  effectCatalogLooks). effect-quick-picker-fit decides where it goes: beside
  the player where its bounds have room (two across, scrolling, where that
  room is narrow), otherwise as one scrolling row floating under the player's
  controls or docked along the bottom of its bounds. The row fades, and with a
  mouse offers an arrow, at whichever end has more effects past it.
-->
<script lang="ts">
  import { Popover } from "bits-ui";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import Crossfade from "#lib/shared/components/Crossfade.svelte";
  import {
    flyFade,
    popIn,
    reducedMotion,
  } from "#lib/shared/transitions/motion.js";
  import {
    scrollEdges,
    type ScrollEdges,
  } from "#lib/shared/ui/scroll-edges.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import {
    isEffectId,
    type EffectsConfigState,
  } from "#lib/shared/effects/state/effects-config-state.svelte.js";
  import {
    fitEffectQuickPicker,
    pictureTileHeight,
    QUICK_PICKER_EDGE,
    QUICK_PICKER_OFFSET,
    QUICK_PICKER_STRIP_EDGE_CLEAR,
    QUICK_PICKER_STRIP_GAP,
    stripPageTarget,
    type EffectQuickPickerFit,
  } from "#lib/shared/animation-engine/domain/effect-quick-picker-fit.js";
  import EffectSelector from "./EffectSelector.svelte";
  import EffectPresetThumbnail from "./EffectPresetThumbnail.svelte";
  import {
    EFFECTS,
    EFFECT_COLORS,
    EFFECT_LABELS,
    effectNavIcon,
  } from "./effect-registry";
  import { effectUiLabel } from "./effect-ui-label";
  import { effectCatalogLooks } from "./effect-catalog-looks";
  import { effectInk } from "./effect-ink";
  import { getThemeMode } from "#lib/shared/theme/state/theme-mode-state.svelte.js";

  interface Props {
    effectsConfigState: EffectsConfigState;
    /** The player the picker changes. The picker sits beside it, and a tap on
     *  it while the picker is open only closes the picker. */
    player: HTMLElement | null | undefined;
    /** The area the picker stays inside, such as the app's content area, so
     *  it may cover a panel beside the player but never the app's own
     *  navigation. The viewport when absent. */
    bounds?: HTMLElement | null;
    /** Reads the height under the player's controls the picker may cover:
     *  empty space down to the next control, or a band it covers whole. */
    roomBelow?: () => number;
    /** Reports where the open picker sits, or null once it closes, so the
     *  player can fade what the floating row covers under its controls. */
    onArrange?: (
      arrangement: "side" | "below" | "dock" | "above" | null
    ) => void;
  }

  const {
    effectsConfigState,
    player,
    bounds = null,
    roomBelow,
    onArrange,
  }: Props = $props();

  let open = $state(false);
  let fit = $state<EffectQuickPickerFit | null>(null);
  let triggerEl = $state<HTMLElement | null>(null);
  let contentEl = $state<HTMLElement | null>(null);
  let scrollerEl = $state<HTMLElement | null>(null);
  /** The player's distance from each side of the bounds, so a docked strip
   *  lines its tiles up under the player. */
  let dockInset = $state({ left: 0, right: 0 });
  /** Which ends of the row have effects scrolled past them. */
  let edges = $state<ScrollEdges>({ start: false, end: false });

  const activeEffect = $derived(effectsConfigState.activeEffect);
  const effectOn = $derived(activeEffect !== "none");
  const activeInk = $derived.by(() => {
    const color = effectOn ? EFFECT_COLORS[activeEffect] : undefined;
    return color ? effectInk(color, getThemeMode()) : undefined;
  });
  const activeName = $derived(
    effectOn
      ? effectUiLabel(EFFECT_LABELS[activeEffect] ?? activeEffect)
      : t("effect_deep_effects")
  );
  const offLabel = $derived(
    effectOn
      ? t("effect_deep_turn_off", { effect: activeName })
      : t("effect_deep_effects_off")
  );
  /** Every name the button can show, stacked unseen in one cell so the
   *  button keeps the widest one's width and the scrubber beside it never
   *  moves when the effect changes. */
  const nameChoices = $derived([
    t("effect_deep_effects"),
    ...EFFECTS.map((effect) => effectUiLabel(effect.label)),
  ]);

  const looks = $derived(
    open && fit?.catalog ? effectCatalogLooks(effectsConfigState) : null
  );
  /** The scrubber row the strip rests on. */
  const row = $derived(
    triggerEl?.closest<HTMLElement>("[data-progress-row]") ?? null
  );

  function boundsRect(): DOMRect {
    return (
      bounds?.getBoundingClientRect() ??
      new DOMRect(0, 0, window.innerWidth, window.innerHeight)
    );
  }

  /** The bottom edge of the bounds, which a docked strip stands on. */
  const boundsFloor = {
    getBoundingClientRect() {
      const area = boundsRect();
      return new DOMRect(area.left, area.bottom, area.width, 0);
    },
  };

  function measure() {
    if (!player) return;
    const area = boundsRect();
    const box = player.getBoundingClientRect();
    dockInset = { left: box.left - area.left, right: area.right - box.right };
    fit = fitEffectQuickPicker({
      bounds: area,
      player: box,
      roomBelow: roomBelow?.() ?? 0,
      count: EFFECTS.length,
    });
  }

  // Re-place the picker when the player or anything around it resizes while
  // it is open: Play grows the player as it starts and folds the settings
  // away, which moves the player without resizing it, and a picker opened
  // then would keep the arrangement it had at the start.
  $effect(() => {
    if (!open || !player) return;
    const observer = new ResizeObserver(() => measure());
    for (let node: Element | null = player; node; node = node.parentElement) {
      observer.observe(node);
      if (node === bounds) break;
    }
    return () => observer.disconnect();
  });

  function select(effectId: string) {
    if (effectId === activeEffect) {
      // EffectSelector names the selected tile "Click to disable".
      effectsConfigState.setActiveEffect("none");
      return;
    }
    if (isEffectId(effectId)) effectsConfigState.setActiveEffect(effectId);
  }

  function turnOff() {
    effectsConfigState.setActiveEffect("none");
  }

  $effect(() => {
    onArrange?.(
      open && fit ? (fit.arrangement === "side" ? "side" : fit.side) : null
    );
  });

  /** Page the row so the tile cut at that end comes fully into view. */
  function scrollStrip(direction: 1 | -1) {
    if (!scrollerEl || fit?.arrangement !== "strip") return;
    scrollerEl.scrollTo({
      left: stripPageTarget({
        portrait: fit.catalog.portrait,
        scrollLeft: scrollerEl.scrollLeft,
        viewWidth: scrollerEl.clientWidth,
        scrollWidth: scrollerEl.scrollWidth,
        direction,
      }),
      behavior: reducedMotion() ? "auto" : "smooth",
    });
  }

  // Warm the effect's renderer on hover or press, before the click commits.
  function prewarm(effectId: string) {
    if (isEffectId(effectId)) effectsConfigState.requestPrewarm(effectId);
  }

  /** Bring the selected effect into the middle of the strip, or of a narrow
   *  side panel's scrolling grid. */
  function centerSelected() {
    const tile = scrollerEl?.querySelector<HTMLElement>(
      '[role="radio"][aria-checked="true"]'
    );
    if (!scrollerEl || !tile) return;
    const view = scrollerEl.getBoundingClientRect();
    const box = tile.getBoundingClientRect();
    scrollerEl.scrollLeft +=
      box.left - view.left - (view.width - box.width) / 2;
    scrollerEl.scrollTop += box.top - view.top - (view.height - box.height) / 2;
  }

  // Focus the effect that is on (or Off), not the first control, so arrow
  // and Tab navigation start from what is showing.
  function focusSelected(event: Event) {
    event.preventDefault();
    centerSelected();
    // The first open sizes the panel a frame late, once the popover has
    // measured the room around it: centering against the panel's first,
    // short height scrolled the top row out of view. The panel is still
    // transparent then, so the second pass never shows.
    requestAnimationFrame(centerSelected);
    const target =
      contentEl?.querySelector<HTMLElement>(
        '[role="radio"][aria-checked="true"]'
      ) ?? contentEl?.querySelector<HTMLElement>("[data-quick-off]");
    target?.focus({ preventScroll: true });
  }

  // A tap on the animation closes the picker and does nothing else: without
  // this it would also pause the player (tap-to-pause) on the way out. The
  // scrubber and the player's buttons still take their press as usual.
  function closeOnPlayerTap(event: PointerEvent) {
    if (!open || event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof Element) || !player?.contains(target)) return;
    if (triggerEl?.contains(target) || contentEl?.contains(target)) return;
    if (target.closest('button, a, input, [role="slider"], [role="button"]')) {
      return;
    }
    event.stopPropagation();
    open = false;
  }

  /** A mouse wheel scrolls the strip sideways; touch and trackpads already
   *  do. */
  function wheelScrollsSideways(node: HTMLElement) {
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      if (node.scrollWidth <= node.clientWidth) return;
      event.preventDefault();
      node.scrollLeft += event.deltaY;
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return { destroy: () => node.removeEventListener("wheel", onWheel) };
  }

  /** What the picker is placed against, and on which side of it. */
  const anchor = $derived(
    fit?.arrangement !== "strip"
      ? (player ?? null)
      : fit.side === "dock"
        ? boundsFloor
        : row
  );
  const placement = $derived(
    fit?.arrangement === "side"
      ? fit.side
      : fit?.side === "below"
        ? "bottom"
        : "top"
  );
  /** It slides in from its anchor. */
  const motion = $derived(
    placement === "right"
      ? { x: -8, y: 0 }
      : placement === "left"
        ? { x: 8, y: 0 }
        : { x: 0, y: placement === "top" ? 8 : -8 }
  );
</script>

<svelte:window
  onpointerdowncapture={closeOnPlayerTap}
  onresize={() => {
    if (open) measure();
  }}
/>

{#snippet closeButton()}
  <Popover.Close>
    {#snippet child({ props })}
      <button
        {...props}
        type="button"
        class="fx-quick-close"
        aria-label={t("common_close")}
        title={t("common_close")}
      >
        <span class="fx-quick-disc">
          <i class="fas fa-times" aria-hidden="true"></i>
        </span>
      </button>
    {/snippet}
  </Popover.Close>
{/snippet}

<!-- A mouse cannot swipe: these page the row. Out of the Tab order, since Tab
     already walks the tiles and scrolls each into view. -->
{#snippet arrow(direction: 1 | -1)}
  {@const label = t(
    direction > 0 ? "effect_deep_more_effects" : "effect_deep_earlier_effects"
  )}
  <div
    class="fx-quick-arrow"
    class:start={direction < 0}
    class:end={direction > 0}
    transition:popIn
  >
    <button
      type="button"
      tabindex="-1"
      aria-label={label}
      title={label}
      onclick={() => scrollStrip(direction)}
    >
      <span class="fx-quick-disc">
        <i
          class="fas {direction > 0 ? 'fa-chevron-right' : 'fa-chevron-left'}"
          aria-hidden="true"
        ></i>
      </span>
    </button>
  </div>
{/snippet}

{#snippet portrait(effectId: string)}
  {@const look = looks?.get(effectId)}
  {#if look}
    <EffectPresetThumbnail
      effectType={effectId}
      preset={look.preset}
      legacyModel={look.model}
    />
  {/if}
{/snippet}

<Popover.Root
  bind:open
  onOpenChange={(next) => {
    if (next) measure();
  }}
>
  <Popover.Trigger bind:ref={triggerEl}>
    {#snippet child({ props })}
      <button
        {...props}
        type="button"
        class="fx-quick-trigger"
        class:open
        class:on={effectOn}
        style:--effect-color={activeInk}
        title={t("effect_deep_select_effect")}
      >
        <span class="sr-only">{t("effect_deep_select_effect")}</span>
        <span class="fx-quick-face">
          {#each nameChoices as name, index (index)}
            <span class="fx-quick-ghost" aria-hidden="true">
              <i class="fas fa-fw {effectNavIcon('none')}"></i>
              <span class="fx-quick-name">{name}</span>
            </span>
          {/each}
          <Crossfade key={activeEffect} duration={DURATION.fast}>
            <span class="fx-quick-current">
              <i
                class="fas fa-fw fx-quick-icon {effectNavIcon(activeEffect)}"
                aria-hidden="true"
              ></i>
              <span class="fx-quick-name">{activeName}</span>
            </span>
          </Crossfade>
        </span>
      </button>
    {/snippet}
  </Popover.Trigger>

  <Popover.Portal>
    <Popover.Content
      bind:ref={contentEl}
      forceMount
      customAnchor={anchor}
      side={placement}
      align={fit?.arrangement === "side" ? "end" : "center"}
      sideOffset={fit?.arrangement === "side"
        ? QUICK_PICKER_OFFSET
        : fit?.side === "below"
          ? QUICK_PICKER_STRIP_GAP
          : 0}
      collisionBoundary={bounds ?? undefined}
      collisionPadding={QUICK_PICKER_EDGE}
      avoidCollisions={fit?.arrangement === "side"}
      onOpenAutoFocus={focusSelected}
    >
      {#snippet child({ open: shown, wrapperProps, props })}
        <!-- bits-ui copies the content's z-index onto this wrapper's inline
             style; the directive overrides it so the picker paints above the
             workspace. -->
        <div {...wrapperProps} style:z-index="var(--z-dropdown, 1000)">
          {#if shown && fit}
            <div
              {...props}
              class="fx-quick-panel"
              class:side={fit.arrangement === "side"}
              class:strip={fit.arrangement === "strip"}
              class:above={fit.arrangement === "strip" && fit.side === "above"}
              class:below={fit.arrangement === "strip" && fit.side === "below"}
              class:dock={fit.arrangement === "strip" && fit.side === "dock"}
              role="dialog"
              aria-label={t("effect_deep_effects")}
              style:width={fit.arrangement === "side"
                ? `${fit.width}px`
                : "var(--bits-popover-anchor-width)"}
              style:height={fit.arrangement === "side" && fit.height
                ? `${fit.height}px`
                : undefined}
              style:min-height={fit.arrangement === "strip"
                ? `${fit.height}px`
                : undefined}
              style:--dock-left={fit.arrangement === "strip" &&
              fit.side === "dock"
                ? `${dockInset.left}px`
                : undefined}
              style:--dock-right={fit.arrangement === "strip" &&
              fit.side === "dock"
                ? `${dockInset.right}px`
                : undefined}
              in:flyFade={{ ...motion, duration: DURATION.normal }}
              out:flyFade={{ ...motion, duration: DURATION.fast }}
            >
              {#if fit.arrangement === "side"}
                <div class="fx-quick-head">
                  <span class="fx-quick-title">{t("effect_deep_effects")}</span>
                  <div class="fx-quick-head-end">
                    <!-- A narrow panel has no room for "Turn off Bubbles":
                         it shows Off, or only the glyph where narrower still,
                         and keeps the full name for assistive technology. -->
                    <button
                      type="button"
                      class="fx-quick-off"
                      class:active={!effectOn}
                      aria-pressed={!effectOn}
                      aria-label={fit.height ? offLabel : undefined}
                      data-quick-off
                      onclick={turnOff}
                    >
                      <i class="fas fa-power-off" aria-hidden="true"></i>
                      <span>{fit.height ? t("effect_deep_off") : offLabel}</span
                      >
                    </button>
                    {@render closeButton()}
                  </div>
                </div>
                <div
                  class="fx-quick-grid"
                  class:scrolls={fit.height !== null}
                  bind:this={scrollerEl}
                >
                  <EffectSelector
                    {activeEffect}
                    onSelect={select}
                    onPrewarm={prewarm}
                    catalog={fit.catalog}
                    {portrait}
                  />
                </div>
              {:else}
                {@const tileHeight = pictureTileHeight(fit.catalog.portrait)}
                <button
                  type="button"
                  class="fx-quick-off-tile"
                  class:active={!effectOn}
                  aria-pressed={!effectOn}
                  aria-label={offLabel}
                  data-quick-off
                  style:height="{tileHeight}px"
                  onclick={turnOff}
                >
                  <i class="fas fa-power-off" aria-hidden="true"></i>
                  <span>{t("effect_deep_off")}</span>
                </button>
                <div class="fx-quick-scroll">
                  <div
                    class="fx-quick-scroller"
                    class:fade-start={edges.start}
                    class:fade-end={edges.end}
                    style:scroll-padding-inline="{QUICK_PICKER_STRIP_EDGE_CLEAR}px"
                    bind:this={scrollerEl}
                    use:wheelScrollsSideways
                    use:scrollEdges={(next) => (edges = next)}
                  >
                    <div
                      class="fx-quick-track"
                      style:width="{fit.trackWidth}px"
                    >
                      <EffectSelector
                        {activeEffect}
                        onSelect={select}
                        onPrewarm={prewarm}
                        catalog={fit.catalog}
                        {portrait}
                      />
                    </div>
                  </div>
                  {#if edges.start}{@render arrow(-1)}{/if}
                  {#if edges.end}{@render arrow(1)}{/if}
                </div>
                {@render closeButton()}
              {/if}
            </div>
          {/if}
        </div>
      {/snippet}
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>

<style>
  /* ── The button ── */
  /* A chip with a value, beside the playback toggle in the scrubber row: a
     32px pill inside the toggle's 44px target, set in from the row's end
     about as far as from its top and bottom, so it never runs into the
     player's rounded corner. A resting tint makes it read as pressable
     before hover. */
  .fx-quick-trigger {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    padding: 0 6px 0 2px;
    border: 0;
    background: none;
    color: var(--theme-text, #fff);
    font: inherit;
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: opacity var(--duration-fast) ease-out;
  }
  .fx-quick-trigger:active {
    opacity: 0.6;
  }
  .fx-quick-trigger:focus-visible {
    outline: none;
  }
  .fx-quick-trigger:focus-visible .fx-quick-face {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .fx-quick-face {
    box-sizing: border-box;
    display: grid;
    align-items: center;
    justify-items: start;
    height: 32px;
    padding: 0 12px 0 10px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--theme-text, #fff) 8%, transparent);
    transition: background var(--duration-fast) ease-out;
  }
  @media (hover: hover) and (pointer: fine) {
    .fx-quick-trigger:hover .fx-quick-face {
      background: color-mix(in srgb, var(--theme-text, #fff) 14%, transparent);
    }
  }
  /* Open: the whole pill takes the effect's color, the way the selected tile
     in the picker does. */
  .fx-quick-trigger.open .fx-quick-face {
    background: color-mix(
      in srgb,
      var(--effect-color, var(--theme-text, #fff)) 18%,
      transparent
    );
  }
  .fx-quick-face > :global(*) {
    grid-area: 1 / 1;
  }
  .fx-quick-ghost {
    visibility: hidden;
  }
  .fx-quick-ghost,
  .fx-quick-current {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    white-space: nowrap;
  }
  .fx-quick-icon {
    color: var(--effect-color, var(--theme-text-dim, currentColor));
  }
  .fx-quick-trigger :global(.fa-fw) {
    width: 1.25em;
  }

  /* A narrow player (a short landscape phone's) keeps the scrubber long
     enough to drag: the button shrinks to its icon, and its name stays the
     accessible name. */
  @container (max-width: 279px) {
    .fx-quick-trigger {
      padding: 0;
    }
    .fx-quick-face {
      width: 32px;
      padding: 0;
      justify-items: center;
    }
    .fx-quick-name {
      display: none;
    }
    .fx-quick-ghost,
    .fx-quick-current {
      gap: 0;
    }
  }

  /* ── The picker ── */
  .fx-quick-panel {
    box-sizing: border-box;
    /* The panel is translucent in the dark theme. Over a moving animation one
       coat lets the effect show through the tiles, so it takes two, as the
       compact transport's popover does. Matte: no blur. */
    background:
      linear-gradient(var(--theme-panel-bg), var(--theme-panel-bg)),
      var(--theme-panel-bg);
    color: var(--theme-text, #fff);
    overscroll-behavior: contain;
  }

  .fx-quick-panel.side {
    container: fx-quick-side / inline-size;
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: var(
      --bits-popover-content-available-height,
      calc(100dvh - 24px)
    );
    overflow-y: auto;
    padding: 12px;
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.14));
    border-radius: 14px;
    box-shadow: var(--theme-panel-shadow, 0 12px 28px rgba(0, 0, 0, 0.35));
  }

  .fx-quick-head {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: var(--min-touch-target, 44px);
  }

  .fx-quick-title {
    padding-inline-start: 4px;
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }

  .fx-quick-head-end {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    /* The close button's 44px target pads its 32px disc: reach into the
       panel's padding so the disc's edge lines up with the tiles'. */
    margin-inline-end: -6px;
  }

  /* The Effects panel's Off button (EffectsPanel .sb-off-btn). */
  .fx-quick-off {
    min-height: var(--min-touch-target, 44px);
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 0 12px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.75));
    font: inherit;
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    cursor: pointer;
    transition:
      color var(--duration-fast) ease-out,
      border-color var(--duration-fast) ease-out,
      background var(--duration-fast) ease-out;
  }
  .fx-quick-off span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* The narrowest side panel keeps the title and the close button whole:
     Off shows only its glyph. */
  @container fx-quick-side (max-width: 209px) {
    .fx-quick-off {
      justify-content: center;
      min-width: var(--min-touch-target, 44px);
      padding: 0;
    }
    .fx-quick-off span {
      display: none;
    }
  }

  /* ── Close and arrow buttons: a 32px disc in a 44px target ── */
  .fx-quick-close,
  .fx-quick-arrow button {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    padding: 0;
    border: 0;
    background: none;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.75));
    font: inherit;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .fx-quick-disc {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--theme-text, #fff) 10%, transparent);
    font-size: var(--font-size-min, 14px);
    transition:
      background var(--duration-fast) ease-out,
      color var(--duration-fast) ease-out;
  }
  @media (hover: hover) and (pointer: fine) {
    .fx-quick-close:hover,
    .fx-quick-arrow button:hover {
      color: var(--theme-text, #fff);
    }
    .fx-quick-close:hover .fx-quick-disc {
      background: color-mix(in srgb, var(--theme-text, #fff) 20%, transparent);
    }
  }
  .fx-quick-close:active .fx-quick-disc,
  .fx-quick-arrow button:active .fx-quick-disc {
    opacity: 0.6;
  }
  .fx-quick-close:focus-visible,
  .fx-quick-arrow button:focus-visible {
    outline: none;
  }
  .fx-quick-close:focus-visible .fx-quick-disc,
  .fx-quick-arrow button:focus-visible .fx-quick-disc {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  /* A narrow panel is the player's height and only its tiles scroll, under
     the title row. The padding keeps a tile's focus ring inside the scroll
     box, which would otherwise clip it. */
  .fx-quick-grid.scrolls {
    flex: 1 1 0;
    min-height: 0;
    margin: -4px;
    padding: 4px;
    overflow-y: auto;
    overscroll-behavior-y: contain;
    scrollbar-width: thin;
  }

  /* ── Strip: one row resting on the scrubber ── */
  .fx-quick-panel.strip {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px;
  }
  /* A tray floating just under the controls, drawn like the side panel. */
  .fx-quick-panel.strip.below {
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.14));
    border-radius: 14px;
    box-shadow: var(--theme-panel-shadow, 0 12px 28px rgba(0, 0, 0, 0.35));
  }
  .fx-quick-panel.strip.above {
    border-top: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.14));
    border-radius: 12px 12px 0 0;
  }
  /* A sheet across the bounds, its tiles lined up under the player. */
  .fx-quick-panel.strip.dock {
    padding-inline: calc(var(--dock-left) + 8px) calc(var(--dock-right) + 8px);
    border-top: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.14));
    border-radius: 16px 16px 0 0;
  }

  .fx-quick-scroll {
    position: relative;
    flex: 1 1 0;
    min-width: 0;
    display: flex;
  }
  .fx-quick-scroller {
    flex: 1 1 0;
    min-width: 0;
    overflow-x: auto;
    overflow-y: hidden;
    scroll-snap-type: x proximity;
    scrollbar-width: none;
    overscroll-behavior-x: contain;
  }
  .fx-quick-scroller::-webkit-scrollbar {
    display: none;
  }
  /* Only an end with effects past it fades, so a tile fully in view stays
     crisp and the cut tile there reads as more to come, not as broken. */
  .fx-quick-scroller.fade-end {
    mask-image: linear-gradient(to right, #000 calc(100% - 28px), transparent);
  }
  .fx-quick-scroller.fade-start {
    mask-image: linear-gradient(to right, transparent, #000 28px);
  }
  .fx-quick-scroller.fade-start.fade-end {
    mask-image: linear-gradient(
      to right,
      transparent,
      #000 28px,
      #000 calc(100% - 28px),
      transparent
    );
  }
  .fx-quick-track {
    position: relative;
  }

  /* Over the faded end, centred on the tiles. Touch swipes the row, so only
     a mouse gets them. */
  .fx-quick-arrow {
    position: absolute;
    top: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    pointer-events: none;
  }
  .fx-quick-arrow.start {
    left: -6px;
  }
  .fx-quick-arrow.end {
    right: -6px;
  }
  .fx-quick-arrow button {
    pointer-events: auto;
    color: var(--theme-text, #fff);
  }
  .fx-quick-arrow .fx-quick-disc {
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.14));
    background:
      linear-gradient(var(--theme-panel-bg), var(--theme-panel-bg)),
      var(--theme-panel-bg);
    box-shadow: var(--theme-panel-shadow, 0 2px 8px rgba(0, 0, 0, 0.35));
  }
  @media not ((hover: hover) and (pointer: fine)) {
    .fx-quick-arrow {
      display: none;
    }
  }
  .fx-quick-track :global(.effect-btn) {
    scroll-snap-align: start;
  }

  /* The leading Off tile: a tile of the row's height with the power glyph
     where the picture would be. */
  .fx-quick-off-tile {
    flex: none;
    box-sizing: border-box;
    width: 64px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 8px 4px;
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.75));
    font: inherit;
    font-size: var(--font-size-compact, 12px);
    line-height: 1;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition:
      color var(--duration-fast) ease-out,
      border-color var(--duration-fast) ease-out,
      background var(--duration-fast) ease-out;
  }
  .fx-quick-off-tile i {
    font-size: 16px;
  }

  @media (hover: hover) and (pointer: fine) {
    .fx-quick-off:hover,
    .fx-quick-off-tile:hover {
      color: var(--theme-text, #fff);
      border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    }
  }

  /* Off is on: the whole control fills, like a selected tile. */
  .fx-quick-off.active,
  .fx-quick-off-tile.active {
    color: var(--theme-text, #fff);
    border-color: var(--theme-text-dim, rgba(255, 255, 255, 0.75));
    background: color-mix(in srgb, var(--theme-text, #fff) 12%, transparent);
  }

  .fx-quick-off:focus-visible,
  .fx-quick-off-tile:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .fx-quick-trigger,
    .fx-quick-face,
    .fx-quick-disc,
    .fx-quick-off,
    .fx-quick-off-tile {
      transition: none;
    }
  }
</style>
