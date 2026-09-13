import type { GenerationOptions } from "$lib/shared/foundation/domain/models/generation/generate-models";
import type { UIGenerationConfig } from "./config-mapper";

export function captureGenerationErrorContext(
  options: Partial<GenerationOptions>,
  uiConfig?: UIGenerationConfig
): Record<string, unknown> {
  // Keep the attempt's settings even if Customize changes while it runs.
  // Capture the whole request so new controls cannot silently escape reports.
  return JSON.parse(
    JSON.stringify({ ...options, uiConfig }, (_key, value: unknown) => {
      if (value instanceof Map) return Object.fromEntries(value);
      return value === undefined ? null : value;
    })
  ) as Record<string, unknown>;
}
