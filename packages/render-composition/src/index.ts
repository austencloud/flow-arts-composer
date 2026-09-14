// @tka/render-composition — shared choreo card composition
export * from "./types.js";
export { tokenizeGlyphWord } from "./glyph-word.js";
export { sanitizeSvgForBitmap } from "./svg-bitmap-sanitize.js";
export {
  DARK_MONOCHROME_IMAGE_COLOR,
  drawMonochromeImage,
  drawTintedImage,
} from "./tinted-image.js";
export * from "./difficulty-config.js";
export {
  drawSvgPath,
  drawPathCommands,
  parsePathData,
  type PathCommand,
} from "./svg-path-painter.js";
export {
  renderLoopIconStrip,
  computeLoopIconStripWidth,
  getReflectionIconTransform,
  LOOP_ICON_COLORS,
  type LoopRotationPeriod,
  type LoopInversionPeriod,
  type LoopReflectionAxis,
  type ReflectionIconTransform,
} from "./loop-icons.js";
export {
  getLayout,
  calculateImageDimensions,
  BASE_STEP_SIZE,
} from "./layout-tables.js";
export {
  calculateHeaderHeight,
  calculateFooterHeight,
  narrowGridScale,
  HEADER_HEIGHT_DIVISOR,
  FOOTER_HEIGHT_DIVISOR,
  NARROW_GRID_THRESHOLD,
  BADGE_SIZE_SCALE,
  CARD_FRONT_INDICATOR_SIZE_SCALE,
  BADGE_PADDING_SCALE,
  BADGE_NUMBER_FONT_SCALE,
  BADGE_BORDER_WIDTH_DIVISOR,
  HEADER_WORD_FONT_SCALE,
  HEADER_WORD_FONT_MIN_SCALE,
  HEADER_WORD_BREATHING_GAP_SCALE,
  LOOP_ICON_SIZE_SCALE,
  LOOP_ICON_GAP_SCALE,
  LOOP_ICON_STRIP_OFFSET_SCALE,
  LOOP_ICON_DOT_SIZE_SCALE,
  LOOP_ICON_DOT_OPACITY,
  FOOTER_FONT_SCALE,
  FOOTER_MARGIN_SCALE,
  FOOTER_TEXT_Y_SCALE,
  FOOTER_GAP_SCALE,
  STEP_NUMBER_FONT_RATIO,
  STEP_LABEL_FONT_RATIO,
  STEP_NUMBER_OFFSET_RATIO,
  STEP_NUMBER_FONT_MAX,
} from "./dimensions.js";
export { renderStepNumber } from "./step-number-renderer.js";
export { renderSmartBorders } from "./border-renderer.js";
export {
  DARK_HAND_COLORS,
  LIGHT_HAND_COLORS,
  normalizeHandHexColor,
  resolveHandColorPair,
  type HandColorPair,
} from "./hand-colors.js";
export {
  calculateCardMandalaPaths,
  renderCardMandala,
  type CardMandalaMotion,
  type CardMandalaPaths,
  type CardMandalaPlacement,
  type CardMandalaStep,
  type CardMandalaTurnAllocation,
} from "./card-mandala.js";
export {
  COMPOSER_CARD_EXPORT_PROFILE_V1,
  calculateSequenceCardCell,
  calculateSequenceCardLayout,
  calculateSequenceCardMandalaPlacements,
  composeSequenceCard,
  type SequenceCardCell,
  type SequenceCardCompositionOptions,
  type SequenceCardExportProfile,
  type SequenceCardHeader,
  type SequenceCardLayout,
  type SequenceCardPipeline,
} from "./sequence-card-pipeline.js";
export {
  calculateHeaderWordSideInset,
  renderHeader,
  type HeaderOptions,
  type HeaderWordSideInsetOptions,
} from "./header-renderer.js";
export {
  renderFooter,
  loadFooterIcon,
  seedFooterIcon,
  type FooterOptions,
} from "./footer-renderer.js";
