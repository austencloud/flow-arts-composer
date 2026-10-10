<script lang="ts">
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import { fits3DViewport } from "#lib/shared/3d/capabilities/viewport-3d-gate.svelte.js";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import SequenceViewerTransitionReviewFrame from "./_components/SequenceViewerTransitionReviewFrame.svelte";
  import RailPropGlyphReview from "./_components/RailPropGlyphReview.svelte";
  import TransitionGeometryTrace from "./_components/TransitionGeometryTrace.svelte";
  import {
    TRANSITION_REVIEW_GATES,
    type TransitionReviewGateId,
  } from "./transition-review-gates";
  import { createTransitionReviewState } from "./transition-review-state.svelte";
  import {
    WORKSPACE_GATE_REVIEWS,
    isWorkspaceReplayCommand,
  } from "./workspace-review-replays";
  import type {
    TransitionGeometryTrace,
    TransitionTraceCommand,
  } from "./transition-geometry-trace";

  type ReplayCommand = TransitionTraceCommand;
  type ReplayStatus = "loading" | "ready" | "running" | "complete" | "error";

  interface FrameMetrics {
    viewportWidth: number;
    viewportHeight: number;
    overflowX: boolean;
    overflowY: boolean;
    panelDirection: "horizontal" | "vertical" | null;
    outerPanelCount: number;
    reducedMotion: boolean;
  }

  const VIEWPORTS = [
    { id: "phone", label: "375 × 667", width: 375, height: 667, scale: 0.9 },
    {
      id: "landscape",
      label: "960 × 412",
      width: 960,
      height: 412,
      scale: 0.78,
    },
    {
      id: "tablet",
      label: "820 × 1180",
      width: 820,
      height: 1180,
      scale: 0.58,
    },
    {
      id: "1440",
      label: "1440 × 900",
      width: 1440,
      height: 900,
      scale: 0.64,
    },
    {
      id: "1920",
      label: "1920 × 1080",
      width: 1920,
      height: 1080,
      scale: 0.49,
    },
    {
      id: "2560",
      label: "2560 × 1440",
      width: 2560,
      height: 1440,
      scale: 0.37,
    },
    { id: "4k", label: "3840 × 2160", width: 3840, height: 2160, scale: 0.25 },
  ] as const;

  const review = createTransitionReviewState();
  const isFrame = $derived(page.url.searchParams.get("frame") === "1");
  const isGlyphReview = $derived(page.url.searchParams.get("glyphs") === "1");
  const selectedViewport = $derived(
    VIEWPORTS.find((viewport) => viewport.id === viewportId) ?? VIEWPORTS[3]
  );
  const selectedViewportFits3D = $derived(
    fits3DViewport(selectedViewport.width, selectedViewport.height)
  );
  const activeGateCanReplay = $derived(
    review.activeGateId !== "2d-3d" || selectedViewportFits3D
  );
  const activeDecision = $derived(review.activeDecision);
  const activeGateNumber = $derived(
    Math.max(
      1,
      TRANSITION_REVIEW_GATES.findIndex(
        (gate) => gate.id === review.activeGateId
      ) + 1
    )
  );
  const readyGateCount = $derived(
    TRANSITION_REVIEW_GATES.filter((gate) => gate.availability === "ready")
      .length
  );
  const acceptanceItems = $derived(
    WORKSPACE_GATE_REVIEWS[
      review.activeGateId as keyof typeof WORKSPACE_GATE_REVIEWS
    ]?.acceptance ??
      (review.activeGateId === "2d-3d"
        ? [
            "3D owns the viewer stage immediately after selection; 2D never masquerades as the chosen mode",
            "engine, scene, cast, and warmup phases disclose the real preparation state",
            "progress only moves forward and the first ready frame replaces the preparation surface cleanly",
            "repeat switches crossfade on the same clock in both directions",
            "rapid reversals never expose a blank or unprotected scene",
          ]
        : review.activeGateId === "stage-tunnel"
          ? [
              "2D and Tunnel retain the same Animator canvas and backing store",
              "Tunnel performers and effects bloom into the live 2D base without a surface crossfade",
              "the outer inspector stays mounted while its 2D and Tunnel controls trade places",
              "3D, rapid reversals, and reduced motion retain a ready, continuous viewer stage",
            ]
          : review.activeGateId === "card-stage"
            ? [
                "Card, Animator, and desktop inspector keep one DOM identity through every round trip",
                "Card and motion views exchange the workspace directly, without a Side-by-Side intermediate frame",
                "both directions travel monotonically on one structural clock without squashed or transformed Card cells",
                "Card, 2D, and Tunnel controls trade places inside one inspector; 3D releases that track into the viewer stage on the same clock",
                "rapid reversals and reduced motion never expose a blank workspace",
              ]
            : review.activeGateId === "performances"
              ? [
                  "the outer viewer stage and inspector retain one DOM identity for every round trip",
                  "the selected performance replaces the motion source inside the same stage allocation",
                  "Performance details replace Motion settings inside the same prepared inspector width",
                  "one shared state owns selection, one player, upload, mapping, and the sequence playhead",
                  "2D, ready 3D, rapid reversals, mobile layout, and reduced motion all remain stable",
                ]
              : [
                  "one continuous edge traveling across the workspace",
                  "no canvas or card remount flash",
                  "clean reversals during interrupted motion",
                  "an opacity-only dissolve with reduced motion",
                ])
  );
  const replayOptions = $derived<
    Array<{
      command: ReplayCommand;
      label: string;
      primary?: boolean;
      requires3D?: boolean;
    }>
  >(
    WORKSPACE_GATE_REVIEWS[
      review.activeGateId as keyof typeof WORKSPACE_GATE_REVIEWS
    ]?.options ??
      (review.activeGateId === "2d-3d"
        ? [
            { command: "3d-first", label: "Replay first 3D" },
            { command: "3d-repeat", label: "Replay repeat switch" },
            {
              command: "3d-interrupt",
              label: "Stress reversal",
              primary: true,
            },
          ]
        : review.activeGateId === "stage-tunnel"
          ? [
              { command: "tunnel-first", label: "Replay first Tunnel" },
              {
                command: "tunnel-3d",
                label: "Replay from 3D",
                requires3D: true,
              },
              {
                command: "tunnel-interrupt",
                label: "Stress reversal",
                primary: true,
              },
            ]
          : review.activeGateId === "card-stage"
            ? [
                { command: "card-2d", label: "Replay with 2D" },
                {
                  command: "card-3d",
                  label: "Replay with 3D",
                  requires3D: true,
                },
                { command: "card-tunnel", label: "Replay with Tunnel" },
                {
                  command: "card-performances",
                  label: "Replay with Performances",
                },
                {
                  command: "card-stage-interrupt",
                  label: "Stress reversal",
                  primary: true,
                },
              ]
            : review.activeGateId === "performances"
              ? [
                  {
                    command: "performances-2d",
                    label: "Replay with 2D",
                  },
                  {
                    command: "performances-3d",
                    label: "Replay with 3D",
                    requires3D: true,
                  },
                  {
                    command: "performances-interrupt",
                    label: "Stress reversal",
                    primary: true,
                  },
                ]
              : [
                  { command: "2d", label: "Replay 2D" },
                  { command: "card", label: "Replay Card" },
                  {
                    command: "interrupt",
                    label: "Stress reversal",
                    primary: true,
                  },
                ])
  );
  const frameSource = $derived(
    `/test/sequence-viewer-transitions?frame=1&gate=${review.activeGateId}`
  );

  let viewportId = $state<(typeof VIEWPORTS)[number]["id"]>("1440");
  let motionPreference = $state<"full" | "reduce">("full");
  let frameElement = $state<HTMLIFrameElement | null>(null);
  let frameMetrics = $state<FrameMetrics | null>(null);
  let lastTrace = $state<TransitionGeometryTrace | null>(null);
  let replayStatus = $state<ReplayStatus>("loading");
  let replayDetail = $state("Loading the production viewer…");
  let frameVersion = $state(0);
  let pendingReplay = $state<ReplayCommand | null>(null);

  function statusLabel(gateId: TransitionReviewGateId): string {
    const gate = TRANSITION_REVIEW_GATES.find(
      (candidate) => candidate.id === gateId
    );
    if (gate?.availability === "pending") return "Queued";

    const status = review.decisions[gateId].status;
    if (status === "approved") return "Approved";
    if (status === "needs-changes") return "Needs changes";
    return "Ready to review";
  }

  function formatReviewDate(value: string | null): string {
    if (!value) return "No decision recorded";
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  }

  function postReplay(command: ReplayCommand): void {
    if (!frameElement?.contentWindow || replayStatus === "loading") return;
    replayStatus = "running";
    replayDetail =
      command === "interrupt" ||
      command === "3d-interrupt" ||
      command === "tunnel-interrupt" ||
      command === "card-stage-interrupt" ||
      command === "performances-interrupt"
        ? "Reversing the workspace before each prior move settles…"
        : command === "3d-first"
          ? "Loading 3D behind the live 2D frame, then returning…"
          : command === "3d-repeat"
            ? "Replaying the warmed 2D and 3D round trip…"
            : command === "tunnel-first"
              ? "Preparing the first Tunnel behind the live 2D view, then returning…"
              : command === "tunnel-3d"
                ? "Moving from the ready 3D view into Tunnel and back…"
                : command === "card-2d"
                  ? "Moving directly from Card into 2D and back…"
                  : command === "card-3d"
                    ? "Moving directly from Card into a ready 3D view and back…"
                    : command === "card-tunnel"
                      ? "Moving directly from Card into the Tunnel view and back…"
                      : command === "card-performances"
                        ? "Moving directly from Card into Performances and back…"
                        : command === "performances-2d"
                          ? "Letting Performances inherit the 2D viewer stage and returning…"
                          : command === "performances-3d"
                            ? "Letting Performances inherit the ready 3D viewer stage and returning…"
                            : `Replaying the ${command === "2d" ? "2D" : "Card"} round trip…`;
    frameElement.contentWindow.postMessage(
      {
        source: "sequence-viewer-transition-review",
        action: "replay",
        command,
      },
      window.location.origin
    );
  }

  function replay(command: ReplayCommand): void {
    if (replayStatus === "loading" || replayStatus === "running") return;
    lastTrace = null;
    if (
      command === "3d-first" ||
      command === "tunnel-first" ||
      command === "card-3d" ||
      command === "performances-3d"
    ) {
      pendingReplay = command;
      replayStatus = "loading";
      replayDetail =
        command === "3d-first"
          ? "Reloading a fresh production viewer for first 3D…"
          : command === "tunnel-first"
            ? "Reloading a fresh production viewer for first Tunnel…"
            : command === "card-3d"
              ? "Reloading a fresh production viewer for Card and first 3D…"
              : "Reloading a fresh production viewer for Performances and first 3D…";
      frameVersion += 1;
      return;
    }
    postReplay(command);
  }

  function selectGate(gateId: TransitionReviewGateId): void {
    review.selectGate(gateId);
    const url = new URL(page.url.href);
    url.searchParams.set("gate", gateId);
    goto(url, { shallow: true, replace: true, state: page.state });
    frameMetrics = null;
    lastTrace = null;
    pendingReplay = null;
    replayStatus = "loading";
    replayDetail = "Loading the production viewer for this gate…";
  }

  function sendMotionPreference(): void {
    frameElement?.contentWindow?.postMessage(
      {
        source: "sequence-viewer-transition-review",
        action: "motion",
        preference: motionPreference,
      },
      window.location.origin
    );
  }

  function requestFrameStatus(): void {
    frameElement?.contentWindow?.postMessage(
      {
        source: "sequence-viewer-transition-review",
        action: "status",
      },
      window.location.origin
    );
  }

  function setMotionPreference(value: string): void {
    motionPreference = value === "reduce" ? "reduce" : "full";
    sendMotionPreference();
  }

  function setViewport(value: string): void {
    const nextViewportId = value as (typeof VIEWPORTS)[number]["id"];
    if (nextViewportId === viewportId) return;
    viewportId = nextViewportId;
    frameMetrics = null;
    lastTrace = null;
    replayStatus = "loading";
    replayDetail = "Loading the production viewer at the selected viewport…";
  }

  onMount(() => {
    document.getElementById("app-loading")?.remove();
    if (isFrame) return;

    review.load();
    const requestedGateId = page.url.searchParams.get("gate");
    const requestedGate = TRANSITION_REVIEW_GATES.find(
      (gate) => gate.id === requestedGateId && gate.availability === "ready"
    );
    if (requestedGate) review.selectGate(requestedGate.id);
    const handleFrameMessage = (event: MessageEvent<unknown>) => {
      if (
        event.source !== frameElement?.contentWindow ||
        event.origin !== window.location.origin ||
        !event.data ||
        typeof event.data !== "object"
      ) {
        return;
      }

      const message = event.data as {
        source?: unknown;
        status?: unknown;
        detail?: unknown;
        metrics?: unknown;
        trace?: unknown;
      };
      if (message.source !== "sequence-viewer-transition-frame") return;
      if (message.status === "trace") {
        const trace = message.trace as
          | Partial<TransitionGeometryTrace>
          | undefined;
        if (
          trace &&
          (isWorkspaceReplayCommand(trace.command) ||
            trace.command === "2d" ||
            trace.command === "card" ||
            trace.command === "interrupt" ||
            trace.command === "3d-first" ||
            trace.command === "3d-repeat" ||
            trace.command === "3d-interrupt" ||
            trace.command === "tunnel-first" ||
            trace.command === "tunnel-3d" ||
            trace.command === "tunnel-interrupt" ||
            trace.command === "card-2d" ||
            trace.command === "card-3d" ||
            trace.command === "card-tunnel" ||
            trace.command === "card-performances" ||
            trace.command === "card-stage-interrupt" ||
            trace.command === "performances-2d" ||
            trace.command === "performances-3d" ||
            trace.command === "performances-interrupt") &&
          typeof trace.duration === "number" &&
          Array.isArray(trace.samples)
        ) {
          lastTrace = trace as TransitionGeometryTrace;
        }
        return;
      }
      if (message.status === "metrics") {
        const metrics = message.metrics as Partial<FrameMetrics> | undefined;
        if (
          metrics &&
          typeof metrics.viewportWidth === "number" &&
          typeof metrics.viewportHeight === "number" &&
          typeof metrics.overflowX === "boolean" &&
          typeof metrics.overflowY === "boolean" &&
          (metrics.panelDirection === "horizontal" ||
            metrics.panelDirection === "vertical" ||
            metrics.panelDirection === null) &&
          typeof metrics.outerPanelCount === "number" &&
          typeof metrics.reducedMotion === "boolean"
        ) {
          frameMetrics = metrics as FrameMetrics;
        }
        return;
      }
      if (
        message.status !== "ready" &&
        message.status !== "running" &&
        message.status !== "complete" &&
        message.status !== "error"
      ) {
        return;
      }

      replayStatus = message.status;
      if (message.status === "ready") {
        sendMotionPreference();
        const command = pendingReplay;
        pendingReplay = null;
        if (command) queueMicrotask(() => postReplay(command));
      }
      replayDetail =
        typeof message.detail === "string"
          ? message.detail
          : message.status === "ready"
            ? "Production viewer ready. Use its switcher or a replay button."
            : message.status === "running"
              ? "Replay in progress…"
              : message.status === "complete"
                ? "Round trip complete."
                : "The replay could not complete.";
    };

    window.addEventListener("message", handleFrameMessage);
    requestFrameStatus();
    return () => window.removeEventListener("message", handleFrameMessage);
  });
