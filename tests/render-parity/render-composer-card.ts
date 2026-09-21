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
}

/** Renders the Composer side of a fixture with the same public card options. */
export async function renderComposerCard(
  testCase: CardParityCase,
  {
    hideBadge = false,
    hideHandColorKey = false,
  }: ComposerCardRenderOptions = {}
): Promise<HTMLCanvasElement | OffscreenCanvas> {
  const opts = testCase.options;
  registerLoopDisplayResolver(resolveLoopDisplay);
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
  const options: Partial<SequenceExportOptions> = {
    stepSize: 300,
    stepScale: 1,
    includeStartPlacement: true,
    startPlacementLayout: opts.startPlacementLayout ?? "row",
    columnCount: opts.columnCount,
    addWord: true,
    addStepNumbers: true,
    addDifficultyLevel: hideBadge ? false : (opts.showDifficulty ?? print),
    addReversalSymbols: true,
    addUserInfo: false,
    showNotes: opts.showFooter ?? false,
    notes: opts.notes,
    ...(print ? { deckCard: { contentWidth: 678, contentHeight: 978 } } : {}),
    accentColor: opts.accentColor,
    accentTintOpacity: opts.accentTintOpacity,
    qrImageBitmap,
    loopType: opts.loopComponents ? LOOPType.ROTATED : undefined,
    showLoopGlyph: !!opts.loopComponents,
    visibilityOverrides: {
      showHandColorKey: !hideHandColorKey,
      darkMode: opts.darkMode ?? false,
      printMode: true,
      showGrid: true,
      showTKA: true,
      showReversals: true,
      showNonRadialPoints: false,
      showTnD: false,
      showElemental: false,
      showPlacements: false,
      showQRCode,
      showMandala: opts.showMandala ?? true,
      leftPropType: (opts.leftPropType ?? "staff") as PropType,
      rightPropType: (opts.rightPropType ?? "staff") as PropType,
      fanAppearance: opts.fanAppearance,
      primaryPropColors: opts.primaryPropColors,
    },
  };
  const sequence = {
    ...testCase.sequence,
    id: `card-parity-${testCase.name}`,
    period: 4,
    // Reversal wrap follows the same loop signal the MCP options carry.
    isCircular: !!opts.loopComponents,
    loopType: options.loopType,
    loopSpec: { left: loopCertificate, right: loopCertificate },
  } as unknown as SequenceData;
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
