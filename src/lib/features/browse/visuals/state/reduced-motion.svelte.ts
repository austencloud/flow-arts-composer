import { MediaQuery } from "svelte/reactivity";
import { reducedMotion } from "#lib/shared/transitions/motion.js";

/**
 * Whether the person asked for less motion, as a reactive value: the system
 * preference, or the app's own motion setting (read when this is read).
 */
export function createReducedMotion(): { readonly value: boolean } {
  const query = new MediaQuery("prefers-reduced-motion: reduce");
  return {
    get value() {
      return query.current || reducedMotion();
    },
  };
}
