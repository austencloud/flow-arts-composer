<!--
  EffectQuickSwitch - the effect button at the end of a small player's
  scrubber row, and the picker it opens.

  The button names the effect that is on. The picker changes it in place,
  without leaving the player: tap a look and the animation behind it switches
  while the picker stays open for the next comparison. Escape, the button, or
  a tap anywhere else closes it.

  The picker composes EffectSelector (the tiles, their selection and prewarm)
  and EffectPresetThumbnail (the same pictures as the Effects panel, from
  effectCatalogLooks). effect-quick-picker-fit decides where it goes: beside
  the player where its bounds have room, otherwise as one scrolling row over
  the player's bottom edge.
-->
<script lang="ts">
  import { Popover } from "bits-ui";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import Crossfade from "#lib/shared/components/Crossfade.svelte";
  import { flyFade } from "#lib/shared/transitions/motion.js";
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
    type EffectQuickPickerFit,
    type QuickPickerRect,
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

  interface Props {
    effectsConfigState: EffectsConfigState;
    /** The player the picker changes. The picker sits beside it, and a tap on
     *  it while the picker is open only closes the picker. */
    player: HTMLElement | null | undefined;
    /** Reads the area the picker stays inside, in viewport pixels, each
     *  time it is placed: a host can let it cover a panel beside the player
     *  but not the app's sidebar or its own toolbars. The viewport when absent
     *  or null. */
    bounds?: () => QuickPickerRect | null;
  }

  const { effectsConfigState, player, bounds = null }: Props = $props();

  let open = $state(false);
  let fit = $state<EffectQuickPickerFit | null>(null);
  let area = $state<QuickPickerRect | null>(null);
  let triggerEl = $state<HTMLElement | null>(null);
  let contentEl = $state<HTMLElement | null>(null);
  let scrollerEl = $state<HTMLElement | null>(null);

  const activeEffect = $derived(effectsConfigState.activeEffect);
  const effectOn = $derived(activeEffect !== "none");
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

  function measure() {
    if (!player) return;
    area = bounds?.() ?? {
      left: 0,
      top: 0,
      width: window.innerWidth,
      height: window.innerHeight,
    };
    fit = fitEffectQuickPicker({
      bounds: area,
      player: player.getBoundingClientRect(),
      count: EFFECTS.length,
    });
  }

  // Re-place the picker when the player resizes while it is open: Play grows
  // the player as it starts, and a picker opened then would keep the
  // arrangement it had at the start.
  $effect(() => {
    if (!open || !player) return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(player);
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

  // Warm the effect's renderer on hover or press, before the click commits.
  function prewarm(effectId: string) {
    if (isEffectId(effectId)) effectsConfigState.requestPrewarm(effectId);
  }

  /** Bring the selected effect into the middle of the strip. */
  function centerSelected() {
    const tile = scrollerEl?.querySelector<HTMLElement>(
      '[role="radio"][aria-checked="true"]'
    );
    if (!scrollerEl || !tile) return;
    scrollerEl.scrollLeft =
      tile.offsetLeft - (scrollerEl.clientWidth - tile.offsetWidth) / 2;
  }

  // Focus the effect that is on (or Off), not the first control, so arrow
  // and Tab navigation start from what is showing.
  function focusSelected(event: Event) {
    event.preventDefault();
    centerSelected();
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

  const motion = $derived(
    fit?.arrangement === "side"
      ? { x: fit.side === "right" ? -8 : 8, y: 0 }
      : { x: 0, y: 8 }
  );
</script>

<svelte:window
  onpointerdowncapture={closeOnPlayerTap}
  onresize={() => {
    if (open) measure();
  }}
/>

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
        style:--effect-color={effectOn
          ? EFFECT_COLORS[activeEffect]
          : undefined}
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
      customAnchor={fit?.arrangement === "strip" ? row : (player ?? null)}
      side={fit?.arrangement === "side" ? fit.side : "top"}
      align={fit?.arrangement === "side" ? "end" : "center"}
      sideOffset={fit?.arrangement === "side" ? QUICK_PICKER_OFFSET : 0}
      collisionBoundary={area
        ? { x: area.left, y: area.top, width: area.width, height: area.height }
        : undefined}
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
              role="dialog"
              aria-label={t("effect_deep_effects")}
              style:width={fit.arrangement === "side"
                ? `${fit.width}px`
                : "var(--bits-popover-anchor-width)"}
              in:flyFade={{ ...motion, duration: DURATION.normal }}
              out:flyFade={{ ...motion, duration: DURATION.fast }}
            >
              {#if fit.arrangement === "side"}
                <div class="fx-quick-head">
                  <span class="fx-quick-title">{t("effect_deep_effects")}</span>
                  <button
                    type="button"
                    class="fx-quick-off"
                    class:active={!effectOn}
                    aria-pressed={!effectOn}
                    data-quick-off
                    onclick={turnOff}
                  >
                    <i class="fas fa-power-off" aria-hidden="true"></i>
                    <span>{offLabel}</span>
                  </button>
                </div>
                <EffectSelector
                  {activeEffect}
                  onSelect={select}
                  onPrewarm={prewarm}
                  catalog={fit.catalog}
                  {portrait}
                />
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
                <div
                  class="fx-quick-scroller"
                  bind:this={scrollerEl}
                  use:wheelScrollsSideways
                >
                  <div class="fx-quick-track" style:width="{fit.trackWidth}px">
                    <EffectSelector
                      {activeEffect}
                      onSelect={select}
                      onPrewarm={prewarm}
                      catalog={fit.catalog}
                      {portrait}
                    />
                  </div>
                </div>
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
  /* A chip with a value, beside the playback toggle in the scrubber row: the
     same 44px height, glyph size and hover/press feedback as the toggle, plus
     a resting tint so it reads as pressable before hover. */
  .fx-quick-trigger {
    flex: none;
    display: inline-flex;
    align-items: center;
    min-width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    padding: 0 14px 0 12px;
    border: 0;
    border-radius: 999px;
    background: color-mix(in srgb, var(--theme-text, #fff) 8%, transparent);
    color: var(--theme-text, #fff);
    font: inherit;
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition:
      background var(--duration-fast) ease-out,
      opacity var(--duration-fast) ease-out;
  }
  @media (hover: hover) and (pointer: fine) {
    .fx-quick-trigger:hover {
      background: color-mix(in srgb, var(--theme-text, #fff) 14%, transparent);
    }
  }
  .fx-quick-trigger:active {
    opacity: 0.6;
  }
  .fx-quick-trigger:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: -2px;
  }
  /* Open: the whole chip takes the effect's color, the way the selected tile
     in the picker does. */
  .fx-quick-trigger.open {
    background: color-mix(
      in srgb,
      var(--effect-color, var(--theme-text, #fff)) 18%,
      transparent
    );
  }

  .fx-quick-face {
    display: grid;
    align-items: center;
    justify-items: start;
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
      justify-content: center;
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

  /* The Effects panel's Off button (EffectsPanel .sb-off-btn). */
  .fx-quick-off {
    min-height: var(--min-touch-target, 44px);
    min-width: 0;
    max-width: 70%;
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

  /* ── Strip: one row resting on the scrubber ── */
  .fx-quick-panel.strip {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px;
    border-top: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.14));
    border-radius: 12px 12px 0 0;
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
  .fx-quick-track {
    position: relative;
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
    .fx-quick-off,
    .fx-quick-off-tile {
      transition: none;
    }
  }
</style>
