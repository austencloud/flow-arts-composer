import { describe, expect, it } from "vitest";
import {
  GENERIC_UPDATE_MESSAGE,
  releaseUpdateMessage,
  updateReadyMessage,
} from "./update-ready-copy";

// The reload prompt must always appear with working words: the release
// lookup may only upgrade them, never delay or break the prompt.
describe("updateReadyMessage", () => {
  it("names a release the deploy carries", async () => {
    expect(await updateReadyMessage("0.50.0", async () => "0.51.0")).toBe(
      releaseUpdateMessage("0.51.0")
    );
  });

  it("keeps the plain words for a deploy with no new release", async () => {
    expect(await updateReadyMessage("0.51.0", async () => "0.51.0")).toBe(
      GENERIC_UPDATE_MESSAGE
    );
  });

  it("keeps the plain words when the lookup fails or hangs", async () => {
    expect(
      await updateReadyMessage("0.50.0", async () => {
        throw new Error("offline");
      })
    ).toBe(GENERIC_UPDATE_MESSAGE);
    expect(
      await updateReadyMessage("0.50.0", () => new Promise(() => {}), 5)
    ).toBe(GENERIC_UPDATE_MESSAGE);
  });
});
