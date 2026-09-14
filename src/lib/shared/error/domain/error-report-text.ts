import type { AppError } from "./error-models";

export function formatParamValue(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => typeof item === "string" || typeof item === "number")
  ) {
    return value.join(", ");
  }
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

export function formatParamLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

export function buildErrorCopyText(error: AppError | null): string {
  if (!error) return "";
  const additionalData = error.context.additionalData;
  const lines: string[] = [];
  lines.push(`Error: ${error.message}`);
  if (error.context.module) lines.push(`Module: ${error.context.module}`);
  if (error.context.tab) lines.push(`Tab: ${error.context.tab}`);
  if (error.context.action) lines.push(`Action: ${error.context.action}`);
  if (additionalData) {
    lines.push("");
    lines.push("Parameters:");
    for (const [key, value] of Object.entries(additionalData)) {
      const display = formatParamValue(value);
      lines.push(`  ${formatParamLabel(key)}: ${display}`);
    }
  }
  if (error.technicalDetails) {
    lines.push("");
    lines.push(`Details: ${error.technicalDetails}`);
  }
  if (error.stack) {
    lines.push("");
    lines.push(error.stack);
  }
  return lines.join("\n");
}
