<!--
  Cache warm — full-control tool page.

  Renders + uploads the selected scope through the REAL
  ThumbnailRenderOrchestrator (zero parity risk), warming the shared cloud
  cache so cold-cache 404s stop. The AdminToolbar "Warm Gallery (lean)" button
  runs a fixed staff + fan/dark/QR subset; this page exposes the full
  prop x mode x QR matrix for a deliberate leave-it-running pass.

  Not an admin route. The Storage rules for thumbnails/ and pictograph-cells/
  accept any authenticated writer, anonymous guests included, so the page mints
  a guest identity on mount and only needs that. It used to live under /admin,
  whose layout guard bounced every non-admin session (including the in-app
  browser pane) to the home page before the tool could render.

  Standalone route, so nothing upstream runs the app's theme pipeline: the page
  calls ensureThemeApplied() and mounts the saved BackgroundHost itself. That is
  what makes it wear the same surfaces, accent and backdrop as the rest of the
  app instead of falling through every var() to a hardcoded default.

  After a run, index + bundle the results (credentialed, outside the browser):
    npm run thumbnails:manifest
    npm run thumbnails:sync

  Spec: docs/superpowers/specs/active/2026-07-02-gallery-thumbnail-warm-pass-design.md
-->
<script lang="ts">
  import { onMount } from "svelte";
  import type { BackgroundType } from "@austencloud/backgrounds";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import {
    PROP_PICKER_SECTIONS,
    getPropTypeDisplayInfo,
    isPropActive,
  } from "#lib/shared/pictograph/prop/domain/prop-type-display-registry.js";
  import { ensureGuestIdentity } from "#lib/shared/auth/services/guest-identity.js";
  import { getAuthInstance } from "#lib/shared/auth/firebase.js";
  import {
    startGalleryWarm,
    type WarmHandle,
    type WarmProgress,
    type WarmScope,
  } from "#lib/shared/browse/services/gallery-thumbnail-warmer.js";
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import SettingToggleButton from "#lib/shared/settings/components/SettingToggleButton.svelte";
  import { loadCanonicalTnDSequences } from "#lib/features/browse/gallery-home/canonical-tnd-pool.js";
  import {
    startScanCellWarm,
    type CellWarmHandle,
    type CellWarmProgress,
  } from "#lib/features/library/services/warm-all-scan-cells.js";
  import { growFade } from "#lib/shared/transitions/motion.js";

  type BackgroundHostComponent =
    (typeof import("#lib/shared/background/shared/components/BackgroundHost.svelte"))["default"];

  // Every prop a visitor can actually pick, kept in picker sections so the page
  // reads like the picker instead of one undifferentiated wall of chips.
  // Deactivated props are hidden from pickers, so nobody can browse the gallery
  // with them; skip them. Bare hands has no picker section of its own.
  const PROP_SECTIONS: { label: string; props: PropType[] }[] = [
    ...PROP_PICKER_SECTIONS.map((section) => ({
      label: section.label,
      props: section.props.filter(isPropActive),
    })),
    { label: "Hands", props: [PropType.HAND] },
  ].filter((section) => section.props.length > 0);

  const ALL_PROPS: PropType[] = PROP_SECTIONS.flatMap(
    (section) => section.props
  ).filter((prop, index, list) => list.indexOf(prop) === index);

  const propLabel = (prop: PropType) => getPropTypeDisplayInfo(prop).label;

  // Uploads need request.auth != null. Anonymous is enough, so mint it here
  // and report the resolved state; the write site re-checks on its own.
  let identityState = $state<"pending" | "ready" | "unavailable">("pending");

  // The app's own chrome: the saved theme drives every --theme-* token this
  // page reads, and the saved background renders behind it.
  let LiveBackground = $state<BackgroundHostComponent | null>(null);
  let backgroundType = $state<BackgroundType | null>(null);

  onMount(() => {
    // Standalone surface: no module ever reports boot completion here, so the
    // app.html splash would sit over the page until its safety timeout.
    (
      window as unknown as {
        __tkaLoadProgress?: (percent: number, message: string) => void;
      }
    ).__tkaLoadProgress?.(100, "Ready");

    let mounted = true;

    void (async () => {
      await ensureGuestIdentity("thumbnail_upload");
      const auth = await getAuthInstance();
      await auth.authStateReady();
      if (mounted) identityState = auth.currentUser ? "ready" : "unavailable";
    })();

    // Interface colors first, then the animated canvas — the renderer graph is
    // large and the tool is fully usable before it lands.
    void import("#lib/shared/settings/utils/background-theme-calculator.js").then(
      ({ ensureThemeApplied, getSavedBackgroundType }) => {
        if (!mounted) return;
        ensureThemeApplied();
        backgroundType = getSavedBackgroundType();
        void import(
          "#lib/shared/background/shared/components/BackgroundHost.svelte"
        ).then(({ default: BackgroundHost }) => {
          if (mounted) LiveBackground = BackgroundHost;
        });
      }
    );

    return () => {
      mounted = false;
    };
  });

  // Scope selection — lean defaults (matches the observed cold set).
  let selectedProps = $state<Set<PropType>>(
    new Set([PropType.STAFF, PropType.FAN])
  );
  let darkMode = $state(true);
  let lightMode = $state(false);
  let noQr = $state(true);
  let qr = $state(true);
  // The canonical T&D pool (~930 turn combos) enters the gallery via the
  // engine's extraCommunitySequences, not the public index — without this the
  // warm pass never sees those cards and they stay on the slow render tier.
  let includeTnDPool = $state(true);

  function toggleProp(prop: PropType) {
    const next = new Set(selectedProps);
    if (next.has(prop)) next.delete(prop);
    else next.add(prop);
    selectedProps = next;
  }

  function selectAllProps() {
    selectedProps = new Set(ALL_PROPS);
  }
  function selectStaffAndFan() {
    selectedProps = new Set([PropType.STAFF, PropType.FAN]);
    darkMode = true;
    lightMode = false;
    noQr = true;
    qr = true;
  }
  function clearProps() {
    selectedProps = new Set();
  }

  const scope = $derived<WarmScope>({
    props: ALL_PROPS.filter((p) => selectedProps.has(p)),
    modes: [
      ...(darkMode ? (["dark"] as const) : []),
      ...(lightMode ? (["light"] as const) : []),
    ],
    qr: [...(noQr ? [false] : []), ...(qr ? [true] : [])],
  });

  const scopeValid = $derived(
    scope.props.length > 0 && scope.modes.length > 0 && scope.qr.length > 0
  );
  const rendersPerSequence = $derived(
    scope.props.length * scope.modes.length * scope.qr.length
  );

  // Run state
  let handle = $state<WarmHandle | null>(null);
  let progress = $state<WarmProgress | null>(null);
  let startTime = $state(0);

  const isRunning = $derived(handle !== null);

  const percent = $derived(
    progress && progress.total > 0
      ? Math.round((progress.done / progress.total) * 100)
      : 0
  );

  const eta = $derived.by(() => {
    const p = progress;
    if (!p || p.done === 0 || p.finished) return "";
    const elapsed = Date.now() - startTime;
    const remaining = ((p.total - p.done) * elapsed) / p.done;
    const m = Math.floor(remaining / 60000);
    const s = Math.floor((remaining % 60000) / 1000);
    return `${m}m ${s}s`;
  });

  function start() {
    if (isRunning || !scopeValid) return;
    startTime = Date.now();
    progress = null;
    handle = startGalleryWarm(
      scope,
      (p) => {
        progress = p;
        if (p.finished) handle = null;
      },
      includeTnDPool ? { extraSequences: loadCanonicalTnDSequences } : undefined
    );
  }

  function cancel() {
    handle?.cancel();
  }

  // ── Scan-card cell warm (pictograph-cells cloud store) ──
  let cellHandle = $state<CellWarmHandle | null>(null);
  let cellProgress = $state<CellWarmProgress | null>(null);
  let cellStartTime = $state(0);

  const cellRunning = $derived(cellHandle !== null);

  const cellPercent = $derived(
    cellProgress && cellProgress.total > 0
      ? Math.round((cellProgress.done / cellProgress.total) * 100)
      : 0
  );

  const cellEta = $derived.by(() => {
    const p = cellProgress;
    if (!p || p.done === 0 || p.finished) return "";
    const elapsed = Date.now() - cellStartTime;
    const remaining = ((p.total - p.done) * elapsed) / p.done;
    const m = Math.floor(remaining / 60000);
    const s = Math.floor((remaining % 60000) / 1000);
    return `${m}m ${s}s`;
  });

  function startCells() {
    if (cellRunning) return;
    cellStartTime = Date.now();
    cellProgress = null;
    cellHandle = startScanCellWarm((p) => {
      cellProgress = p;
      if (p.finished) cellHandle = null;
    });
  }

  function cancelCells() {
    cellHandle?.cancel();
  }
