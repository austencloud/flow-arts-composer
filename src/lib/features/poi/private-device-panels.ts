/**
 * Device panels from the private prop-bridges repo.
 *
 * Some prop bridges are kept out of this public repository. They live in a
 * private one that is cloned into `src/lib/private/` (ignored here), and each
 * bridge that talks to hardware ships a `DevicePanel.svelte` the POV lab shows.
 * Without that clone the list is empty and the lab has no device panel.
 *
 * Builds leave the panels out unless `VITE_PRIVATE_BRIDGES=1` asks for them,
 * so a production build made on a machine with the clone never ships them.
 * See `.claude/rules/private-prop-bridges.md`.
 */
import type { Component } from "svelte";

type PanelModule = { default: Component };

const panels: Record<string, () => Promise<PanelModule>> =
  import.meta.env.DEV || import.meta.env.VITE_PRIVATE_BRIDGES === "1"
    ? import.meta.glob<PanelModule>(
        "/src/lib/private/bridges/*/DevicePanel.svelte"
      )
    : {};

export async function loadPrivateDevicePanels(): Promise<Component[]> {
  const loaded = await Promise.all(Object.values(panels).map((load) => load()));
  return loaded.map((module) => module.default);
}
