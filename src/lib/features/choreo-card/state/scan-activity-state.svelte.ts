import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { deriveWordFromBeats } from "#lib/shared/foundation/services/word-deriver.js";
import { parsePropTypeFromURLValue } from "#lib/shared/navigation/services/sequence-encoder.js";
import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import {
  resolveScanPropConfig,
  type ScanPropConfig,
} from "#lib/shared/qr/services/scan-prop-resolver.js";
import { hydrateSequence as hydrateDecodedForRender } from "#lib/shared/navigation/services/sequence-hydrator.js";
import { simplifyRepeatedWord } from "#lib/shared/foundation/utils/word-simplifier.js";
import { hydrateSequence } from "../services/sequence-render-hydrator";
import type {
  IScanActivityWatcher,
  ScanActivityCardDocument,
  ScanActivityEventRecord,
  ScanActivityAuthor,
} from "../services/contracts/IScanActivityWatcher";

export interface CodeEntry {
  code: string;
  word: string;
  ownerId: string | null;
  createdAt: string;
  encoded: string;
  scanCount: number;
  lastScannedAt: string | null;
  lastCity: string | null;
  lastCountry: string | null;
  leftPropType: PropType | null;
  rightPropType: PropType | null;
  catDogMode: boolean | null;
  metadataAvailable: boolean;
  embeddedFallback: SequenceData | null;
  decoded: SequenceData | null;
  previewSource: "encoded" | "embedded" | null;
  integrityOk: boolean;
  integrityReason?: string;
  decoding: boolean;
}

const EMBEDDED_PREVIEW_RENDER_VERSION = 1;

/**
 * Embedded legacy cards briefly rendered before their runtime motion fields
 * were restored, so those blank images can exist in local/cloud thumbnail
 * caches. Keep their corrected previews in a versioned cache namespace while
 * encoded cards retain their established identity.
 */
export function sequenceForScanPreview(
  entry: CodeEntry | null
): SequenceData | null {
  if (!entry?.decoded) return null;
  if (entry.previewSource !== "embedded") return entry.decoded;
  return {
    ...entry.decoded,
    id: `scan-activity-embedded-v${EMBEDDED_PREVIEW_RENDER_VERSION}-${entry.code}`,
  };
}

export function scanPropConfigForPreview(
  entry: CodeEntry | null,
  event: ScanActivityEventRecord | null
): ScanPropConfig {
  return resolveScanPropConfig(sequenceForScanPreview(entry), event, entry);
}

export type ScanEventRow = ScanActivityEventRecord;

export interface ScanMapPin {
  id: string;
  lat: number;
  lng: number;
  label: string;
  styleClass: "pin" | "pin-new";
}

export interface ScanActivityFilters {
  scope: "mine" | "all";
  currentUserId: string | null;
  search: string;
  city: string | null;
}

export interface ScanActivitySummary {
  windowCount: number;
  visibleCount: number;
  locatedCount: number;
  unlocatedCount: number;
  cityCount: number;
  cardCount: number;
  isFullWindow: boolean;
}

export type ScanActivityConnectionStatus =
  | "idle"
  | "connecting"
  | "live"
  | "error";

export interface ScanActivityStateDependencies {
  data: IScanActivityWatcher;
  decodeSequence: (encoded: string) => Promise<SequenceData>;
}

