<!--
  CardStepZoom.svelte

  The enlarged step on a focused Card. A tapped step grows out of its cell to
  a readable size over a dimmed card. A swipe or the arrows walk to the next
  or previous step, and any other tap, Escape or the phone's Back puts it back
  into its cell. The card underneath does not move.

  The picture is the card's own live pictograph drawn larger, so it stays
  sharp. Pointer and click listeners are native and stop at this surface: the
  dialog sits inside the card's DOM, and a press here must never reach the
  card's long-press menu or a pane gesture behind it.
-->
<script lang="ts">
  import { flushSync, tick, untrack } from "svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import BaseModal from "#lib/shared/foundation/ui/modal/BaseModal.svelte";
  import type { ChoreoCardCell } from "#lib/shared/choreo-card/services/choreo-card-render-engine.js";
  import type { ViewerControlValue } from "../domain/viewer-control-analytics";
  import {
    EASE_OUT,
    EASE_STANDARD,
    motionDuration,
    releaseSettle,
  } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import LiveCardPictograph from "./LiveCardPictograph.svelte";
  import {
    START_INDEX,
    SWIPE_SLOP_PX,
    boxOnScreen,
    edgeResistance,
    liftTransform,
    neighborStep,
    swipeStep,
  } from "./card-step-zoom";

  type CloseWay = "tap" | "button" | "back";
  type BrowseWay = "swipe" | "arrow" | "key";

  let {
    cells,
    order,
    step,
    darkMode,
    showStepNumbers,
    findCell,
    onAction,
    onClosed,
  }: {
    cells: readonly ChoreoCardCell[];
    /** Steps in card order; -1 is the start position. */
    order: readonly number[];
    /** The step that was tapped. */
    step: number;
    darkMode: boolean;
    showStepNumbers: boolean;
    /** The card cell a step lifts out of and lands back in. */
    findCell: (index: number) => HTMLElement | null;
    onAction?: (
      action: string,
      properties: Record<string, ViewerControlValue>
    ) => void;
    /** The dialog has left the screen; the host can unmount this. */
    onClosed: () => void;
  } = $props();

  const titleId = `card-step-zoom-${Math.random().toString(36).slice(2, 8)}`;
  const SLOT_GAP_PX = 24;

  let current = $state(untrack(() => step));
  let open = $state(true);
  let phase = $state<"lifting" | "open" | "sliding" | "landing">("lifting");

  let surface = $state<HTMLElement | null>(null);
  let scrim = $state<HTMLElement | null>(null);
  let stage = $state<HTMLElement | null>(null);
  let track = $state<HTMLElement | null>(null);
  let chrome = $state<HTMLElement | null>(null);
  let closeButton = $state<HTMLElement | null>(null);

  const prev = $derived(neighborStep(order, current, -1));
  const next = $derived(neighborStep(order, current, 1));
  const stepCount = $derived(order.filter((index) => index >= 0).length);
  const title = $derived(
    current === START_INDEX
      ? t("viewer_ui_start")
      : t("shared_controls_step_progress", {
          current: current + 1,
          total: stepCount,
        })
  );

  // The neighbours stay drawn beside the stage, so a swipe reveals a picture
  // that is already there instead of one that starts loading mid-gesture.
  const slots = $derived(
    [
      { index: prev, role: -1 },
      { index: current, role: 0 },
      { index: next, role: 1 },
    ].flatMap(({ index, role }) => {
      if (index === null) return [];
      const cell = cells.find((item) => item.index === index);
      return cell ? [{ cell, role }] : [];
    })
  );

  // What the close event reports about this visit.
  const openedAt = performance.now();
  const viewed = new Set<number>([untrack(() => step)]);
  const browsed: Record<BrowseWay, number> = { swipe: 0, arrow: 0, key: 0 };

  function stepNumber(index: number): number {
    return index === START_INDEX ? 0 : index + 1;
  }

  function liveFor(cell: ChoreoCardCell) {
    // The card's own cell reports settling to the card; this copy must not,
    // and it redraws in place rather than gliding from a card identity.
    return cell.live
      ? { ...cell.live, transitionKey: null, onSettled: () => {} }
      : null;
  }

  function currentPicture(): HTMLElement | null {
    return (
      track?.querySelector<HTMLElement>('[data-zoom-role="0"] .picture') ?? null
    );
  }

  // The card cell under the enlarged step is hidden, so the step reads as
  // lifted out of the card rather than copied over it.
  let liftedCell: HTMLElement | null = null;
  function liftCell(index: number | null): void {
    liftedCell?.removeAttribute("data-zoom-lifted");
    liftedCell = index === null ? null : findCell(index);
    liftedCell?.setAttribute("data-zoom-lifted", "");
  }

  // Only animations started here are ever finished early: the pictograph
  // runs its own (a loading ring spins forever), and finishing an endless
  // animation throws.
  const running = new Set<Animation>();
  function own(animation: Animation): Animation {
    running.add(animation);
    const drop = () => running.delete(animation);
    animation.finished.then(drop, drop);
    return animation;
  }

  function fade(
    elements: (HTMLElement | null)[],
    from: number,
    to: number,
    duration: number,
    easing = EASE_STANDARD
  ): void {
    if (duration === 0) return;
    for (const element of elements) {
      // Forwards holds the closing fade until the dialog leaves.
      element?.animate([{ opacity: from }, { opacity: to }], {
        duration,
        easing,
        fill: to === 0 ? "forwards" : "none",
      });
    }
  }

  // The picture may still be preparing its drawing when the dialog opens.
  // Growing a spinner out of the cell would look broken, so the lift waits
  // for the drawing, briefly.
  async function pictureReady(): Promise<void> {
    for (let frame = 0; frame < 12; frame += 1) {
      const picture = currentPicture();
      const image = picture?.querySelector("img");
      if (
        picture?.querySelector(".live-pictograph") ||
        (image && image.complete)
      )
        return;
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }

  async function handleOpened(): Promise<void> {
    await tick();
    await pictureReady();
    if (!open || phase !== "lifting") return;
    const duration = motionDuration(DURATION.dramatic);
    const picture = currentPicture();
    const cell = findCell(current);
    liftCell(current);
    phase = "open";
    onAction?.("card_step_zoom", {
      step: stepNumber(current),
      steps: stepCount,
    });
    if (!picture || duration === 0) return;
    fade([scrim], 0, 1, duration);
    fade([chrome, closeButton], 0, 1, duration, EASE_OUT);
    const from = cell?.getBoundingClientRect();
    if (!from || !boxOnScreen(from, innerWidth, innerHeight)) {
      own(
        picture.animate(
          [
            { opacity: 0, transform: "scale(0.9)" },
            { opacity: 1, transform: "none" },
          ],
          { duration, easing: EASE_OUT }
        )
      );
      return;
    }
    const lift = picture.animate(
      [
        {
          transformOrigin: "0 0",
          transform: liftTransform(from, picture.getBoundingClientRect()),
        },
        { transformOrigin: "0 0", transform: "none" },
      ],
      { duration, easing: EASE_OUT }
    );
    own(lift);
  }

  function close(way: CloseWay): void {
    if (phase === "landing") return;
    finishRunning();
    phase = "landing";
    onAction?.("card_step_zoom_close", {
      step: stepNumber(current),
      steps: stepCount,
      steps_viewed: viewed.size,
      swipes: browsed.swipe,
      arrows: browsed.arrow,
      keys: browsed.key,
      closed_by: way,
      open_ms: Math.round(performance.now() - openedAt),
    });
    const duration = motionDuration(DURATION.emphasis);
    const picture = currentPicture();
    const cell = findCell(current);
    const done = () => {
      liftCell(null);
      open = false;
    };
    if (!picture || duration === 0) {
      done();
      return;
    }
    fade([scrim], 1, 0, duration);
    fade([chrome, closeButton], 1, 0, duration);
    const to = cell?.getBoundingClientRect();
    const landing =
      to && boxOnScreen(to, innerWidth, innerHeight)
        ? picture.animate(
            [
              { transformOrigin: "0 0", transform: "none" },
              {
                transformOrigin: "0 0",
                transform: liftTransform(to, picture.getBoundingClientRect()),
              },
            ],
            { duration, easing: EASE_STANDARD, fill: "forwards" }
          )
        : picture.animate(
            [
              { opacity: 1, transform: "none" },
              { opacity: 0, transform: "scale(0.9)" },
            ],
            { duration, easing: EASE_STANDARD, fill: "forwards" }
          );
    landing.finished.then(done, done);
  }

  // ===== Stepping =====

  // A slide that is cut short (a second arrow tap, a close) lands at once,
  // so whatever comes next measures the picture in its resting place.
  let pendingLand: (() => void) | null = null;

  function finishRunning(): void {
    const land = pendingLand;
    pendingLand = null;
    land?.();
    for (const animation of [...running]) animation.finish();
    running.clear();
  }

  function slotStride(): number {
    return (stage?.clientWidth ?? 0) + SLOT_GAP_PX;
  }

  function setTrackOffset(px: number): void {
    if (track) track.style.transform = px ? `translateX(${px}px)` : "";
  }

  /** Slides the track from `fromPx` to the neighbour in `delta`'s direction. */
  function go(
    delta: -1 | 1,
    way: BrowseWay,
    fromPx = 0,
    settle?: { durationMs: number; easing: string } | null
  ): void {
    if (phase === "sliding") finishRunning();
    const target = delta === 1 ? next : prev;
    if (target === null || phase !== "open" || !track) {
      if (fromPx) settleBack(fromPx, 0);
      return;
    }
    browsed[way] += 1;
    viewed.add(target);
    const endPx = -delta * slotStride();
    const duration = settle?.durationMs ?? motionDuration(DURATION.emphasis);
    let slide: Animation | null = null;
    const land = () => {
      slide?.cancel();
      flushSync(() => {
        current = target;
        phase = "open";
      });
      setTrackOffset(0);
      liftCell(current);
    };
    if (duration === 0) {
      land();
      return;
    }
    phase = "sliding";
    setTrackOffset(0);
    slide = track.animate(
      [
        { transform: `translateX(${fromPx}px)` },
        { transform: `translateX(${endPx}px)` },
      ],
      {
        duration,
        easing: settle?.easing ?? EASE_STANDARD,
        fill: "forwards",
      }
    );
    own(slide);
    pendingLand = land;
    slide.finished.then(
      () => {
        if (pendingLand !== land) return;
        pendingLand = null;
        land();
      },
      () => {}
    );
  }

  function settleBack(fromPx: number, velocity: number): void {
    const timing = releaseSettle(Math.abs(velocity), Math.abs(fromPx));
    if (!track || !timing) {
      setTrackOffset(0);
      return;
    }
    setTrackOffset(0);
    own(
      track.animate(
        [{ transform: `translateX(${fromPx}px)` }, { transform: "none" }],
        { duration: timing.durationMs, easing: timing.easing }
      )
    );
  }

  // ===== Gestures =====

  let press: {
    id: number;
    x: number;
    y: number;
    lastX: number;
    lastT: number;
    velocity: number;
    dragging: boolean;
  } | null = null;
  let swallowClick = false;

  function onPointerDown(event: PointerEvent): void {
    event.stopPropagation();
    swallowClick = false;
    if (!event.isPrimary || event.button !== 0 || phase !== "open") return;
    if ((event.target as Element).closest("button")) return;
    finishRunning();
    press = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      lastX: event.clientX,
      lastT: event.timeStamp,
      velocity: 0,
      dragging: false,
    };
  }

  function onPointerMove(event: PointerEvent): void {
    event.stopPropagation();
    if (!press || event.pointerId !== press.id) return;
    const dx = event.clientX - press.x;
    const dy = event.clientY - press.y;
    if (!press.dragging) {
      if (Math.abs(dx) < SWIPE_SLOP_PX || Math.abs(dx) < Math.abs(dy)) return;
      press.dragging = true;
      surface?.setPointerCapture(event.pointerId);
    }
    const dt = event.timeStamp - press.lastT;
    if (dt > 0) press.velocity = (event.clientX - press.lastX) / dt;
    press.lastX = event.clientX;
    press.lastT = event.timeStamp;
    const blocked = (dx > 0 && prev === null) || (dx < 0 && next === null);
    setTrackOffset(blocked ? edgeResistance(dx) : dx);
  }

  function onPointerUp(event: PointerEvent): void {
    event.stopPropagation();
    if (!press || event.pointerId !== press.id) return;
    const { dragging, velocity } = press;
    const dx = event.clientX - press.x;
    press = null;
    if (!dragging) return;
    swallowClick = true;
    const width = stage?.clientWidth ?? 0;
    const delta = swipeStep(dx, velocity, width);
    const target = delta === 1 ? next : delta === -1 ? prev : null;
    if (delta === 0 || target === null) {
      const blocked = (dx > 0 && prev === null) || (dx < 0 && next === null);
      settleBack(blocked ? edgeResistance(dx) : dx, velocity);
      return;
    }
    const remaining = slotStride() - Math.abs(dx);
    go(delta, "swipe", dx, releaseSettle(Math.abs(velocity), remaining));
  }

  function onPointerCancel(event: PointerEvent): void {
    event.stopPropagation();
    if (!press) return;
    const wasDragging = press.dragging;
    press = null;
    if (wasDragging) settleBack(0, 0);
  }

  function onClick(event: MouseEvent): void {
    event.stopPropagation();
    const action = (event.target as Element)
      .closest<HTMLElement>("[data-zoom-action]")
      ?.getAttribute("data-zoom-action");
    if (action === "prev") return go(-1, "arrow");
    if (action === "next") return go(1, "arrow");
    if (action === "close") return close("button");
    if (swallowClick) {
      swallowClick = false;
      return;
    }
    if (phase === "open") close("tap");
  }

  function onContextMenu(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
  }

  $effect(() => {
    const element = surface;
    if (!element) return;
    const listeners: [string, (event: never) => void][] = [
      ["pointerdown", onPointerDown],
      ["pointermove", onPointerMove],
      ["pointerup", onPointerUp],
      ["pointercancel", onPointerCancel],
      ["click", onClick],
      ["contextmenu", onContextMenu],
    ];
    for (const [type, listener] of listeners)
      element.addEventListener(type, listener as EventListener);
    return () => {
      for (const [type, listener] of listeners)
        element.removeEventListener(type, listener as EventListener);
    };
  });

  function onKeydown(event: KeyboardEvent): void {
    if (!open || event.defaultPrevented) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    event.stopPropagation();
    go(event.key === "ArrowRight" ? 1 : -1, "key");
  }

  $effect(() => () => liftCell(null));
