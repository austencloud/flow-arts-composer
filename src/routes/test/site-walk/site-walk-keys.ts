/** The keys that ask the body for something other than walking. Each press asks once. */
import type { GestureName } from "#lib/shared/3d/locomotion/gait/gait-clips.js";

export type BodyAsk = "jump" | "crouch" | "roll" | GestureName;

const KEYS: Readonly<Record<string, BodyAsk>> = {
  Space: "jump",
  KeyC: "crouch",
  KeyQ: "roll",
  Digit1: "wave",
  Digit2: "point",
  Digit3: "clap",
  Digit4: "cheer",
  Digit5: "bow",
};

/** A key meant for something on the page, not for the body. */
const forThePage = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest("input, textarea, select, button, a, [contenteditable], [role=dialog]") !== null;

export class BodyKeys {
  private asked = new Set<BodyAsk>();

  ask(what: BodyAsk): void {
    this.asked.add(what);
  }

  /** What was asked for since the last take. */
  take(): ReadonlySet<BodyAsk> {
    if (this.asked.size === 0) return NONE;
    const taken = this.asked;
    this.asked = new Set();
    return taken;
  }

  /** Returns what stops the listening. */
  listen(on: Window): () => void {
    const press = (event: KeyboardEvent) => {
      const what = KEYS[event.code];
      if (!what || event.ctrlKey || event.metaKey || event.altKey || forThePage(event.target)) return;
      // Space would scroll the page under the view.
      event.preventDefault();
      if (!event.repeat) this.ask(what);
    };
    on.addEventListener("keydown", press);
    return () => on.removeEventListener("keydown", press);
  }
}

const NONE: ReadonlySet<BodyAsk> = new Set();
