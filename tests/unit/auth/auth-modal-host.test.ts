/**
 * The sign-up window on pages without the app (AuthModalHost).
 *
 * Without a host, a guest's fourth save on the Shape Engine or the spinner
 * page does nothing visible: the save service asks for the window and throws,
 * and nobody is listening. The host must also keep the window's code off those
 * pages until it is needed, and must never pull in Firebase, whose absence
 * from these pages' startup the build check guards.
 */
import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chainTo, importGraph, repoPath } from "../../helpers/import-graph";

const modal = vi.hoisted(() => ({
  renders: [] as Array<Record<string, unknown>>,
}));

vi.mock("#lib/shared/auth/components/AuthModal.svelte", () => ({
  default: (_anchor: unknown, props: Record<string, unknown>) => {
    modal.renders.push(props);
  },
}));

const { authDrawerState } =
  await import("#lib/shared/auth/state/auth-drawer-state.svelte.js");
const { default: AuthModalHost } =
  await import("#lib/shared/auth/components/AuthModalHost.svelte");

// vitest-setup.ts swaps document.createElement for canvas stubs that are not
// DOM nodes. Mounting a component needs jsdom's own, from document's prototype.
const realCreateElement = Object.getPrototypeOf(document)
  .createElement as typeof document.createElement;
let stubbedCreateElement: typeof document.createElement;
let mounted: ReturnType<typeof mount> | null = null;

beforeEach(() => {
  modal.renders = [];
  authDrawerState.reset();
  stubbedCreateElement = document.createElement;
  document.createElement = realCreateElement.bind(document);
  const host = realCreateElement.call(document, "div");
  document.body.append(host);
  mounted = mount(AuthModalHost, { target: host });
  flushSync();
});

afterEach(() => {
  if (mounted) unmount(mounted);
  mounted = null;
  authDrawerState.reset();
  document.body.innerHTML = "";
  document.createElement = stubbedCreateElement;
});

describe("sign-up window host", () => {
  it("loads nothing until something asks for the window", async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    flushSync();
    expect(modal.renders).toEqual([]);
  });

  it("opens the window with the save-limit reason when a guest hits the limit", async () => {
    // What library-save-service does at the guest save cap.
    authDrawerState.show("signup", "save-limit");
    flushSync();

    await vi.waitFor(() => expect(modal.renders).toHaveLength(1));
    const props = modal.renders[0]!;
    expect(props.open).toBe(true);
    expect(props.initialMode).toBe("signup");
    expect(props.reason).toBe("save-limit");
  });

  it("keeps the window mounted after it closes, and closes it through the shared state", async () => {
    authDrawerState.show("signup", "save-limit");
    flushSync();
    await vi.waitFor(() => expect(modal.renders).toHaveLength(1));

    (modal.renders[0]!.onClose as () => void)();
    flushSync();

    expect(authDrawerState.open).toBe(false);
    expect(modal.renders[0]!.open).toBe(false);
    expect(modal.renders).toHaveLength(1);
  });
});

describe("what the host costs the pages it sits on", () => {
  const HOST = repoPath("src/lib/shared/auth/components/AuthModalHost.svelte");
  const MODAL = repoPath("src/lib/shared/auth/components/AuthModal.svelte");

  it.each([
    "src/routes/(public)/shape-engine/+page.svelte",
    "src/routes/embed/spinner/+page.svelte",
  ])("%s mounts the host but loads the window only on demand", (entry) => {
    const graph = importGraph([repoPath(entry)]);
    expect(graph.files).toContain(HOST);
    expect(graph.files.has(MODAL) ? chainTo(graph, MODAL) : null).toBeNull();
  });

  it("never reaches Firebase before the window is asked for", () => {
    const graph = importGraph([HOST]);
    const bootstrap = repoPath("src/lib/shared/auth/firebase.ts");
    expect(
      graph.files.has(bootstrap) ? chainTo(graph, bootstrap) : null
    ).toBeNull();
    const importers = [...graph.packages.entries()]
      .filter(([spec]) => /^@?firebase(\/|$)/.test(spec))
      .flatMap(([, files]) => [...files]);
    expect(importers.map((file) => chainTo(graph, file))).toEqual([]);
  });
});
