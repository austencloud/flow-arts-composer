/**
 * Short Code Manager Implementation
 *
 * Manages short codes for QR code URLs using Firebase Firestore.
 * Short codes are 4-character base36 uppercase strings (auto-bumping
 * to 5/6) that map to encoded sequence data for compact QR codes.
 *
 * Firebase collection: shortcodes
 *
 * Domain: QR - URL Shortening
 */

import {
  addDoc,
  collection,
  doc,
  getDoc,
  setDoc,
  query,
  where,
  getDocs,
  limit,
  updateDoc,
  increment,
  runTransaction,
  type Firestore,
  type QueryConstraint,
} from "firebase/firestore";
import { getFirestoreInstance } from "$lib/shared/auth/firebase";
import { type SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { isHandPathSequence } from "$lib/shared/foundation/domain/models/sequence-kind";
import { buildHandPathShortCodePayload } from "./hand-path-short-code-payload";
import {
  deriveWordStatusFromSteps,
  IncompleteWordError,
} from "$lib/shared/foundation/services/word-deriver";
import type { PublicSequencesLoader } from "$lib/shared/browse/services/public-sequences-loader";
import {
  encodeSequenceForQR,
  isInlineEncoded,
  decodeSequenceFromQR,
} from "$lib/shared/navigation/services/sequence-encoder";
import { deriveLettersForSequence } from "$lib/shared/navigation/services/letter-deriver";
import type { PublicSequenceHashMatcher } from "$lib/shared/sequence-viewer/services/public-sequence-hash-matcher";
import type {
  ShortCodeRecord,
  CreateShortCodeResult,
  ShortCodeURLOptions,
  ImportResolution,
  ShortCodeData,
} from "./types";
import { ShortCodeCache, SHORT_CODE_CACHE_SCHEMA } from "./short-code-cache";
import { assetFetch } from "$lib/shared/net/asset-fetch";
import { captureEvent } from "$lib/shared/analytics/services/posthog";
import type { SoloPropData } from "$lib/shared/foundation/domain/models/solo-prop-data";
import type { AuthoredHand } from "$lib/shared/foundation/domain/models/authored-hand";
import { getSequenceMotionProfile } from "$lib/shared/foundation/services/sequence-motion-profile";
import {
  extractLeftSoloProp,
  extractRightSoloProp,
} from "$lib/shared/foundation/services/sequence-decomposer";
import { soloPropToSequence } from "$lib/shared/foundation/services/solo-prop-sequence-adapter";
import { hashSoloProp } from "$lib/shared/foundation/services/content-hasher";
import { sha256Hex } from "$lib/shared/foundation/utils/canonical-digest";
import { ShortCodeShareError } from "../domain/short-code-error";
import {
  SHORTCODE_PAYLOAD_SCHEMA_VERSION,
  SOLO_SHORTCODE_PAYLOAD_SCHEMA_VERSION,
  decodeWordShortCodePayload,
  hydrateEmbeddedWordShortCodePayload,
  hydrateSelfContainedShortCodePayload,
  hydrateSoloShortCodePayload,
} from "./short-code-payload-hydrator";
import { fetchPublicShortCodeRecord } from "./public-short-code-record-reader";
import {
  choreographyDigest,
  contentStepsOf,
  findChoreographyMismatch,
  projectChoreography,
  verifyEncodedChoreography,
  type ChoreographyProjection,
} from "./choreography-fidelity";

export type { ShortCodeData } from "./types";

const SHORTCODES_COLLECTION = "shortcodes";
/** Content-addressed index: shortcodeHashes/{encoderHash} → { code }.
 *  Written atomically with each new code doc; makes one-code-per-hash a
 *  transactional invariant instead of a best-effort pre-check query. */
const HASH_INDEX_COLLECTION = "shortcodeHashes";
const MIN_CODE_LENGTH = 4;
/** Minting grows a code by up to two characters when shorter ones collide. */
export const MAX_SHORT_CODE_LENGTH = MIN_CODE_LENGTH + 2;

/**
 * Shortcode payload/label schema. 2 = strict payload-derived labels
 * (`payloadWord`/`payloadStepCount` present, mint rejected on incomplete
 * derivation). Absent/1 = legacy records whose labels may be auto-names or
 * stale words; readers may re-derive from the payload.
 */
/** Firestore `in` query operand cap. Batch reads chunk to this. */
const FIRESTORE_IN_LIMIT = 30;
/** Word-fallback and payloadDigest dedup read at most this many candidates.
 *  Every candidate is verified by hydrating it, so a small page suffices. */
const DEDUP_CANDIDATE_LIMIT = 10;
/** A stored loss reason is a diagnostic, not payload. */
const MAX_LOSS_REASON_LENGTH = 200;

/** An existing code that dedup may hand back once it proves what it plays. */
interface CodeCandidate {
  code: string;
  createdAt: string;
  data: ShortCodeData;
}

/** Oldest first; the smaller code breaks a createdAt tie. Every lookup path
 *  uses this order so two clients converge on the same code. */
function oldestFirst(a: CodeCandidate, b: CodeCandidate): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
}

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const CODE_COLLISION = "__CODE_COLLISION__";
const HASH_CLAIM_MISMATCH = "__HASH_CLAIM_MISMATCH__";

/**
 * Network budgets for the scan critical path (ms).
 *
 * A scan is a person standing still, holding a phone over a piece of
 * cardstock. The old path spent that time serially: Firestore's `getDoc` has
 * no app-level timeout and can sit on the SDK's internal 10s
 * ONLINE_STATE_TIMEOUT_MS before rejecting, and only THEN did the snapshot
 * fallback start its own untimed fetch. A real card (SJJ6, 2026-07-20) failed
 * to resolve on the first load and succeeded on the reload — a flaky leg on a
 * chain with no deadline reads to the user as "this card is broken".
 *
 * These budgets are sized so the worst case is one snapshot download, not a
 * serial chain of stalls.
 *
 * GRACE — how long Firestore runs ALONE before the snapshot ladder joins it.
 *   A warm mobile doc read lands in 200-600ms; 2.5s absorbs a slow LTE/TLS
 *   handshake while still meaning a healthy network never pays for a 2.4MB
 *   snapshot download.
 * FIRESTORE_HARD — we stop waiting on Firestore past this. `getDoc` accepts no
 *   AbortSignal, so the SDK call keeps running in the background; this only
 *   caps how long the scan blocks on it.
 * SNAPSHOT — covers the whole body download, not just the handshake: the R2
 *   snapshot is ~2.4MB uncompressed, and an abort mid-stream is still a failed
 *   source. 2.4MB at the floor of usable LTE (~1.6 Mbit) is ~12s.
 */
const FIRESTORE_GRACE_MS = 2_500;
const FIRESTORE_HARD_MS = 8_000;
const FIRESTORE_REST_TIMEOUT_MS = 5_000;
const SNAPSHOT_TIMEOUT_MS = 12_000;

/**
 * Static snapshot ladder, freshest first. Both layers are valid "Firestore
 * died" fallbacks:
 *
 *   1. R2 CDN (`snapshots/shortcodes-v2.json`) — published daily by the
 *      `snapshotShortCodes` Cloud Function. Freshest source; skinny
 *      `{_id, encoded}` word records plus the small schema-3 envelope for solo
 *      records, which is exactly what Strategy 0 of `hydrateFromRecord`
 *      consumes.
 *   2. Site-bundled `/data/snapshots/shortcodes.json` — generated by
 *      `scripts/export-static-snapshot.cjs` and committed to git. Ships with
 *      the build, so it survives R2 being unreachable (or the user being
 *      offline with the site already in the service-worker cache) — but it is
 *      STALE by construction, regenerated only when someone runs the script.
 *
 * They are consulted CONCURRENTLY and independently. The old loop returned the
 * first source that fetched+parsed regardless of whether it contained the
 * requested code, so a single R2 hiccup promoted the stale file (2026-05-23,
 * 6672 codes vs R2's 20054) to authoritative and every newer code — SJJ6
 * included — resolved as a confident, wrong "not found".
 */