function toISOString(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return String(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function nullableText(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function codeWord(data: Record<string, unknown>): string {
  const embedded = data.sequenceData as
    | { word?: unknown; steps?: unknown }
    | undefined;
  // Prefer the letters of the actual steps over the stored sequenceName: older
  // codes minted before the word fix baked in a junk auto-name ("Sequence
  // 2:21:45 PM", "Assemble Sequence"), so the stored name can't be trusted as
  // the display word. Returns raw joined letters; callers simplify.
  const fromSteps = Array.isArray(embedded?.steps)
    ? deriveWordFromBeats(
        embedded.steps as Parameters<typeof deriveWordFromBeats>[0]
      )
    : "";
  return (
    fromSteps ||
    text(data.sequenceName) ||
    text(embedded?.word) ||
    text(data.sequence)
  );
}

function embeddedSequenceFromDocument(
  document: ScanActivityCardDocument
): SequenceData | null {
  const value = document.data.sequenceData;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const embedded = value as Partial<SequenceData> & {
    beats?: SequenceData["steps"];
  };
  const steps = embedded.steps ?? embedded.beats;
  if (!Array.isArray(steps) || steps.length === 0) return null;

  const word = codeWord(document.data);
  const ownerId = nullableText(document.data.ownerId);
  // Shortcode embeds intentionally contain only durable motion fields. Restore
  // the derived arrow/prop placement data before handing them to the thumbnail
  // renderer; wrapping the blob in createSequenceData() leaves every cell with
  // a letter and grid but no renderable motions.
  return hydrateSequence({
    ...embedded,
    id: document.code,
    ...(word && { word, name: word }),
    ...(ownerId && { ownerId }),
  });
}

export function buildScanMapPins(
  events: ScanEventRow[],
  wordFor?: (code: string) => string | undefined
): ScanMapPin[] {
  const pins: ScanMapPin[] = [];
  for (const event of events) {
    if (
      event.lat === null ||
      event.lng === null ||
      !Number.isFinite(event.lat) ||
      !Number.isFinite(event.lng) ||
      !event.city
    ) {
      continue;
    }
    pins.push({
      id: event.id,
      lat: event.lat,
      lng: event.lng,
      label: `${simplifyRepeatedWord(wordFor?.(event.code) || event.code)} · ${event.city}`,
      styleClass: pins.length === 0 ? "pin-new" : "pin",
    });
  }
  return pins;
}

export function filterScanEvents(
  events: ScanEventRow[],
  cards: ReadonlyMap<string, Pick<CodeEntry, "ownerId" | "word">>,
  filters: ScanActivityFilters
): ScanEventRow[] {
  const needle = filters.search.trim().toLocaleLowerCase();
  const city = filters.city?.toLocaleLowerCase() ?? null;

  return events.filter((event) => {
    const card = cards.get(event.code);
    if (
      filters.scope === "mine" &&
      (!filters.currentUserId || card?.ownerId !== filters.currentUserId)
    ) {
      return false;
    }
    if (city && event.city?.toLocaleLowerCase() !== city) return false;
    if (!needle) return true;

    return [event.code, card?.word, event.city, event.country]
      .filter((value): value is string => Boolean(value))
      .some((value) => value.toLocaleLowerCase().includes(needle));
  });
}

export function summarizeScanActivity(
  windowEvents: ScanEventRow[],
  visibleEvents: ScanEventRow[]
): ScanActivitySummary {
  const located = visibleEvents.filter(
    (event) =>
      Boolean(event.city) &&
      event.lat !== null &&
      event.lng !== null &&
      Number.isFinite(event.lat) &&
      Number.isFinite(event.lng)
  );
  const cities = new Set(
    visibleEvents
      .map((event) => event.city?.trim().toLocaleLowerCase())
      .filter((city): city is string => Boolean(city))
  );

  return {
    windowCount: windowEvents.length,
    visibleCount: visibleEvents.length,
    locatedCount: located.length,
    unlocatedCount: visibleEvents.length - located.length,
    cityCount: cities.size,
    cardCount: new Set(visibleEvents.map((event) => event.code)).size,
    isFullWindow: windowEvents.length === 100,
  };
}

function entryFromDocument(document: ScanActivityCardDocument): CodeEntry {
  const data = document.data;
  const encoded = text(data.encoded);
  const embeddedSequence = embeddedSequenceFromDocument(document);
  const initialPreview = encoded ? null : embeddedSequence;
  const hasPreviewSource = Boolean(encoded || embeddedSequence);
  return {
    code: document.code,
    word: codeWord(data),
    ownerId: nullableText(data.ownerId),
    createdAt: toISOString(data.createdAt) ?? "",
    encoded,
    scanCount: Number(data.scanCount ?? 0),
    lastScannedAt: toISOString(data.lastScannedAt),
    lastCity: nullableText(data.lastCity),
    lastCountry: nullableText(data.lastCountry),
    leftPropType:
      parsePropTypeFromURLValue(text(data.leftPropType ?? data.bluePropType)) ??
      null,
    rightPropType:
      parsePropTypeFromURLValue(text(data.rightPropType ?? data.redPropType)) ??
      null,
    catDogMode: typeof data.catDogMode === "boolean" ? data.catDogMode : null,
    metadataAvailable: true,
    embeddedFallback: embeddedSequence,
    decoded: initialPreview,
    previewSource: initialPreview ? "embedded" : null,
    integrityOk: hasPreviewSource,
    integrityReason: hasPreviewSource ? undefined : "Card data is unavailable.",
    decoding: false,
  };
}

function unavailableEntry(code: string): CodeEntry {
  return {
    code,
    word: "",
    ownerId: null,
    createdAt: "",
    encoded: "",
    scanCount: 0,
    lastScannedAt: null,
    lastCity: null,
    lastCountry: null,
    leftPropType: null,
    rightPropType: null,
    catDogMode: null,
    metadataAvailable: false,
    embeddedFallback: null,
    decoded: null,
    previewSource: null,
    integrityOk: false,
    integrityReason: "Card record is unavailable.",
    decoding: false,
  };
}

export type ScanActivityState = ReturnType<typeof createScanActivityState>;

export function createScanActivityState({
  data,
  decodeSequence,
}: ScanActivityStateDependencies) {
  let codes = $state<CodeEntry[]>([]);
  let recentEvents = $state<ScanEventRow[]>([]);
  let status = $state<ScanActivityConnectionStatus>("connecting");
  let error = $state<string | null>(null);
  let detailsError = $state<string | null>(null);
  let scope = $state<"mine" | "all">("all");
  let search = $state("");
  let cityFilter = $state<string | null>(null);
  let selectedEventId = $state<string | null>(null);
  let selectedCode = $state<string | null>(null);
  let currentUserId = $state<string | null>(null);
  let connectedAsAdmin = false;

  const byCode = new Map<string, CodeEntry>();
  const decodeCache = new Map<
    string,
    { decoded: SequenceData | null; reason?: string }
  >();
  const authorCache = new Map<string, ScanActivityAuthor>();
  const authorInflight = new Map<string, Promise<ScanActivityAuthor>>();
  const metadataInflight = new Map<string, number>();
  const metadataRefreshQueued = new Set<string>();
  const metadataFailures = new Map<string, string>();
  let previousEventIds = new Set<string>();
  let hasReceivedEventSnapshot = false;
  let metadataRequestId = 0;
  let unsubscribe: (() => void) | null = null;
  let connectionGeneration = 0;

  function currentVisibleEvents(): ScanEventRow[] {
    // `byCode` itself is not reactive; `codes` changes whenever it does.
    void codes;
    return filterScanEvents(recentEvents, byCode, {
      scope,
      currentUserId,
      search,
      city: cityFilter,
    });
  }
  function publishCards(): void {
    codes = [...byCode.values()].sort((a, b) => {
      const aTime = a.lastScannedAt ?? a.createdAt;
      const bTime = b.lastScannedAt ?? b.createdAt;
      return bTime.localeCompare(aTime);
    });
  }

  async function lookupAuthor(ownerId: string): Promise<ScanActivityAuthor> {
    const cached = authorCache.get(ownerId);
    if (cached) return cached;
    const inflight = authorInflight.get(ownerId);
    if (inflight) return inflight;

    const request = data
      .loadAuthor(ownerId)
      .catch(() => ({ displayName: "Unknown" }))
      .then((author) => {
        authorCache.set(ownerId, author);
        return author;
      })
      .finally(() => authorInflight.delete(ownerId));
    authorInflight.set(ownerId, request);
    return request;
  }

  async function enrichDecoded(
    decoded: SequenceData,
    entry: CodeEntry
  ): Promise<SequenceData> {
    // A decoded QR payload is LETTERLESS by construction — decodeSequence
    // stamps `letter: null` on every step because the wire format carries
    // motions, not letters. A letterless pictograph drops out of the
    // special-placement tier (it needs a letter to build a key) AND degrades
    // the default-placement key: detectLayerInfo can't classify alpha/beta/
    // gamma without the letter, so the lookup asks for `pro_to_layer1` and
    // then bare `pro`, neither of which any default_*_placements.json
    // defines. Both tiers miss, the adjustment comes back (0,0), and every
    // arrow renders on its raw hand point.
    //
    // Every other decoded-shortcode surface (/q/[code], /sequence/[id], the
    // viewer drawer, the scan-cell warmer) runs the canonical hydrator, which
    // derives letters before render. Scan Atlas was the one that didn't.
    // The local render hydrator still runs after it to keep the step/motion
    // placement shape this module's preview path expects.
    const withLetters = await hydrateDecodedForRender(decoded, {
      loopDetector: null,
    });
    const renderReady = hydrateSequence(
      withLetters as unknown as Record<string, unknown>
    );
    // The decoded steps are ground truth. Encoded-only codes have no embedded
    // steps at entry time, so entry.word is still the stored (possibly junk)
    // sequenceName here — prefer the letters of the decoded sequence over it.
    const decodedWord =
      deriveWordFromBeats(renderReady.steps ?? []) ||
      renderReady.word ||
      entry.word;
    const author = entry.ownerId ? await lookupAuthor(entry.ownerId) : null;
    return {
      ...renderReady,
      word: decodedWord,
      name: decodedWord || renderReady.name,
      ownerId: entry.ownerId ?? renderReady.ownerId,
      author: author?.displayName ?? renderReady.author,
      displayName: decodedWord || renderReady.displayName,
    } as SequenceData;
  }

  async function decodeSelectedCard(): Promise<void> {
    if (!selectedCode) return;
    const entry = byCode.get(selectedCode);
    if (!entry || entry.decoded || entry.decoding || !entry.encoded) return;

    const cached = decodeCache.get(entry.encoded);
    if (cached) {
      if (cached.decoded) {
        entry.decoded = cached.decoded;
        entry.previewSource = "encoded";
        entry.integrityOk = true;
        entry.integrityReason = undefined;
      } else if (entry.embeddedFallback) {
        entry.decoded = entry.embeddedFallback;
        entry.previewSource = "embedded";
        entry.integrityOk = true;
        entry.integrityReason = undefined;
      } else {
        entry.decoded = null;
        entry.previewSource = null;
        entry.integrityOk = false;
        entry.integrityReason = cached.reason;
      }
      publishCards();
      return;
    }

    const encoded = entry.encoded;
    entry.decoding = true;
    publishCards();
    try {
      const decoded = await decodeSequence(encoded);
      const enriched = await enrichDecoded(decoded, entry);
      decodeCache.set(encoded, { decoded: enriched });
      const current = byCode.get(entry.code);
      if (current?.encoded === encoded) {
        current.decoded = enriched;
        current.previewSource = "encoded";
        current.integrityOk = true;
        current.integrityReason = undefined;
      }
    } catch (caught) {
      const reason = (caught as Error).message;
      decodeCache.set(encoded, { decoded: null, reason });
      const current = byCode.get(entry.code);
      if (current?.encoded === encoded) {
        if (current.embeddedFallback) {
          current.decoded = current.embeddedFallback;
          current.previewSource = "embedded";
          current.integrityOk = true;
          current.integrityReason = undefined;
        } else {
          current.decoded = null;
          current.previewSource = null;
          current.integrityOk = false;
          current.integrityReason = reason;
        }
      }
    } finally {
      const current = byCode.get(entry.code);
      if (current) current.decoding = false;
      publishCards();
    }
  }

  function updateDetailsError(): void {
    detailsError = metadataFailures.values().next().value ?? null;
  }

  function pruneIrrelevantMetadataFailures(events: ScanEventRow[]): void {
    const relevantCodes = new Set(events.map((event) => event.code));
    if (selectedCode) relevantCodes.add(selectedCode);
    for (const failedCode of metadataFailures.keys()) {
      if (!relevantCodes.has(failedCode)) metadataFailures.delete(failedCode);
    }
    updateDetailsError();
  }

  async function loadCardMetadata(codesToLoad: string[], generation: number) {
    const requestedCodes = [...new Set(codesToLoad)].filter(
      (code) => !metadataInflight.has(code)
    );
    if (requestedCodes.length === 0) return;

    const requestId = ++metadataRequestId;
    for (const code of requestedCodes) {
      metadataInflight.set(code, requestId);
    }

    try {
      const documents = await data.loadCards(requestedCodes);
      if (generation !== connectionGeneration) return;

      const returnedCodes = new Set(documents.map((document) => document.code));
      for (const code of requestedCodes) {
        metadataFailures.delete(code);
        if (!returnedCodes.has(code)) {
          byCode.set(code, unavailableEntry(code));
        }
      }
      for (const document of documents) {
        const prior = byCode.get(document.code);
        const next = entryFromDocument(document);
        if (
          prior?.metadataAvailable &&
          next.encoded &&
          prior.encoded === next.encoded
        ) {
          next.decoded = prior.decoded;
          next.previewSource = prior.previewSource;
          next.integrityOk = prior.integrityOk;
          next.integrityReason = prior.integrityReason;
          next.decoding = prior.decoding;
        }
        byCode.set(document.code, next);
      }
      updateDetailsError();
      publishCards();
      await decodeSelectedCard();
    } catch (caught) {
      if (generation === connectionGeneration) {
        const message = (caught as Error).message;
        for (const code of requestedCodes) {
          metadataFailures.set(code, message);
        }
        pruneIrrelevantMetadataFailures(recentEvents);
      }
    } finally {
      const queuedRefreshes: string[] = [];
      for (const code of requestedCodes) {
        if (metadataInflight.get(code) !== requestId) continue;
        metadataInflight.delete(code);
        if (metadataRefreshQueued.delete(code)) queuedRefreshes.push(code);
      }
      if (generation === connectionGeneration && queuedRefreshes.length > 0) {
        void loadCardMetadata(queuedRefreshes, generation);
      }
    }
  }

  function metadataCodesForSnapshot(events: ScanEventRow[]): string[] {
    const initialSnapshot = !hasReceivedEventSnapshot;
    const newlyObservedCodes = new Set<string>();
    for (const event of events) {
      if (!previousEventIds.has(event.id)) newlyObservedCodes.add(event.code);
    }

    const windowCodes = new Set(events.map((event) => event.code));
    previousEventIds = new Set(events.map((event) => event.id));
    hasReceivedEventSnapshot = true;

    pruneIrrelevantMetadataFailures(events);

    const requestedCodes: string[] = [];
    for (const code of windowCodes) {
      const causedByNewEvent = newlyObservedCodes.has(code);
      if (!initialSnapshot && !causedByNewEvent && byCode.has(code)) continue;

      if (metadataInflight.has(code)) {
        if (causedByNewEvent && !initialSnapshot) {
          // A scan can land while this card's count is still loading. One
          // follow-up read keeps the lifetime count from freezing one scan behind.
          metadataRefreshQueued.add(code);
        }
        continue;
      }
      requestedCodes.push(code);
    }
    return requestedCodes;
  }

  function receiveEvents(events: ScanEventRow[], generation: number): void {
    if (generation !== connectionGeneration) return;
    const codesToLoad = metadataCodesForSnapshot(events);
    recentEvents = events;
    status = "live";
    error = null;
    void loadCardMetadata(codesToLoad, generation);
  }

  async function connect(
    userId: string | null,
    isAdmin: boolean,
    force = false
  ): Promise<void> {
    if (
      !force &&
      unsubscribe &&
      currentUserId === userId &&
      connectedAsAdmin === isAdmin
    ) {
      return;
    }

    disconnect();
    currentUserId = userId;
    connectedAsAdmin = isAdmin;
    error = null;

    if (!isAdmin) {
      recentEvents = [];
      status = "live";
      return;
    }

    status = "connecting";
    const generation = connectionGeneration;
    try {
      const stop = await data.watchRecentEvents(
        (events) => receiveEvents(events, generation),
        (caught) => {
          if (generation !== connectionGeneration) return;
          status = "error";
          error = caught.message;
        }
      );
      if (generation !== connectionGeneration) {
        stop();
        return;
      }
      unsubscribe = stop;
      ensureSelectedCardMetadata();
    } catch (caught) {
      if (generation !== connectionGeneration) return;
      status = "error";
      error = (caught as Error).message;
    }
  }

  function disconnect(): void {
    connectionGeneration += 1;
    unsubscribe?.();
    unsubscribe = null;
    previousEventIds = new Set();
    hasReceivedEventSnapshot = false;
    metadataInflight.clear();
    metadataRefreshQueued.clear();
    if (status === "connecting") status = "idle";
  }

  function retry(): void {
    void connect(currentUserId, connectedAsAdmin, true);
  }

  function retryDetails(): void {
    const relevantCodes = new Set(recentEvents.map((event) => event.code));
    if (selectedCode) relevantCodes.add(selectedCode);
    const failedCodes = [...metadataFailures.keys()].filter(
      (code) => relevantCodes.has(code) && !metadataInflight.has(code)
    );
    void loadCardMetadata(failedCodes, connectionGeneration);
  }

  function ensureSelectedCardMetadata(): void {
    if (!selectedCode) return;
    if (byCode.has(selectedCode)) {
      void decodeSelectedCard();
      return;
    }
    if (
      !connectedAsAdmin ||
      !unsubscribe ||
      metadataInflight.has(selectedCode) ||
      metadataFailures.has(selectedCode)
    ) {
      return;
    }
    void loadCardMetadata([selectedCode], connectionGeneration);
  }

  function setScope(next: "mine" | "all"): void {
    scope = next;
  }

  function setSearch(next: string): void {
    search = next;
  }

  function filterToCity(city: string): void {
    cityFilter = city;
  }

  function clearCityFilter(): void {
    cityFilter = null;
  }

  function selectEvent(eventId: string): void {
    const event = recentEvents.find((candidate) => candidate.id === eventId);
    if (!event) return;
    selectedEventId = event.id;
    selectedCode = event.code;
    pruneIrrelevantMetadataFailures(recentEvents);
    ensureSelectedCardMetadata();
  }

  function selectCode(code: string): void {
    selectedCode = code;
    selectedEventId =
      recentEvents.find((event) => event.code === code)?.id ?? null;
    pruneIrrelevantMetadataFailures(recentEvents);
    ensureSelectedCardMetadata();
  }

  function clearSelection(): void {
    selectedEventId = null;
    selectedCode = null;
    pruneIrrelevantMetadataFailures(recentEvents);
  }

  return {
    get codes() {
      return codes;
    },
    get recentEvents() {
      return recentEvents;
    },
    get visibleEvents() {
      return currentVisibleEvents();
    },
    get mapPins() {
      return buildScanMapPins(
        currentVisibleEvents(),
        (code) => byCode.get(code)?.word
      );
    },
    get summary() {
      return summarizeScanActivity(recentEvents, currentVisibleEvents());
    },
    get status() {
      return status;
    },
    get loading() {
      return status === "connecting" && recentEvents.length === 0;
    },
    get error() {
      return error;
    },
    get detailsError() {
      return detailsError;
    },
    get scope() {
      return scope;
    },
    get search() {
      return search;
    },
    get cityFilter() {
      return cityFilter;
    },
    get currentUserId() {
      return currentUserId;
    },
    get selectedEventId() {
      return selectedEventId;
    },
    get selectedCode() {
      return selectedCode;
    },
    get selectedEvent() {
      return selectedEventId
        ? (recentEvents.find((event) => event.id === selectedEventId) ?? null)
        : null;
    },
    get selectedCard() {
      // `byCode` is deliberately non-reactive; `codes` is its publication
      // signal, so read it here before resolving the current map entry.
      void codes;
      return selectedCode ? (byCode.get(selectedCode) ?? null) : null;
    },
    get relatedEvents() {
      return selectedCode
        ? recentEvents
            .filter(
              (event) =>
                event.code === selectedCode && event.id !== selectedEventId
            )
            .slice(0, 5)
        : [];
    },
    connect,
    disconnect,
    retry,
    retryDetails,
    setScope,
    setSearch,
    filterToCity,
    clearCityFilter,
    selectEvent,
    selectCode,
    clearSelection,
  };
}
