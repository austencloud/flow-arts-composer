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
  it.each([
    { cookie: "", languages: ["de-DE", "en"], german: true },
    { cookie: "PARAGLIDE_LOCALE=de", languages: ["en"], german: true },
    { cookie: "PARAGLIDE_LOCALE=en", languages: ["de-DE"], german: false },
    {
      cookie: "PARAGLIDE_LOCALE=invalid",
      languages: ["nl", "de-AT"],
      german: true,
    },
  ])(
    "honors the saved or supported browser language before app boot: $cookie / $languages",
    ({ cookie, languages, german }) => {
      page = new JSDOM(
        '<div id="app-loading" aria-label="Loading Flow Arts Composer"><div id="loading-bar-fill"></div><p id="loading-text"></p></div>',
        {
          url: "https://localhost/create/construct",
          runScripts: "outside-only",
        }
      );
      page.window.document.cookie = cookie;
      Object.defineProperty(page.window.navigator, "languages", {
        value: languages,
      });
      page.window.eval(loadingScript!);
      expect(
        page.window.document.getElementById("loading-text")!.textContent
      ).toBe(german ? "Das Alphabet wird geladen…" : "Loading the alphabet…");
      expect(
        page.window.document
          .getElementById("app-loading")!
          .getAttribute("aria-label")
      ).toBe(
        german
          ? "Flow Arts Composer wird geladen"
          : "Loading Flow Arts Composer"
      );
      expect(page.window.eval('__tkaBootMessage("Checking session...")')).toBe(
        german ? "Anmeldung wird geprüft…" : "Checking session..."
      );
    }
  );

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