</script>

<svelte:window onkeydown={onKeydown} />

<BaseModal
  {open}
  animation="morph"
  size="full"
  class="card-step-zoom"
  labelledBy={titleId}
  onopened={handleOpened}
  onclose={() => close("back")}
  onclosed={onClosed}
>
  <div
    class="zoom-surface"
    data-phase={phase}
    bind:this={surface}
  >
    <div class="zoom-scrim" bind:this={scrim} aria-hidden="true"></div>
    <div class="zoom-stage" bind:this={stage}>
      <div class="zoom-track" bind:this={track}>
        {#each slots as slot (slot.cell.index)}
          {@const live = liveFor(slot.cell)}
          {@const widthRatio = live?.options.widthMultiplier ?? 1}
          <div
            class="zoom-slot"
            data-zoom-role={slot.role}
            aria-hidden={slot.role === 0 ? undefined : "true"}
            style:--slot-role={slot.role}
            style:--slot-gap="{SLOT_GAP_PX}px"
          >
            <div
              class="picture"
              class:paper={!darkMode}
              style:--width-ratio={widthRatio}
            >
              {#if live}
                <LiveCardPictograph
                  {live}
                  {darkMode}
                  stepNumber={slot.cell.index + 1}
                  showStepNumber={showStepNumbers}
                />
              {:else if slot.cell.isLoaded}
                <img src={slot.cell.imageUrl} alt="" draggable="false" />
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </div>
    <div class="zoom-chrome" bind:this={chrome}>
      <button
        type="button"
        class="zoom-button"
        data-zoom-action="prev"
        disabled={prev === null}
        aria-label={t("viewer_ui_previous_step")}
      >
        <i class="fas fa-chevron-left" aria-hidden="true"></i>
      </button>
      <h2 id={titleId} class="zoom-title" aria-live="polite">{title}</h2>
      <button
        type="button"
        class="zoom-button"
        data-zoom-action="next"
        disabled={next === null}
        aria-label={t("viewer_ui_next_step")}
      >
        <i class="fas fa-chevron-right" aria-hidden="true"></i>
      </button>
    </div>
    <button
      type="button"
      class="zoom-button zoom-close"
      data-zoom-action="close"
      bind:this={closeButton}
      aria-label={t("common_close")}
    >
      <i class="fas fa-xmark" aria-hidden="true"></i>
    </button>
  </div>
</BaseModal>

<style>
  /* The dialog is only a frame: the scrim inside it dims the card, so the
     fade-in and fade-out follow the picture instead of snapping. */
  :global(dialog.base-modal.card-step-zoom[data-size="full"]) {
    width: 100%;
    height: 100%;
    max-width: none;
    max-height: none;
    margin: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    overflow: hidden;
  }

  :global(dialog.base-modal.card-step-zoom::backdrop) {
    background: transparent;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  :global(dialog.card-step-zoom > .modal-content-wrapper > .modal-body) {
    position: relative;
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  /* The card cell the step was lifted out of. Hidden, not removed, so the
     card keeps its shape. */
  :global([data-zoom-lifted]) {
    visibility: hidden;
  }

  .zoom-surface {
    --zoom-control: var(--min-touch-target);
    position: relative;
    flex: 1;
    display: grid;
    grid-template-rows: var(--zoom-control) minmax(0, 1fr) var(--zoom-control);
    gap: 12px;
    padding: max(12px, var(--safe-top)) 0
      max(16px, env(safe-area-inset-bottom));
    color: #fff;
    touch-action: none;
    overscroll-behavior: contain;
    user-select: none;
    -webkit-user-select: none;
  }

  @media (pointer: coarse) and (max-width: 600px),
    (pointer: coarse) and (max-height: 600px) {
    .zoom-surface {
      --zoom-control: var(--alt-touch-target);
    }
  }

  .zoom-scrim {
    position: absolute;
    inset: 0;
    background: var(--modal-backdrop-bg);
  }

  .zoom-surface[data-phase="lifting"] .zoom-scrim,
  .zoom-surface[data-phase="lifting"] .zoom-chrome,
  .zoom-surface[data-phase="lifting"] .zoom-close,
  .zoom-surface[data-phase="lifting"] .zoom-stage {
    opacity: 0;
  }

  /* Unclipped, so a step lifting out of a cell near the top or bottom of the
     card is whole from its first frame. The neighbours sit a full width to
     either side, outside the dialog, which clips them. */
  .zoom-stage {
    position: relative;
    grid-row: 2;
    min-height: 0;
  }

  .zoom-track {
    position: absolute;
    inset: 0;
    will-change: transform;
  }

  .zoom-slot {
    position: absolute;
    inset: 0;
    translate: calc(var(--slot-role) * (100% + var(--slot-gap))) 0;
    display: grid;
    place-items: center;
    padding: 0 16px;
    container-type: size;
  }

  /* The picture keeps the cell's shape (a two-beat step is twice as wide)
     and takes the largest size that fits. */
  .picture {
    width: min(100cqw, 100cqh * var(--width-ratio));
    aspect-ratio: var(--width-ratio) / 1;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.45);
    background: var(--theme-panel-bg, #12121c);
  }

  .picture.paper {
    background: #fff;
  }

  .picture img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .zoom-chrome {
    position: relative;
    grid-row: 3;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 0 16px;
  }

  .zoom-title {
    margin: 0;
    min-width: 0;
    font-size: var(--font-size-base, 1rem);
    font-weight: 600;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .zoom-button {
    display: grid;
    place-items: center;
    flex: none;
    width: var(--zoom-control);
    height: var(--zoom-control);
    padding: 0;
    border: 1px solid rgba(255, 255, 255, 0.22);
    border-radius: 999px;
    background: rgba(18, 18, 28, 0.72);
    color: #fff;
    font-size: var(--font-size-base, 1rem);
    cursor: pointer;
    transition:
      background-color var(--duration-fast) var(--ease-out),
      opacity var(--duration-fast) var(--ease-out);
  }

  .zoom-button:hover:not(:disabled) {
    background: rgba(48, 48, 64, 0.9);
  }

  .zoom-button:focus-visible {
    outline: 2px solid #fff;
    outline-offset: 2px;
  }

  .zoom-button:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .zoom-close {
    position: absolute;
    top: max(12px, var(--safe-top));
    right: 16px;
  }
</style>