</script>

<svelte:head>
  <title
    >{isGlyphReview
      ? "Sequence Viewer prop glyph fit"
      : isFrame
        ? "Sequence Viewer transition frame"
        : "Sequence Viewer transition review"}</title
  >
</svelte:head>

{#if isGlyphReview}
  <RailPropGlyphReview />
{:else if isFrame}
  <SequenceViewerTransitionReviewFrame />
{:else}
  <main class="review-page">
    <header class="review-header">
      <div>
        <span class="eyebrow">A+ motion program</span>
        <h1>Sequence Viewer transitions</h1>
        <p>
          One production transition at a time. Each gate keeps its dated verdict
          in this browser.
        </p>
      </div>
      <a class="direct-frame" href={frameSource}>Open full-size viewer</a>
    </header>

    <div class="review-layout">
      <aside class="gate-rail">
        <header>
          <strong>Transition map</strong>
          <span>{readyGateCount} of {TRANSITION_REVIEW_GATES.length} ready</span
          >
        </header>
        <nav aria-label="Sequence Viewer transition gates">
          {#each TRANSITION_REVIEW_GATES as gate, index}
            <button
              type="button"
              class="gate-button"
              class:active={gate.id === review.activeGateId}
              class:pending={gate.availability === "pending"}
              disabled={gate.availability === "pending"}
              onclick={() => selectGate(gate.id)}
            >
              <span class="gate-number">{index + 1}</span>
              <span class="gate-copy">
                <strong>{gate.title}</strong>
                <small>{gate.summary}</small>
              </span>
              <span
                class="gate-status"
                data-status={review.decisions[gate.id].status}
                >{statusLabel(gate.id)}</span
              >
            </button>
          {/each}
        </nav>
      </aside>

      <section class="review-workspace" aria-labelledby="active-gate-title">
        <header class="workspace-header">
          <div>
            <span
              >Gate {activeGateNumber} · Current grade {review.activeGate
                .fromGrade}</span
            >
            <h2 id="active-gate-title">{review.activeGate.title}</h2>
          </div>
          <div class="target-grade" aria-label="Target grade A plus">A+</div>
        </header>

        <div class="acceptance-strip">
          <span>Look for</span>
          <ul>
            {#each acceptanceItems as item}
              <li>{item}</li>
            {/each}
          </ul>
        </div>

        <div class="review-toolbar">
          <div class="review-options">
            <div class="viewport-control">
              <span id="transition-review-viewport-label">Viewport</span>
              <SegmentedControl
                options={VIEWPORTS.map((viewport) => ({
                  value: viewport.id,
                  label: viewport.label,
                }))}
                value={viewportId}
                onchange={setViewport}
                ariaLabelledby="transition-review-viewport-label"
                size="sm"
              />
            </div>
            <div class="motion-control">
              <span id="transition-review-motion-label">Motion</span>
              <SegmentedControl
                options={[
                  { value: "full", label: "Full" },
                  { value: "reduce", label: "Reduced" },
                ]}
                value={motionPreference}
                onchange={setMotionPreference}
                ariaLabelledby="transition-review-motion-label"
                size="sm"
              />
            </div>
          </div>

          <div
            class="replay-controls"
            aria-label="Automated transition replays"
          >
            {#each replayOptions as option}
              <PanelButton
                variant={option.primary ? "primary" : "secondary"}
                disabled={replayStatus === "loading" ||
                  replayStatus === "running" ||
                  !activeGateCanReplay ||
                  (option.requires3D && !selectedViewportFits3D)}
                onclick={() => replay(option.command)}
                >{option.label}</PanelButton
              >
            {/each}
          </div>
        </div>

        {#if !activeGateCanReplay}
          <p class="viewport-gate-note">
            3D is intentionally withheld at this viewport. Use this size to
            review the responsive layout; transition replays resume when the
            production 3D viewport gate passes.
          </p>
        {:else if review.activeGateId === "stage-tunnel" && !selectedViewportFits3D}
          <p class="viewport-gate-note">
            The 3D-to-Tunnel replay is intentionally withheld at this viewport.
            The first-Tunnel and reversal replays remain available against the
            production 2D view.
          </p>
        {:else if review.activeGateId === "card-stage" && !selectedViewportFits3D}
          <p class="viewport-gate-note">
            Card-to-3D is intentionally withheld at this viewport. The 2D,
            Tunnel, and reversal replays remain available against the production
            compact layout.
          </p>
        {/if}

        <div class="review-feedback">
          <p
            class="replay-status"
            data-status={replayStatus}
            aria-live="polite"
          >
            <span></span>{replayDetail}
          </p>
          <div class="health-badges" aria-live="polite">
            <span
              data-health={frameMetrics &&
              !frameMetrics.overflowX &&
              !frameMetrics.overflowY
                ? "good"
                : "pending"}
              >{frameMetrics
                ? frameMetrics.overflowX || frameMetrics.overflowY
                  ? "Overflow detected"
                  : "No viewport overflow"
                : "Measuring viewport…"}</span
            >
            <span
              data-health={frameMetrics?.panelDirection ? "good" : "pending"}
              >{frameMetrics?.panelDirection
                ? `${frameMetrics.panelDirection === "horizontal" ? "Horizontal" : "Vertical"} panels`
                : "Measuring panels…"}</span
            >
            <span data-health={frameMetrics?.reducedMotion ? "reduced" : "full"}
              >{frameMetrics?.reducedMotion
                ? "Reduced motion · dissolve"
                : "Full motion"}</span
            >
          </div>
        </div>

        <div class="preview-panel">
          <header>
            <span>{selectedViewport.width} × {selectedViewport.height}</span>
            <span>{Math.round(selectedViewport.scale * 100)}% review scale</span
            >
          </header>
          <div class="preview-scroll">
            <div
              class="viewport-shell"
              style:width={`${selectedViewport.width * selectedViewport.scale}px`}
              style:height={`${selectedViewport.height * selectedViewport.scale}px`}
            >
              {#key `${selectedViewport.id}-${review.activeGateId}-${frameVersion}`}
                <iframe
                  bind:this={frameElement}
                  src={frameSource}
                  onload={requestFrameStatus}
                  title={`${review.activeGate.title} production preview`}
                  style:width={`${selectedViewport.width}px`}
                  style:height={`${selectedViewport.height}px`}
                  style:transform={`scale(${selectedViewport.scale})`}
                ></iframe>
              {/key}
            </div>
          </div>
        </div>

        {#if lastTrace}
          <TransitionGeometryTrace trace={lastTrace} />
        {/if}

        <section class="decision-panel" aria-labelledby="decision-title">
          <div class="decision-copy">
            <span>Visual gate</span>
            <h3 id="decision-title">Your dated confirmation</h3>
            <p>{formatReviewDate(activeDecision.reviewedAt)}</p>
          </div>
          <label>
            Review note
            <textarea
              value={activeDecision.note}
              placeholder="What still catches your eye?"
              oninput={(event) => review.updateNote(event.currentTarget.value)}
            ></textarea>
          </label>
          <div class="decision-actions">
            <PanelButton
              variant="secondary"
              onclick={() => review.mark("needs-changes")}
              >Needs work</PanelButton
            >
            <PanelButton
              variant="primary"
              onclick={() => review.mark("approved")}
              >Approve Gate {activeGateNumber}</PanelButton
            >
          </div>
          {#if !review.storageAvailable}
            <p class="storage-warning">
              Browser storage is unavailable, so this verdict cannot survive a
              reload.
            </p>
          {/if}
        </section>
      </section>
    </div>
  </main>
{/if}

<style>
  :global(html),
  :global(body) {
    margin: 0;
    min-height: 100%;
    background: var(--theme-bg, #090b11);
  }

  .review-page {
    box-sizing: border-box;
    height: 100dvh;
    min-height: 0;
    padding: clamp(16px, 2vw, 36px);
    overflow-y: auto;
    overscroll-behavior-y: contain;
    scrollbar-gutter: stable;
    background:
      radial-gradient(
        circle at 12% 5%,
        color-mix(in srgb, var(--theme-accent, #8b6cff) 16%, transparent),
        transparent 28%
      ),
      var(--theme-bg, #090b11);
    color: var(--theme-text, #f7f8fb);
  }

  .review-header,
  .review-layout {
    width: min(100%, 1840px);
    margin-inline: auto;
  }

  .review-header {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: var(--spacing-lg, 24px);
    margin-bottom: var(--spacing-lg, 24px);
  }

  .eyebrow,
  .workspace-header span,
  .acceptance-strip > span,
  .viewport-control > span,
  .motion-control > span,
  .decision-copy > span {
    color: var(--theme-accent, #9b7cff);
    font-size: var(--font-size-compact, 12px);
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  h1,
  h2,
  h3,
  p {
    margin: 0;
  }

  h1 {
    margin-top: 4px;
    font-size: clamp(30px, 3vw, 50px);
    line-height: 1.05;
  }

  .review-header p {
    max-width: 680px;
    margin-top: 8px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.64));
  }

  .direct-frame {
    display: inline-flex;
    min-height: var(--min-touch-target, 44px);
    align-items: center;
    padding: 0 16px;
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.18));
    border-radius: var(--radius-md, 10px);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    color: var(--theme-text, #fff);
    text-decoration: none;
  }

  .review-layout {
    display: grid;
    grid-template-columns: minmax(280px, 350px) minmax(0, 1fr);
    gap: 18px;
  }

  .gate-rail,
  .review-workspace,
  .decision-panel {
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-panel-bg, #11131a);
  }

  .gate-rail,
  .review-workspace {
    border-radius: var(--radius-xl, 18px);
  }

  .gate-rail {
    align-self: start;
    padding: 10px;
  }

  .gate-rail > header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 10px 12px;
  }

  .gate-rail > header span {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.58));
    font-size: var(--font-size-compact, 12px);
  }

  .gate-rail nav {
    display: grid;
    gap: 6px;
  }

  .gate-button {
    display: grid;
    min-height: var(--min-touch-target, 44px);
    grid-template-columns: 30px minmax(0, 1fr) auto;
    align-items: start;
    gap: 10px;
    padding: 10px;
    border: 1px solid transparent;
    border-radius: var(--radius-lg, 12px);
    background: transparent;
    color: var(--theme-text, #fff);
    text-align: left;
    cursor: pointer;
    transition:
      border-color var(--transition-fast),
      background-color var(--transition-fast),
      opacity var(--transition-fast);
  }

  .gate-button.active {
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #8b6cff) 48%,
      transparent
    );
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b6cff) 14%,
      transparent
    );
  }

  .gate-button.pending {
    opacity: 0.54;
    cursor: not-allowed;
  }

  .gate-number {
    display: grid;
    width: 28px;
    height: 28px;
    place-items: center;
    border-radius: 8px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    font-size: var(--font-size-compact, 12px);
    font-variant-numeric: tabular-nums;
  }

  .gate-copy strong,
  .gate-copy small {
    display: block;
  }

  .gate-copy small {
    margin-top: 3px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.58));
    font-size: var(--font-size-compact, 12px);
    line-height: 1.35;
  }

  .gate-status {
    padding: 4px 7px;
    border-radius: 999px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.62));
    font-size: var(--font-size-compact, 12px);
    white-space: nowrap;
  }

  .gate-status[data-status="approved"] {
    color: var(--semantic-success, #4ade80);
  }

  .gate-status[data-status="needs-changes"] {
    color: var(--semantic-warning, #fbbf24);
  }

  .review-workspace {
    min-width: 0;
    padding: 16px;
  }

  .workspace-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .workspace-header span {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.58));
  }

  .workspace-header h2 {
    margin-top: 4px;
    font-size: clamp(22px, 2vw, 30px);
  }

  .target-grade {
    display: grid;
    width: 58px;
    height: 58px;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--theme-accent) 55%, transparent);
    border-radius: 16px;
    background: color-mix(in srgb, var(--theme-accent) 15%, transparent);
    color: var(--theme-accent, #a78bfa);
    font-size: 24px;
    font-weight: 900;
  }

  .acceptance-strip {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 16px;
    margin-top: 16px;
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.045));
  }

  .acceptance-strip ul {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 22px;
    margin: 0;
    padding-left: 18px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.66));
    font-size: var(--font-size-sm, 14px);
  }

  .review-toolbar {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 16px;
    margin-top: 16px;
  }

  .review-options {
    display: flex;
    min-width: 0;
    flex-wrap: wrap;
    align-items: end;
    gap: 12px;
  }

  .viewport-control {
    min-width: 0;
  }

  .viewport-control > span,
  .motion-control > span {
    display: block;
    margin-bottom: 7px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.58));
  }

  .viewport-control :global(.segmented-control) {
    max-width: 100%;
    overflow-x: auto;
  }

  .replay-controls {
    display: flex;
    flex: none;
    gap: 8px;
  }

  .review-feedback {
    display: flex;
    min-height: 34px;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: 8px;
  }

  .viewport-gate-note {
    margin: 0;
    padding: 0.7rem 0.85rem;
    border: 1px solid color-mix(in srgb, var(--theme-accent) 30%, transparent);
    border-radius: 0.7rem;
    background: color-mix(in srgb, var(--theme-accent) 8%, transparent);
    color: var(--theme-text-secondary);
    font-size: 0.82rem;
    line-height: 1.45;
  }

  .replay-status {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 26px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.62));
    font-size: var(--font-size-sm, 14px);
  }

  .replay-status span {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--theme-text-dim, rgba(255, 255, 255, 0.45));
  }

  .replay-status[data-status="ready"] span,
  .replay-status[data-status="complete"] span {
    background: var(--semantic-success, #4ade80);
  }

  .replay-status[data-status="running"] span {
    background: var(--theme-accent, #a78bfa);
    animation: reviewPulse 900ms ease-in-out infinite alternate;
  }

  .replay-status[data-status="error"] span {
    background: var(--semantic-error, #f87171);
  }

  .health-badges {
    display: flex;
    flex: none;
    flex-wrap: wrap;
    justify-content: end;
    gap: 6px;
  }

  .health-badges span {
    padding: 5px 8px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 999px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.045));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.64));
    font-size: var(--font-size-compact, 12px);
  }

  .health-badges span[data-health="good"] {
    color: var(--semantic-success, #4ade80);
  }

  .health-badges span[data-health="reduced"] {
    color: var(--theme-accent, #a78bfa);
  }

  @keyframes reviewPulse {
    to {
      opacity: 0.35;
      transform: scale(0.7);
    }
  }

  .preview-panel {
    margin-top: 8px;
    overflow: hidden;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 14px;
    background: var(--theme-bg-deep, #05070a);
  }

  .preview-panel > header {
    display: flex;
    justify-content: space-between;
    padding: 8px 10px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.58));
    font-size: var(--font-size-compact, 12px);
    font-variant-numeric: tabular-nums;
  }

  .preview-scroll {
    min-height: 610px;
    padding: 18px;
    overflow: auto;
  }

  .viewport-shell {
    margin-inline: auto;
  }

  .viewport-shell iframe {
    display: block;
    border: 0;
    transform-origin: top left;
    background: var(--theme-bg, #090b11);
  }

  .decision-panel {
    display: grid;
    grid-template-columns: minmax(180px, 0.7fr) minmax(260px, 1.4fr) auto;
    align-items: end;
    gap: 16px;
    margin-top: 14px;
    padding: 14px;
    border-radius: 14px;
  }

  .decision-copy h3 {
    margin-top: 3px;
    font-size: var(--font-size-lg, 18px);
  }

  .decision-copy p {
    margin-top: 4px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.58));
    font-size: var(--font-size-compact, 12px);
  }

  .decision-panel label {
    display: grid;
    gap: 6px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.66));
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
  }

  .decision-panel textarea {
    min-height: 58px;
    resize: vertical;
    padding: 9px 10px;
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.18));
    border-radius: 9px;
    background: var(--theme-input-bg, rgba(0, 0, 0, 0.24));
    color: var(--theme-text, #fff);
    font: inherit;
  }

  .decision-actions {
    display: flex;
    gap: 8px;
  }

  .storage-warning {
    grid-column: 1 / -1;
    color: var(--semantic-warning, #fbbf24);
    font-size: var(--font-size-compact, 12px);
  }

  @media (max-width: 1180px) {
    .review-layout {
      grid-template-columns: 1fr;
    }

    .gate-rail nav {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .review-toolbar,
    .decision-panel {
      align-items: stretch;
      grid-template-columns: 1fr;
      flex-direction: column;
    }

    .decision-panel {
      display: grid;
    }
  }

  @media (max-width: 720px) {
    .review-page {
      padding: 10px;
    }

    .review-header {
      align-items: start;
      flex-direction: column;
    }

    .gate-rail nav {
      grid-template-columns: 1fr;
    }

    .acceptance-strip {
      grid-template-columns: 1fr;
    }

    .replay-controls,
    .decision-actions {
      flex-wrap: wrap;
    }

    .review-feedback {
      align-items: start;
      flex-direction: column;
    }

    .health-badges {
      justify-content: start;
    }

    .preview-scroll {
      min-height: 470px;
      padding: 8px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .gate-button {
      transition: none;
    }

    .replay-status[data-status="running"] span {
      animation: none;
    }
  }
</style>
