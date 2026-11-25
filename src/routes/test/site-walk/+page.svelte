<script lang="ts">
  /**
   * Walk a gig's site plan at true size.
   *
   * The person picks a flat site plan (JSON, in feet) from their own PC; it is
   * read here in the browser and kept in this browser's own storage so a reload
   * returns to it. Nothing is uploaded. A banner picture can be chosen the same
   * way and is shown on the canopy.
   *
   * WASD or the arrow keys walk, Shift runs, the mouse looks (click the view
   * first), V switches between over the shoulder and eye level. On a touch
   * screen a thumbstick walks and a drag looks.
   */
  import { onDestroy, onMount } from "svelte";
  import { Canvas } from "@threlte/core";
  import { NoToneMapping, PCFSoftShadowMap, SRGBColorSpace, TextureLoader, WebGLRenderer, type Texture } from "three";
  import ScenePreparationSurface from "#lib/shared/3d/scene-features/components/ScenePreparationSurface.svelte";
  import { createLoadingSession, type LoadingSession } from "#lib/shared/loading/loading-session.svelte.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import { reducedMotion } from "#lib/shared/transitions/motion.js";
  import BaseModal from "#lib/shared/foundation/ui/modal/BaseModal.svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import { JamAudio } from "../flow-fest-jam/flow-fest-jam-audio";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import VirtualJoystick from "#lib/shared/components/touch/VirtualJoystick.svelte";
  import SiteWalkScene, { type SiteView } from "./SiteWalkScene.svelte";
  import { LOOKS } from "./look/site-walk-look";
  import SiteWalkKeys from "./SiteWalkKeys.svelte";
  import { placeGuests, readSitePlanText, type SiteWalkWorld, type Stand } from "./site-walk-plan";
  import { forgetAround, forgetPlan, recallAround, recallBanner, recallPlan, rememberAround, rememberBanner, rememberPlan } from "./site-walk-storage";
  import { readSurroundingsText, type SiteSurroundings } from "./site-walk-around";
  import { guestMayStand, siteFloor } from "./site-walk-floor";

  const GUEST_SEED = 20260;

  let world = $state.raw<SiteWalkWorld | null>(null);
  let error = $state<string | null>(null);
  let light = $state<"dusk" | "night">("dusk");
  let guestCount = $state<"0" | "40" | "80" | "150" | "200">("80");
  let stand = $state<{ spot: Stand; token: number } | null>(null);
  let bannerTexture = $state.raw<Texture | null>(null);
  let view = $state<SiteView>("behind");
  /** Null follows the light: off at dusk, on at night. The Fire switch overrides it. */
  let fireChoice = $state<"on" | "off" | null>(null);
  /** The jam's fire sound: off until a click turns it on, and it only sounds while Fire is on. */
  const audio = new JamAudio();
  let sound = $state<"off" | "on">("off");
  const fire = $derived(fireChoice ?? (light === "night" ? "on" : "off"));
  let planKey = $state(0);
  /** The optional surroundings file; kept when a new plan is opened. */
  let around = $state.raw<SiteSurroundings | null>(null);
  let aroundError = $state<string | null>(null);
  let coarse = $state(false);
  /** Narrow windows keep Stand and View in the bar and put the rest behind Settings. */
  let compact = $state(false);
  let settingsOpen = $state(false);
  let moveAxis = $state({ x: 0, z: 0 });
  let walking = $state(false);
  let walkedSeconds = $state(0);
  let pointerLocked = $state(false);
  let walkTimer: ReturnType<typeof setInterval> | undefined;
  let unlisten: (() => void) | undefined;
  let dragging = $state(false);
  let planInput: HTMLInputElement | undefined;
  let bannerInput: HTMLInputElement | undefined;
  let aroundInput: HTMLInputElement | undefined;

  // ---------------------------------------------------------------- loading

  /** The curtain wears the sky it opens on. */
  const curtainSky = $derived.by(() => {
    const { sky } = LOOKS[light];
    return { top: sky.zenith[0], mid: sky.midAnti[0], horizon: sky.horizonSun[0] };
  });
  let session = $state<LoadingSession | null>(null);
  type Reveal = "idle" | "loading" | "leaving" | "gone";
  let reveal = $state<Reveal>("idle");
  const timers: ReturnType<typeof setTimeout>[] = [];
  const hold = reducedMotion() ? DURATION.normal : DURATION.normal + DURATION.instant;

  function startLoading(): void {
    session?.abandon?.();
    session = createLoadingSession({
      key: "site-walk",
      ranks: ["open", "built"],
      defaultProfile: { open: 0, built: 3000 },
    });
    reveal = "loading";
  }

  function onReady(): void {
    if (reveal !== "loading") return;
    session?.reach("built");
    session?.complete();
    timers.push(setTimeout(() => (reveal = "leaving"), hold));
  }

  // ---------------------------------------------------------------- plan

  function openPlan(text: string, remember: boolean): boolean {
    const read = readSitePlanText(text);
    if (!read.ok) {
      error = read.message;
      return false;
    }
    error = null;
    if (remember) rememberPlan(text);
    world = read.world;
    stand = { spot: read.world.stands.start, token: 0 };
    planKey += 1;
    startLoading();
    return true;
  }

  async function onPlanFile(file: File | null | undefined): Promise<void> {
    if (!file) return;
    try {
      openPlan(await file.text(), true);
    } catch {
      error = "That file is not a site plan.";
    }
  }

  /** Reads the text; a bad file keeps whatever was showing and says why. */
  function openAround(text: string, remember: boolean): boolean {
    const read = readSurroundingsText(text);
    if (!read.ok) {
      aroundError = read.message;
      return false;
    }
    aroundError = null;
    if (remember) rememberAround(text);
    around = read.around;
    if (world) {
      planKey += 1;
      startLoading();
    }
    return true;
  }

  async function onAroundFile(file: File | null | undefined): Promise<void> {
    if (!file) return;
    try {
      openAround(await file.text(), true);
    } catch {
      aroundError = "That file is not a surroundings file.";
    }
  }

  function leavePlan(): void {
    forgetPlan();
    world = null;
    stand = null;
    reveal = "idle";
  }

  function goTo(spot: Stand | null): void {
    if (!spot || !stand) return;
    stand = { spot, token: stand.token + 1 };
  }

  // ---------------------------------------------------------------- banner

  async function useBannerBlob(blob: Blob): Promise<void> {
    const url = URL.createObjectURL(blob);
    try {
      const texture = await new TextureLoader().loadAsync(url);
      texture.colorSpace = SRGBColorSpace;
      texture.anisotropy = 8;
      bannerTexture?.dispose();
      bannerTexture = texture;
    } catch {
      error = "That picture could not be read.";
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function onBannerFile(file: File | null | undefined): Promise<void> {
    if (!file) return;
    await useBannerBlob(file);
    await rememberBanner(file);
  }

  /** How high the floor is everywhere: raised areas and the lawn's heights from the surroundings file. */
  const floor = $derived(world ? siteFloor(world, around) : null);
  /** What the surroundings name that the plan does not have, and anything else they could not stand up. */
  const aroundNotDrawn = $derived([...(around?.notDrawn ?? []), ...(floor?.notDrawn ?? [])]);

  const guests = $derived(
    world && floor && world.guestArea && guestCount !== "0"
      ? placeGuests(world.guestArea, Number(guestCount), {
          seed: GUEST_SEED,
          facing: world.stands.stage,
          keep: (p) => guestMayStand(floor, p),
          floor: (p) => floor.heightAt(p),
        })
      : { figures: [], capped: false },
  );

  function releaseFocus(event: Event): void {
    (event.currentTarget as HTMLElement | null)?.blur();
  }

  function onPointerLock(): void {
    pointerLocked = !!document.pointerLockElement;
  }

  /** The legend fades once you have walked a few seconds, and returns while the pointer is free. */
  const legendShown = $derived(!coarse && (!pointerLocked || walkedSeconds < 4));

  onMount(() => {
    coarse = window.matchMedia("(pointer: coarse)").matches;
    const narrow = window.matchMedia("(max-width: 1024px)");
    const onNarrow = () => {
      compact = narrow.matches;
      if (!compact) settingsOpen = false;
    };
    onNarrow();
    // The camera package portals its own mode chip to <body>; this page has its own key legend.
    document.body.classList.add("site-walk-page");
    narrow.addEventListener("change", onNarrow);
    unlisten = () => narrow.removeEventListener("change", onNarrow);
    document.addEventListener("pointerlockchange", onPointerLock);
    walkTimer = setInterval(() => {
      if (walking || Math.hypot(moveAxis.x, moveAxis.z) > 0) walkedSeconds += 0.25;
    }, 250);
    const savedAround = recallAround();
    if (savedAround && !openAround(savedAround, false)) forgetAround();
    const text = recallPlan();
    if (text && !openPlan(text, false)) forgetPlan();
    void recallBanner().then((blob) => {
      if (blob) void useBannerBlob(blob);
    });
  });

  onDestroy(() => {
    audio.dispose();
    unlisten?.();
    if (typeof document !== "undefined") document.body.classList.remove("site-walk-page");
    if (walkTimer) clearInterval(walkTimer);
    if (typeof document !== "undefined") document.removeEventListener("pointerlockchange", onPointerLock);
    timers.forEach(clearTimeout);
    if (session && !session.done) session.abandon();
    bannerTexture?.dispose();
  });
</script>

<svelte:head>
  <title>Site walk</title>
</svelte:head>

<div class="walk">
  {#if world && stand}
    {#key planKey}
      <Canvas
        autoRender={false}
        dpr={1}
        shadows={PCFSoftShadowMap}
        toneMapping={NoToneMapping}
        createRenderer={(canvas) =>
          new WebGLRenderer({
            canvas,
            antialias: false,
            preserveDrawingBuffer: true,
            powerPreference: "high-performance",
          })}
      >
        <SiteWalkScene
          {world}
          {light}
          figures={guests.figures.filter((f) => !world?.stands.guests || Math.hypot(f.x - world.stands.guests.x, f.z - world.stands.guests.z) > 1.1)}
          {stand}
          {bannerTexture}
          {around}
          {floor}
          fire={fire === "on" && !!world.stage}
          {audio}
          {view}
          onViewChange={(next) => (view = next)}
          {moveAxis}
          onWalking={(on) => (walking = on)}
          {onReady}
          onError={(message) => {
            error = message;
          }}
        />
      </Canvas>
    {/key}

    {#snippet standGroup()}
      <div class="pair">
        <span class="label">Stand</span>
        <div class="group" role="group" aria-label="Where to stand">
          <PanelButton
            size="compact"
            onclick={(event) => {
              goTo(world?.stands.guests ?? null);
              releaseFocus(event);
            }}
            disabled={!world?.stands.guests}
          >
            Guests
          </PanelButton>
          <PanelButton
            size="compact"
            onclick={(event) => {
              goTo(world?.stands.stage ?? null);
              releaseFocus(event);
            }}
            disabled={!world?.stands.stage}
          >
            Stage
          </PanelButton>
          <PanelButton
            size="compact"
            onclick={(event) => {
              goTo(world?.stands.canopy ?? null);
              releaseFocus(event);
            }}
            disabled={!world?.stands.canopy}
          >
            Canopy
          </PanelButton>
        </div>
      </div>
    {/snippet}
    {#snippet viewGroup()}
      <div class="pair">
        <span class="label">View</span>
        <div class="fit">
          <SegmentedControl
            size="sm"
            density="tight"
            ariaLabel="View"
            value={view}
            onchange={(next) => (view = next)}
            options={[
              { value: "behind", label: "Behind" },
              { value: "eye", label: "Eye level" },
            ]}
          />
        </div>
      </div>
    {/snippet}
    {#snippet lightGroup()}
      <div class="pair">
        <span class="label">Light</span>
        <div class="fit">
          <SegmentedControl
            size="sm"
            density="tight"
            ariaLabel="Light"
            value={light}
            onchange={(next) => (light = next)}
            options={[
              { value: "dusk", label: "Dusk" },
              { value: "night", label: "Night" },
            ]}
          />
        </div>
      </div>
    {/snippet}
    {#snippet guestsGroup()}
      <div class="pair">
        <span class="label">Guests</span>
        <div class="fit">
          <SegmentedControl
            size="sm"
            density="tight"
            ariaLabel="Guests"
            value={guestCount}
            onchange={(next) => (guestCount = next)}
            options={[
              { value: "0", label: "None" },
              { value: "40", label: "40" },
              { value: "80", label: "80" },
              { value: "150", label: "150" },
              { value: "200", label: "200" },
            ]}
          />
        </div>
      </div>
    {/snippet}
    {#snippet fireGroup()}
      <div class="pair">
        <span class="label">Fire</span>
        <div class="fit">
          <SegmentedControl
            size="sm"
            density="tight"
            ariaLabel="Fire"
            value={fire}
            onchange={(next) => (fireChoice = next)}
            options={[
              { value: "off", label: "Off" },
              { value: "on", label: "On" },
            ]}
          />
        </div>
      </div>
    {/snippet}
    {#snippet soundGroup()}
      <div class="pair">
        <span class="label">Sound</span>
        <div class="fit">
          <SegmentedControl
            size="sm"
            density="tight"
            ariaLabel="Sound"
            value={sound}
            onchange={(next) => {
              sound = next;
              audio.setEnabled(next === "on");
            }}
            options={[
              { value: "off", label: "Off" },
              { value: "on", label: "On" },
            ]}
          />
        </div>
      </div>
    {/snippet}
    {#snippet filesGroup()}
      <div class="pair">
        <span class="label">Files</span>
        <div class="group" role="group" aria-label="Files">
          <PanelButton
            size="compact"
            variant="quiet"
            onclick={(event) => {
              leavePlan();
              releaseFocus(event);
            }}>Plan</PanelButton
          >
          <PanelButton
            size="compact"
            variant="quiet"
            onclick={(event) => {
              bannerInput?.click();
              releaseFocus(event);
            }}>Banner</PanelButton
          >
          <PanelButton
            size="compact"
            variant="quiet"
            onclick={(event) => {
              aroundInput?.click();
              releaseFocus(event);
            }}>Surroundings</PanelButton
          >
        </div>
      </div>
    {/snippet}

    <header class="bar">
      {@render standGroup()}
      {@render viewGroup()}
      {#if compact}
        <span class="spacer"></span>
        <PanelButton
          size="compact"
          variant="quiet"
          onclick={(event) => {
            settingsOpen = true;
            releaseFocus(event);
          }}>Settings</PanelButton
        >
      {:else}
        {@render lightGroup()}
        {@render guestsGroup()}
        {@render fireGroup()}
        {@render soundGroup()}
        <span class="spacer"></span>
        {@render filesGroup()}
      {/if}
    </header>

    {#if compact}
      <BaseModal bind:open={settingsOpen} size="sm" onclose={() => (settingsOpen = false)} labelledBy="site-walk-settings">
        {#snippet header()}
          <h2 id="site-walk-settings" class="settings-title">Settings</h2>
        {/snippet}
        <div class="settings">
          {@render lightGroup()}
          {@render guestsGroup()}
          {@render fireGroup()}
          {@render soundGroup()}
          {@render filesGroup()}
        </div>
      </BaseModal>
    {/if}

    {#if legendShown}
      <SiteWalkKeys />
    {/if}

    {#if coarse}
      <VirtualJoystick onInput={(x, y) => (moveAxis = { x, z: y })} enabled={true} left={24} bottom={40} size={120} />
    {/if}

    <footer class="notes" aria-live="polite">
      {#if world.notDrawn.length > 0}
        <p>Not drawn: {world.notDrawn.join(", ")}.</p>
      {/if}
      {#if aroundError}
        <p>{aroundError}</p>
      {:else if aroundNotDrawn.length > 0}
        <p>Surroundings not drawn: {aroundNotDrawn.join(", ")}.</p>
      {/if}
      {#if guests.capped}
        <p>The guest area holds fewer people than asked for, so the crowd is smaller.</p>
      {/if}
    </footer>

    {#if reveal !== "gone"}
      <div class="curtain">
        <ScenePreparationSurface
          statusText="Setting up the site"
          {session}
          labels={["Setting up the site"]}
          sky={curtainSky}
          title={world.title}
          leaving={reveal === "leaving"}
          onLeft={() => (reveal = "gone")}
        />
      </div>
    {/if}
  {:else}
    <main
      class="empty"
      class:dragging
      ondragover={(event) => {
        event.preventDefault();
        dragging = true;
      }}
      ondragleave={() => (dragging = false)}
      ondrop={(event) => {
        event.preventDefault();
        dragging = false;
        void onPlanFile(event.dataTransfer?.files?.[0]);
      }}
    >
      <div class="card">
        <h1>Site walk</h1>
        <p>Open a site plan to stand in it at true size, at eye level.</p>
        <PanelButton variant="primary" onclick={() => planInput?.click()}>Open a site plan</PanelButton>
        <p class="small">Or drop the file here. It is read in this browser and stays on this computer.</p>
      </div>
    </main>
  {/if}

  {#if error}
    <p class="error" role="alert">{error}</p>
  {/if}

  <input
    bind:this={planInput}
    class="file"
    type="file"
    accept=".json,application/json"
    tabindex="-1"
    aria-hidden="true"
    onchange={(event) => {
      const input = event.currentTarget as HTMLInputElement;
      void onPlanFile(input.files?.[0]);
      input.value = "";
    }}
  />
  <input
    bind:this={aroundInput}
    class="file"
    type="file"
    accept=".json,application/json"
    tabindex="-1"
    aria-hidden="true"
    onchange={(event) => {
      const input = event.currentTarget as HTMLInputElement;
      void onAroundFile(input.files?.[0]);
      input.value = "";
    }}
  />
  <input
    bind:this={bannerInput}
    class="file"
    type="file"
    accept="image/*"
    tabindex="-1"
    aria-hidden="true"
    onchange={(event) => {
      const input = event.currentTarget as HTMLInputElement;
      void onBannerFile(input.files?.[0]);
      input.value = "";
    }}
  />
</div>

<style>
  .walk {
    /* behind the status bar: the 3D view fills the window; the bar inside it clears --safe-top */
    position: fixed;
    inset: 0;
    overflow: hidden;
    background: #05070c;
    color: rgb(255 244 228 / 0.92);
  }

  :global(body.site-walk-page > .mode-indicator) {
    display: none;
  }

  .file {
    position: absolute;
    width: 0;
    height: 0;
    opacity: 0;
    pointer-events: none;
  }

  .bar {
    position: absolute;
    top: calc(0.5rem + var(--safe-top, 0px));
    left: 0.5rem;
    right: 0.5rem;
    z-index: 20;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem 0.55rem;
    padding: 0.3rem 0.5rem;
    border-radius: 0.75rem;
    background: rgb(10 12 18 / 0.62);
    backdrop-filter: blur(6px);
  }

  .label {
    flex: 0 0 auto;
    margin: 0;
    font-size: var(--font-size-sm, 0.875rem);
    letter-spacing: 0.04em;
    white-space: nowrap;
    opacity: 0.8;
  }

  /* A label and its own controls are one unit: the bar wraps only between units. */
  .pair {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 0.25rem;
    white-space: nowrap;
  }

  .pair :global(button) {
    white-space: nowrap;
  }

  /* Compact file and stand buttons, so the whole bar fits one row from 1280 up. */
  .group :global(button) {
    min-height: 2rem;
    padding-inline: 0.55rem;
  }

  .spacer {
    flex: 1 1 0;
    min-width: 0.25rem;
  }

  /* A control sits at the width of its own content, never the whole bar. */
  .fit {
    flex: 0 0 auto;
    width: max-content;
  }

  /* Bar-sized segments: the shared control's touch size is for the app's own screens. */
  .fit :global(.segment) {
    min-height: 2rem;
    min-width: 0;
    padding: 0.2rem 0.6rem;
  }

  .group {
    display: flex;
    flex: 0 0 auto;
    gap: 0.3rem;
  }

  .settings {
    display: grid;
    gap: 0.9rem;
    justify-items: start;
  }

  .settings-title {
    margin: 0;
    font-size: var(--font-size-lg, 1.125rem);
  }

  .notes {
    position: absolute;
    left: 0.75rem;
    bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px));
    z-index: 20;
    max-width: min(34rem, calc(100vw - 1.5rem));
    pointer-events: none;
    text-shadow: 0 1px 8px rgb(0 0 0 / 0.7);
    font-size: var(--font-size-sm, 0.875rem);
  }

  .notes p {
    margin: 0 0 0.2rem;
  }

  .curtain {
    position: absolute;
    inset: 0;
    /* Above the thumbstick, which otherwise shows through the loading picture. */
    z-index: 110;
    overflow: hidden;
  }

  .empty {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 1rem;
    border: 2px dashed transparent;
    transition: border-color var(--transition-fast);
  }

  .empty.dragging {
    border-color: rgb(255 244 228 / 0.5);
  }

  .card {
    display: grid;
    gap: 0.9rem;
    justify-items: center;
    max-width: 26rem;
    padding: 1.75rem;
    border-radius: 1rem;
    background: rgb(255 255 255 / 0.06);
    text-align: center;
  }

  .card h1 {
    margin: 0;
    font-size: var(--font-size-2xl);
  }

  .card p {
    margin: 0;
  }

  .card .small {
    font-size: var(--font-size-sm, 0.875rem);
    opacity: 0.7;
  }

  .error {
    position: absolute;
    left: 50%;
    bottom: 3.5rem;
    z-index: 40;
    transform: translateX(-50%);
    margin: 0;
    padding: 0.4rem 0.9rem;
    border-radius: 999px;
    background: rgb(10 12 18 / 0.75);
    color: rgb(255 226 206);
    font-size: var(--font-size-sm, 0.875rem);
  }
</style>
