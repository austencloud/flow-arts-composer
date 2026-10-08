/**
 * The page port on the Codex Browser runtime tab, which is what
 * scripts/demo-capture/browser-director.mjs was first written against. Pass
 * the tab the Node REPL's Browser runtime hands out.
 */
export function createCodexPage(tab) {
  const field = ({ role, name }) =>
    tab.playwright.getByRole(role, { name, exact: true });
  return {
    evaluate: (fn, arg) => tab.playwright.evaluate(fn, arg),
    async fillByRole({ role, name, value, commitKey }) {
      const locator = field({ role, name });
      await locator.fill(String(value));
      if (commitKey) await locator.press(commitKey);
    },
    url: () => tab.url(),
    snapshot: () => tab.playwright.domSnapshot(),
  };
}
