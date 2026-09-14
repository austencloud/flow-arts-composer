import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import { getTikaModelDefinition } from "../../../tika/domain/tika-model-catalog";
import { TikaModelProvider } from "../../../tika/services/tika-model-provider";

/**
 * Model selection for the Stage director only. The chat picker in
 * tika-model-catalog stays hosted-only; a local model is a per-machine
 * setting, reachable from the server the desktop app runs, never from the
 * deployed edge.
 *
 * Keys: any TIKA catalog key, "ollama" for the default local model, or
 * "ollama:<model>" for another pulled model.
 */
export const DEFAULT_OLLAMA_DIRECTOR_MODEL = "qwen3-coder:30b";

/**
 * Greedy decoding with a fixed seed: the same words produce the same plan on
 * the same machine. The hosted Claude models reject temperature outright, so
 * this is the only model-backed deterministic path.
 */
export const OLLAMA_DETERMINISTIC_DECODING = {
  seed: 7,
  temperature: 0,
} as const;

export interface TikaDirectorModelEnv {
  anthropicApiKey?: string;
  /** Ollama server origin, e.g. http://127.0.0.1:11434. */
  ollamaBaseUrl?: string;
  /** Test seam only. */
  fetch?: typeof fetch;
}

export function isOllamaDirectorModel(key: string): boolean {
  return key === "ollama" || key.startsWith("ollama:");
}

export function ollamaDirectorModelId(key: string): string {
  return key.startsWith("ollama:")
    ? key.slice("ollama:".length)
    : DEFAULT_OLLAMA_DIRECTOR_MODEL;
}

export function isTikaDirectorModelConfigured(
  key: string,
  env: TikaDirectorModelEnv
): boolean {
  if (isOllamaDirectorModel(key)) return Boolean(env.ollamaBaseUrl);
  const definition = getTikaModelDefinition(key);
  if (!definition) return false;
  return definition.provider === "anthropic"
    ? Boolean(env.anthropicApiKey)
    : false;
}

export function createTikaDirectorModel(
  key: string,
  env: TikaDirectorModelEnv
): LanguageModel {
  if (!isOllamaDirectorModel(key)) {
    return new TikaModelProvider(env.anthropicApiKey ?? "", "").getModel(key);
  }
  if (!env.ollamaBaseUrl) {
    throw new Error(
      `TIKA director model "${key}" needs OLLAMA_BASE_URL to be set.`
    );
  }
  const ollama = createOpenAICompatible({
    name: "ollama",
    baseURL: `${env.ollamaBaseUrl.replace(/\/+$/, "")}/v1`,
    // Ollama constrains decoding to the JSON schema itself, so the plan can
    // never be malformed; the hosted models rely on a tool schema instead.
    supportsStructuredOutputs: true,
    transformRequestBody: (body) => ({
      ...body,
      ...OLLAMA_DETERMINISTIC_DECODING,
    }),
    fetch: env.fetch,
  });
  return ollama(ollamaDirectorModelId(key));
}
