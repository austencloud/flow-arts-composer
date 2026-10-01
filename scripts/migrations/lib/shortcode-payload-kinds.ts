/**
 * Payload kinds the shortcode label audit understands (parity-repair spec,
 * phase 5). `backfill-shortcode-words.ts` derives a TKA word only for word
 * payloads; every other kind the mint paths produce needs its own rule here,
 * and a kind with no rule is reported as UNKNOWN_PAYLOAD_KIND instead of
 * being run through word derivation.
 *
 * 2026-09-30: the six hand-path reference cards minted on 2026-09-05 had no
 * rule, so the engine derived TKA words from their hand paths and reported
 * four as LEGACY_PAYLOAD_VERSION and two as PAYLOAD_INCOMPLETE for 25 days.
 * Applying the label repair would have stamped a word and schema 2 onto them.
 */
import { HAND_PATH_SHORTCODE_PAYLOAD_SCHEMA_VERSION } from "../../../src/lib/shared/qr/services/hand-path-short-code-payload";
import { hydrateSelfContainedShortCodePayload } from "../../../src/lib/shared/qr/services/short-code-payload-hydrator";
import type { ShortCodeData } from "../../../src/lib/shared/qr/services/types";

/** Classes the scheduled audit treats as healthy. */
export const CURRENT_SHORTCODE_CLASSES: ReadonlySet<string> = new Set([
  "LABELS_CURRENT",
  "SOLO_CURRENT",
  "HAND_PATH_CURRENT",
]);

export function isCurrentShortcodeClass(cls: string): boolean {
  return CURRENT_SHORTCODE_CLASSES.has(cls);
}

/** Kinds that take the TKA word derivation path. Absent means word. */
export function isWordPayloadKind(payloadKind: unknown): boolean {
  return payloadKind === undefined || payloadKind === "word";
}

/**
 * Validate a hand-path record against the envelope
 * `buildHandPathShortCodePayload` mints, then hydrate it through the same
 * self-contained resolver `/q/[code]` uses. Returns null when the record is
 * current, or the first reason it is not.
 */
export async function validateHandPathRecord(
  code: string,
  data: Record<string, unknown>
): Promise<string | null> {
  if (
    data.payloadSchemaVersion !== HAND_PATH_SHORTCODE_PAYLOAD_SCHEMA_VERSION
  ) {
    return `hand-path payloadSchemaVersion must be ${HAND_PATH_SHORTCODE_PAYLOAD_SCHEMA_VERSION}`;
  }
  if (typeof data.payloadTitle !== "string" || data.payloadTitle.length === 0) {
    return "hand-path payloadTitle is missing";
  }
  if (
    data.payloadWord !== "" ||
    data.sequence !== "" ||
    data.sequenceName !== ""
  ) {
    return "hand-path record carries a TKA word label";
  }
  const stepCount = data.payloadStepCount;
  if (!Number.isInteger(stepCount) || Number(stepCount) <= 0) {
    return "hand-path payloadStepCount is invalid";
  }
  const sequence = await hydrateSelfContainedShortCodePayload(
    code,
    data as unknown as ShortCodeData
  );
  if (!sequence) {
    return "hand-path payload does not hydrate to a playable hand-path sequence";
  }
  return null;
}
