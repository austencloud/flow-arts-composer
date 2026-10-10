import { describe, it, expect, vi } from "vitest";
import { buildCardDescriptors } from "../card-configurator";
import { DifficultyLevel } from "../../domain/models/generate-models";
import type { UIGenerationConfig } from "../../utils/config-mapper";
import type { CardHandlers } from "#lib/shared/create/domain/generator-contract-types.js";

/**
 * In spell mode the length card's `currentLength` is the word's own natural
 * length, and the handler can only raise it via `spellTargetLength` — it can
 * never shrink the word below the tier cap. LengthCard's clamp effect must be
 * turned off for that host, or it asks for a correction nobody can make.
 * See LengthCard.svelte.test.ts for what happened when it did.
 */
function makeConfig(over: Partial<UIGenerationConfig> = {}): UIGenerationConfig {
  return {
    length: 16,
    level: 2,
    turnIntensity: 1,
    loopEnabled: false,
    ...over,
  } as UIGenerationConfig;
}

function makeHandlers(over: Partial<CardHandlers> = {}): CardHandlers {
  return {
    handleLengthChange: vi.fn(),
    handleSpellLengthChange: vi.fn(),
    ...over,
  } as unknown as CardHandlers;
}

function lengthCardProps(
  handlers: CardHandlers,
  config = makeConfig()
): Record<string, unknown> {
  const cards = buildCardDescriptors(
    config,
    DifficultyLevel.INTERMEDIATE,
    !handlers.wordInputValue?.trim(),
    handlers,
    [0, 1],
    false,
    false,
    config.loopEnabled
  );
  const length = cards.find((c) => c.id === "length");
  expect(length, "length card should always be present").toBeDefined();
  return length!.props as Record<string, unknown>;
}

describe("card-configurator length card clamp contract", () => {
  it("disables the tier clamp in spell mode", () => {
    const props = lengthCardProps(makeHandlers({ wordInputValue: "AUSTEN" }));

    expect(props.clampToMax).toBe(false);
  });

  it("leaves the clamp on in freeform, where the parent owns length", () => {
    const props = lengthCardProps(makeHandlers({ wordInputValue: "" }));

    // Freeform relies on the default (true); it must not be turned off.
    expect(props.clampToMax).not.toBe(false);
  });

  it("routes spell-mode length changes to the spell handler", () => {
    const handlers = makeHandlers({ wordInputValue: "AUSTEN" });
    const props = lengthCardProps(handlers);

    expect(props.onLengthChange).toBe(handlers.handleSpellLengthChange);
  });
});
