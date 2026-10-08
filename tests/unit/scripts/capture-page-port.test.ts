import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCdpPage } from "../../../scripts/feature-video/capture/cdp-page.mjs";
import { createCodexPage } from "../../../scripts/feature-video/capture/codex-page.mjs";

type Call = [string, Record<string, unknown>];

/** A CDP client that runs Runtime.evaluate in the jsdom this test runs in. */
function jsdomClient() {
  const calls: Call[] = [];
  return {
    calls,
    async send(method: string, params: Record<string, unknown> = {}) {
      calls.push([method, params]);
      if (method === "Runtime.evaluate") {
        try {
          return { result: { value: (0, eval)(String(params.expression)) } };
        } catch (error) {
          return {
            exceptionDetails: { exception: { description: String(error) } },
          };
        }
      }
      return {};
    },
  };
}

describe("createCdpPage", () => {
  const original = Element.prototype.getBoundingClientRect;
  beforeEach(() => {
    Element.prototype.getBoundingClientRect = () =>
      ({
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        top: 0,
        left: 0,
        right: 10,
        bottom: 10,
      }) as DOMRect;
    document.body.innerHTML =
      '<label>Zoom <input id="zoom" type="number" aria-label="Zoom"></label>' +
      '<input id="other" type="number" aria-label="Other">';
  });
  afterEach(() => {
    Element.prototype.getBoundingClientRect = original;
    document.body.innerHTML = "";
  });

  it("runs a function in the page with an argument and returns its value", async () => {
    const page = createCdpPage(jsdomClient());
    expect(await page.evaluate((n: number) => n * 2, 21)).toBe(42);
  });

  it("throws what the page threw", async () => {
    const page = createCdpPage(jsdomClient());
    await expect(
      page.evaluate(() => {
        throw new Error("nope");
      })
    ).rejects.toThrow(/nope/);
  });

  it("focuses the field with that label, types into it and presses the commit key", async () => {
    const client = jsdomClient();
    const page = createCdpPage(client);
    await page.fillByRole({
      role: "spinbutton",
      name: "Zoom",
      value: 1.4,
      commitKey: "Tab",
    });
    expect(document.activeElement?.id).toBe("zoom");
    const methods = client.calls.map(([method]) => method);
    expect(methods).toEqual([
      "Runtime.evaluate",
      "Input.insertText",
      "Input.dispatchKeyEvent",
      "Input.dispatchKeyEvent",
    ]);
    expect(client.calls[1]?.[1]).toEqual({ text: "1.4" });
    expect(client.calls[2]?.[1]).toMatchObject({
      type: "keyDown",
      key: "Tab",
      windowsVirtualKeyCode: 9,
    });
    expect(client.calls[3]?.[1]).toMatchObject({ type: "keyUp", key: "Tab" });
  });

  it("names the field it could not find", async () => {
    const page = createCdpPage(jsdomClient());
    await expect(
      page.fillByRole({ role: "spinbutton", name: "Missing", value: 1 })
    ).rejects.toThrow('No visible spinbutton named "Missing"');
  });

  it("refuses a commit key it does not know", async () => {
    const page = createCdpPage(jsdomClient());
    await expect(
      page.fillByRole({
        role: "spinbutton",
        name: "Zoom",
        value: 1,
        commitKey: "F13",
      })
    ).rejects.toThrow(/F13/);
  });

  it("reports the url and a snapshot", async () => {
    const page = createCdpPage(jsdomClient());
    expect(await page.url()).toContain("http");
    const snapshot = await page.snapshot();
    expect(snapshot.controls).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: "Zoom" })])
    );
  });
});

describe("createCodexPage", () => {
  it("maps the port onto the Codex runtime tab", async () => {
    const press = vi.fn();
    const fill = vi.fn();
    const getByRole = vi.fn(() => ({ fill, press }));
    const tab = {
      url: async () => "https://localhost:5173/post",
      playwright: {
        evaluate: vi.fn(async (fn: (n: number) => number, arg: number) =>
          fn(arg)
        ),
        getByRole,
        domSnapshot: async () => "- main",
      },
    };
    const page = createCodexPage(tab);
    expect(await page.evaluate((n: number) => n + 1, 1)).toBe(2);
    await page.fillByRole({
      role: "spinbutton",
      name: "Zoom",
      value: 1.4,
      commitKey: "Tab",
    });
    expect(getByRole).toHaveBeenCalledWith("spinbutton", {
      name: "Zoom",
      exact: true,
    });
    expect(fill).toHaveBeenCalledWith("1.4");
    expect(press).toHaveBeenCalledWith("Tab");
    expect(await page.url()).toBe("https://localhost:5173/post");
    expect(await page.snapshot()).toBe("- main");
  });
});