const SNAPSHOT_SOURCES = [
  {
    id: "r2",
    label: "R2 CDN (daily)",
    url: "https://pub-f5505ed75927471cb198c54336317370.r2.dev/snapshots/shortcodes-v2.json",
  },
  {
    id: "bundled",
    label: "git-committed snapshot",
    url: "/data/snapshots/shortcodes.json",
  },
] as const;

type SnapshotSource = (typeof SNAPSHOT_SOURCES)[number];

/** How one source answered. "miss" = the source loaded fine but does not
 *  contain the code — which is NOT an answer, only evidence. */
type SourceOutcome = "hit" | "miss" | "timeout" | "error";

interface SourceAttempt {
  source: string;
  outcome: SourceOutcome;
  /** ms from the start of resolution to this source settling. */
  ms: number;
  detail?: string;
}

/** The record plus the forensic trail of how we got (or failed to get) it. */
interface RecordResolution {
  data: ShortCodeData | null;
  source: string | null;
  attempts: SourceAttempt[];
  elapsedMs: number;
}

/** Sentinel distinguishing "the grace period expired" from "Firestore answered
 *  null", which Promise.race would otherwise collapse into the same value. */
const GRACE_EXPIRED = Symbol("grace-expired");

function isTimeoutError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "TimeoutError";
}

function errorLabel(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Stop waiting on a promise after `ms`, rejecting with a TimeoutError-shaped
 * DOMException so callers can tell a deadline from a real failure. The
 * underlying work is NOT cancelled — Firestore's `getDoc` takes no
 * AbortSignal — we only stop blocking on it.
 */
function withTimeout<T>(
  work: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    work,
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new DOMException(`${label} timed out after ${ms}ms`, "TimeoutError")
          ),
        ms
      );
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * Resolve with the first promise that yields a non-null value; resolve null
 * ONLY once every promise has settled.
 *
 * This is the shape the old sequential loop got wrong: a source that loads
 * successfully but lacks the requested code must not terminate the search.
 * Rejections are absorbed the same way — a dead source is not an answer.
 */
async function firstTruthy<T>(
  promises: Promise<T | null>[]
): Promise<T | null> {
  if (promises.length === 0) return null;

  return new Promise<T | null>((resolve) => {
    let remaining = promises.length;
    let settled = false;

    const lose = () => {
      if (--remaining === 0 && !settled) resolve(null);
    };

    for (const promise of promises) {
      promise.then((value) => {
        if (value != null) {
          if (settled) return;
          settled = true;
          resolve(value);
          return;
        }
        lose();
      }, lose);
    }
  });
}

/**
 * A resolved short code plus the record it came from.
 *
 * The record is the ONLY client-side source of deck attribution — it is
 * resolved on the scan critical path anyway and used to be discarded, so
 * `card_scanned` fell back to SSR meta and recorded deck_id: null forever.
 * `record` is null for inline-encoded codes (self-contained, no doc exists)
 * and for snapshot-sourced hits that predate the fields.
 */
export interface ShortCodeResolution {
  sequence: SequenceData | null;
  record: ShortCodeData | null;
}

/**
 * The short-code resolver reads public sequence bodies when a stored code has
 * to be reconstructed. It does not own gallery metadata, cache warming, or
 * Firestore refreshes, so callers outside the app shell only provide this one
 * read instead of pretending to be a full PublicSequencesLoader.
 */
export type ShortCodeSequenceLoader = Pick<
  PublicSequencesLoader,
  "loadFullSequenceData"
>;

/**
 * The word to stamp on a sequence imported from this record's encoded blob.
 * Prefers the strict `payloadWord` (schema-2 mints), then the legacy
 * `sequenceName`; oldest records stored the word — or even the ENCODED BLOB —
 * in `sequence`, so anything containing encoding separators ("|") or
 * compression prefixes (":") is not a word and yields "" (the import keeps its
 * decoded placeholder name).
 */
export class ShortCodeManager {
  private firestore: Firestore | null = null;
  /** Parsed snapshot maps, memoized PER SOURCE. The old single
   *  `staticSnapshotCache` held whichever layer happened to load first, so one
   *  R2 failure pinned the instance to the stale git-committed file for the
   *  rest of the page's life. Keying by source means a degraded layer can
   *  never masquerade as the authoritative one, and a later resolve still
   *  re-attempts the fresher layer (failures are deliberately not memoized). */
  private readonly snapshotCacheBySource = new Map<
    string,
    Map<string, ShortCodeData>
  >();
  /** Single-flight per source so concurrent resolves share one download. */
  private readonly snapshotInflight = new Map<
    string,
    Promise<Map<string, ShortCodeData> | null>
  >();
  /** In-flight single-flight cache keyed by BARE encoderHash (or `w:{id}`
   *  fallback). Every concurrent caller for the same sequence shares ONE
   *  allocation regardless of options/embed flags — the shared result is the
   *  CODE; each caller derives its own URL from its own options. (The old key
   *  included embedScope, which put the two page-load callers — overlay state
   *  and QR generator — in different scopes and let them race straight past
   *  each other: 1,044 duplicate docs by 2026-07-05.) */
  private readonly inflightByKey = new Map<
    string,
    Promise<{ code: string; isNew: boolean }>
  >();

  constructor(
    private readonly browseLoader: ShortCodeSequenceLoader,
    private readonly hashMatcher?: PublicSequenceHashMatcher,
    private readonly codeCache: ShortCodeCache = new ShortCodeCache()
  ) {}

  /**
   * Cache key for a sequence's resolved code. Keyed by content hash (or word
   * fallback) ONLY — the code never varies with URL options, and URLs are
   * derived per caller. deckId/deckName/bp/rp/vm affect the stored record or
   * the URL, never the code.
   */
  private buildCacheKey(hashOrWord: string): string {
    return `${SHORT_CODE_CACHE_SCHEMA}:${hashOrWord}`;
  }

