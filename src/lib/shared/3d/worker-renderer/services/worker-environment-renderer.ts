import { prefersReducedMotion } from "../../environments/primitives/motion-preference";
import { motionDuration } from "$lib/shared/transitions/motion";
import { DURATION } from "$lib/shared/transitions/transitions";
import { getWorkerEnvironmentCamera } from "../domain/worker-environment-camera";
import {
  clampWorkerViewport,
  type WorkerCameraSnapshot,
  type WorkerEffectQualityTier,
  type WorkerEnvironmentKey,
  type WorkerRendererBootMetrics,
  type WorkerRendererInMessage,
  type WorkerRendererOutMessage,
  type WorkerPerformerSnapshot,
  type WorkerSceneEffectsSnapshot,
  type WorkerViewport,
} from "../domain/worker-renderer-protocol";
import { WorkerRendererResponsivenessProbe } from "./worker-renderer-responsiveness-probe";
import { WorkerRendererSlot } from "./worker-renderer-slot";

interface PendingEnvironment {
  requestId: number;
  environment: WorkerEnvironmentKey;
  requestedAt: number;
}

export type WorkerSceneSwitchEventKind =
  | "prefetch"
  | "requested"
  | "started"
  | "phase"
  | "cancelled"
  | "retrying"
  | "failed"
  | "ready"
  | "ignored";

export interface WorkerSceneSwitchEvent {
  kind: WorkerSceneSwitchEventKind;
  requestId: number;
  environment: WorkerEnvironmentKey;
  phase: string | null;
  elapsedMs: number;
  detail: string | null;
}

export interface WorkerSceneSwitchCurrentRequest {
  requestId: number;
  environment: WorkerEnvironmentKey;
  phase: string | null;
  elapsedMs: number;
}

export interface WorkerSceneSwitchMeasurement {
  requestId: number;
  environment: WorkerEnvironmentKey;
  requestedAt: number;
  swappedAt: number;
  clickToSwapMs: number;
  workerBoot: WorkerRendererBootMetrics;
  mainThreadMaxGapMs: number;
  mainThreadMaxGapPhase: string | null;
  mainThreadGapsOver50Ms: number;
  outgoingWorkerMaxFrameGapMs: number;
  outgoingWorkerMaxFrameGapPhase: string | null;
  outgoingFrameSamples: number;
  outgoingTerminalFrameGapMs: number;
  outgoingVisualMode: "none" | "animated" | "held-frame";
  handoffDelayMs: number;
  liveWorkersAtSwap: number;
  liveWorkersAfterCleanup: number | null;
  passedInputGate: boolean;
  passedFrameGate: boolean;
  passedWorkerBound: boolean;
}

export interface WorkerSceneSwitchSnapshot {
  supported: boolean;
  active: WorkerEnvironmentKey | null;
  staging: WorkerEnvironmentKey | null;
  phase: "unsupported" | "idle" | "booting" | "swapping" | "error";
  progress: number;
  progressPhase: string | null;
  liveWorkers: number;
  heldFrame: WorkerEnvironmentKey | null;
  lastError: string | null;
  currentRequest: WorkerSceneSwitchCurrentRequest | null;
  events: readonly WorkerSceneSwitchEvent[];
  lastMeasurement: WorkerSceneSwitchMeasurement | null;
  history: readonly WorkerSceneSwitchMeasurement[];
}

export interface WorkerEnvironmentRendererOptions {
  container: HTMLElement;
  qualityTier?: WorkerEffectQualityTier;
  onSnapshot?: (snapshot: WorkerSceneSwitchSnapshot) => void;
  onFrame?: (deltaMs: number) => void;
  onInteraction?: (
    message: Extract<WorkerRendererOutMessage, { type: "interaction" }>
  ) => void;
  createWorker?: () => Worker;
}

