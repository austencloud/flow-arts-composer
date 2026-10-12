/**
 * Paths the motion scanner never reads: the owners themselves and the token
 * source. Everything else in src/ is feature code and must use the owners.
 */
export const SKIP = (file: string): boolean =>
  file.startsWith("lib/shared/transitions/") || file === "app.css";