  /**
   * Compute the content hash for a sequence (or null when the matcher is
   * absent / the sequence has no steps). Same logic `createShortCode` uses.
   */
  private async tryComputeHash(
    sequence: SequenceData
  ): Promise<string | undefined> {
    if (this.hashMatcher && sequence.steps && sequence.steps.length > 0) {
      try {
        return await this.hashMatcher.computeEncoderHash(sequence);
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  /**
   * Initialize Firestore instance (called lazily)
   */
  private async ensureFirestore(): Promise<Firestore> {
    if (!this.firestore) {
      this.firestore = await getFirestoreInstance();
    }
    return this.firestore;
  }

  /**
   * Generate a random short code of the given length.
   *
   * Length is a per-call parameter (not instance state) so a collision-bump in
   * one createShortCode call can't permanently raise the code length for every
   * future call on the same instance. Concurrent calls each escalate their own
   * local length independently.
   */
  private generateCode(codeLength: number): string {
    let code = "";
    for (let i = 0; i < codeLength; i++) {
      code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    }
    return code;
  }

  /**
   * Get the base URL for short code URLs
   */
  private getBaseUrl(): string {
    return "HTTPS://TKA.RUN";
  }

  /**
   * Build URL with optional prop type query params.
   * Props are encoded as single characters (bp=S for blue staff, rp=F for red fan).
   */
  /** Format an already-published code without allocating or changing its record. */
  urlForExistingCode(code: string, options?: ShortCodeURLOptions): string {
    return this.buildUrlWithOptions(this.getBaseUrl(), code, options);
  }

  private buildUrlWithOptions(
    baseUrl: string,
    code: string,
    options?: ShortCodeURLOptions
  ): string {
    let url = `${baseUrl}/${code}`;

    const params = new URLSearchParams();
    if (options?.leftPropType) {
      params.set("bp", options.leftPropType);
    }
    if (options?.rightPropType) {
      params.set("rp", options.rightPropType);
    }
    if (options?.viewMode) {
      params.set("vm", options.viewMode);
    }

    const query = params.toString();
    if (query) {
      url += `?${query}`;
    }

    return url;
  }

  async createShortCode(
    sequence: SequenceData,
    options?: ShortCodeURLOptions
  ): Promise<CreateShortCodeResult> {
    const motionProfile = getSequenceMotionProfile(sequence);
    if (motionProfile.kind === "mixed") {
      throw new ShortCodeShareError(
        "MIXED_CHOREOGRAPHY_UNSUPPORTED",
        "This sequence switches between one-hand and two-hand choreography. Use the same hands on every beat before sharing."
      );
    }
    if (motionProfile.kind === "solo") {
      const soloProp =
        motionProfile.hand === "left"
          ? (sequence.leftSoloProp ?? extractLeftSoloProp(sequence))
          : (sequence.rightSoloProp ?? extractRightSoloProp(sequence));
      const sourceSoloPropId =
        typeof sequence.metadata.sourceSoloPropId === "string" &&
        sequence.metadata.sourceSoloPropId === soloProp.id
          ? sequence.metadata.sourceSoloPropId
          : undefined;
      return this.createSoloShortCode(
        {
          ...soloProp,
          name: sequence.displayName || sequence.name || soloProp.name,
          notes: sequence.notes ?? soloProp.notes,
          ownerId: sequence.ownerId ?? soloProp.ownerId,
          ownerDisplayName:
            sequence.ownerDisplayName ?? soloProp.ownerDisplayName,
          authoredHand: motionProfile.authoredHand,
        },
        motionProfile.authoredHand,
        options,
        sourceSoloPropId
      );
    }

    // Short codes are a signed-in-only operation — every caller gates on auth
    // before reaching here (guests get no QR at all). There is no guest
    // short-circuit anymore: the dense self-contained "s~..." QR it minted was
    // unscannable, so guests simply get nothing rather than a bad code.

    // Compute encoderHash for content-based dedup. Two sequences with the
    // same motions always produce the same hash, regardless of word or owner.
    // Falls back to word-based lookup for sequences without steps (legacy).
    let encoderHash: string | undefined;
    if (this.hashMatcher && sequence.steps && sequence.steps.length > 0) {
      try {
        encoderHash = await this.hashMatcher.computeEncoderHash(sequence);
      } catch {
        // Fall through to word-based
      }
    }

    const fallbackId = sequence.word || sequence.name || sequence.id;
    if (!encoderHash && !fallbackId) {
      throw new Error(
        "Sequence must have steps, word, name, or id for short code generation"
      );
    }

    // Cache and single-flight key on what the sequence PLAYS, not on the
    // lossy encoder hash: two sequences can share an encoderHash and still
    // play different choreography (HFWmmG / EPcIm6), and must not share a
    // cached code.
    const digest = await choreographyDigest(sequence);
    const allocKey = `d:${digest}`;

    // Persistent-cache short-circuit. A sequence's code is global + content-
    // addressed, so once resolved it never changes — read it locally and skip
    // the Firestore round-trip entirely. This is the cold-deck speed fix:
    // ~380ms/card network query → memory/IDB read.
    const cacheKey = this.buildCacheKey(allocKey);
    const cached = await this.codeCache.get(cacheKey);
    if (cached) {
      return {
        code: cached.code,
        url: this.buildUrlWithOptions(this.getBaseUrl(), cached.code, options),
        isNew: false,
      };
    }

    let inflight = this.inflightByKey.get(allocKey);
    if (!inflight) {
      inflight = this.allocateCode(
        sequence,
        options,
        encoderHash,
        fallbackId,
        digest
      )
        .then((result) => {
          // Write through the persistent cache so the next render (this
          // session or future) skips Firestore.
          void this.codeCache.set(cacheKey, { code: result.code });
          return result;
        })
        .finally(() => this.inflightByKey.delete(allocKey));
      this.inflightByKey.set(allocKey, inflight);
    }

    const { code, isNew } = await inflight;
    return {
      code,
      url: this.buildUrlWithOptions(this.getBaseUrl(), code, options),
      isNew,
    };
  }

  async createSoloShortCode(
    soloProp: SoloPropData,
    authoredHand: AuthoredHand,
    options?: ShortCodeURLOptions,
    sourceSoloPropId?: string
  ): Promise<CreateShortCodeResult> {
    if (soloProp.steps.length === 0) {
      throw new Error("Solo choreography must contain at least one step");
    }
    if (hashSoloProp(soloProp) !== soloProp.contentHash) {
      throw new Error("Solo choreography content hash is stale");
    }

    const title =
      soloProp.name?.trim() ||
      `${authoredHand === "left" ? "Left" : "Right"}-hand choreography`;
    if (title.length > 160) {
      throw new ShortCodeShareError(
        "SOLO_TITLE_TOO_LONG",
        "Shorten the choreography title to 160 characters before sharing."
      );
    }
    const encoderHash = await sha256Hex(
      JSON.stringify({
        kind: "solo",
        contentHash: soloProp.contentHash,
        authoredHand,
        title,
      })
    );
    const allocKey = encoderHash;
    const cacheKey = this.buildCacheKey(allocKey);
    const cached = await this.codeCache.get(cacheKey);
    if (cached) {
      return {
        code: cached.code,
        url: this.buildUrlWithOptions(this.getBaseUrl(), cached.code, options),
        isNew: false,
      };
    }

    let inflight = this.inflightByKey.get(allocKey);
    if (!inflight) {
      inflight = this.allocateSoloCode(
        soloProp,
        authoredHand,
        title,
        options,
        encoderHash,
        sourceSoloPropId
      )
        .then((result) => {
          void this.codeCache.set(cacheKey, { code: result.code });
          return result;
        })
        .finally(() => this.inflightByKey.delete(allocKey));
      this.inflightByKey.set(allocKey, inflight);
    }

    const { code, isNew } = await inflight;
    return {
      code,
      url: this.buildUrlWithOptions(this.getBaseUrl(), code, options),
      isNew,
    };
  }

  private async allocateSoloCode(
    soloProp: SoloPropData,
    authoredHand: AuthoredHand,
    title: string,
    options: ShortCodeURLOptions | undefined,
    encoderHash: string,
    sourceSoloPropId: string | undefined
  ): Promise<{ code: string; isNew: boolean }> {
    const expected = projectChoreography(
      soloPropToSequence(soloProp, authoredHand)
    );
    const existing = await this.findPlayingCode(expected, { encoderHash });
    if (existing.code) return { code: existing.code, isNew: false };

    const record: Record<string, unknown> = {
      sequence: title,
      sequenceName: title,
      payloadKind: "solo",
      payloadTitle: title,
      payloadStepCount: soloProp.steps.length,
      payloadContentHash: soloProp.contentHash,
      payloadSchemaVersion: SOLO_SHORTCODE_PAYLOAD_SCHEMA_VERSION,
      authoredHand,
      encoderHash,
      createdAt: new Date().toISOString(),
      createdBy: "system",
      scanCount: 0,
      // The canonical solo prop is the authoritative payload on every mint.
      // Readers verify it against payloadContentHash, so it plays exactly or
      // not at all. The rules accept `encoded` OR `soloData`, never both, so a
      // new solo record carries no blob.
      soloData: JSON.parse(JSON.stringify({ ...soloProp, authoredHand })),
    };
    if (sourceSoloPropId) record.sourceSoloPropId = sourceSoloPropId;
    if (soloProp.ownerId) record.ownerId = soloProp.ownerId;
    if (soloProp.ownerDisplayName) {
      record.ownerDisplayName = soloProp.ownerDisplayName;
    }
    if (options?.deckId) record.deckId = options.deckId;
    if (options?.deckName) record.deckName = options.deckName;
    if (options?.leftPropType) record.leftPropType = options.leftPropType;
    if (options?.rightPropType) record.rightPropType = options.rightPropType;
    if (options?.catDogMode !== undefined) {
      record.catDogMode = options.catDogMode;
    }

    return this.commitNewCode(
      record,
      existing.hashTaken ? undefined : encoderHash,
      expected,
      "solo short code"
    );
  }

  /**
   * Whether a stored record plays `expected`, hydrated exactly as a scan
   * hydrates it (embedded copy first, then the blob). A record that cannot be
   * hydrated from its own fields proves nothing and never matches.
   */
  private async recordPlays(
    code: string,
    data: ShortCodeData | null | undefined,
    expected: ChoreographyProjection
  ): Promise<boolean> {
    if (!data) return false;
    try {
      const hydrated = await hydrateSelfContainedShortCodePayload(code, data);
      return (
        !!hydrated &&
        findChoreographyMismatch(expected, projectChoreography(hydrated)) ===
          null
      );
    } catch {
      return false;
    }
  }

  private async firstPlaying(
    candidates: readonly CodeCandidate[],
    expected: ChoreographyProjection
  ): Promise<CodeCandidate | null> {
    for (const candidate of candidates) {
      if (await this.recordPlays(candidate.code, candidate.data, expected)) {
        return candidate;
      }
    }
    return null;
  }

  /** Short-code docs matching one equality filter, oldest first. */
  private async queryCandidates(
    field: "encoderHash" | "payloadDigest" | "sequence",
    value: string,
    ...constraints: QueryConstraint[]
  ): Promise<CodeCandidate[]> {
    const firestore = await this.ensureFirestore();
    const snapshot = await getDocs(
      query(
        collection(firestore, SHORTCODES_COLLECTION),
        where(field, "==", value),
        ...constraints
      )
    );
    return snapshot.docs
      .map((d) => {
        const data = d.data() as ShortCodeData;
        return { code: d.id, createdAt: data.createdAt ?? "", data };
      })
      .sort(oldestFirst);
  }

  /**
   * The existing code that plays `expected`, if any.
   *
   * An encoderHash is a hash of the lossy wire blob, so a hash match alone is
   * not proof: real records share a hash while playing different
   * choreography. Every candidate is hydrated and compared field by field,
   * and the oldest one that plays the sequence wins. `hashTaken` reports that
   * some record already carries this encoderHash, in which case a new code
   * must not claim the hash index.
   */
  private async findPlayingCode(
    expected: ChoreographyProjection,
    keys: { encoderHash?: string; fallbackWord?: string; digest?: string }
  ): Promise<{ code: string | null; hashTaken: boolean }> {
    let hashTaken = false;

    if (keys.encoderHash) {
      const candidates = await this.queryCandidates(
        "encoderHash",
        keys.encoderHash
      );
      hashTaken = candidates.length > 0;
      const winner = await this.firstPlaying(candidates, expected);
      if (winner) {
        // Lazy heal: point the hash index at the canonical code so future
        // allocations hit the transaction path directly. Only the canonical
        // (oldest) code is ever indexed, matching every other client.
        if (winner === candidates[0]) {
          void this.healHashIndex(
            keys.encoderHash,
            winner.code,
            winner.createdAt
          );
        }
        return { code: winner.code, hashTaken };
      }
      if (hashTaken) {
        console.warn(
          "[ShortCode] encoderHash is shared by code(s) that play different choreography; minting a separate code.",
          {
            encoderHash: keys.encoderHash,
            codes: candidates.map((c) => c.code),
          }
        );
      }
    } else if (keys.fallbackWord) {
      const winner = await this.firstPlaying(
        await this.queryCandidates(
          "sequence",
          keys.fallbackWord,
          limit(DEDUP_CANDIDATE_LIMIT)
        ),
        expected
      );
      if (winner) return { code: winner.code, hashTaken };
    }

    if (keys.digest) {
      const winner = await this.firstPlaying(
        await this.queryCandidates(
          "payloadDigest",
          keys.digest,
          limit(DEDUP_CANDIDATE_LIMIT)
        ),
        expected
      );
      if (winner) return { code: winner.code, hashTaken };
    }

    return { code: null, hashTaken };
  }

  /**
   * Allocate a unique code for `record`. The transaction enforces BOTH
   * invariants atomically: the code doc path is unclaimed (collision retry),
   * and no other writer has claimed this hash (index doc). Two clients racing:
   * both read a nonexistent index doc, both try to write it; Firestore's
   * serializable transactions force the loser to retry, whose re-read then
   * sees the winner and adopts its code instead of minting a duplicate.
   *
   * An index claim is adopted only when the claimed record plays `expected`.
   * A claim held by different choreography sends the mint down the hash-less
   * path instead (no encoderHash, no claim), which the rules allow.
   */
  private async commitNewCode(
    record: Record<string, unknown>,
    claimHash: string | undefined,
    expected: ChoreographyProjection,
    label: string
  ): Promise<{ code: string; isNew: boolean }> {
    const firestore = await this.ensureFirestore();
    const maxAttemptsPerLength = 10;
    let codeLength = MIN_CODE_LENGTH;
    let indexRef = claimHash
      ? doc(firestore, HASH_INDEX_COLLECTION, claimHash)
      : null;
    // The rules tie a stored encoderHash to its index claim in the same
    // write, so a hash-less mint carries no encoderHash field.
    if (!indexRef) delete record.encoderHash;

    while (codeLength <= MAX_SHORT_CODE_LENGTH) {
      for (let attempts = 0; attempts < maxAttemptsPerLength; attempts++) {
        const code = this.generateCode(codeLength);
        const docRef = doc(firestore, SHORTCODES_COLLECTION, code);

        let adoptedCode: string | null = null;
        try {
          await runTransaction(firestore, async (tx) => {
            // Reset on every (re-)run: Firestore re-invokes this callback on
            // write-write contention, and a stale value from a prior run must
            // not leak.
            adoptedCode = null;
            if (indexRef) {
              const indexSnap = await tx.get(indexRef);
              if (indexSnap.exists()) {
                const claimed = (indexSnap.data() as { code: string }).code;
                const claimedSnap = await tx.get(
                  doc(firestore, SHORTCODES_COLLECTION, claimed)
                );
                if (
                  claimedSnap.exists() &&
                  (await this.recordPlays(
                    claimed,
                    claimedSnap.data() as ShortCodeData,
                    expected
                  ))
                ) {
                  adoptedCode = claimed;
                  return;
                }
                throw new Error(HASH_CLAIM_MISMATCH);
              }
            }
            const snap = await tx.get(docRef);
            if (snap.exists()) {
              throw new Error(CODE_COLLISION);
            }
            tx.set(docRef, record);
            if (indexRef) {
              tx.set(indexRef, { code, createdAt: record.createdAt });
            }
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg === CODE_COLLISION) continue;
          if (msg === HASH_CLAIM_MISMATCH) {
            console.warn(
              `[ShortCode] ${label}: the hash index names a code that plays different choreography; minting without a hash claim.`,
              { encoderHash: claimHash }
            );
            indexRef = null;
            delete record.encoderHash;
            continue;
          }
          throw err;
        }

        if (adoptedCode) return { code: adoptedCode, isNew: false };
        return { code, isNew: true };
      }

      codeLength++;
      console.warn(
        `[ShortCode] Exhausted ${maxAttemptsPerLength} attempts at length ${codeLength - 1}, bumping to ${codeLength}`
      );
    }

    throw new Error(
      `Failed to generate a unique ${label} after exhausting all length tiers`
    );
  }

  /**
   * Batch-resolve every sequence's short code for a deck render in as few
   * Firestore reads as possible, populating the persistent cache. Turns the
   * first cold view of a fresh deck from N serial round-trips into ~⌈N/30⌉.
   *
   * Best-effort: anything not resolved here (no existing code, or the batch
   * failed) falls through to per-card `createShortCode` at render time, which
   * still creates + caches it. Never throws — a deck render must not block on
   * code resolution.
   */
  async resolveCodesForDeck(
    sequences: SequenceData[],
    options?: ShortCodeURLOptions,
    onProgress?: (done: number, total: number) => void
  ): Promise<void> {
    if (sequences.length === 0) return;

    try {
      // 1. Compute the content hash (the batch query key) and the choreography
      //    cache key for every sequence.
      const items = await Promise.all(
        sequences.map(async (seq) => {
          const hash = await this.tryComputeHash(seq);
          return {
            seq,
            hash,
            cacheKey: this.buildCacheKey(`d:${await choreographyDigest(seq)}`),
          };
        })
      );

      // 2. Skip anything already cached.
      const cacheHits = await this.codeCache.getMany(
        items.map((i) => i.cacheKey)
      );
      const misses = items.filter((i) => !cacheHits.has(i.cacheKey));

      // 3. Only hash-bearing misses can be batch-queried. Dedup hashes —
      //    repeated sequences across a deck share one operand.
      const missHashes = [
        ...new Set(misses.map((i) => i.hash).filter((h): h is string => !!h)),
      ];
      if (missHashes.length === 0) return;

      onProgress?.(0, missHashes.length);
      const firestore = await this.ensureFirestore();
      const candidatesByHash = new Map<string, CodeCandidate[]>();

      // 4. Chunked `in` queries (Firestore caps the `in` list at 30).
      for (let i = 0; i < missHashes.length; i += FIRESTORE_IN_LIMIT) {
        const chunk = missHashes.slice(i, i + FIRESTORE_IN_LIMIT);
        const snap = await getDocs(
          query(
            collection(firestore, SHORTCODES_COLLECTION),
            where("encoderHash", "in", chunk)
          )
        );
        for (const docSnap of snap.docs) {
          const data = docSnap.data() as ShortCodeData;
          const hash = data.encoderHash;
          if (!hash) continue;
          const list = candidatesByHash.get(hash) ?? [];
          list.push({
            code: docSnap.id,
            createdAt: data.createdAt ?? "",
            data,
          });
          candidatesByHash.set(hash, list);
        }
        onProgress?.(
          Math.min(i + FIRESTORE_IN_LIMIT, missHashes.length),
          missHashes.length
        );
      }

      // 5. Populate the cache for every miss whose code already exists AND
      //    plays that card's choreography. Oldest first, smaller id on a tie,
      //    so a deck-prewarmed client and a viewer-only client pick the SAME
      //    code. A hash shared by different choreography is left to
      //    createShortCode, which mints the card its own code.
      await Promise.all(
        misses.map(async (item) => {
          if (!item.hash) return;
          const candidates = [...(candidatesByHash.get(item.hash) ?? [])].sort(
            oldestFirst
          );
          const winner = await this.firstPlaying(
            candidates,
            projectChoreography(item.seq)
          );
          if (!winner) return; // genuinely new — created at render
          await this.codeCache.set(item.cacheKey, { code: winner.code });
        })
      );
    } catch (error) {
      // Best-effort: never block a deck render on pre-resolution.
      console.warn(
        "[ShortCode] resolveCodesForDeck failed (falling back to per-card):",
        error
      );
    }
  }

  private async allocateCode(
    sequence: SequenceData,
    options: ShortCodeURLOptions | undefined,
    encoderHash: string | undefined,
    fallbackId: string | undefined,
    digest: string
  ): Promise<{ code: string; isNew: boolean }> {
    const firestore = await this.ensureFirestore();
    const expected = projectChoreography(sequence);

    // Reuse an existing code only when its stored payload provably plays this
    // sequence. Catches codes created before the hash index existed, codes
    // written by other tabs/devices, and hash-less codes (by payloadDigest).
    const existing = await this.findPlayingCode(expected, {
      encoderHash,
      fallbackWord: encoderHash ? undefined : fallbackId,
      digest,
    });
    if (existing.code) {
      const existingCode = existing.code;
      // Backfill ownerId and sequenceId on legacy records that lack them.
      // Without these, the resolver can't load unpublished sequences directly.
      if (sequence.ownerId || sequence.id) {
        const existingRef = doc(firestore, SHORTCODES_COLLECTION, existingCode);
        const existingSnap = await getDoc(existingRef);
        if (existingSnap.exists()) {
          const existingData = existingSnap.data();
          const updates: Record<string, unknown> = {};
          if (!existingData.ownerId && sequence.ownerId)
            updates.ownerId = sequence.ownerId;
          if (!existingData.sequenceId && sequence.id)
            updates.sequenceId = sequence.id;
          if (Object.keys(updates).length > 0) {
            // Best-effort backfill — a failure (e.g. permission-denied for the
            // current user) must not block returning the existing code. But it
            // does degrade direct-load resolution of unpublished sequences, so
            // surface it instead of swallowing silently.
            await updateDoc(existingRef, updates).catch((error) => {
              console.warn(
                `[ShortCode] Failed to backfill ownerId/sequenceId on "${existingCode}":`,
                error
              );
            });
          }
        }
      }
      return { code: existingCode, isNew: false };
    }

    // Build the full record once. Encoding is expensive - don't redo it per
    // collision-retry attempt.
    //
    // The label is derived from the SOURCE PAYLOAD STEPS through the strict
    // word API. Never `sequence.word || deriveWordFromBeats(...)`: the stored
    // word can be an auto-title ("Sequence 2:21:45 PM", "Assemble Sequence")
    // or stale, and the payload is the authority even when `sequence.word` is
    // non-empty. A partial fallback word would bake a wrong label into an
    // immutable record.
    const payloadSteps = sequence.steps ?? [];
    const wordStatus = deriveWordStatusFromSteps(payloadSteps);
    const handPath = isHandPathSequence(sequence);
    if (!handPath && (!wordStatus.complete || wordStatus.word.length === 0)) {
      throw new IncompleteWordError(wordStatus);
    }
    const payloadWord = handPath ? "" : wordStatus.word;
    const record: Record<string, unknown> = {
      // Compatibility aliases during the reader migration — readers prefer
      // payloadWord, then fall back to these.
      sequence: payloadWord,
      sequenceName: payloadWord,
      payloadWord,
      payloadStepCount: wordStatus.stepCount,
      payloadSchemaVersion: SHORTCODE_PAYLOAD_SCHEMA_VERSION,
      payloadDigest: digest,
      createdAt: new Date().toISOString(),
      createdBy: "system",
      scanCount: 0,
    };
    if (sequence.id) {
      record.sequenceId = sequence.id;
      record.sourceSequenceId = sequence.id;
    }
    const sourceProjectionRevision = (
      sequence as { publicProjectionRevision?: unknown }
    ).publicProjectionRevision;
    if (typeof sourceProjectionRevision === "number") {
      record.sourceProjectionRevision = sourceProjectionRevision;
    }
    if (sequence.ownerId) record.ownerId = sequence.ownerId;
    if (encoderHash) record.encoderHash = encoderHash;
    if (options?.deckId) record.deckId = options.deckId;
    if (options?.deckName) record.deckName = options.deckName;
    // Persist the deck's prop so the doc is self-describing (the scan URL also
    // carries ?bp/?rp, but storing it lets resolution recover the prop even
    // when a URL is reconstructed without params).
    if (options?.leftPropType) record.leftPropType = options.leftPropType;
    if (options?.rightPropType) record.rightPropType = options.rightPropType;
    if (options?.catDogMode !== undefined) {
      record.catDogMode = options.catDogMode;
    }

    Object.assign(
      record,
      handPath
        ? await buildHandPathShortCodePayload(sequence)
        : await this.buildWordPayload(
            sequence,
            payloadWord,
            wordStatus.stepCount
          )
    );
    // buildHandPathShortCodePayload sets its own digest; keep the one the
    // cache and single-flight key were derived from.
    record.payloadDigest = digest;

    if (!record.sequenceData) {
      throw new Error(
        "[ShortCode] Refusing to create a shortcode without its embedded sequence copy."
      );
    }

    return this.commitNewCode(
      record,
      existing.hashTaken ? undefined : encoderHash,
      expected,
      "short code"
    );
  }

  /**
   * The payload of a word record: the embedded sequence copy on every mint
   * (the authoritative payload), plus the compact blob only when decoding it
   * plays the same choreography field by field AND re-derives the same word.
   *
   * The offline snapshot serves `encoded` alone, so a blob that plays
   * anything else is never stored; `encodedFidelity: "lossy"` records why the
   * record has none. An unencodable motion (UnencodableMotionError) fails the
   * mint instead of silently dropping a hand.
   */
  private async buildWordPayload(
    sequence: SequenceData,
    payloadWord: string,
    payloadStepCount: number
  ): Promise<Record<string, unknown>> {
    const startBeat =
      sequence.startPlacement ??
      sequence.startingPlacement ??
      sequence.steps.find((step) => step.stepNumber === 0);
    const embed: Record<string, unknown> = {
      // The rules require steps.size() == payloadStepCount, which counts only
      // the steps that play. Beat 0 travels as the start placement.
      steps: contentStepsOf(sequence.steps),
      // The immutable payload word comes from these steps. A stale mutable
      // sequence.word must not survive inside an otherwise-correct embed.
      word: payloadWord,
    };
    if (startBeat != null) embed.startPlacement = startBeat;
    if (sequence.gridMode != null) embed.gridMode = sequence.gridMode;
    if (sequence.isCircular != null) embed.isCircular = sequence.isCircular;
    if (sequence.loopType != null) embed.loopType = sequence.loopType;
    const payload: Record<string, unknown> = {
      sequenceData: JSON.parse(JSON.stringify(embed)),
    };

    const encoded = await encodeSequenceForQR(sequence);
    const fidelity = await this.checkWordBlob(
      sequence,
      encoded,
      payloadWord,
      payloadStepCount
    );
    if (fidelity.exact) {
      payload.encoded = encoded;
      payload.encodedFidelity = "exact";
    } else {
      payload.encodedFidelity = "lossy";
      payload.encodedLossReason = fidelity.reason.slice(
        0,
        MAX_LOSS_REASON_LENGTH
      );
      console.warn(
        "[ShortCode] Encoded payload does not play the saved choreography; storing the embedded copy only.",
        { sequenceId: sequence.id, reason: fidelity.reason }
      );
    }
    return payload;
  }

  private async checkWordBlob(
    sequence: SequenceData,
    encoded: string,
    payloadWord: string,
    payloadStepCount: number
  ): Promise<{ exact: true } | { exact: false; reason: string }> {
    const motions = await verifyEncodedChoreography(encoded, sequence);
    if (!motions.exact) return motions;
    try {
      const decodedWithLetters = await deriveLettersForSequence(
        motions.decoded
      );
      const decodedWordStatus = deriveWordStatusFromSteps(
        decodedWithLetters.steps
      );
      if (
        !decodedWordStatus.complete ||
        decodedWordStatus.word !== payloadWord ||
        decodedWordStatus.stepCount !== payloadStepCount
      ) {
        return {
          exact: false,
          reason: `word: ${payloadWord} vs ${decodedWordStatus.complete ? decodedWordStatus.word : "(incomplete)"}`,
        };
      }
    } catch (error) {
      return {
        exact: false,
        reason: `letters: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
    return { exact: true };
  }

  /**
   * The code a sequence ALREADY has, or null. Pure read — no allocation, no
   * hash-index heal, no write of any kind.
   *
   * This exists for surfaces that must DEPICT a code without owning it. The
   * shop hero shows a phone loading the real `/q/<code>` for the card on
   * screen; a marketing page minting codes would put writes on an anonymous
   * public route and could fork the one-code-per-hash invariant the whole
   * shortcode scheme rests on. `createShortCode` is the write path and stays
   * the write path — a depicting surface calls this instead and simply shows
   * nothing when the answer is null.
   *
   * Like allocation, it returns only a code whose stored payload plays this
   * sequence; a code that merely shares the encoderHash is not an answer.
   */
  async findExistingCodeForSequence(
    sequence: SequenceData
  ): Promise<string | null> {
    try {
      const expected = projectChoreography(sequence);
      const hash = await this.tryComputeHash(sequence);
      if (hash) {
        const byHash = await this.firstPlaying(
          await this.queryCandidates("encoderHash", hash),
          expected
        );
        if (byHash) return byHash.code;
      }
      const byDigest = await this.firstPlaying(
        await this.queryCandidates(
          "payloadDigest",
          await choreographyDigest(sequence),
          limit(DEDUP_CANDIDATE_LIMIT)
        ),
        expected
      );
      return byDigest?.code ?? null;
    } catch {
      // A depiction is never worth an error surface; the caller shows nothing.
      return null;
    }
  }

  /** Best-effort create of the hash-index doc. The index is immutable after
   *  create (rules), so a lost race here just means another client healed it
   *  first — the warn is noise, not damage. `createdAt` is the canonical
   *  code's own timestamp (not heal time) so it matches the transaction path
   *  and the backfill script. */
  private async healHashIndex(
    hash: string,
    code: string,
    createdAt: string
  ): Promise<void> {
    try {
      const firestore = await this.ensureFirestore();
      const ref = doc(firestore, HASH_INDEX_COLLECTION, hash);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, { code, createdAt });
      }
    } catch (error) {
      console.warn(`[ShortCode] hash-index heal failed for ${hash}:`, error);
    }
  }

  /**
   * Resolve a short code to its sequence. Thin wrapper over
   * `resolveShortCodeWithRecord` for the callers that only need the sequence.
   */
  async resolveShortCode(code: string): Promise<SequenceData | null> {
    const { sequence } = await this.resolveShortCodeWithRecord(code);
    return sequence;
  }

  /**
   * Resolve a short code and hand back the record too.
   *
   * Same work as `resolveShortCode` — the record was always fetched, just
   * thrown away on the way out. Callers that need attribution (deck id/name,
   * owner, stored props) take this variant instead of re-reading the doc.
   */
  async resolveShortCodeWithRecord(
    code: string,
    prefetchedRecord?: ShortCodeData | null
  ): Promise<ShortCodeResolution> {
    // Inline-encoded offline code (s~...): self-contained, zero network. Stays
    // ahead of every network leg below — it resolves with the radio off. There
    // is no Firestore doc behind it, so there is no record to return.
    if (isInlineEncoded(code)) {
      try {
        // Decode directly - no Firebase needed, works offline!
        return { sequence: await decodeSequenceFromQR(code), record: null };
      } catch (error) {
        console.error("Failed to decode inline sequence:", error);
        return { sequence: null, record: null };
      }
    }

    // SvelteKit's /q server load already fetched this public document for its
    // metadata. Reuse that complete, plain-data record when supplied so the
    // browser does not repeat the Firestore read and snapshot race. A missing
    // server record keeps the established multi-source recovery path intact.
    const resolution: RecordResolution = prefetchedRecord
      ? {
          data: prefetchedRecord,
          source: "server-load",
          attempts: [{ source: "server-load", outcome: "hit", ms: 0 }],
          elapsedMs: 0,
        }
      : await this.resolveRecord(code);
    if (!resolution.data) {
      this.reportResolveFailure(code, "record_not_found", resolution);
      return { sequence: null, record: null };
    }

    const hydrated = await this.hydrateFromRecord(code, resolution.data);
    if (!hydrated) {
      this.reportResolveFailure(code, "hydrate_failed", resolution);
    }
    // The record rides along even when hydration failed — a caller logging the
    // scan still wants to know which deck the card came from.
    return { sequence: hydrated, record: resolution.data };
  }

  /**
   * Resolve a scanned card for FILING into a collection, not viewing.
   *
   * resolveShortCode prefers the self-contained encoded blob (fastest to
   * show) and returns id = code — but a collection member must be a
   * Firestore sequence doc the member-loader can find later (own or
   * public). So this resolver runs identity-first: public index, then
   * sequenceId-as-word, then direct doc load; the blob and embedded data
   * come last and are flagged docBacked: false so the caller knows to
   * import a copy before filing.
   */
  async resolveForImport(
    code: string,
    currentUserId: string | null
  ): Promise<ImportResolution | null> {
    // Self-contained payload: nothing to reference, always a copy.
    if (isInlineEncoded(code)) {
      try {
        return { sequence: await decodeSequenceFromQR(code), docBacked: false };
      } catch (error) {
        console.error("[ShortCode] Failed to decode inline sequence:", error);
        return null;
      }
    }

    const resolution = await this.resolveRecord(code);
    if (!resolution.data) {
      this.reportResolveFailure(code, "record_not_found", resolution);
      return null;
    }
    const data = resolution.data;

    if (data.payloadKind === "solo") {
      const soloSequence = await hydrateSoloShortCodePayload(code, data);
      if (soloSequence) {
        return { sequence: soloSequence, docBacked: false };
      }
      this.reportResolveFailure(code, "import_strategies_failed", resolution);
      return null;
    }

    // Strategy: public index by stored word + sequenceId.
    try {
      const bySeq = await this.browseLoader.loadFullSequenceData(
        data.sequence,
        data.sequenceId
      );
      if (bySeq) return { sequence: bySeq, docBacked: true };
    } catch {
      // fall through
    }

    // Strategy: sequenceId as the (simplified) word.
    if (data.sequenceId && data.sequenceId !== data.sequence) {
      try {
        const byId = await this.browseLoader.loadFullSequenceData(
          data.sequenceId,
          data.sequenceId
        );
        if (byId) return { sequence: byId, docBacked: true };
      } catch {
        // fall through
      }
    }

    // Strategy: direct doc load. Referenceable only when the collection
    // member-loader will find it later — the user's own doc, or a public
    // one. A foreign private doc would file as an invisible member, so it
    // feeds the copy path instead (we still use its full data).
    if (data.ownerId && data.sequenceId) {
      try {
        const firestore = await this.ensureFirestore();
        const directSnap = await getDoc(
          doc(firestore, `users/${data.ownerId}/sequences/${data.sequenceId}`)
        );
        if (directSnap.exists()) {
          const seqData = directSnap.data();
          const referenceable =
            data.ownerId === currentUserId ||
            seqData["visibility"] === "public";
          return {
            sequence: {
              ...seqData,
              id: directSnap.id,
              ownerId: data.ownerId,
            } as SequenceData,
            docBacked: referenceable,
          };
        }
      } catch (error) {
        console.error(`[ShortCode] Direct load failed for "${code}":`, error);
      }
    }

    // Self-contained fallbacks — data exists but no referenceable doc.
    if (data.encoded) {
      const decoded = await decodeWordShortCodePayload(code, data);
      if (decoded) return { sequence: decoded, docBacked: false };
    }
    if (data.sequenceData) {
      const embedded = hydrateEmbeddedWordShortCodePayload(code, data);
      if (!embedded) return null;
      return {
        sequence: embedded,
        docBacked: false,
      };
    }

    this.reportResolveFailure(code, "import_strategies_failed", resolution);
    return null;
  }

  /**
   * Look up a short code record from Firestore (primary path).
   * Returns null if the document doesn't exist. Throws on network/auth errors.
   * Deliberately has no deadline of its own — `resolveRecord` owns the budget,
   * because only it knows what else is racing.
   */
  private async resolveFromFirestore(
    code: string
  ): Promise<ShortCodeData | null> {
    const firestore = await this.ensureFirestore();
    const docRef = doc(firestore, SHORTCODES_COLLECTION, code);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return null;
    }

    return docSnap.data() as ShortCodeData;
  }

  /**
   * Find a short code's record from whichever source answers FIRST with the
   * requested code — Firestore or either static snapshot layer.
   *
   * Three properties the old sequential Firestore-then-snapshot chain lacked:
   *
   *   1. Every leg has a deadline (see the *_MS budgets). Nothing on the scan
   *      path can stall indefinitely.
   *   2. Sources OVERLAP. Firestore gets a short head start alone (the healthy
   *      case, and much the cheapest), then the public REST reader and snapshot
   *      ladder run alongside it rather than waiting on a full rejection.
   *   3. A source that loads but LACKS the code is a miss, not an answer. Only
   *      when every source has been consulted do we report not-found. That is
   *      the SJJ6 bug: the stale snapshot "succeeded" and terminated the
   *      search on a code it never contained.
   *
   * Firestore returning "no such document" is likewise NOT authoritative — a
   * read served from the offline cache reports a nonexistent snapshot for a
   * doc that exists on the server — so it too falls through to the ladder.
   */
  private async resolveRecord(code: string): Promise<RecordResolution> {
    const startedAt = Date.now();
    const attempts: SourceAttempt[] = [];
    let winner: string | null = null;

    const note = (source: string, outcome: SourceOutcome, detail?: string) => {
      attempts.push({
        source,
        outcome,
        ms: Date.now() - startedAt,
        ...(detail ? { detail } : {}),
      });
    };

    const firestoreLeg = withTimeout(
      this.resolveFromFirestore(code),
      FIRESTORE_HARD_MS,
      "firestore"
    )
      .then((data) => {
        note("firestore", data ? "hit" : "miss");
        if (data) winner ??= "firestore";
        return data;
      })
      .catch((error) => {
        note(
          "firestore",
          isTimeoutError(error) ? "timeout" : "error",
          errorLabel(error)
        );
        return null;
      });

    // Grace period: Firestore alone. On a healthy network it answers here, so
    // the common scan still costs one doc read and zero snapshot bytes.
    const graced = await Promise.race<
      ShortCodeData | null | typeof GRACE_EXPIRED
    >([firestoreLeg, sleep(FIRESTORE_GRACE_MS).then(() => GRACE_EXPIRED)]);
    if (graced !== GRACE_EXPIRED && graced) {
      return {
        data: graced,
        source: "firestore",
        attempts,
        elapsedMs: Date.now() - startedAt,
      };
    }

    // Firestore is slow, dead, or answered a non-authoritative miss. The public
    // REST document is far smaller than either snapshot and uses a separate
    // transport, so bring it up alongside the snapshot layers and whatever the
    // browser SDK is still doing. This is the load-bearing Capacitor fallback:
    // Android WebView can reach this endpoint even when the SDK's streaming
    // connection never establishes.
    const restLeg = fetchPublicShortCodeRecord(code, {
      timeoutMs: FIRESTORE_REST_TIMEOUT_MS,
    })
      .then((data) => {
        note("firestore-rest", data ? "hit" : "miss");
        if (data) winner ??= "firestore-rest";
        return data;
      })
      .catch((error) => {
        note(
          "firestore-rest",
          isTimeoutError(error) ? "timeout" : "error",
          errorLabel(error)
        );
        return null;
      });

    // Snapshot layers remain the offline/stale-network fallback and race
    // independently. A miss from any one source never terminates resolution.
    const snapshotLegs = SNAPSHOT_SOURCES.map((source) =>
      this.loadSnapshotSource(source)
        .then((map) => {
          if (!map) {
            note(source.id, "error", "snapshot unavailable");
            return null;
          }
          const hit = map.get(code) ?? null;
          note(
            source.id,
            hit ? "hit" : "miss",
            hit ? undefined : `${map.size} codes`
          );
          if (hit) winner ??= source.id;
          return hit;
        })
        .catch((error) => {
          note(
            source.id,
            isTimeoutError(error) ? "timeout" : "error",
            errorLabel(error)
          );
          return null;
        })
    );

    const data = await firstTruthy<ShortCodeData>([
      firestoreLeg,
      restLeg,
      ...snapshotLegs,
    ]);

    return {
      data,
      source: data ? winner : null,
      attempts,
      elapsedMs: Date.now() - startedAt,
    };
  }

  /**
   * Load (and memoize) one snapshot layer's code → record map. Memoization is
   * per source and success-only, so a degraded layer never gets promoted to
   * authoritative and a transient failure doesn't poison later resolves.
   */
  private async loadSnapshotSource(
    source: SnapshotSource
  ): Promise<Map<string, ShortCodeData> | null> {
    const cached = this.snapshotCacheBySource.get(source.id);
    if (cached) return cached;

    let inflight = this.snapshotInflight.get(source.id);
    if (!inflight) {
      inflight = this.fetchSnapshotSource(source).finally(() =>
        this.snapshotInflight.delete(source.id)
      );
      this.snapshotInflight.set(source.id, inflight);
    }
    return inflight;
  }

  private async fetchSnapshotSource(
    source: SnapshotSource
  ): Promise<Map<string, ShortCodeData> | null> {
    const response = await assetFetch(
      source.url,
      undefined,
      SNAPSHOT_TIMEOUT_MS
    );
    if (!response.ok) {
      console.warn(
        `[ShortCode] ${source.label} unavailable (${response.status})`
      );
      return null;
    }

    const envelope = await response.json();
    const map = new Map<string, ShortCodeData>();
    for (const record of envelope.documents || []) {
      if (record._id) {
        map.set(record._id, record as ShortCodeData);
      }
    }

    this.snapshotCacheBySource.set(source.id, map);
    return map;
  }

  /**
   * Report a scan that failed to resolve.
   *
   * The console.error stays for local debugging, but the captureEvent is the
   * point: SJJ6 failed on a real phone on 2026-07-20, auto-reloaded, and
   * succeeded — and the only trace was a console line nobody could read. Every
   * failure now carries which sources were consulted, how each one answered,
   * how long it took, and whether the device thought it was online.
   */
  private reportResolveFailure(
    code: string,
    stage: "record_not_found" | "hydrate_failed" | "import_strategies_failed",
    resolution: RecordResolution
  ): void {
    const summary =
      resolution.attempts
        .map((a) => `${a.source}=${a.outcome}@${a.ms}ms`)
        .join(" ") || "no sources reached";

    console.error(
      `[ShortCode] ✗ "${code}" unresolved (${stage}) after ${resolution.elapsedMs}ms — ${summary}`
    );

    captureEvent("shortcode_resolve_failed", {
      code,
      stage,
      sources_tried: resolution.attempts.map((a) => a.source),
      source_outcomes: resolution.attempts,
      outcome_summary: summary,
      record_source: resolution.source,
      online: typeof navigator !== "undefined" ? navigator.onLine : null,
      elapsed_ms: resolution.elapsedMs,
    });
  }

  /**
   * Given a short code record (from Firebase or static snapshot), resolve it
   * to full sequence data using the same multi-strategy approach.
   */
  private async hydrateFromRecord(
    code: string,
    data: ShortCodeData
  ): Promise<SequenceData | null> {
    // Strategy 0: Data carried by the record itself. The shared resolver keeps
    // the exact embedded copy ahead of the lean encoded blob, while retaining
    // the blob as the zero-network fallback used by skinny offline snapshots.
    const selfContained = await hydrateSelfContainedShortCodePayload(
      code,
      data
    );
    if (selfContained) return selfContained;

    // Strategy 2: Public index lookup by stored word + sequenceId
    try {
      const fullSequence = await this.browseLoader.loadFullSequenceData(
        data.sequence,
        data.sequenceId
      );
      if (fullSequence) {
        return fullSequence;
      }
    } catch (err) {
      // Public index lookup failed — fall through
    }

    // Strategy 3: The stored word may be expanded (e.g., "AAKEAAKEAAKEAAKE").
    // Try using sequenceId as the word - it often matches the simplified form.
    if (data.sequenceId && data.sequenceId !== data.sequence) {
      try {
        const byId = await this.browseLoader.loadFullSequenceData(
          data.sequenceId,
          data.sequenceId
        );
        if (byId) {
          return byId;
        }
      } catch (err) {
        // sequenceId-as-word lookup failed — fall through
      }
    }

    // Strategy 4: Direct Firestore load (requires ownerId + sequenceId)
    if (data.ownerId && data.sequenceId) {
      try {
        const firestore = await this.ensureFirestore();
        const directRef = doc(
          firestore,
          `users/${data.ownerId}/sequences/${data.sequenceId}`
        );
        const directSnap = await getDoc(directRef);
        if (directSnap.exists()) {
          const seqData = directSnap.data();
          return {
            ...seqData,
            id: directSnap.id,
            ownerId: data.ownerId,
          } as SequenceData;
        }
        // Direct Firestore doc not found — fall through
      } catch (error) {
        console.error(`[ShortCode] ✗ Direct Firestore load failed:`, error);
      }
    } else {
      // Skipping direct load — missing ownerId or sequenceId
    }

    console.error(
      `[ShortCode] ✗ ALL strategies failed for code "${code}". Record:`,
      JSON.stringify(data)
    );

    return null;
  }

  async incrementScanCount(code: string): Promise<void> {
    try {
      const firestore = await this.ensureFirestore();
      const docRef = doc(firestore, SHORTCODES_COLLECTION, code);

      // Write three things atomically:
      //   - scanCount (canonical total)
      //   - lastScannedAt (for "most recent scan" stat)
      //   - dailyScans.YYYY-MM-DD += 1 (rolled-up sparkline bucket)
      //
      // The dailyScans map lives on the parent doc so the admin
      // dashboard can render 30-day sparklines for the top-50 codes
      // without fan-out reads into each code's scanEvents subcollection.
      // Map size is bounded - a year of daily keys is ~5 KB, well
      // under Firestore's 1 MB doc limit.
      const today = new Date().toISOString().slice(0, 10);
      await updateDoc(docRef, {
        scanCount: increment(1),
        lastScannedAt: new Date().toISOString(),
        [`dailyScans.${today}`]: increment(1),
      });
    } catch (error) {
      // Log but don't throw - analytics shouldn't break the user experience
      console.error("Failed to increment scan count:", error);
    }
  }

  async getAnalytics(code: string): Promise<ShortCodeRecord | null> {
    const firestore = await this.ensureFirestore();
    const docRef = doc(firestore, SHORTCODES_COLLECTION, code);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return null;
    }

    const data = docSnap.data() as {
      sequence: string;
      createdAt: string;
      createdBy: string;
      scanCount: number;
      sequenceName?: string;
    };

    return {
      sequence: data.sequence,
      createdAt: new Date(data.createdAt),
      createdBy: data.createdBy,
      scanCount: data.scanCount,
      sequenceName: data.sequenceName,
    };
  }

  async logScanEvent(
    code: string,
    event: {
      printId: string | null;
      country: string | null;
      city: string | null;
      userAgent: string;
      screenWidth: number;
      screenHeight: number;
      referrer: string | null;
      userId: string | null;
      deviceId: string;
      lat?: number | null;
      lng?: number | null;
      /** Deck attribution, straight off the resolved shortcode record. Optional
       *  like lat/lng so the viewer-drawer and /sequence callers (which have no
       *  record in hand) stay unchanged. Durable counterpart to the deck_id on
       *  the PostHog `card_scanned` event — PostHog history can never be
       *  rewritten, Firestore scanEvents can. */
      deckId?: string | null;
      deckName?: string | null;
      /** Resolved from the scanned URL before persistence. These values belong
       * to this physical scan, unlike the shared shortcode record. */
      leftPropType?: string | null;
      rightPropType?: string | null;
      catDogMode?: boolean | null;
    }
  ): Promise<void> {
    try {
      const firestore = await this.ensureFirestore();
      const eventsRef = collection(
        firestore,
        SHORTCODES_COLLECTION,
        code,
        "scanEvents"
      );
      await addDoc(eventsRef, {
        ...event,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Failed to log scan event:", error);
    }
  }

  /**
   * Write the PII-free public journey projection for a scan. Separate from
   * logScanEvent (which is admin-only and carries deviceId/userAgent/referrer)
   * so the scanner-facing journey can be read publicly without exposing
   * fingerprinting data. Fire-and-forget — never blocks the scan UX.
   */
  async logJourneyPoint(
    code: string,
    point: {
      printId: string | null;
      lat: number | null;
      lng: number | null;
      city: string | null;
      country: string | null;
    }
  ): Promise<void> {
    try {
      const firestore = await this.ensureFirestore();
      const ref = collection(
        firestore,
        SHORTCODES_COLLECTION,
        code,
        "journeyPoints"
      );
      await addDoc(ref, {
        ...point,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Failed to log journey point:", error);
    }
  }
}
