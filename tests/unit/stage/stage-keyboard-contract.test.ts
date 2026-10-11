import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  createInertStageHandlers,
  createStageShortcuts,
  type StageShortcutHandlers,
} from "#lib/shared/keyboard/registration/register-stage-shortcuts.js";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const STAGE = "src/lib/features/stage/StageModule.svelte";
const HARNESS = "src/routes/test/stage/+page.svelte";
const COORDINATOR =
  "src/lib/shared/keyboard/coordinators/KeyboardShortcutCoordinator.svelte";

describe("Stage keyboard ownership", () => {
  it("routes every Stage key through the app's shortcut manager", () => {
    const stage = read(STAGE);
    // A local <svelte:window onkeydown> is invisible to the `?` overlay and to
    // Settings → Keyboard Shortcuts, cannot be rebound, and is not checked for
    // conflicts against the rest of the app. That is what the Stage used to do.
    expect(stage).not.toContain("svelte:window");
    expect(stage).toContain("createStageShortcuts");
    expect(stage).toContain("getKeyboardShortcutManager");
    expect(stage).toContain('manager.setContext("stage")');
  });

  it("renders the shared edit-history bridge so Ctrl+Z reaches the document", () => {
    const stage = read(STAGE);
    // Undo is owned globally and routed to whichever editor is on screen. The
    // scope attribute plus the bridge is the whole contract; without either,
    // Ctrl+Z resolves no target and silently does nothing.
    expect(stage).toContain("data-edit-history-shortcut-scope");
    expect(stage).toContain("<EditHistoryShortcutBridge");
    expect(stage).toContain("onUndo={stageState.undo}");
    expect(stage).toContain("canUndo={stageState.canUndo}");
    // ...and it must not grow a second undo keymap of its own.
    expect(stage).not.toMatch(/id:\s*"stage\.(undo|redo)"/);
  });

  it("registers the Stage keymap at boot so it is listed and rebindable", () => {
    expect(read(COORDINATOR)).toContain("registerStageShortcuts(manager)");
  });

  it("gives the harness the keyboard layer the app shell provides", () => {
    // The harness mounts StageModule outside the app shell. Without the
    // coordinator, the manager's window listener never starts and every
    // shortcut on the page — Ctrl+Z included — is swallowed.
    expect(read(HARNESS)).toContain("<KeyboardShortcutCoordinator />");
  });

  it("lets a focused drill-chart spot keep the arrow keys", () => {
    // The spots nudge a performer a quarter metre with the arrows; the playhead
    // shortcuts claim the same keys. The marker is how the widget wins.
    expect(
      read("src/lib/features/stage/components/FormationOverlay.svelte")
    ).toContain("data-keyboard-shortcuts-ignore");
  });

  it("binds every declared handler and nothing outside the stage context", () => {
    const called: string[] = [];
    const handlers = Object.fromEntries(
      Object.keys(createInertStageHandlers()).map((name) => [
        name,
        () => called.push(name),
      ])
    ) as unknown as StageShortcutHandlers;

    const shortcuts = createStageShortcuts(handlers);
    expect(shortcuts.length).toBeGreaterThan(0);
    for (const shortcut of shortcuts) {
      expect(shortcut.context).toBe("stage");
      expect(shortcut.id.startsWith("stage.")).toBe(true);
      shortcut.action(new KeyboardEvent("keydown"));
    }

    // Two ids share deleteSelection (Delete and Backspace), so every handler
    // is reachable even though the counts differ.
    expect(new Set(called)).toEqual(
      new Set(Object.keys(createInertStageHandlers()))
    );
  });

  it("keeps the ids unique so one binding cannot silently replace another", () => {
    const ids = createStageShortcuts(createInertStageHandlers()).map(
      (shortcut) => shortcut.id
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("registers play under the normalized Space name", () => {
    // NormalizedKeyboardEvent rewrites " " to "Space" before matching, so a
    // shortcut registered under the raw space character can never fire. Both
    // the Stage and the Choreo sheet shipped that bug.
    const play = createStageShortcuts(createInertStageHandlers()).find(
      (shortcut) => shortcut.id === "stage.play"
    );
    expect(play?.key).toBe("Space");
    for (const file of [
      "src/lib/shared/keyboard/registration/register-stage-shortcuts.ts",
      "src/lib/shared/keyboard/registration/register-choreo-shortcuts.ts",
    ]) {
      expect(read(file)).not.toContain('key: " "');
    }
  });

  it("advertises no binding the Stage cannot honour", () => {
    // stage-choreography-state's toggleLoop is a documented v1 no-op. A key
    // listed in Settings that does nothing is worse than no key at all.
    const ids = createStageShortcuts(createInertStageHandlers()).map(
      (shortcut) => shortcut.id
    );
    expect(ids).not.toContain("stage.loop");
  });
});
