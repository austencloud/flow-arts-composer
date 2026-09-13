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

  it("dispatches one live command by its inspected ID and reports its completion", async () => {
    document.body.innerHTML = `<p id="path"></p><button id="control"></button><iframe id="preview"></iframe><p id="status"></p><p id="served"></p>`;
    const preview = document.querySelector<HTMLIFrameElement>("#preview")!;
    const frame = document.implementation.createHTMLDocument("preview");
    frame.body.innerHTML = `<input id="speed" type="range" aria-label="Speed 0.5" min="0.1" max="2" step="0.1">`;
    Object.defineProperty(preview, "contentDocument", { value: frame });
    Object.defineProperty(preview, "contentWindow", { value: { location: { href: "http://localhost/test/hand-tunnel?reviewRevision=0" } } });
    const intervals: (() => void)[] = [];
    vi.spyOn(window, "setInterval").mockImplementation((callback) => { intervals.push(callback as () => void); return 0 as unknown as number; });
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
    sessionStorage.setItem("tka-phone-review-client-id", "review-test");
    const speed = frame.querySelector<HTMLInputElement>("#speed")!;
    let changes = 0;
    speed.addEventListener("change", () => changes++);
    const reports: unknown[] = [];
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(url);
      if (url.includes("phone-review-target")) return new Response(JSON.stringify({ target: { path: "/test/hand-tunnel", revision: 0 }, served: {}, stateError: false }));
      if (url.includes("phone-review-command")) {
        return new Response(JSON.stringify({ command: { id: "once", kind: "set", clientId: "review-test", expectedRoute: "/test/hand-tunnel", controlId: "speed", controlName: "Speed 0.5", value: "0.7", createdAt: new Date(Date.now() + 100).toISOString(), expiresAt: new Date(Date.now() + 10_000).toISOString() } }));
      }
      reports.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ ok: true }));
    }));
    new Function(script)();
    await new Promise((resolve) => setTimeout(resolve, 20));
    intervals[1]!();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(calls.some((url) => url.includes("phone-review-command"))).toBe(true);
    expect(reports).toEqual(expect.arrayContaining([expect.objectContaining({ result: expect.objectContaining({ status: "completed" }) })]));
    expect(speed.value).toBe("0.7");
    expect(changes).toBe(1);
    expect(reports.some((report: any) => report.result?.status === "completed")).toBe(true);
  });
});
