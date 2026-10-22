/**
 * Short, log-safe description of an image source for error messages.
 *
 * Loader failures used to read "Failed to load SVG image" with nothing to
 * say which image failed. A URL is shown as-is (truncated); a data: URI or
 * raw SVG markup is summarised so a megabyte body never lands in an error
 * message or an error-tracking payload.
 */
const MAX_SOURCE_LENGTH = 120;

export function describeImageSource(source: unknown): string {
  if (typeof source !== "string" || source.length === 0) {
    return "unknown source";
  }
  if (source.startsWith("data:")) {
    const comma = source.indexOf(",");
    const header = source.slice(0, comma === -1 ? 40 : Math.min(comma, 60));
    return `${header} (${source.length} chars)`;
  }
  const trimmed = source.trimStart();
  if (trimmed.startsWith("<")) {
    const head = trimmed.slice(0, 80).replace(/\s+/g, " ");
    return `inline markup ${head}... (${source.length} chars)`;
  }
  return source.length > MAX_SOURCE_LENGTH
    ? `${source.slice(0, MAX_SOURCE_LENGTH)}...`
    : source;
}
