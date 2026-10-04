import type { BrowseViewMode } from "$lib/shared/browse/domain/browse-view-mode";
import { encodeViewMode } from "$lib/shared/browse/domain/browse-view-mode";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { QRCodeGenerator } from "$lib/shared/qr/services/qr-code-generator";
import {
  encodeSequence,
  UnencodableMotionError,
} from "$lib/shared/navigation/services/sequence-encoder";
import { PRINT_QR_RENDER_SIZE } from "@tka/render-composition";

export interface ChoreoCardQrDeps {
  readonly sequence: SequenceData;
  readonly showQRCode: boolean;
  readonly qrUrl?: string;
  readonly darkMode: boolean;
  readonly isAuthenticated: boolean;
  readonly leftPropType: PropType | undefined;
  readonly rightPropType: PropType | undefined;
  readonly browseViewMode: BrowseViewMode | undefined;
  /** Use the PNG's authored QR resolution for a stable export presentation. */
  readonly exportPresentation?: boolean;
}

/** The two QR calls a card makes, so the generator can load lazily. */
export type ChoreoCardQrGenerator = Pick<
  QRCodeGenerator,
  "generateForSequence" | "generateForUrl"
>;

export interface ChoreoCardQrServices {
  readonly getGenerator: () => ChoreoCardQrGenerator;
  readonly getUrlGenerator?: () => ChoreoCardQrGenerator;
}

function lazyQrGenerator(forUrl: boolean): ChoreoCardQrGenerator {
  const load = async () => {
    const qr = await import("$lib/shared/qr/get-qr-code-generator");
    return forUrl ? qr.getUrlQRCodeGenerator() : qr.getQRCodeGenerator();
  };
  return {
    generateForSequence: async (sequence, options) =>
      (await load()).generateForSequence(sequence, options),
    generateForUrl: async (url, options) =>
      (await load()).generateForUrl(url, options),
  };
}

const sequenceQrGenerator = lazyQrGenerator(false);
const urlQrGenerator = lazyQrGenerator(true);

/**
 * The app's QR generators, loaded with import() the first time a card mints a
 * code. Their short-code manager imports Firebase, and the home page launchpad
 * renders cards without a QR code.
 */
export const lazyChoreoCardQrServices: ChoreoCardQrServices = {
  getGenerator: () => sequenceQrGenerator,
  getUrlGenerator: () => urlQrGenerator,
};

/** Owns QR minting, stale-result rejection, and the per-card QR cache. */
export function createChoreoCardQrState(
  getDeps: () => ChoreoCardQrDeps,
  services: ChoreoCardQrServices
) {
  let dataUrl = $state<string | null>(null);
  let generating = $state(false);
  // The key whose QR is decided. `activeKey` is not reactive, so a reused
  // cached code would otherwise leave a reader's derived `settled` stale.
  let settledKey = $state("");
  const cache = new Map<string, string>();
  let activeKey = "";
  let warnedUnencodable = false;

  // The QR is optional; the card is not. A motion the encoder has no wire code
  // for leaves this card without a QR instead of throwing out of the derived
  // key and taking the whole card down. Any other failure is a real bug.
  function encodeForQrKey(sequence: SequenceData): string | null {
    try {
      return encodeSequence(sequence);
    } catch (error) {
      if (!(error instanceof UnencodableMotionError)) throw error;
      if (!warnedUnencodable) {
        warnedUnencodable = true;
        console.warn(
          "[ChoreoCard] Showing the card without a QR: the sequence has a motion the encoder cannot represent.",
          { sequenceId: sequence.id, field: error.field, value: error.value }
        );
      }
      return null;
    }
  }

  const encodedViewMode = $derived.by(() => {
    const mode = getDeps().browseViewMode;
    return mode ? encodeViewMode(mode) : undefined;
  });

  const cacheKey = $derived.by(() => {
    const deps = getDeps();
    if (!deps.showQRCode) return "";
    const presentation = deps.exportPresentation ? "export" : "viewer";
    if (deps.qrUrl) return `url:${presentation}:${deps.darkMode}:${deps.qrUrl}`;
    // Editing a sequence in place keeps its ID; its QR must follow the motions.
    const sequenceId = encodeForQrKey(deps.sequence);
    if (sequenceId === null) return "";
    const authTag = deps.isAuthenticated ? "a" : "g";
    const leftProp = deps.leftPropType ?? "default";
    const rightProp = deps.rightPropType ?? "default";
    return `${presentation}:${sequenceId}:${deps.darkMode}:${authTag}:${leftProp}:${rightProp}${encodedViewMode ? `:${encodedViewMode}` : ""}`;
  });

  $effect(() => {
    const key = cacheKey;
    if (!key) {
      dataUrl = null;
      generating = false;
      activeKey = "";
      return;
    }

    if (key === activeKey) return;
    activeKey = key;

    const cached = cache.get(key);
    if (cached) {
      dataUrl = cached;
      generating = false;
      settledKey = key;
      return;
    }

    const deps = getDeps();
    if (!deps.isAuthenticated && !deps.qrUrl) {
      dataUrl = null;
      generating = false;
      settledKey = key;
      return;
    }

    const generator =
      deps.qrUrl && services.getUrlGenerator
        ? services.getUrlGenerator()
        : services.getGenerator();
    if (!generator) {
      generating = false;
      settledKey = key;
      return;
    }

    // Never leave a previous sequence or prop pair's scan target on screen.
    dataUrl = null;
    generating = true;
    const options = {
      // A URL QR does not use the sequence-preparation cache. Author it at the
      // PNG's canonical resolution before both surfaces scale it into the same
      // cell geometry. Sequence QRs stay at the shared prepared 200px source.
      size: deps.qrUrl && deps.exportPresentation ? PRINT_QR_RENDER_SIZE : 200,
      margin: 1,
      style: "modern" as const,
      darkMode: deps.darkMode,
      leftPropType: deps.leftPropType ? String(deps.leftPropType) : undefined,
      rightPropType: deps.rightPropType
        ? String(deps.rightPropType)
        : undefined,
      viewMode: encodedViewMode,
    };
    void (
      deps.qrUrl
        ? generator.generateForUrl(deps.qrUrl, options)
        : generator.generateForSequence(deps.sequence, options)
    )
      .then((result) => {
        cache.set(key, result.dataUrl);
        if (activeKey === key) {
          dataUrl = result.dataUrl;
          generating = false;
          settledKey = key;
        }
      })
      .catch(() => {
        // QR is optional. Settling the state prevents an indefinite spinner.
        if (activeKey === key) {
          generating = false;
          settledKey = key;
        }
      });
  });

  const pending = $derived(getDeps().showQRCode && !dataUrl && generating);

  return {
    get dataUrl() {
      return dataUrl;
    },
    get pending() {
      return pending;
    },
    get settled() {
      return !cacheKey || settledKey === cacheKey;
    },
  } as const;
}