</script>

<div class="warm-surface">
  <div class="surface-wash" aria-hidden="true"></div>
  {#if LiveBackground && backgroundType}
    <div class="surface-bg" aria-hidden="true">
      <LiveBackground {backgroundType} />
    </div>
  {/if}

  <div class="workspace">
    <header class="tool-header">
      <div class="header-icon" aria-hidden="true">
        <i class="fas fa-fire"></i>
      </div>
      <div class="header-copy">
        <h1>Cache warm</h1>
        <p>
          Render and upload through the real renderer so cold visitors get
          finished images instead of a slow client-side rasterize.
        </p>
      </div>
      <p class="identity" data-state={identityState}>
        <span class="dot"></span>
        {identityState === "pending"
          ? "Signing in as a guest writer"
          : identityState === "ready"
            ? "Guest writer ready"
            : "Sign-in unavailable"}
      </p>
    </header>

    {#if identityState === "unavailable"}
      <section class="zone gate">
        <div class="zone-body">
          <h2 class="zone-title">
            <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
            Uploads are blocked
          </h2>
          <p class="zone-note">
            Anonymous auth looks disabled for this Firebase project. Enable it,
            then reload this page.
          </p>
        </div>
      </section>
    {:else}
      <div class="zones">
        <section class="zone">
          <div class="zone-head">
            <h2 class="zone-title">
              <i class="fas fa-images" aria-hidden="true"></i>
              Gallery thumbnails
            </h2>
            <p class="zone-note">
              Every selected prop, mode and QR combination for each gallery
              sequence, written to <code>thumbnails/</code>.
            </p>
          </div>

          <div class="zone-body">
            <div class="field">
              <div class="field-head">
                <span class="field-label">Props</span>
                <span class="field-count"
                  >{scope.props.length} of {ALL_PROPS.length} selected</span
                >
                <div class="field-actions">
                  <FilterChipBase
                    label="Lean"
                    mode="action"
                    size="sm"
                    ariaLabel="Reset to the lean preset"
                    onclick={selectStaffAndFan}
                  />
                  <FilterChipBase
                    label="All"
                    mode="action"
                    size="sm"
                    ariaLabel="Select every prop"
                    onclick={selectAllProps}
                  />
                  <FilterChipBase
                    label="None"
                    mode="action"
                    size="sm"
                    disabled={scope.props.length === 0}
                    ariaLabel="Clear every prop"
                    onclick={clearProps}
                  />
                </div>
              </div>

              <div class="prop-sections">
                {#each PROP_SECTIONS as section (section.label)}
                  <div class="prop-section">
                    <span class="sub-label">{section.label}</span>
                    <div class="chips">
                      {#each section.props as prop (prop)}
                        <FilterChipBase
                          label={propLabel(prop)}
                          mode="toggle"
                          size="sm"
                          active={selectedProps.has(prop)}
                          onclick={() => toggleProp(prop)}
                        />
                      {/each}
                    </div>
                  </div>
                {/each}
              </div>
            </div>

            <div class="field-row">
              <div class="field">
                <span class="field-label">Mode</span>
                <div class="chips">
                  <FilterChipBase
                    label="Dark"
                    icon="fa-moon"
                    mode="toggle"
                    size="sm"
                    active={darkMode}
                    onclick={() => (darkMode = !darkMode)}
                  />
                  <FilterChipBase
                    label="Light"
                    icon="fa-sun"
                    mode="toggle"
                    size="sm"
                    active={lightMode}
                    onclick={() => (lightMode = !lightMode)}
                  />
                </div>
              </div>

              <div class="field">
                <span class="field-label">QR variant</span>
                <div class="chips">
                  <FilterChipBase
                    label="Without QR"
                    mode="toggle"
                    size="sm"
                    active={noQr}
                    onclick={() => (noQr = !noQr)}
                  />
                  <FilterChipBase
                    label="With QR"
                    icon="fa-qrcode"
                    mode="toggle"
                    size="sm"
                    active={qr}
                    onclick={() => (qr = !qr)}
                  />
                </div>
              </div>
            </div>

            <SettingToggleButton
              label="Include the canonical T&D pool"
              description="About 930 turn combinations that reach the gallery through the engine rather than the public index. Off leaves those cards on the slow render tier."
              checked={includeTnDPool}
              surface="card"
              onToggle={() => (includeTnDPool = !includeTnDPool)}
            />
          </div>

          <footer class="zone-foot">
            <p class="summary" class:invalid={!scopeValid}>
              {#if scopeValid}
                <strong>{rendersPerSequence}</strong> renders per sequence —
                {scope.props.length}
                {scope.props.length === 1 ? "prop" : "props"} ×
                {scope.modes.length}
                {scope.modes.length === 1 ? "mode" : "modes"} ×
                {scope.qr.length}
                QR {scope.qr.length === 1 ? "variant" : "variants"}
              {:else}
                Pick at least one prop, one mode and one QR variant.
              {/if}
            </p>
            {#if !isRunning}
              <PanelButton
                variant="primary"
                onclick={start}
                disabled={!scopeValid}
              >
                Start warm
              </PanelButton>
            {:else}
              <PanelButton variant="secondary" onclick={cancel}>
                Stop
              </PanelButton>
            {/if}
          </footer>

          {#if progress}
            <section class="progress" transition:growFade>
              <div
                class="bar"
                role="progressbar"
                aria-label="Gallery thumbnail warm progress"
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div class="fill" style:width="{percent}%"></div>
              </div>
              <div class="stats">
                <span
                  >{progress.done.toLocaleString()} / {progress.total.toLocaleString()}
                  ({percent}%)</span
                >
                <span class="eta"
                  >{progress.uploading
                    ? "Saving uploads"
                    : progress.finished
                      ? ""
                      : `ETA ${eta}`}</span
                >
              </div>
              <div class="tally">
                <span class="new">{progress.rendered} new</span>
                <span class="cached">{progress.skipped} cached</span>
                <span class="failed">{progress.failed} failed</span>
              </div>
              {#if progress.uploading}
                <div class="current">
                  Every render is done. Finishing the uploads still in flight —
                  leave this tab open until it says Done.
                </div>
              {:else if progress.current && !progress.finished}
                <div class="current">{progress.current}</div>
              {/if}
              {#if progress.failedCombinations.length > 0}
                <details class="failure-details">
                  <summary>
                    {progress.failedCombinations.length} failed {progress
                      .failedCombinations.length === 1
                      ? "combination"
                      : "combinations"}
                  </summary>
                  <ul>
                    {#each progress.failedCombinations as combination}
                      <li>{combination}</li>
                    {/each}
                  </ul>
                </details>
              {/if}
              {#if progress.finished}
                <div class="done">
                  {progress.cancelled
                    ? "Cancelled"
                    : "Done — every upload landed"} — now run the index and
                  bundle steps in the rail.
                </div>
              {/if}
            </section>
          {/if}
        </section>

        <div class="rail">
          <section class="zone">
            <div class="zone-head">
              <h2 class="zone-title">
                <i class="fas fa-qrcode" aria-hidden="true"></i>
                Scan-card cells
              </h2>
              <p class="zone-note">
                Per-pictograph cells (<code>pictograph-cells/</code>) for every
                durable QR shortcode, so /q scanners download images instead of
                rasterizing. Resolves each card's exact left and right props and
                verifies both light and dark assets.
              </p>
            </div>

            <footer class="zone-foot">
              <p class="summary">All QR codes, light and dark</p>
              {#if !cellRunning}
                <PanelButton variant="primary" onclick={startCells}>
                  Start cell warm
                </PanelButton>
              {:else}
                <PanelButton variant="secondary" onclick={cancelCells}>
                  Stop
                </PanelButton>
              {/if}
            </footer>

            {#if cellProgress}
              <section class="progress" transition:growFade>
                <div
                  class="bar"
                  role="progressbar"
                  aria-label="Scan-card cell warm progress"
                  aria-valuenow={cellPercent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div class="fill" style:width="{cellPercent}%"></div>
                </div>
                <div class="stats">
                  <span
                    >{cellProgress.done.toLocaleString()} / {cellProgress.total.toLocaleString()}
                    ({cellPercent}%)</span
                  >
                  <span class="eta"
                    >{cellProgress.finished ? "" : `ETA ${cellEta}`}</span
                  >
                </div>
                <div class="tally">
                  <span class="failed">{cellProgress.failed} failed</span>
                </div>
                {#if cellProgress.current && !cellProgress.finished}
                  <div class="current">{cellProgress.current}</div>
                {/if}
                {#if cellProgress.finished}
                  <div class="done">
                    {cellProgress.cancelled ? "Cancelled" : "Done"} — cells live in
                    the cloud store, so /q probes find them immediately with no manifest
                    step.
                  </div>
                {/if}
              </section>
            {/if}
          </section>

          <section class="zone">
            <div class="zone-head">
              <h2 class="zone-title">
                <i class="fas fa-terminal" aria-hidden="true"></i>
                After a gallery run
              </h2>
              <p class="zone-note">
                Run these outside the browser. They need credentials the page
                does not have.
              </p>
            </div>
            <div class="zone-body">
              <ol class="steps">
                <li><code>npm run thumbnails:manifest</code></li>
                <li><code>npm run thumbnails:sync</code></li>
              </ol>
              <p class="zone-note">
                The cell warm needs neither step; those assets are found by
                probe.
              </p>
            </div>
          </section>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  /* ── Surface ──
     Standalone route, so this page carries the chrome the app shell normally
     provides: the saved background behind a theme-derived wash. */
  .warm-surface {
    position: relative;
    display: flex;
    min-height: 100vh;
    min-height: 100dvh;
    color: var(--theme-text, #ffffff);
  }
  .surface-wash {
    position: fixed;
    inset: 0;
    z-index: 0;
    background:
      radial-gradient(
        120% 90% at 50% -10%,
        color-mix(in srgb, var(--theme-accent, #6366f1) 16%, transparent),
        transparent 62%
      ),
      #0a0a0a;
  }
  .surface-bg {
    position: fixed;
    inset: 0;
    z-index: 1;
  }
  .workspace {
    position: relative;
    z-index: 2;
    width: min(100%, var(--shell-w, 1440px));
    /* Auto margins on a flex child centre the tool in a canvas taller than it
       needs, and collapse to zero once the content overflows — so a 4K screen
       gets a composed page instead of a block stranded in the top corner, and
       a phone still scrolls from the top. */
    margin: auto;
    display: flex;
    flex-direction: column;
    gap: clamp(16px, 2vw, 28px);
    padding: clamp(20px, 3vw, 44px) clamp(16px, 3vw, 40px)
      clamp(48px, 6vw, 80px);
  }

  /* ── Header — the app's settings-tab header grammar ── */
  .tool-header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 16px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }
  .header-icon {
    width: 56px;
    height: 56px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    border-radius: 16px;
    background: linear-gradient(
      135deg,
      var(--theme-accent, #6366f1) 0%,
      color-mix(in srgb, var(--theme-accent, #6366f1) 55%, #000) 100%
    );
    color: var(--theme-text-on-accent, #ffffff);
    font-size: var(--font-size-2xl);
  }
  .header-copy {
    flex: 1 1 22rem;
    min-width: 0;
  }
  .header-copy h1 {
    margin: 0;
    font-size: var(--font-size-2xl);
    font-weight: 650;
    line-height: 1.2;
    color: var(--theme-text, #ffffff);
  }
  .header-copy p {
    margin: 4px 0 0;
    max-width: 64ch;
    font-size: var(--font-size-sm);
    line-height: 1.45;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.62));
  }
  .identity {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    padding: 8px 14px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 999px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    font-size: var(--font-size-sm);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.62));
    white-space: nowrap;
  }
  .identity .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }
  .identity[data-state="ready"] .dot {
    background: var(--semantic-success, #22c55e);
  }
  .identity[data-state="unavailable"] .dot {
    background: var(--semantic-error, #ef4444);
  }

  /* ── Zones — aligned functional panels, not a deck of equal cards ── */
  .zones {
    display: grid;
    gap: clamp(16px, 1.8vw, 28px);
    align-items: start;
  }
  @media (min-width: 1080px) {
    .zones {
      grid-template-columns: minmax(0, 1.7fr) minmax(340px, 0.85fr);
    }
  }
  .rail {
    display: grid;
    gap: clamp(16px, 1.8vw, 28px);
    align-content: start;
  }
  .zone {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 18px;
    background: var(--theme-panel-bg, rgba(0, 0, 0, 0.35));
    box-shadow: var(--theme-panel-shadow, 0 18px 44px rgba(0, 0, 0, 0.32));
    overflow: hidden;
  }
  .zone-head {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 20px 20px 0;
  }
  .zone-title {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0;
    font-size: var(--font-size-lg);
    font-weight: 650;
    color: var(--theme-text, #ffffff);
  }
  .zone-title i {
    font-size: var(--font-size-base);
    color: var(--theme-accent-strong, var(--theme-accent, #6366f1));
  }
  .zone-note {
    margin: 0;
    max-width: 64ch;
    font-size: var(--font-size-sm);
    line-height: 1.5;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.62));
  }
  .zone-body {
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 20px;
  }
  .zone-foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px 16px;
    margin-top: auto;
    padding: 16px 20px;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    background: var(--surface-inset, rgba(0, 0, 0, 0.2));
  }
  .summary {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.62));
    font-variant-numeric: tabular-nums;
  }
  .summary strong {
    color: var(--theme-text, #ffffff);
    font-size: var(--font-size-base);
    font-weight: 700;
  }
  .summary.invalid {
    color: var(--semantic-error, #ef4444);
  }

  /* ── Fields ── */
  .field {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }
  .field-row {
    display: flex;
    flex-wrap: wrap;
    gap: 20px clamp(24px, 3vw, 48px);
  }
  .field-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
  }
  .field-label {
    font-size: var(--font-size-sm);
    font-weight: 650;
    color: var(--theme-text, #ffffff);
  }
  .field-count {
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.62));
    font-variant-numeric: tabular-nums;
  }
  .field-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin-left: auto;
  }
  .prop-sections {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .prop-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .sub-label {
    font-size: var(--font-size-compact);
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  /* ── Progress ── */
  .progress {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 16px 20px 20px;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
  }
  .bar {
    height: 8px;
    border-radius: 999px;
    background: var(--theme-stroke, rgba(255, 255, 255, 0.12));
    overflow: hidden;
  }
  .fill {
    height: 100%;
    background: var(--theme-accent, #6366f1);
    transition: width var(--duration-emphasis, 280ms) ease-out;
  }
  .stats {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    font-size: var(--font-size-sm);
    font-variant-numeric: tabular-nums;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.62));
  }
  /* Reserve the ETA slot so the finished state does not reflow the row. */
  .eta {
    min-width: 8ch;
    text-align: right;
  }
  .tally {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    font-size: var(--font-size-sm);
    font-variant-numeric: tabular-nums;
  }
  .tally .new {
    color: var(--semantic-success, #22c55e);
  }
  .tally .cached {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.62));
  }
  .tally .failed {
    color: var(--semantic-error, #ef4444);
  }
  .current {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.62));
    overflow-wrap: anywhere;
  }
  .failure-details {
    color: var(--semantic-error, #ef4444);
    font-size: var(--font-size-sm);
  }
  .failure-details summary {
    display: flex;
    align-items: center;
    min-height: 32px;
    cursor: pointer;
  }
  .failure-details ul {
    max-height: 16rem;
    margin: 8px 0 0;
    padding-left: 1.25rem;
    overflow: auto;
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: var(--font-size-compact);
  }
  .done {
    padding: 12px 14px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    font-size: var(--font-size-sm);
    color: var(--theme-text, #ffffff);
  }

  /* ── After-run steps ── */
  .steps {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0;
    padding-left: 1.4rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.62));
    font-size: var(--font-size-sm);
  }
  .steps code {
    color: var(--theme-text, #ffffff);
  }
  code {
    padding: 0.15em 0.45em;
    border-radius: 6px;
    background: var(--surface-inset, rgba(0, 0, 0, 0.2));
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 0.9em;
  }

  /* ── Gate ── */
  .gate .zone-body {
    gap: 8px;
    padding: 28px 20px;
  }

  @media (max-width: 640px) {
    .zone-head {
      padding: 16px 16px 0;
    }
    .zone-body {
      padding: 16px;
    }
    .zone-foot {
      padding: 14px 16px;
    }
    .progress {
      padding: 14px 16px 16px;
    }
    .field-actions {
      margin-left: 0;
    }
  }
</style>
