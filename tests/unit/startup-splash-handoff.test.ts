import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it } from "vitest";

const template = readFileSync("src/app.html", "utf8");
const loadingScript = [...template.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map((match) => match[1])
  .find((script) => script?.includes("var __tkaFinished = false"));
let page: JSDOM | undefined;

afterEach(() => page?.window.close());

describe("startup splash handoff", () => {
  it("releases the shell immediately and ignores child transition events", () => {
    expect(loadingScript).toBeDefined();
    page = new JSDOM(
      '<div id="app-loading"><div id="loading-bar-fill"></div><p id="loading-text"></p></div>',
      { url: "https://localhost/create/construct", runScripts: "outside-only" }
    );
    page.window.eval(loadingScript!);
    const screen = page.window.document.getElementById("app-loading")!;
    const text = page.window.document.getElementById("loading-text")!;
    const initialText = text.textContent;

    page.window.eval('window.__tkaLoadProgress(100, "Opening workspace...")');
    // The real inline script must release input synchronously, without a
    // celebratory message or another timer before the exit transition begins.
    expect(screen.classList.contains("loaded")).toBe(true);
    expect(text.textContent).toBe(initialText);
    text.dispatchEvent(
      new page.window.Event("transitionend", { bubbles: true })
    );
    expect(screen.isConnected).toBe(true);
    screen.dispatchEvent(new page.window.Event("transitionend"));
    expect(screen.isConnected).toBe(false);

    // Late initialization checkpoints cannot resurrect the loading screen.
    page.window.eval('window.__tkaLoadProgress(80, "Loading...")');
    expect(page.window.document.getElementById("app-loading")).toBeNull();
  });
});
