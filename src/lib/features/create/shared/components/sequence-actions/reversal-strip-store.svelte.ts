//
// Module-level persistence for the Direction drawer's reversal matrix. The
// editor (`ReversalPatternView`) unmounts whenever the user navigates back to
// the Sequence Actions grid (or closes the panel), so a component-local `$state`
// loses the matrix every time. Hoisting it here lets the matrix survive across
// open/close — the user's last reversal layout is exactly what they see on
//
// The strip array encodes both the period (its length) and the per-beat values,
// so persisting it alone restores the full editor state.

import type { StripValue } from "#lib/shared/create/components/pattern-strip/pattern-strip-types.js";

let strip = $state<StripValue[][] | null>(null);

export const reversalStripStore = {
  /** The persisted matrix, or null when nothing has been seeded this session. */
  get value(): StripValue[][] | null {
    return strip;
  },
  set(next: StripValue[][]): void {
    strip = next;
  },
  /** True before the first seed — the editor seeds a default on first entry. */
  get isEmpty(): boolean {
    return strip === null;
  },
};
