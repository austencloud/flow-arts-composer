import { evaluate } from "../../lib/chrome-cdp.mjs";

/**
 * The page port on raw Chrome DevTools Protocol, for a client from
 * `openTab` in scripts/lib/chrome-cdp.mjs. The recording director talks to a
 * page only through this port: evaluate, fillByRole, url and snapshot.
 */

const KEYS = {
  Tab: { code: "Tab", keyCode: 9 },
  Enter: { code: "Enter", keyCode: 13 },
  Escape: { code: "Escape", keyCode: 27 },
  Backspace: { code: "Backspace", keyCode: 8 },
  ArrowLeft: { code: "ArrowLeft", keyCode: 37 },
  ArrowUp: { code: "ArrowUp", keyCode: 38 },
  ArrowRight: { code: "ArrowRight", keyCode: 39 },
  ArrowDown: { code: "ArrowDown", keyCode: 40 },
};

/** Runs in the page: focuses and selects the visible field with this role and name. */
function focusField({ role, name }) {
  const selectors = {
    spinbutton: 'input[type="number"],[role="spinbutton"]',
    textbox: 'input:not([type]),input[type="text"],textarea,[role="textbox"]',
    slider: 'input[type="range"],[role="slider"]',
  };
  const selector = selectors[role] ?? `[role="${role}"]`;
  const labelOf = (element) =>
    element.getAttribute("aria-label") ??
    element.labels?.[0]?.textContent?.trim() ??
    element.getAttribute("title") ??
    "";
  const field = [...document.querySelectorAll(selector)].find(
    (candidate) =>
      !candidate.closest("[inert]") &&
      candidate.getBoundingClientRect().width &&
      labelOf(candidate) === name
  );
  if (!field) throw new Error(`No visible ${role} named "${name}"`);
  field.focus();
  field.select?.();
  return true;
}

/** Runs in the page: what the page says about itself, kept small. */
function describePage() {
  const controls = [
    ...document.querySelectorAll("button,a,input,select,textarea,[role]"),
  ]
    .filter((element) => element.getBoundingClientRect().width)
    .map((element) => ({
      tag: element.tagName.toLowerCase(),
      role: element.getAttribute("role"),
      label:
        element.getAttribute("aria-label") ??
        element.textContent?.trim().slice(0, 80) ??
        "",
    }));
  return {
    title: document.title,
    text: (document.body.innerText ?? document.body.textContent ?? "").slice(
      0,
      20000
    ),
    controls,
  };
}

export function createCdpPage(client) {
  /** Runs `fn(arg)` in the page and returns its value. `fn` must be self-contained. */
  function run(fn, arg) {
    return evaluate(
      client,
      `(${fn.toString()})(${JSON.stringify(arg ?? null)})`
    );
  }

  async function pressKey(key) {
    const known = KEYS[key];
    if (!known && key.length !== 1)
      throw new Error(
        `pressKey does not know "${key}". It knows ${Object.keys(KEYS).join(", ")} and single characters.`
      );
    const base = known
      ? { key, code: known.code, windowsVirtualKeyCode: known.keyCode }
      : { key, text: key };
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", ...base });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
  }

  async function fillByRole({ role, name, value, commitKey }) {
    if (commitKey && !KEYS[commitKey] && commitKey.length !== 1)
      throw new Error(`pressKey does not know "${commitKey}".`);
    await run(focusField, { role, name });
    await client.send("Input.insertText", { text: String(value) });
    if (commitKey) await pressKey(commitKey);
  }

  return {
    evaluate: run,
    fillByRole,
    url: () => run(() => window.location.href),
    snapshot: () => run(describePage),
  };
}
