<!--
  Boot Overture lab: the real boot worker and its real boot script
  (overture-boot.js) against a fake boot, so the trace, the letters and the
  fly-through can be judged without reloading the app. The capsule fill runs
  the same self-timing engine the boot screen does, fed the same scaled
  milestones. Nothing here draws: the worker does.

  Query parameters set the controls (scene, surface, reduced, length, fly,
  tier);
  `chrome=0` hides the panel for screenshots and `pauseAt=<ms>` freezes the
  whole lab that many ms into the fake boot (the finish is at the boot length;
  the fly-through ends about 540 ms later).

  Design: docs/superpowers/specs/2026-10-26-boot-overture-design.md
-->
<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import {
    createSelfTimingBar,
    type SelfTimingBar,
    type SelfTimingProfile,
  } from "#lib/shared/loading/self-timing-bar.js";
  import "#lib/shared/loading/overture/overture-boot.js";
  import workerUrl from "#lib/shared/loading/overture/overture.worker.ts?worker&url";
  import { OVERTURE_POOL_IDS } from "#lib/shared/loading/overture/overture-pool-source.js";
  import { OVERTURE_SNAPSHOT_KEY } from "#lib/shared/loading/overture/overture-snapshot.js";
  import type { OvertureScene } from "#lib/shared/loading/overture/overture-trace.js";

  interface OvertureHandle {
    send(type: string, name?: string): void;
    stop(): void;
  }
  type StartOverture = (config: Record<string, unknown>) => OvertureHandle;

  // The boot's own ranks and default profile (src/app.html).
  const RANKS = [
    "start",
    "scripts",
    "shell",
    "hydrated",
    "cloud",
    "session",
    "services",
    "workspace",
    "settings",
    "ready",
    "composed",
  ];
  const DEFAULT_PROFILE: Record<string, number> = {
    start: 310,
    scripts: 830,
    shell: 980,
    hydrated: 2400,
    services: 3740,
    workspace: 3870,
    settings: 3870,
    ready: 3870,
    composed: 6380,
  };

  const params =
    typeof location === "undefined"
      ? new URLSearchParams()
      : new URLSearchParams(location.search);
  const sceneOptions = [
    { value: "snapshot", label: "Snapshot" },
    ...OVERTURE_POOL_IDS.map((id) => ({
      value: id,
      label: id.replace(/^(cap|zans):/, ""),
    })),
  ];

  let scene = $state(params.get("scene") ?? "snapshot");
  let surface = $state<"dark" | "light">(
    params.get("surface") === "light" ? "light" : "dark"
  );
  let reduced = $state(params.get("reduced") === "1" ? "on" : "off");
  let length = $state(params.get("length") === "6.4" ? "6.4" : "2.4");
  let fly = $state(
    ["1.25", "1.4"].includes(params.get("fly") ?? "")
      ? params.get("fly")!
      : "1.6"
  );
  let tier = $state(
    ["full", "low"].includes(params.get("tier") ?? "")
      ? params.get("tier")!
      : "auto"
  );
  const chrome = params.get("chrome") !== "0";
  const pauseAt = params.has("pauseAt") ? Number(params.get("pauseAt")) : null;

  let canvas = $state<HTMLCanvasElement | null>(null);
  let fill = $state<HTMLDivElement | null>(null);
  let run = $state(0);
  let leaving = $state(false);
  let note = $state("");

  let pool: OvertureScene[] = [];
  let handle: OvertureHandle | null = null;
  let bar: SelfTimingBar | null = null;
  let timers: ReturnType<typeof setTimeout>[] = [];

  function scaledProfile(ms: number): SelfTimingProfile {
    const k = ms / DEFAULT_PROFILE.composed!;
    const t: Record<string, number> = {};
    for (const [name, at] of Object.entries(DEFAULT_PROFILE))
      t[name] = Math.round(at * k);
    return { v: 1, t };
  }

  function sceneSnapshot(): string | null {
    if (scene === "snapshot") {
      try {
        return localStorage.getItem(OVERTURE_SNAPSHOT_KEY);
      } catch {
        return null;
      }
    }
    const chosen = pool.find((s) => s.id === scene);
    return chosen ? JSON.stringify(chosen) : null;
  }

  function teardown() {
    for (const timer of timers) clearTimeout(timer);
    timers = [];
    handle?.stop();
    handle = null;
    bar?.destroy();
    bar = null;
  }

  async function replay() {
    teardown();
    leaving = false;
    run++;
    await tick();
    if (!canvas || !fill) return;
    const total = Number(length) * 1000;
    const profile = scaledProfile(total);
    const start = (
      globalThis as unknown as { __tkaStartOverture?: StartOverture }
    ).__tkaStartOverture;
    if (!start) {
      note = "overture-boot.js did not load";
      return;
    }
    const snapshot = sceneSnapshot();
    note =
      scene === "snapshot" && !snapshot
        ? "No snapshot stored: the pool rotation plays."
        : "";
    handle = start({
      worker: workerUrl,
      pool: "/boot/overture-pool.json",
      font: "/fonts/tka/tka.woff2",
      screen: canvas.parentElement,
      canvas,
      zero: performance.now(),
      surface,
      reduced: reduced === "on",
      profile,
      milestones: [],
      snapshot,
      fly,
      tier,
    });
    bar = createSelfTimingBar({
      fill,
      ranks: RANKS,
      profile,
      endAfter: "ready",
      shown: 5,
      floor: 4,
      still: reduced === "on",
    });
    bar.startTicker();
    for (const [name, at] of Object.entries(profile.t)) {
      if (name === "composed") continue;
      timers.push(
        setTimeout(() => {
          bar?.milestone(name);
          handle?.send("milestone", name);
        }, at)
      );
    }
    timers.push(
      setTimeout(() => {
        bar?.milestone("composed");
        bar?.finish(200, "ease");
        handle?.send("finish");
        leaving = true;
      }, total)
    );
    if (pauseAt !== null && Number.isFinite(pauseAt)) {
      // Freeze everything: the worker, the capsule and the rest of the feed.
      timers.push(
        setTimeout(() => {
          handle?.send("hidden");
          bar?.stopTicker();
          leaving = false; // the sky's fade waits 200 ms, so nothing jumps
          for (const timer of timers) clearTimeout(timer);
          timers = [];
        }, pauseAt)
      );
    }
  }

  onMount(async () => {
    try {
      const response = await fetch("/boot/overture-pool.json");
      pool = ((await response.json()) as { scenes: OvertureScene[] }).scenes;
    } catch {
      note = "The pool did not load.";
    }
    void replay();
  });

  onDestroy(teardown);
