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

/*
 * Phone (upright) arrangements of the step editor's top zone.
 *
 * The picture is what the person needs to see, so the top zone takes the
 * arrangement that gives it the biggest square, less half of any empty space
 * (under the picture or in the column beside it) past the band allowance.
 * The choice is a size, not a state: it
 * changes only when the drawer is resized, so it does not animate.
 *
 * All sizes are CSS px. Controls are the 36px phone size (layout law).
 *
 * A step:
 *   tall   - header 44 over the picture over Duration 44 (6px x 8px around
 *            the picture): min(width - 16, height - 100). A title or red
 *            scope line too long for one line wraps (two lines at most) and
 *            the header grows by tallHeaderExtra, which the picture gives.
 *   side   - picture at the left, title, actions and the five-across Duration
 *            in a column about 202 wide beside it (6px padding and gap):
 *            min(height - 12, width - 220).
 *   column - picture at the left, the column beside it holds the title, the
 *            actions and Duration as fine pair over coarse pair (84 tall,
 *            about 144 wide), 4px padding: min(height - 8, width - 14 -
 *            column). The column needs 76 + 4 + 84 = 164 of height.
 *   below  - picture at the left of the title and actions, Duration as the
 *            full-width "DURATION << - 1x + >>" row under both:
 *            min(height - 56, width - 14 - 150).
 * The start:
 *   side   - board in a full-height column at the left (its prompt line,
 *            23, above it), title, hand picker and the stacked Location and
 *            Orientation fields beside it (208 tall, 186 wide):
 *            min(width - 198, height - 35).
 *   stack  - title, hand picker and Done in one row (42), the prompt and the
 *            board, then Location beside Orientation in one card (66):
 *            min(width - 8, height - 147). Under 340px of inner width the two
 *            fields stack and the card grows by 62.
 */

export type PhoneStepForm = "tall" | "side" | "column" | "below";
export type PhoneStartForm = "side" | "stack";

export interface PhoneFormChoice<F extends string> {
  form: F;
  /** The picture (or board) square, px. */
  board: number;
  /** The empty height left beside the square in its own column, px. */
  band: number;
}

/** The tallest empty band the editor may leave under the picture. */
export const EMPTY_BAND_LIMIT = 16;

/** The band allowed beside a square: 16, or an eighth of a big square. */
export function bandAllowance(board: number): number {
  return Math.max(EMPTY_BAND_LIMIT, Math.round(board * 0.125));
}

/** Width of the title column when Duration is not in it. */
const TITLE_COLUMN_WIDTH = 150;
/** Width of Duration as fine pair over coarse pair in its card. */
const STACKED_DURATION_WIDTH = 152;
/** Height the column form needs: header 76, gap 4, Duration 84. */
const COLUMN_FORM_HEIGHT = 164;
/** Height the start's side column needs: header, picker, two fields. */
const START_SIDE_HEIGHT = 208;
/** Inner width that fits Location beside Orientation in one card. */
const START_TWO_UP_WIDTH = 340;

/** Height of the title and action rows beside the picture. */
const HEADER_HEIGHT = 76;

/*
 * Each form scores its picture less half of any empty space past the band
 * allowance. A strict filter chose badly both ways: at 375 x 667 with the
 * beta chip it gave up a 185 picture (band 18) for a 155 one, and at 360 x 689
 * it kept a 183 picture with an empty block beside it over a 194 one.
 */
function score(c: PhoneFormChoice<string>): number {
  return c.board - Math.max(0, c.band - bandAllowance(c.board)) / 2;
}

function pick<F extends string>(
  candidates: PhoneFormChoice<F>[]
): PhoneFormChoice<F> {
  return [...candidates].sort(
    (a, b) => score(b) - score(a) || b.board - a.board
  )[0]!;
}

function square(availableHeight: number, availableWidth: number) {
  const board = Math.max(
    0,
    Math.floor(Math.min(availableHeight, availableWidth))
  );
  return { board, band: Math.max(0, Math.floor(availableHeight) - board) };
}

/**
 * @param actionsWidth the header's widest line: the action row (Delete,
 *   Done, and the beta swap or admin inspect when shown) or the title or the
 *   red scope line, whichever is wider in the current language, so the column
 *   form never cuts it or squeezes it onto a second line it has no height for.
 * @param tallHeaderExtra how much taller than 44 the tall form's header is in
 *   the current language, once its title and red line wrap
 *   (tallHeaderExtraHeight). The tall picture gives that height, so its
 *   score stays honest and another form wins where it is now bigger.
 */
export function choosePhoneStepForm(
  width: number,
  height: number,
  actionsWidth: number,
  tallHeaderExtra = 0
): PhoneFormChoice<PhoneStepForm> {
  const candidates: PhoneFormChoice<PhoneStepForm>[] = [
    { form: "tall", ...square(height - 100 - tallHeaderExtra, width - 16) },
    { form: "side", ...square(height - 12, width - 220) },
  ];
  // Below: the title column beside the picture holds only the header, so the
  // rest of its height is empty too.
  const below = square(height - 56, width - 14 - TITLE_COLUMN_WIDTH);
  candidates.push({
    form: "below",
    board: below.board,
    band: Math.max(below.band, below.board - HEADER_HEIGHT),
  });
  if (height - 8 >= COLUMN_FORM_HEIGHT) {
    // Column: whatever the header and Duration leave of the column is empty.
    const column = square(
      height - 8,
      width - 14 - Math.max(STACKED_DURATION_WIDTH, actionsWidth)
    );
    candidates.push({
      form: "column",
      board: column.board,
      band: Math.max(column.band, height - 8 - COLUMN_FORM_HEIGHT),
    });
  }
  return pick(candidates);
}

/**
 * How much taller than its 44px row the tall form's header gets when the
 * title and the red scope line wrap in `textRoom` px (the header less its
 * 12px padding each side, the 6px gap and the action row). Each wraps to two
 * lines at most; the row has 4px of padding top and bottom and 2px between
 * the lines. A language whose words fit on one line gets 0.
 */
export function tallHeaderExtraHeight(params: {
  textRoom: number;
  titleWidth: number;
  titleLine: number;
  scopeWidth: number;
  scopeLine: number;
}): number {
  const { textRoom, titleWidth, titleLine, scopeWidth, scopeLine } = params;
  if (textRoom <= 0) return 0;
  const lines = (w: number) => (w > textRoom + 0.5 ? 2 : 1);
  const content =
    4 +
    lines(titleWidth) * titleLine +
    (scopeWidth > 0 ? 2 + lines(scopeWidth) * scopeLine : 0) +
    4;
  const oneLine = 4 + titleLine + (scopeWidth > 0 ? 2 + scopeLine : 0) + 4;
  return Math.max(0, Math.ceil(content) - Math.max(44, Math.ceil(oneLine)));
}

/** The start keeps whichever arrangement gives the bigger board. */
export function choosePhoneStartForm(
  width: number,
  height: number
): PhoneFormChoice<PhoneStartForm> & { twoUp: boolean } {
  const twoUp = width - 8 >= START_TWO_UP_WIDTH;
  const stack = {
    form: "stack" as const,
    ...square(height - 147 - (twoUp ? 0 : 62), width - 8),
  };
  if (height - 12 < START_SIDE_HEIGHT) return { ...stack, twoUp };
  const side = { form: "side" as const, ...square(height - 35, width - 198) };
  return { ...(side.board > stack.board ? side : stack), twoUp };
}
