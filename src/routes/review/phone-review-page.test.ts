import { afterEach, describe, expect, it, vi } from "vitest";
import { _reviewDocument } from "./+server";

const script = _reviewDocument.match(/<script>([\s\S]*?)<\/script>/)?.[1];
if (!script)
  throw new Error("Phone review document is missing its client script");

describe("phone review page", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
    localStorage.clear();
  });

  it("does not replace a paused preview when an earlier poll finishes", async () => {
    document.body.innerHTML = `
      <p id="path"></p><button id="control"></button><iframe id="preview"></iframe>
      <p id="status"></p><p id="served"></p>`;
    vi.spyOn(window, "setInterval").mockReturnValue(0 as unknown as number);

    let resolveResponse: ((response: Response) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveResponse = resolve;
          })
      )
    );
    new Function(script)();

    document.querySelector<HTMLButtonElement>("#control")?.click();
    resolveResponse?.(
      new Response(
        JSON.stringify({
          target: {
            path: "/browse",
            revision: 1,
            updatedAt: "2026-09-13T12:00:00.000Z",
          },
          served: { branch: "main", commit: "cb4d4210" },
          stateError: false,
        })
      )
    );
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(document.querySelector("#path")?.textContent).toBe("/create");
    expect(document.querySelector("#preview")?.getAttribute("src")).toContain(
      "/create?reviewRevision=0"
    );
  });
});
