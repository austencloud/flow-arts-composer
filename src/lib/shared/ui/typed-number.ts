/**
 * Reading what someone typed into a value box. People type "120", "120%",
 * "-4.5°", "1,5" or "−2": a comma counts as the decimal point, a typographic
 * minus or dash as a minus, and the first number wins.
 */

/** A typed value with its decimal comma and typographic minus made plain. */
export function normalizeTyped(typed: string): string {
  return typed
    .trim()
    .replace(/[−‒–—]/g, "-")
    .replace(/,/g, ".");
}

const NUMBER = /[-+]?(?:\d+(?:\.\d*)?|\.\d+)/;

/** The first number in what was typed, or null when there is none. */
export function parseTypedNumber(typed: string): number | null {
  const match = NUMBER.exec(normalizeTyped(typed));
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isFinite(value) ? value : null;
}

/**
 * A shown reading split for typing: the number to start from and the unit
 * after it, so "120%" opens as "120" with "%" beside the field. A reading
 * with no number opens as itself.
 */
export function splitReading(text: string): { draft: string; unit: string } {
  const plain = normalizeTyped(text);
  const match = NUMBER.exec(plain);
  if (!match) return { draft: text.trim(), unit: "" };
  return {
    draft: match[0],
    unit: plain.slice(match.index + match[0].length).trim(),
  };
}
