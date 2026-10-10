import {
  MAX_IMAGE_BYTES,
  isAllowedImageType,
} from "#lib/shared/inbox/domain/image-attachment-limits.js";
import type {
  IntakeProblem,
  SharedFileDescriptor,
} from "../domain/share-intake-models";

/**
 * Boundary checks for content arriving from ANY app on the device.
 *
 * Scope limit, stated honestly: on native the plugin has already copied the
 * bytes to cacheDir/shared_files before we are notified, with no size or count
 * limit. This gate protects IndexedDB, the QR decoder, and the uploader. It
 * cannot protect the disk. That is an accepted cost of using the plugin
 * unmodified (see the spec's Spike results).
 */

/** Same cap as the picker, imported rather than re-declared. */
export const MAX_INTAKE_BYTES = MAX_IMAGE_BYTES;
export const MAX_INTAKE_FILES = 20;
export const MAX_INTAKE_TEXT = 2000;
export const MAX_INTAKE_TITLE = 200;
export const MAX_INTAKE_NAME = 120;

const FALLBACK_NAME = "shared-image";
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

/**
 * Normalize a sender-supplied filename.
 *
 * The plugin writes the sender's name verbatim into its cache dir with no
 * sanitization, so "../" and control bytes are both possible. We never reuse
 * the raw name for a filesystem write, but it DOES reach the message
 * attachment and the rejection list the user reads, so it is normalized on the
 * way in - including on the rejection path, which the first draft skipped.
 */
export function safeName(raw: string): string {
  const base = (raw.split(/[/\\]/).pop() ?? "")
    .replace(CONTROL_CHARS, "")
    .trim();

  // "." and ".." survive the split above and are not names.
  if (base.length === 0 || /^\.+$/.test(base)) return FALLBACK_NAME;
  if (base.length <= MAX_INTAKE_NAME) return base;

  // Keep a short trailing extension so the truncated name still reads as an
  // image rather than as a hash.
  const dot = base.lastIndexOf(".");
  const ext = dot > 0 && base.length - dot <= 6 ? base.slice(dot) : "";
  return base.slice(0, MAX_INTAKE_NAME - ext.length) + ext;
}

function cleanText(raw: string, cap: number): { value: string; truncated: boolean } {
  const cleaned = raw.replace(CONTROL_CHARS, "").trim();
  return cleaned.length > cap
    ? { value: cleaned.slice(0, cap), truncated: true }
    : { value: cleaned, truncated: false };
}

export interface DescriptorScreen {
  admitted: SharedFileDescriptor[];
  problems: IntakeProblem[];
}

/**
 * Pre-bridge screen: mime type and count only, because those are the two
 * things knowable WITHOUT reading the file. Running this first is what stops a
 * 200 MB share from being pulled into WebView memory just to be rejected.
 *
 * Order is load-bearing: the type check runs before the count cap, so the 21st
 * HEIC is reported as unsupported-type rather than as too-many, which is what
 * the user actually needs to be told.
 */
export function screenDescriptors(
  descriptors: SharedFileDescriptor[]
): DescriptorScreen {
  const admitted: SharedFileDescriptor[] = [];
  const problems: IntakeProblem[] = [];

  for (const descriptor of descriptors) {
    const name = safeName(descriptor.name);

    if (!isAllowedImageType(descriptor.mimeType)) {
      problems.push({
        name,
        reason: "unsupported-type",
        detail: descriptor.mimeType,
      });
      continue;
    }
    if (admitted.length >= MAX_INTAKE_FILES) {
      problems.push({ name, reason: "too-many" });
      continue;
    }
    admitted.push({ ...descriptor, name });
  }

  return { admitted, problems };
}

export interface ValidationResult {
  accepted: File[];
  problems: IntakeProblem[];
  text: string | null;
  title: string | null;
}

/**
 * Post-bridge gate: everything that needs real bytes.
 *
 * `title` comes from Android's EXTRA_SUBJECT - unbounded, sender-controlled,
 * and persisted. The first draft validated the text and left the title
 * unchecked; both are capped here.
 */
export function validateIntake(input: {
  files: File[];
  text?: string;
  title?: string;
}): ValidationResult {
  const accepted: File[] = [];
  const problems: IntakeProblem[] = [];

  for (const file of input.files) {
    const name = safeName(file.name);

    if (!isAllowedImageType(file.type)) {
      problems.push({ name, reason: "unsupported-type", detail: file.type });
      continue;
    }
    if (file.size <= 0) {
      problems.push({ name, reason: "empty" });
      continue;
    }
    if (file.size > MAX_INTAKE_BYTES) {
      problems.push({ name, reason: "too-large", detail: `${file.size} bytes` });
      continue;
    }
    if (accepted.length >= MAX_INTAKE_FILES) {
      problems.push({ name, reason: "too-many" });
      continue;
    }

    accepted.push(
      name === file.name ? file : new File([file], name, { type: file.type })
    );
  }

  let text: string | null = null;
  if (input.text) {
    const cleaned = cleanText(input.text, MAX_INTAKE_TEXT);
    text = cleaned.value.length > 0 ? cleaned.value : null;
    // Truncation used to be silent. A share whose link sat at character 2100
    // simply stopped resolving with no trace of why.
    if (cleaned.truncated) problems.push({ name: "", reason: "text-truncated" });
  }

  let title: string | null = null;
  if (input.title) {
    const cleaned = cleanText(input.title, MAX_INTAKE_TITLE);
    title = cleaned.value.length > 0 ? cleaned.value : null;
    if (cleaned.truncated) problems.push({ name: "", reason: "title-truncated" });
  }

  return { accepted, problems, text, title };
}
