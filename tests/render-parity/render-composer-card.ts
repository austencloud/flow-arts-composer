import { wrapContentInCardFrame } from "$lib/features/choreo-card/services/card-front-frame";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { getImageComposer } from "$lib/shared/render/get-image-composer";
import type { SequenceExportOptions } from "$lib/shared/render/domain/models/sequence-export-options";
import { createRenderCanvas } from "$lib/shared/render/services/create-render-canvas";
import type { CardParityCase } from "./card-parity-cases";
import { LOOPType } from "$lib/shared/foundation/domain/models/generation/circular-models";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { registerLoopDisplayResolver } from "$lib/shared/loop-labeler/get-loop-display-resolver";
import { resolveLoopDisplay } from "$lib/features/loop-labeler/services/loop-display-resolver";
import { getUrlQRCodeGenerator } from "$lib/shared/qr/get-qr-code-generator";
import type { PropLOOPSpecWire } from "@tka/sequence-engine/loop";
import { PRINT_QR_RENDER_SIZE } from "@tka/render-composition";

interface ComposerCardRenderOptions {
  hideBadge?: boolean;
  hideHandColorKey?: boolean;
  /** Viewer/download cards use the normal screen palette, not deck print mode. */
  printMode?: boolean;
}

/** Renders the Composer side of a fixture with the same public card options. */
export async function renderComposerCard(
  testCase: CardParityCase,
  {
    hideBadge = false,
    hideHandColorKey = false,
    printMode = true,
  }: ComposerCardRenderOptions = {}
): Promise<HTMLCanvasElement | OffscreenCanvas> {
  const opts = testCase.options;
  registerLoopDisplayResolver(resolveLoopDisplay);
  const print = opts.exportProfile === "print";
  const showQRCode = !!opts.qrUrl && opts.showQRCode !== false;
  // A published link is rendered exactly the way PrintCardRenderer does it:
  // a URL-only generator, the modern style, no short-code minting.
  const qrImageBitmap = showQRCode
    ? await getUrlQRCodeGenerator().generateUrlAsImage(
        opts.qrUrl!,
        PRINT_QR_RENDER_SIZE,
        { style: "modern", margin: 1, darkMode: opts.darkMode ?? false }
      )
    : undefined;
  const options = cardParityExportOptions(testCase, {
    hideBadge,
    hideHandColorKey,
    printMode,
  });
  options.qrImageBitmap = qrImageBitmap;
  const sequence = cardParitySequence(testCase);
  let canvas = await getImageComposer().composeSequenceImage(sequence, options);
  if (print) {
    canvas = wrapContentInCardFrame(
      canvas as CanvasImageSource,
      { accent: "#999999", dark: "#444444" },
      createRenderCanvas
    );
  }
  return canvas;
}

/**
 * The complete export snapshot shared by the PNG side and the real live-card
 * harness. Keep fixture shorthand (`showFooter`, `showMandala`, and friends)
 * at this boundary; neither renderer receives those invented field names.
 */
export function cardParityExportOptions(
  testCase: CardParityCase,
  {
    hideBadge = false,
    hideHandColorKey = false,
    printMode = true,
  }: ComposerCardRenderOptions = {}
): Partial<SequenceExportOptions> & { qrUrl?: string } {
  const opts = testCase.options;
  const resolved = opts as typeof opts &
    Partial<SequenceExportOptions> & { qrUrl?: string };
  const print = opts.exportProfile === "print";
  const showQRCode =
    !!opts.qrUrl &&
    (resolved.visibilityOverrides?.showQRCode ?? opts.showQRCode ?? true);
  return {
    stepSize: 300,
    stepScale: 1,
    includeStartPlacement: true,
    startPlacementLayout: opts.startPlacementLayout ?? "row",
    columnCount: opts.columnCount,
    addWord: resolved.addWord ?? true,
    addStepNumbers: resolved.addStepNumbers ?? true,
    customName: resolved.customName,
    renderWordAsText: resolved.renderWordAsText,
    addDifficultyLevel: hideBadge
      ? false
      : (resolved.addDifficultyLevel ?? opts.showDifficulty ?? print),
    addReversalSymbols: true,
    addUserInfo: false,
    showNotes: resolved.showNotes ?? opts.showFooter ?? false,
    notes: resolved.notes ?? opts.notes,
    customNotesText: resolved.customNotesText,
    ...(print ? { deckCard: { contentWidth: 678, contentHeight: 978 } } : {}),
    accentColor: opts.accentColor,
    accentTintOpacity: opts.accentTintOpacity,
    loopType: opts.loopComponents ? LOOPType.ROTATED : undefined,
    showLoopGlyph: !!opts.loopComponents,
    visibilityOverrides: {
      // Match buildCardRenderOptions: this is a complete, immutable snapshot.
      // The live card must never fall through to account-global viewer state.
      showGrid: true,
      showTKA: true,
      showTnD: false,
      showElemental: false,
      showPropTnD: false,
      showPlacements: false,
      showReversals: true,
      showNonRadialPoints: false,
      showHandColorKey: !hideHandColorKey,
      handPointVisibility: "all",
      handPathMode: false,
      leftBuugengFlipped: false,
      rightBuugengFlipped: false,
      darkMode: opts.darkMode ?? false,
      printMode,
      showQRCode,
      showMandala: opts.showMandala ?? true,
      leftPropType: (opts.leftPropType ?? "staff") as PropType,
      rightPropType: (opts.rightPropType ?? "staff") as PropType,
      fanAppearance: opts.fanAppearance,
      primaryPropColors: opts.primaryPropColors ?? null,
      ...resolved.visibilityOverrides,
    },
    // A live ChoreoCard needs the published URL; the canvas renderer receives
    // the generated bitmap below. This is deliberate test-only transport, not
    // a second QR source or a code-minting path.
    ...(showQRCode ? { qrUrl: opts.qrUrl } : {}),
  };
}

export function cardParitySequence(testCase: CardParityCase): SequenceData {
  const opts = testCase.options;
  const loopCertificate: PropLOOPSpecWire = {};
  for (const component of opts.loopComponents ?? []) {
    const period =
      component === "rotated"
        ? opts.rotationPeriod
        : component === "inverted"
          ? opts.inversionPeriod
          : undefined;
    loopCertificate[component] = {
      period: period === "quartered" ? 4 : 2,
      ...(opts.overlayComponents?.includes(component)
        ? { mode: "overlay" }
        : {}),
      ...(component === "mirrored" && opts.reflectionAxis
        ? { reflectionAxis: opts.reflectionAxis }
        : {}),
    };
  }
  return {
    ...testCase.sequence,
    id: `card-parity-${testCase.name}`,
    period: 4,
    // Reversal wrap follows the same loop signal the MCP options carry.
    isCircular: !!opts.loopComponents,
    loopType: opts.loopComponents ? LOOPType.ROTATED : undefined,
    loopSpec: { left: loopCertificate, right: loopCertificate },
  } as unknown as SequenceData;
}