export function supportsWorkerEnvironmentRenderer(): boolean {
  return (
    typeof Worker !== "undefined" &&
    typeof HTMLCanvasElement !== "undefined" &&
    "transferControlToOffscreen" in HTMLCanvasElement.prototype
  );
}

function createRendererWorker(): Worker {
  return new Worker(
    new URL("../workers/environment-renderer.worker.ts", import.meta.url),
    { type: "module", name: "tka-environment-renderer" }
  );
}

/** Keeps the outgoing worker rendering while another worker prepares the next scene. */
export class WorkerEnvironmentRenderer {
  private readonly container: HTMLElement;
  private readonly onSnapshot?: WorkerEnvironmentRendererOptions["onSnapshot"];
  private readonly onFrame?: WorkerEnvironmentRendererOptions["onFrame"];
  private readonly onInteraction?: WorkerEnvironmentRendererOptions["onInteraction"];
  private readonly createWorker: () => Worker;
  private readonly supported: boolean;
  private active: WorkerRendererSlot | null = null;
  private staging: WorkerRendererSlot | null = null;
  private backgroundStaging: WorkerRendererSlot | null = null;
  private idle: WorkerRendererSlot | null = null;
  private fading: WorkerRendererSlot | null = null;
  private pending: PendingEnvironment | null = null;
  private latestRequestId = 0;
  private viewport: WorkerViewport = { width: 1, height: 1, dpr: 1 };
  private pixelRatio =
    typeof window === "undefined" ? 1 : window.devicePixelRatio;
  private resizeObserver: ResizeObserver | null = null;
  private publishFrame: number | null = null;
  private swapFrame: number | null = null;
  private cleanupTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly probe = new WorkerRendererResponsivenessProbe();
  private progress = 0;
  private progressPhase: string | null = null;
  private phase: WorkerSceneSwitchSnapshot["phase"] = "idle";
  private lastError: string | null = null;
  private events: WorkerSceneSwitchEvent[] = [];
  private lastMeasurement: WorkerSceneSwitchMeasurement | null = null;
  private history: WorkerSceneSwitchMeasurement[] = [];
  private disposed = false;
  private performers: readonly WorkerPerformerSnapshot[] = [];
  private effects: WorkerSceneEffectsSnapshot = { playing: false, sources: [] };
  private camera: WorkerCameraSnapshot | null = null;
  private qualityTier: WorkerEffectQualityTier = "medium";
  private bootMetrics = new WeakMap<
    WorkerRendererSlot,
    WorkerRendererBootMetrics
  >();
  private recoveryAttempted = false;

  constructor(options: WorkerEnvironmentRendererOptions) {
    this.container = options.container;
    this.onSnapshot = options.onSnapshot;
    this.onFrame = options.onFrame;
    this.onInteraction = options.onInteraction;
    this.createWorker = options.createWorker ?? createRendererWorker;
    this.qualityTier = options.qualityTier ?? "medium";
    this.supported = supportsWorkerEnvironmentRenderer();
    if (!this.supported) {
      this.phase = "unsupported";
      this.publish();
      return;
    }
    this.resizeObserver = new ResizeObserver(() => this.measureViewport());
    this.resizeObserver.observe(this.container);
    this.container.addEventListener("pointermove", this.handlePointerMove);
    this.container.addEventListener("pointerdown", this.handlePointerDown);
    this.container.addEventListener("pointerleave", this.handlePointerLeave);
    this.measureViewport();
    this.publish();
  }

  get snapshot(): WorkerSceneSwitchSnapshot {
    return {
      supported: this.supported,
      active: this.active?.state.environment ?? null,
      staging: this.pending?.environment ?? null,
      phase: this.phase,
      progress: this.progress,
      progressPhase: this.progressPhase,
      liveWorkers: [this.active, this.staging, this.idle, this.fading].filter(
        (slot) => slot?.isLive
      ).length,
      heldFrame: null,
      lastError: this.lastError,
      currentRequest: this.pending
        ? {
            requestId: this.pending.requestId,
            environment: this.pending.environment,
            phase: this.progressPhase,
            elapsedMs: performance.now() - this.pending.requestedAt,
          }
        : null,
      events: [...this.events],
      lastMeasurement: this.lastMeasurement,
      history: [...this.history],
    };
  }

