import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIKA_MODEL,
  getConfiguredTikaModels,
  getTikaModelDefinition,
  resolveTikaModelKey,
} from "#lib/features/tika/domain/tika-model-catalog.js";
import { TikaModelProvider } from "#lib/features/tika/services/tika-model-provider.js";

describe("TIKA model selection", () => {
  it("defaults to the lower-cost model without changing a saved Sonnet tier", () => {
    expect(DEFAULT_TIKA_MODEL).toBe("haiku");
    expect(resolveTikaModelKey("sonnet-4")).toBe("sonnet-5");
    expect(resolveTikaModelKey("sonnet-4-legacy")).toBe("sonnet-5");
    expect(getTikaModelDefinition("sonnet-4-legacy")?.modelId).toBe(
      "claude-sonnet-5"
    );
  });

  it("never turns an unknown key into a billed model selection", () => {
    expect(resolveTikaModelKey("missing-model")).toBeNull();
    expect(() =>
      new TikaModelProvider("test", "test").getModel("missing-model")
    ).toThrow("Unknown TIKA model");
  });

  it("shows only configured providers and uses the current DeepSeek API ID", () => {
    expect(
      getConfiguredTikaModels({ anthropic: false, deepseek: true }).map(
        (model) => model.id
      )
    ).toEqual(["deepseek"]);
    expect(
      getConfiguredTikaModels({ anthropic: true, deepseek: false }).map(
        (model) => model.id
      )
    ).toEqual(["haiku", "sonnet-5"]);
    expect(
      getConfiguredTikaModels({ anthropic: false, deepseek: false })
    ).toEqual([]);
    expect(
      new TikaModelProvider("test", "test").getModel("deepseek").modelId
    ).toBe("deepseek-v4-flash");
  });
});
