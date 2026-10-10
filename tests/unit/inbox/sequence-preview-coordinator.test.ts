import { describe, expect, it } from "vitest";
import { createSequencePreviewCoordinator } from "#lib/shared/inbox/state/sequence-preview-coordinator.svelte.js";

function setup() {
  const availableIds = new Set(["older", "latest"]);
  const coordinator = createSequencePreviewCoordinator({
    isMessageAvailable: (messageId) => availableIds.has(messageId),
  });

  return {
    coordinator,
    availableIds,
  };
}

describe("sequence preview coordinator", () => {
  it("starts with every sequence in its Choreo Card state", () => {
    const { coordinator } = setup();

    expect(coordinator.activeMessageId).toBeNull();
    expect(coordinator.isPlaybackActive("latest")).toBe(false);
    expect(coordinator.isPlayerMounted("older")).toBe(false);
  });

  it("moves the single playback slot when another card is selected", () => {
    const { coordinator } = setup();

    coordinator.requestPlayback("older");
    expect(coordinator.activeMessageId).toBe("older");
    expect(coordinator.isPlayerMounted("older")).toBe(true);
    expect(coordinator.isPlayerMounted("latest")).toBe(false);

    coordinator.requestPlayback("latest");
    expect(coordinator.activeMessageId).toBe("latest");
    expect(coordinator.isPlayerMounted("older")).toBe(false);
    expect(coordinator.isPlayerMounted("latest")).toBe(true);
  });

  it("releases the slot when its selected message is no longer renderable", () => {
    const { coordinator, availableIds } = setup();

    coordinator.requestPlayback("older");
    availableIds.delete("older");
    expect(coordinator.activeMessageId).toBeNull();
    expect(coordinator.isPlayerMounted("older")).toBe(false);

    coordinator.requestPlayback("missing");
    expect(coordinator.activeMessageId).toBeNull();
  });

  it("clears thread-specific ownership on reset", () => {
    const { coordinator } = setup();

    coordinator.requestPlayback("older");
    coordinator.reset();

    expect(coordinator.activeMessageId).toBeNull();
    expect(coordinator.isPlayerMounted("older")).toBe(false);
  });
});
