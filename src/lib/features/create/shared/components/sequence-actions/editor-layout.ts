/**
 * Step editor composition thresholds.
 *
 * The editor recomposes by the width of the drawer it lives in, not by the
 * viewport: a tablet sheet and a desktop side panel can both be wide enough
 * for two hand cards, and a landscape phone's side panel can be too narrow.
 * Both the persistent controls zone and the top panel measure themselves and
 * compare against the same numbers so they agree on one layout.
 */

/** Below this drawer width one hand card shows at a time behind a picker. */
export const NARROW_EDITOR_WIDTH = 480;

/** Hand cards stop growing past this so wide drawers show two compact cards. */
export const MAX_HAND_CARD_WIDTH = 320;

/** A top panel this short (landscape phone) puts the preview beside its controls. */
export const SHORT_EDITOR_HEIGHT = 520;
