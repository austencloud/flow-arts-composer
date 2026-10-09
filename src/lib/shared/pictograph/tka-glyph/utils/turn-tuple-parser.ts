/**
 * Turn Tuple Parser
 *
 * The parser and turn-number sizing live in @tka/render-core so the MCP
 * renderers draw the turns column from the same rule as the app.
 */
export {
  parseTurnsTuple,
  shouldDisplayTurn,
  getTurnNumberImagePath,
  getTurnNumberWidth,
  HALF_MARK_IMAGE_PATH,
  getHalfMarkWidth,
  MARK_GAP,
  getSlotUnitWidth,
  getSlotOffsetX,
  type TurnValue,
  type DirectionValue,
  type OpenCloseValue,
  type ParsedTurnsTuple,
} from "@tka/render-core";
