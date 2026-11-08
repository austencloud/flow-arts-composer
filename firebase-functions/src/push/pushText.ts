/**
 * Text a person wrote (a display name, a group name, a message) goes onto
 * someone else's lock screen. Keep it to one tidy line of bounded length: no
 * newlines or control characters that could fake a second notification line,
 * and no 10,000-character "name".
 *
 * Pure, with no imports, so the app's unit tests can load it directly.
 */

export const PUSH_NAME_MAX = 40;
export const PUSH_BODY_MAX = 180;

// C0 and C1 controls, DEL, and the Unicode line and paragraph separators.
// Built from code points so no invisible character sits in the source.
const char = String.fromCharCode;
const CONTROL_CHARACTERS = new RegExp(
  `[${char(0x00)}-${char(0x1f)}${char(0x7f)}-${char(0x9f)}${char(0x2028)}${char(0x2029)}]+`,
  "g"
);

function clip(text: string, max: number): string {
  const characters = Array.from(text); // whole code points, never half an emoji
  if (characters.length <= max) return text;
  return `${characters.slice(0, max - 1).join("").trimEnd()}…`;
}

/** One line, spaces collapsed, at most `max` characters; "" when nothing is left. */
export function cleanPushText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const oneLine = value
    .replace(CONTROL_CHARACTERS, " ")
    .replace(/\s+/g, " ")
    .trim();
  return clip(oneLine, max);
}

/** A person's name for a push, or the fallback when it is empty. */
export function cleanPushName(value: unknown, fallback = "Someone"): string {
  return cleanPushText(value, PUSH_NAME_MAX) || fallback;
}
