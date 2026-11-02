/**
 * Press-and-hold repeat for step buttons such as tempo +/-.
 *
 * A tap moves one step. Holding the button repeats the step after a short
 * delay, and after a longer hold the step grows, so a big change does not
 * need a dozen taps. Keyboard activation (Enter or Space) stays one step per
 * click, as a plain button would.
 */

/** Wait before a held press starts repeating. */
export const HOLD_REPEAT_DELAY_MS = 500;
/** Time between repeats once a hold is repeating. */
export const HOLD_REPEAT_TICK_MS = 100;
/** How long a press is held before each repeat uses the larger step. */
export const HOLD_REPEAT_ACCEL_MS = 2000;

export interface HoldRepeatOptions {
  /** Applies one step; the caller supplies the direction. */
  onStep: (step: number) => void;
  /** Step for a tap, a keyboard press, and the first part of a hold. */
  step: number;
  /** Step once the hold passes `accelMs`; defaults to `step`. */
  fastStep?: number;
  delayMs?: number;
  tickMs?: number;
  accelMs?: number;
}

/**
 * Svelte action: `use:holdRepeat={{ step: 1, fastStep: 5, onStep }}`.
 *
 * The press steps on pointerdown, so the click that follows a pointer release
 * is swallowed rather than stepping a second time. A click with no pointer
 * press before it (keyboard, assistive tech) steps once.
 */
export function holdRepeat(node: HTMLElement, initial: HoldRepeatOptions) {
  let options = initial;
  let delayTimer: ReturnType<typeof setTimeout> | null = null;
  let repeatTimer: ReturnType<typeof setInterval> | null = null;
  let pressStartedAt = 0;
  let pointerPressed = false;

  const isDisabled = () => node.matches(":disabled");

  function stop() {
    if (delayTimer !== null) {
      clearTimeout(delayTimer);
      delayTimer = null;
    }
    if (repeatTimer !== null) {
      clearInterval(repeatTimer);
      repeatTimer = null;
    }
  }

  function repeat() {
    // A held minus reaching the floor disables the button, and a disabled
    // button may never see the pointerup.
    if (isDisabled()) {
      stop();
      return;
    }
    const accelMs = options.accelMs ?? HOLD_REPEAT_ACCEL_MS;
    const held = Date.now() - pressStartedAt;
    options.onStep(
      held > accelMs ? (options.fastStep ?? options.step) : options.step
    );
  }

  function handlePointerDown(event: PointerEvent) {
    if (event.button !== 0 || isDisabled()) return;
    stop();
    pointerPressed = true;
    pressStartedAt = Date.now();
    options.onStep(options.step);
    delayTimer = setTimeout(() => {
      delayTimer = null;
      repeatTimer = setInterval(repeat, options.tickMs ?? HOLD_REPEAT_TICK_MS);
    }, options.delayMs ?? HOLD_REPEAT_DELAY_MS);
  }

  function handleClick(event: MouseEvent) {
    // Keyboard clicks carry detail 0, so a stale pointer flag (a press that
    // slid off the button and never clicked) cannot swallow one.
    const fromPointer = pointerPressed && event.detail !== 0;
    pointerPressed = false;
    if (fromPointer || isDisabled()) return;
    options.onStep(options.step);
  }

  node.addEventListener("pointerdown", handlePointerDown);
  node.addEventListener("pointerup", stop);
  node.addEventListener("pointercancel", stop);
  node.addEventListener("pointerleave", stop);
  node.addEventListener("click", handleClick);

  return {
    update(next: HoldRepeatOptions) {
      options = next;
    },
    destroy() {
      stop();
      node.removeEventListener("pointerdown", handlePointerDown);
      node.removeEventListener("pointerup", stop);
      node.removeEventListener("pointercancel", stop);
      node.removeEventListener("pointerleave", stop);
      node.removeEventListener("click", handleClick);
    },
  };
}