  prefetch(environment: WorkerEnvironmentKey): void {
    if (
      this.disposed ||
      this.pending ||
      !this.active?.isLive ||
      environment === this.active.state.environment
    )
      return;
    const connection = (
      navigator as Navigator & {
        connection?: { saveData?: boolean; effectiveType?: string };
      }
    ).connection;
    if (
      navigator.onLine === false ||
      connection?.saveData ||
      connection?.effectiveType === "slow-2g" ||
      connection?.effectiveType === "2g"
    )
      return;
    if (
      this.active.post({
        type: "prefetch-environment",
        requestId: this.latestRequestId,
        environment,
      })
    ) {
      this.recordEvent(
        "prefetch",
        {
          requestId: this.latestRequestId,
          environment,
          requestedAt: performance.now(),
        },
        "assets"
      );
      this.publish();
    }
  }

  switchTo(environment: WorkerEnvironmentKey): void {
    if (!this.supported || this.disposed) return;
    if (this.pending?.environment === environment && this.phase !== "error")
      return;
    if (this.active?.state.environment === environment && this.active.isLive) {
      if (this.pending) this.cancelPending();
      return;
    }
    this.cancelPending();
    this.finishFade();
    const request: PendingEnvironment = {
      requestId: ++this.latestRequestId,
      environment,
      requestedAt: performance.now(),
    };
    this.pending = request;
    this.phase = "booting";
    this.progress = 0;
    this.progressPhase = "worker";
    this.lastError = null;
    this.recoveryAttempted = false;
    this.probe.begin(request.requestId);
    this.recordEvent("requested", request, "worker");

    if (this.idle?.isLive && this.idle.state.environment === environment) {
      const slot = this.idle;
      this.idle = null;
      this.staging = slot;
      slot.state = {
        ...slot.state,
        requestId: request.requestId,
        status: "ready",
      };
      slot.setPresentation(false);
      slot.post({
        type: "visibility",
        requestId: request.requestId,
        visible: true,
      });
      this.progressPhase = "resume";
    } else if (this.idle?.isLive) {
      const slot = this.idle;
      this.idle = null;
      this.staging = slot;
      this.backgroundStaging = slot;
      slot.state = {
        ...slot.state,
        requestId: request.requestId,
        environment: request.environment,
        status: "booting",
      };
      slot.setPresentation(false);
      const cameraReady = slot.post({
        type: "camera",
        requestId: request.requestId,
        camera: this.camera ?? getWorkerEnvironmentCamera(request.environment),
      });
      const switchReady =
        cameraReady &&
        slot.post({
          type: "switch-environment",
          requestId: request.requestId,
          environment: request.environment,
          reducedMotion: prefersReducedMotion(),
          backgroundPreparation: true,
        });
      if (!switchReady) {
        slot.terminate();
        this.staging = null;
        this.startStaging(request);
      }
    } else {
      this.dropIdle();
      this.startStaging(request);
    }
    this.publish();
  }

  setCamera(camera: WorkerCameraSnapshot): void {
    this.camera = camera;
    this.postSessionMessage({ type: "camera", camera });
  }

  setPixelRatio(pixelRatio: number): void {
    if (
      !Number.isFinite(pixelRatio) ||
      pixelRatio <= 0 ||
      pixelRatio === this.pixelRatio
    )
      return;
    this.pixelRatio = pixelRatio;
    this.measureViewport();
  }

  setQualityTier(qualityTier: WorkerEffectQualityTier): void {
    if (qualityTier === this.qualityTier) return;
    this.qualityTier = qualityTier;
    this.postSessionMessage({ type: "quality", qualityTier });
  }

