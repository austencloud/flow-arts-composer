/**
 * Resting a mouse or pen on a Create method card, or reaching it by
 * keyboard, asks the turn coordinator to play that card's preview (spec:
 * Turns). Touch never does: on a touch screen a tap opens the method, and a
 * tap's focus does not match :focus-visible.
 *
 * A click ends a pointer hold. A locked method opens its sign-up dialog over
 * the card, and a pointer under a modal dialog may never report leaving, so
 * waiting for pointerleave could hold the turns for as long as it is open.
 *
 *   <button use:methodPreviewHold={{ turns, id: method.id }}>
 */
import type { MethodPreviewTurns } from "#lib/features/create/shared/state/method-preview-turns.svelte.js";

export interface MethodPreviewHoldParams {
  turns: Pick<MethodPreviewTurns, "hold" | "release">;
  id: string;
}

function keyboardFocused(node: HTMLElement): boolean {
  try {
    return node.matches(":focus-visible");
  } catch {
    // An engine without :focus-visible gets pointer holds only.
    return false;
  }
}

export function methodPreviewHold(
  node: HTMLElement,
  params: MethodPreviewHoldParams
): { update(next: MethodPreviewHoldParams): void; destroy(): void } {
  let current = params;
  let pointerHeld = false;
  let focusHeld = false;

  const onPointerEnter = (event: Event): void => {
    const kind = (event as PointerEvent).pointerType;
    if (pointerHeld || (kind !== "mouse" && kind !== "pen")) return;
    pointerHeld = true;
    current.turns.hold(current.id);
  };

  const onPointerLeave = (): void => {
    if (!pointerHeld) return;
    pointerHeld = false;
    current.turns.release(current.id);
  };

  const onFocus = (): void => {
    if (focusHeld || !keyboardFocused(node)) return;
    focusHeld = true;
    current.turns.hold(current.id);
  };

  const onBlur = (): void => {
    if (!focusHeld) return;
    focusHeld = false;
    current.turns.release(current.id);
  };

  const letGo = (): void => {
    onPointerLeave();
    onBlur();
  };

  node.addEventListener("pointerenter", onPointerEnter);
  node.addEventListener("pointerleave", onPointerLeave);
  node.addEventListener("click", onPointerLeave);
  node.addEventListener("focus", onFocus);
  node.addEventListener("blur", onBlur);

  return {
    update(next) {
      if (next.id === current.id && next.turns === current.turns) return;
      letGo();
      current = next;
    },
    destroy() {
      letGo();
      node.removeEventListener("pointerenter", onPointerEnter);
      node.removeEventListener("pointerleave", onPointerLeave);
      node.removeEventListener("click", onPointerLeave);
      node.removeEventListener("focus", onFocus);
      node.removeEventListener("blur", onBlur);
    },
  };
}
