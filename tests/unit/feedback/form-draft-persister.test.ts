// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FormDraftPersister } from "#lib/features/feedback/services/form-draft-persister.svelte.js";

describe("FormDraftPersister", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it("flushes the latest keystrokes before the debounce completes", () => {
    const persister = new FormDraftPersister();
    persister.scheduleSave({
      type: "bug",
      title: "Reload",
      description: "The final words must survive",
    });

    persister.flushPendingSave();

    expect(
      JSON.parse(localStorage.getItem("tka-feedback-draft") ?? "null")
    ).toEqual(
      expect.objectContaining({
        formData: {
          type: "bug",
          title: "Reload",
          description: "The final words must survive",
        },
      })
    );
    expect(persister.saveStatus).toBe("saved");
  });

  it("keeps a pending draft available after timer cancellation", () => {
    const persister = new FormDraftPersister();
    persister.scheduleSave({
      type: "bug",
      title: "Reload",
      description: "Still pending",
    });
    persister.cancelPendingSave();

    persister.flushPendingSave();

    expect(localStorage.getItem("tka-feedback-draft")).toContain(
      "Still pending"
    );
  });
});