</script>

<svelte:head>
  <title>Boot Overture lab</title>
</svelte:head>

<div
  class="lab-stage"
  data-surface={surface}
  class:leaving
  class:still={reduced === "on"}
>
  {#key run}
    <canvas class="lab-overture" bind:this={canvas} aria-hidden="true"></canvas>
  {/key}
  <div class="boot-capsule lab-capsule">
    <div class="boot-capsule-fill" bind:this={fill}></div>
    <span class="boot-capsule-label">Opening Flow Arts Composer</span>
  </div>
</div>

{#if chrome}
  <aside class="lab-panel" aria-label="Overture controls">
    <h1>Boot Overture</h1>
    <div class="row">
      <span>Scene</span>
      <SegmentedControl
        options={sceneOptions}
        value={scene}
        onchange={(v) => (scene = v)}
        columns={3}
        size="sm"
        density="compact"
        ariaLabel="Scene"
      />
    </div>
    <div class="row">
      <span>Surface</span>
      <SegmentedControl
        options={[
          { value: "dark", label: "Dark" },
          { value: "light", label: "Light" },
        ]}
        value={surface}
        onchange={(v) => (surface = v)}
        size="sm"
        ariaLabel="Surface"
      />
    </div>
    <div class="row">
      <span>Reduced motion</span>
      <SegmentedControl
        options={[
          { value: "off", label: "Off" },
          { value: "on", label: "On" },
        ]}
        value={reduced}
        onchange={(v) => (reduced = v)}
        size="sm"
        ariaLabel="Reduced motion"
      />
    </div>
    <div class="row">
      <span>Boot length</span>
      <SegmentedControl
        options={[
          { value: "2.4", label: "2.4 s" },
          { value: "6.4", label: "6.4 s" },
        ]}
        value={length}
        onchange={(v) => (length = v)}
        size="sm"
        ariaLabel="Boot length"
      />
    </div>
    <div class="row">
      <span>Fly-through</span>
      <SegmentedControl
        options={[
          { value: "1.25", label: "1.25" },
          { value: "1.4", label: "1.4" },
          { value: "1.6", label: "1.6" },
        ]}
        value={fly}
        onchange={(v) => (fly = v)}
        size="sm"
        ariaLabel="Fly-through scale"
      />
    </div>
    <div class="row">
      <span>Tier</span>
      <SegmentedControl
        options={[
          { value: "auto", label: "Auto" },
          { value: "full", label: "Full" },
          { value: "low", label: "Low" },
        ]}
        value={tier}
        onchange={(v) => (tier = v)}
        size="sm"
        ariaLabel="Tier"
      />
    </div>
    <PanelButton variant="primary" fullWidth onclick={() => void replay()}
      >Replay</PanelButton
    >
    {#if note}<p class="note">{note}</p>{/if}
  </aside>
{/if}

<style>
  /* The boot screen's two surfaces, as src/app.html paints #app-loading. */
  .lab-stage {
    position: fixed;
    inset: 0;
    overflow: hidden;
    background: linear-gradient(
      180deg,
      #0a0a1a 0%,
      #0d0d1f 10%,
      #16142c 25%,
      #1c2538 40%,
      #1b293f 55%,
      #163253 70%,
      #103259 85%,
      #0a2142 100%
    );
    transition: opacity calc(var(--duration-normal) * 2) ease-out;
  }

  .lab-stage[data-surface="light"] {
    background:
      radial-gradient(
        ellipse at 72% 24%,
        rgba(139, 108, 255, 0.14),
        transparent 40%
      ),
      radial-gradient(
        ellipse at 20% 78%,
        rgba(111, 140, 255, 0.12),
        transparent 44%
      ),
      radial-gradient(
        130% 100% at 50% -10%,
        #f6f7fc 0%,
        #eceef6 48%,
        #dfe2ee 100%
      );
  }

  .lab-stage[data-surface="light"] .lab-capsule {
    background: rgba(63, 80, 190, 0.92);
  }

  /* The finish: the sky waits 200 ms for the fly-through, as the boot does.
     Token math keeps the boot's 400, 300 and 200 ms (src/app.html). */
  .lab-stage.leaving {
    opacity: 0;
    transition-delay: var(--duration-normal);
  }

  .lab-stage.still.leaving {
    transition: none;
  }

  .lab-overture {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    transition: opacity calc(var(--duration-fast) * 2) ease-out;
  }

  .lab-overture:global(.on) {
    opacity: 1;
  }

  .lab-stage.still .lab-overture {
    transition: none;
  }

  .lab-capsule {
    position: absolute;
    bottom: 9%;
    left: 0;
    right: 0;
    margin: 0 auto;
  }

  .lab-panel {
    position: fixed;
    top: 12px;
    right: 12px;
    z-index: 2;
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: min(340px, calc(100vw - 24px));
    max-height: calc(100vh - 24px);
    overflow: auto;
    padding: 14px;
    border-radius: 14px;
    background: var(--theme-panel-bg, rgba(15, 18, 32, 0.88));
    color: var(--theme-text, #fff);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
  }

  .lab-panel h1 {
    margin: 0;
    font-size: var(--font-size-base, 1rem);
  }

  .row {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .row > span,
  .note {
    margin: 0;
    font-size: var(--font-size-sm, 0.875rem);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.72));
  }
</style>
