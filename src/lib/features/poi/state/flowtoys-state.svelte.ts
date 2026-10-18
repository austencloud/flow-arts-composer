/**
 * Flowtoys props through a Flowtoys Bridge, for the device panel. Props play
 * only their built-in modes, so this picks a mode for each group the bridge
 * has heard and can override its colour, brightness, speed and density.
 */

import {
  FlowtoysBridge,
  isWebBluetoothSupported,
  type FlowtoysGroup,
} from "../services/flowtoys/flowtoys-bridge";
import {
  FLOWTOYS_MODES,
  FLOWTOYS_PAGES,
} from "../services/flowtoys/flowtoys-modes";
import {
  FLAG,
  type FlowtoysAdjust,
} from "../services/flowtoys/flowtoys-packet";

function message(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function cancelled(err: unknown): boolean {
  return (
    err instanceof DOMException &&
    (err.name === "NotFoundError" || err.name === "AbortError")
  );
}

export class FlowtoysState {
  readonly supported = isWebBluetoothSupported();
  readonly pages = FLOWTOYS_PAGES;

  bridgeName = $state<string | null>(null);
  connecting = $state(false);
  error = $state<string | null>(null);
  groups = $state<FlowtoysGroup[]>([]);
  /** Groups a cue goes to; empty means every group heard. */
  chosen = $state<number[]>([]);
  page = $state(FLOWTOYS_PAGES[0] ?? 1);
  mode = $state(1);
  adjust = $state<Partial<Record<FlowtoysAdjust, number>>>({});

  readonly pageModes = $derived(
    FLOWTOYS_MODES.filter((m) => m.page === this.page)
  );
  readonly targets = $derived(
    this.chosen.length > 0
      ? this.groups.filter((g) => this.chosen.includes(g.id)).map((g) => g.id)
      : this.groups.map((g) => g.id)
  );

  private bridge: FlowtoysBridge | null = null;
  private readonly cleanups: (() => void)[] = [];

  /** Show the browser's Bluetooth chooser. Must run from a click. */
  async connect(): Promise<void> {
    this.error = null;
    this.connecting = true;
    try {
      const bridge = await FlowtoysBridge.request();
      this.bridge = bridge;
      this.bridgeName = bridge.name;
      this.groups = bridge.list();
      this.cleanups.push(
        bridge.onGroups((groups) => (this.groups = groups)),
        bridge.onClose(() => this.reset())
      );
    } catch (err) {
      if (!cancelled(err))
        this.error = message(err, "Could not connect to the bridge");
    } finally {
      this.connecting = false;
    }
  }

  disconnect(): void {
    this.bridge?.disconnect();
    this.reset();
  }

  dispose(): void {
    this.disconnect();
  }

  toggleGroup(id: number): void {
    this.chosen = this.chosen.includes(id)
      ? this.chosen.filter((g) => g !== id)
      : [...this.chosen, id];
  }

  setPage(page: number): void {
    this.page = page;
  }

  /** Play a mode on the chosen groups now. */
  cue(mode: number): void {
    this.mode = mode;
    this.sendAll(0);
  }

  setAdjust(key: FlowtoysAdjust, value: number): void {
    this.adjust = { ...this.adjust, [key]: value };
    this.sendAll(0);
  }

  /** Hand colour, brightness, speed and density back to the props. */
  clearAdjust(): void {
    this.adjust = {};
    this.sendAll(0);
  }

  wake(): void {
    this.sendAll(FLAG.WAKE);
  }

  powerOff(): void {
    this.sendAll(FLAG.POWER_OFF);
  }

  private sendAll(flags: number): void {
    const bridge = this.bridge;
    if (!bridge) return;
    this.error = null;
    const state = {
      page: this.page,
      mode: this.mode,
      adjust: { ...this.adjust },
    };
    for (const id of this.targets) {
      bridge.send(id, state, flags).catch((err: unknown) => {
        this.error = message(err, "The bridge did not take the cue");
      });
    }
  }

  private reset(): void {
    for (const c of this.cleanups.splice(0)) c();
    this.bridge = null;
    this.bridgeName = null;
    this.groups = [];
    this.chosen = [];
  }
}