  setPerformers(performers: readonly WorkerPerformerSnapshot[]): void {
    this.performers = performers;
    this.postSessionMessage({ type: "performers", performers });
  }

  setEffects(effects: WorkerSceneEffectsSnapshot): void {
    this.effects = effects;
    this.postSessionMessage({ type: "effects", effects });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resizeObserver?.disconnect();
    this.container.removeEventListener("pointermove", this.handlePointerMove);
    this.container.removeEventListener("pointerdown", this.handlePointerDown);
    this.container.removeEventListener("pointerleave", this.handlePointerLeave);
    if (this.publishFrame !== null) cancelAnimationFrame(this.publishFrame);
    if (this.swapFrame !== null) cancelAnimationFrame(this.swapFrame);
    if (this.cleanupTimer !== null) clearTimeout(this.cleanupTimer);
    this.probe.end();
    this.active?.terminate();
    this.staging?.terminate();
    this.idle?.terminate();
    this.fading?.terminate();
    this.active = this.staging = this.idle = this.fading = null;
    this.pending = null;
  }

  private cancelPending(): void {
    if (!this.pending) return;
    this.recordEvent("cancelled", this.pending, this.progressPhase);
    this.pending = null;
    this.probe.end();
    if (this.swapFrame !== null) cancelAnimationFrame(this.swapFrame);
    this.swapFrame = null;
    this.staging?.terminate();
    this.staging = null;
    this.backgroundStaging = null;
    this.phase = "idle";
    this.progressPhase = null;
    this.progress = 0;
    this.publish();
  }

  private dropIdle(): void {
    this.idle?.terminate();
    this.idle = null;
    if (this.cleanupTimer !== null) clearTimeout(this.cleanupTimer);
    this.cleanupTimer = null;
  }

  private finishFade(): void {
    if (this.cleanupTimer !== null) clearTimeout(this.cleanupTimer);
    this.cleanupTimer = null;
    if (!this.fading) return;
    const outgoing = this.fading;
    this.fading = null;
    if (this.active) this.active.setPresentation(true);
    outgoing.post({
      type: "visibility",
      requestId: outgoing.state.requestId,
      visible: false,
    });
    this.dropIdle();
    this.idle = outgoing;
    outgoing.setPresentation(false);
  }

