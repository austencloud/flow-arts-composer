/**
 * Space toggles the Shape Engine's animation, through the app's own shortcut
 * manager rather than a listener of this feature's own.
 *
 * The canvas already toggles on a click and now says so on hover, so the key
 * is the same action reached without the mouse. Registering it here keeps the
 * binding in the one registry that can show it in help, let it be rebound, and
 * stand aside for a text field or an open dialog — a bare `window` keydown of
 * our own would do none of that and would fire under the About modal.
 */
import { getKeyboardShortcutManager } from "$lib/shared/keyboard/get-keyboard-shortcut-manager";

/**
 * Register Space for one detail view. Returns the unregister function, so an
 * `$effect` can hand it straight back.
 *
 * `surface` names which of the two the caller is. Both are mounted at the same
 * time -- the Level Matrix drill and the Ratio Playground's theory detail sit
 * in the same shell -- and the registry keys by id, so a single shared id
 * meant whichever mounted last silently replaced the other, leaving Space
 * bound to a surface with nothing on it.
 *
 * `condition` is read at press time, which is what lets a surface refuse the
 * key while it has nothing to play or while it is not the one being looked at.
 */
export function registerShapeMatrixPlaybackShortcut(
  surface: "matrix" | "theory",
  toggle: () => void,
  condition: () => boolean
): () => void {
  // The embeddable app owns no route and reads no SvelteKit environment
  // module; that stays with the public host. A server render has no keyboard
  // to register against either way, so `window` answers the same question.
  if (typeof window === "undefined") return () => {};

  const manager = getKeyboardShortcutManager();

  /* The manager only listens once something calls this, and the thing that
     normally does is KeyboardShortcutCoordinator inside the signed-in app
     shell. This app also ships on a public route and as a standalone embed,
     where that shell never mounts, so a shortcut registered here was accepted
     and then never heard. `initialize` is idempotent, so on a host that does
     mount the coordinator this is a no-op. Mounting the coordinator instead
     would drag the whole global shortcut set -- command palette, module
     bindings -- onto a public page that asked for one key. */
  manager.initialize();

  return manager.register({
    id: `shape-matrix.play-pause.${surface}`,
    label: "Play / Pause",
    description: "Toggle the Shape Engine animation",
    // The manager normalizes the event's key before matching, and " " comes
    // out of that as "Space". Registering the raw character silently never
    // fires -- every other Space binding in the app carries the same note.
    key: "Space",
    modifiers: [],
    scope: "animation",
    priority: "high",
    condition,
    action: (event) => {
      // Space scrolls the page by default, and the grid behind the stage is a
      // long column of buttons.
      event.preventDefault();
      toggle();
    },
  });
}
