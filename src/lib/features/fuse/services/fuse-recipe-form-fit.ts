/**
 * How a hand's settings for new paths fill the room they are given.
 *
 * Every setting is one row: a name and one segmented control. The rows share
 * the panel's height, so the form leaves no empty half behind. The only
 * question is how much each row can say: its name beside the control, its name
 * and a line of explanation, or both above the control. A wide, short panel
 * (the open Fold) sets the settings side by side instead.
 */
import type { FuseRecipeGroup } from "../domain/fuse-recipe-destination";

/** How many settings each group holds. */
export const FUSE_RECIPE_GROUP_ROWS: Record<FuseRecipeGroup, number> = {
  path: 4,
  style: 3,
  start: 3,
};

/** The rows each group takes where its settings stand side by side. */
export const FUSE_RECIPE_SIDE_BY_SIDE_ROWS: Record<FuseRecipeGroup, number> = {
  path: 2,
  style: 1,
  start: 1,
};

export interface FuseRecipeFormInput {
  width: number;
  height: number;
  groups: readonly FuseRecipeGroup[];
  /** A touch screen whose short side is under 600px (layout law, Tap size). */
  phone: boolean;
}

export interface FuseRecipeFormLayout {
  /** The name sits beside its control, or above it. */
  arrangement: "beside" | "above";
  /** Each row has room for a line saying what its choice does. */
  hints: boolean;
  /** Each group has room for its name. */
  headings: boolean;
  /** Length has too many choices to sit beside its name at the tap size, so it
   *  leads the form with its name above it. */
  lengthAbove: boolean;
  /** Path's four settings stand two and two, Style's and Start's three across. */
  sideBySide: boolean;
}

/** The name column and gap of a row that has its name beside the control. */
export const FUSE_RECIPE_NAME_COLUMN = 80;
export const FUSE_RECIPE_COLUMN_GAP = 8;
/** From here a row is a name-and-hint column beside the control, the shape
 *  GenerationStylePanel takes at the same width (36rem). */
export const FUSE_RECIPE_WIDE = 576;

const LENGTH_CHOICES = 7;
const SEGMENT_GAP = 2;
const TRACK_EDGE = 8;
const ROW_GAP = 3;
/** Between two settings that stand side by side. */
const SETTING_GAP = 16;
const NAME_LINE = 22;
const HINT_LINES = 44;
/** The line between two groups, and the air around it. */
const GROUP_RULE = 13;
const HEADING = 28;

/**
 * The layout for this much room, or null when the rows do not fit it at the
 * tap size and the groups have to open one at a time.
 */
export function resolveFuseRecipeForm(
  input: FuseRecipeFormInput
): FuseRecipeFormLayout | null {
  const { width, height, groups, phone } = input;
  const rows = groups.reduce(
    (count, group) => count + FUSE_RECIPE_GROUP_ROWS[group],
    0
  );
  const segment = phone ? 36 : 44;
  const track = phone ? 42 : 52;
  const wide = width >= FUSE_RECIPE_WIDE;

  const lengthWidth =
    LENGTH_CHOICES * segment + (LENGTH_CHOICES - 1) * SEGMENT_GAP + TRACK_EDGE;
  const controlWidth = width - FUSE_RECIPE_NAME_COLUMN - FUSE_RECIPE_COLUMN_GAP;
  const lengthAbove =
    groups.includes("path") && !wide && controlWidth < lengthWidth;

  const rules = Math.max(0, groups.length - 1) * GROUP_RULE;
  const least =
    rows * track +
    (rows - groups.length) * ROW_GAP +
    rules +
    (lengthAbove ? NAME_LINE : 0);
  if (height < least) return resolveSideBySide(input, lengthWidth, track);

  const headingHeight = groups.length > 1 ? groups.length * HEADING : 0;
  const headings = headingHeight > 0 && height >= least + headingHeight;
  const rowHeight =
    (height - rules - (headings ? headingHeight : 0)) / Math.max(1, rows);

  if (rowHeight >= track + NAME_LINE + HINT_LINES) {
    return {
      arrangement: "above",
      hints: true,
      headings,
      lengthAbove: true,
      sideBySide: false,
    };
  }
  if (wide) {
    const hints = rowHeight >= NAME_LINE + HINT_LINES + 2 * ROW_GAP;
    return {
      arrangement: "beside",
      hints,
      headings,
      lengthAbove: false,
      sideBySide: false,
    };
  }
  if (rowHeight >= track + NAME_LINE + 2 * ROW_GAP) {
    return {
      arrangement: "above",
      hints: false,
      headings,
      lengthAbove: true,
      sideBySide: false,
    };
  }
  return {
    arrangement: "beside",
    hints: false,
    headings,
    lengthAbove,
    sideBySide: false,
  };
}

/** Two Length controls across is the widest row of the side by side form. */
function resolveSideBySide(
  { width, height, groups }: FuseRecipeFormInput,
  lengthWidth: number,
  track: number
): FuseRecipeFormLayout | null {
  if (width < 2 * lengthWidth + SETTING_GAP) return null;
  const rows = groups.reduce(
    (count, group) => count + FUSE_RECIPE_SIDE_BY_SIDE_ROWS[group],
    0
  );
  const least =
    rows * (track + NAME_LINE) +
    (rows - groups.length) * ROW_GAP +
    (groups.length - 1) * GROUP_RULE;
  if (height < least) return null;
  return {
    arrangement: "above",
    hints: false,
    headings: groups.length > 1 && height >= least + groups.length * HEADING,
    lengthAbove: true,
    sideBySide: true,
  };
}

/** The tab track and the gap under it. */
const TABS = 60;

/**
 * One tab per group, for a mouse or tablet panel too short for every row at
 * once. Null on a phone, which opens its groups from boxes, and where one
 * group would not fit under the tabs.
 */
export function resolveFuseRecipeTabs(
  input: FuseRecipeFormInput
): Partial<Record<FuseRecipeGroup, FuseRecipeFormLayout>> | null {
  if (input.phone) return null;
  const layouts: Partial<Record<FuseRecipeGroup, FuseRecipeFormLayout>> = {};
  for (const group of input.groups) {
    const layout = resolveFuseRecipeForm({
      ...input,
      height: input.height - TABS,
      groups: [group],
    });
    if (!layout) return null;
    layouts[group] = layout;
  }
  return layouts;
}