  private startStaging(request: PendingEnvironment): void {
    this.backgroundStaging = null;
    try {
      const slot = new WorkerRendererSlot({
        container: this.container,
        createWorker: this.createWorker,
        state: {
          id: this.active?.state.id === "a" ? "b" : "a",
          requestId: request.requestId,
          environment: request.environment,
          status: "booting",
        },
        viewport: this.viewport,
        camera: this.camera ?? getWorkerEnvironmentCamera(request.environment),
        qualityTier: this.qualityTier,
        performers: this.performers,
        effects: this.effects,
        reducedMotion: prefersReducedMotion(),
        retainSceneCache: false,
        onMessage: (source, message) => this.handleMessage(source, message),
        onError: (source, message) => this.handleFailure(source, message),
        onDestroyed: () => {},
      });
      this.staging = slot;
      slot.setPresentation(false);
    } catch (error) {
      this.handleStartFailure(
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  private handleMessage(
    slot: WorkerRendererSlot,
    message: WorkerRendererOutMessage
  ): void {
    if (slot !== this.active && slot !== this.staging && slot !== this.idle) {
      if (message.type === "poster") message.bitmap.close();
      return;
    }
    if (message.type === "poster") {
      message.bitmap.close();
      return;
    }
    if (
      slot === this.idle &&
      (message.type === "error" || message.type === "context-lost")
    ) {
      this.dropIdle();
      this.publish();
      return;
    }
    if (
      slot === this.active &&
      (message.type === "error" || message.type === "context-lost")
    ) {
      this.handleFailure(
        slot,
        message.type === "error"
          ? message.message
          : "Worker WebGL context was lost"
      );
      return;
    }
    if (message.type === "frame") {
      if (slot === this.active) {
        if (this.pending) this.probe.recordOutgoingFrame(message.deltaMs);
        this.onFrame?.(message.deltaMs);
      } else if (
        slot === this.staging &&
        this.progressPhase === "resume" &&
        message.requestId === this.pending?.requestId &&
        message.environment === this.pending?.environment
      ) {
        this.present(
          slot,
          slot === this.backgroundStaging
            ? this.bootMetrics.get(slot)!
            : this.warmMetrics(slot, this.pending!)
        );
      }
      return;
    }
    if (message.type === "interaction") {
      if (slot === this.active) this.onInteraction?.(message);
      return;
    }
    if (
      slot !== this.staging ||
      !this.pending ||
      ("requestId" in message && message.requestId !== this.pending.requestId)
    )
      return;
    switch (message.type) {
      case "booting":
        this.recordEvent("started", this.pending, this.progressPhase);
        break;
      case "progress":
        this.progress = message.fraction;
        if (this.progressPhase !== message.phase)
          this.recordEvent("phase", this.pending, message.phase);
        this.progressPhase = message.phase;
        this.probe.setPhase(message.phase);
        this.schedulePublish();
        break;
      case "first-frame":
        if (message.environment !== this.pending.environment) return;
        this.bootMetrics.set(slot, message.metrics);
        if (slot === this.backgroundStaging) {
          if (slot.state.status !== "booting") return;
          // A reused hidden canvas needs its first live frame after preparation.
          // Its completed preparation render is not yet visible to the user.
          this.progressPhase = "resume";
          slot.state = { ...slot.state, status: "ready" };
          if (
            !slot.post({
              type: "visibility",
              requestId: this.pending.requestId,
              visible: true,
            })
          ) {
            this.handleFailure(slot, "Unable to resume prepared renderer");
          }
        } else {
          this.present(slot, message.metrics);
        }
        break;
      case "error":
        this.handleFailure(slot, message.message);
        break;
      case "context-lost":
        this.handleFailure(slot, "Worker WebGL context was lost");
        break;
    }
  }

  private warmMetrics(
    slot: WorkerRendererSlot,
    request: PendingEnvironment
  ): WorkerRendererBootMetrics {
    const previous = this.bootMetrics.get(slot);
    if (!previous)
      throw new Error("Warm scene has no completed first-frame metrics");
    const firstFrameAt = performance.now();
    const readyAt = request.requestedAt;
    return {
      ...previous,
      warmReuse: true,
      acceptedAt: readyAt,
      rendererReadyAt: readyAt,
      environmentReadyAt: readyAt,
      performerReadyAt: readyAt,
      worldReadyAt: readyAt,
      compiledAt: readyAt,
      primedAt: readyAt,
      finalizedAt: readyAt,
      preflightedAt: readyAt,
      firstFrameAt,
      rendererMs: 0,
      environmentMs: 0,
      performerMs: 0,
      worldMs: 0,
      compileMs: 0,
      primeMs: 0,
      finalizeCompileMs: 0,
      preflightMs: 0,
      firstRenderMs: 0,
      presentationWaitMs: 0,
      confirmationRenderMs: 0,
      firstFrameWaitMs: firstFrameAt - readyAt,
      firstFrameMs: firstFrameAt - readyAt,
    };
  }

  private present(
    slot: WorkerRendererSlot,
    metrics: WorkerRendererBootMetrics
  ): void {
    const request = this.pending;
    if (!request || slot !== this.staging || this.swapFrame !== null) return;
    this.backgroundStaging = null;
    this.phase = "swapping";
    this.progress = 1;
    this.progressPhase = "handoff";
    this.recordEvent("phase", request, "handoff");
    const receivedAt = performance.now();
    this.swapFrame = requestAnimationFrame(() => {
      this.swapFrame = null;
      if (
        this.disposed ||
        slot !== this.staging ||
        this.pending?.requestId !== request.requestId
      )
        return;
      const outgoing = this.active;
      const fadeMs = outgoing ? motionDuration(DURATION.fast) : 0;
      // The incoming canvas is already complete; both workers stay live through the fade.
      slot.setPresentation(true, fadeMs);
      if (outgoing) {
        outgoing.canvas.style.transition = "none";
        outgoing.canvas.style.opacity = "1";
        outgoing.canvas.style.zIndex = "1";
      }
      this.active = slot;
      this.staging = null;
      slot.state = { ...slot.state, status: "active" };
      this.pending = null;
      this.phase = "idle";
      this.progressPhase = null;
      const swappedAt = performance.now();
      const probe = this.probe.end();
      const terminalGap =
        probe?.lastOutgoingFrameAt === null ||
        probe?.lastOutgoingFrameAt === undefined
          ? swappedAt - request.requestedAt
          : swappedAt - probe.lastOutgoingFrameAt;
      const maxFrameGap = Math.max(
        probe?.outgoingWorkerMaxFrameGapMs ?? 0,
        terminalGap
      );
      const workerCount = [this.active, outgoing].filter(
        (item) => item?.isLive
      ).length;
      const measurement: WorkerSceneSwitchMeasurement = {
        requestId: request.requestId,
        environment: request.environment,
        requestedAt: probe?.requestedAt ?? request.requestedAt,
        swappedAt,
        clickToSwapMs: swappedAt - request.requestedAt,
        workerBoot: metrics,
        mainThreadMaxGapMs: probe?.mainThreadMaxGapMs ?? 0,
        mainThreadMaxGapPhase: probe?.mainThreadMaxGapPhase ?? null,
        mainThreadGapsOver50Ms: probe?.mainThreadGapsOver50Ms ?? 0,
        outgoingWorkerMaxFrameGapMs: maxFrameGap,
        outgoingWorkerMaxFrameGapPhase:
          terminalGap >= (probe?.outgoingWorkerMaxFrameGapMs ?? 0)
            ? "handoff"
            : (probe?.outgoingWorkerMaxFrameGapPhase ?? null),
        outgoingFrameSamples: probe?.outgoingFrameSamples ?? 0,
        outgoingTerminalFrameGapMs: terminalGap,
        outgoingVisualMode: outgoing
          ? (probe?.outgoingFrameSamples ?? 0) > 0
            ? "animated"
            : "held-frame"
          : "none",
        handoffDelayMs: swappedAt - receivedAt,
        liveWorkersAtSwap: workerCount,
        liveWorkersAfterCleanup: workerCount,
        passedInputGate: (probe?.mainThreadMaxGapMs ?? 0) <= 50,
        passedFrameGate:
          !outgoing ||
          ((probe?.outgoingFrameSamples ?? 0) > 0 && maxFrameGap <= 100),
        passedWorkerBound: workerCount <= 2,
      };
      this.lastMeasurement = measurement;
      this.history = [...this.history, measurement].slice(-20);
      this.recordEvent("ready", request, null);
      this.fading = outgoing;
      this.publish();
      if (outgoing) {
        this.cleanupTimer = setTimeout(() => {
          if (this.disposed || this.fading !== outgoing) return;
          this.finishFade();
          if (this.lastMeasurement === measurement) {
            measurement.liveWorkersAfterCleanup = this.snapshot.liveWorkers;
            this.publish();
          }
        }, fadeMs);
      }
    });
    this.publish();
  }

  private handleFailure(slot: WorkerRendererSlot, message: string): void {
    if (this.disposed) return;
    if (slot === this.active) {
      slot.terminate();
      this.active = null;
      if (this.fading?.isLive) {
        const rescued = this.fading;
        this.fading = null;
        if (this.cleanupTimer !== null) clearTimeout(this.cleanupTimer);
        this.cleanupTimer = null;
        rescued.setPresentation(true);
        this.active = rescued;
        this.phase = this.pending ? "booting" : "idle";
        this.lastError = message;
        this.publish();
        return;
      }
      this.lastError = message;
      this.phase = this.pending ? "booting" : "error";
      this.publish();
      return;
    }
    if (slot !== this.staging || !this.pending) return;
    this.recordEvent("failed", this.pending, this.progressPhase, message);
    if (!this.recoveryAttempted) {
      this.recoveryAttempted = true;
      this.recordEvent(
        "retrying",
        this.pending,
        "worker",
        "automatic recovery"
      );
      slot.terminate();
      this.staging = null;
      this.progress = 0;
      this.progressPhase = "worker";
      this.startStaging(this.pending);
      this.publish();
      return;
    }
    slot.terminate();
    this.staging = null;
    this.handleStartFailure(message);
  }

  private handleStartFailure(message: string): void {
    this.lastError = message;
    if (this.pending)
      this.recordEvent("failed", this.pending, this.progressPhase, message);
    this.probe.end();
    this.phase = "error";
    this.publish();
  }

  private recordEvent(
    kind: WorkerSceneSwitchEventKind,
    request: PendingEnvironment,
    phase: string | null,
    detail: string | null = null
  ): void {
    this.events = [
      ...this.events,
      {
        kind,
        requestId: request.requestId,
        environment: request.environment,
        phase,
        elapsedMs: Math.max(0, performance.now() - request.requestedAt),
        detail,
      },
    ].slice(-40);
  }

  private measureViewport(): void {
    const rect = this.container.getBoundingClientRect();
    this.viewport = clampWorkerViewport({
      width: rect.width,
      height: rect.height,
      dpr: this.pixelRatio,
    });
    this.postSessionMessage({ type: "resize", viewport: this.viewport });
  }

  private readonly handlePointerMove = (event: PointerEvent): void =>
    this.postPointer("move", event);
  private readonly handlePointerDown = (event: PointerEvent): void =>
    this.postPointer("down", event);
  private readonly handlePointerLeave = (): void => {
    this.active?.post({
      type: "pointer",
      requestId: this.active.state.requestId,
      action: "leave",
      ndcX: 0,
      ndcY: 0,
    });
  };

  private postPointer(action: "move" | "down", event: PointerEvent): void {
    if (!this.active) return;
    const rect = this.container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    this.active.post({
      type: "pointer",
      requestId: this.active.state.requestId,
      action,
      ndcX: ((event.clientX - rect.left) / rect.width) * 2 - 1,
      ndcY: -((event.clientY - rect.top) / rect.height) * 2 + 1,
    });
  }

  private postSessionMessage(
    message:
      | Omit<Extract<WorkerRendererInMessage, { type: "camera" }>, "requestId">
      | Omit<Extract<WorkerRendererInMessage, { type: "resize" }>, "requestId">
      | Omit<
          Extract<WorkerRendererInMessage, { type: "performers" }>,
          "requestId"
        >
      | Omit<Extract<WorkerRendererInMessage, { type: "effects" }>, "requestId">
      | Omit<Extract<WorkerRendererInMessage, { type: "quality" }>, "requestId">
  ): void {
    for (const slot of [this.active, this.staging, this.idle, this.fading]) {
      if (
        slot?.isLive &&
        !slot.post({
          ...message,
          requestId: slot.state.requestId,
        } as WorkerRendererInMessage)
      ) {
        if (slot === this.idle) this.dropIdle();
        else
          this.handleFailure(
            slot,
            `Unable to send ${message.type} to renderer`
          );
      }
    }
  }

  private schedulePublish(): void {
    if (this.publishFrame !== null) return;
    this.publishFrame = requestAnimationFrame(() => {
      this.publishFrame = null;
      if (!this.disposed) this.publish();
    });
  }

  private publish(): void {
    this.onSnapshot?.(this.snapshot);
  }
}
