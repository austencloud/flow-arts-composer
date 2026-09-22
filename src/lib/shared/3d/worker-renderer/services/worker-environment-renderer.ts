import type { WorkerRendererSlotState } from "../domain/worker-renderer-handoff";
import { prefersReducedMotion } from "../../environments/primitives/motion-preference";
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
import { getWorkerEnvironmentCamera } from "../domain/worker-environment-camera";
import { WorkerRendererResponsivenessProbe } from "./worker-renderer-responsiveness-probe";
import {
  WorkerRendererSlot,
  type WorkerRendererSlotStart,
} from "./worker-renderer-slot";

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

/**
 * Owns one application-lifetime worker renderer session.
 *
 * The outgoing scene is copied into a bitmap poster before its scene-owned
 * resources are released. The same worker, OffscreenCanvas, WebGLRenderer, and
 * GPU context then build the requested scene behind that poster. Ordinary
 * switches never create a second context; only a context loss takes the
 * exceptional restart path.
 */
export class WorkerEnvironmentRenderer {
  private readonly container: HTMLElement;
  private readonly onSnapshot?: (snapshot: WorkerSceneSwitchSnapshot) => void;
  private readonly onFrame?: (deltaMs: number) => void;
  private readonly createWorker: () => Worker;
  private readonly onInteraction?: WorkerEnvironmentRendererOptions["onInteraction"];
  private readonly supported: boolean;
  private slot: WorkerRendererSlot | null = null;
  private latestRequestId = 0;
  private displayedEnvironment: WorkerEnvironmentKey | null = null;
  private liveEnvironment: WorkerEnvironmentKey | null = null;
  private pending: PendingEnvironment | null = null;
  private posterEnvironment: WorkerEnvironmentKey | null = null;
  private viewport: WorkerViewport = { width: 1, height: 1, dpr: 1 };
  private pixelRatio =
    typeof window === "undefined" ? 1 : window.devicePixelRatio;
  private resizeObserver: ResizeObserver | null = null;
  private progressPublishFrame: number | null = null;
  private presentationFrame: number | null = null;
  private readonly responsiveness = new WorkerRendererResponsivenessProbe();
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
  private recoveryAttempted = false;

  constructor(options: WorkerEnvironmentRendererOptions) {
    this.container = options.container;
    this.onSnapshot = options.onSnapshot;
    this.onFrame = options.onFrame;
    this.onInteraction = options.onInteraction;
    this.createWorker = options.createWorker ?? createRendererWorker;
    this.qualityTier = options.qualityTier ?? this.qualityTier;
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
      active: this.displayedEnvironment,
      staging: this.pending?.environment ?? null,
      phase: this.phase,
      progress: this.progress,
      progressPhase: this.progressPhase,
      liveWorkers: this.slot?.isLive ? 1 : 0,
      heldFrame: this.posterEnvironment,
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
      !this.slot?.isLive ||
      environment === this.liveEnvironment
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
      this.slot.post({
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
    if (this.pending?.environment === environment && this.phase !== "error") {
      return;
    }
    if (
      !this.pending &&
      this.displayedEnvironment === environment &&
      this.liveEnvironment === environment
    ) {
      return;
    }

    if (this.presentationFrame !== null) {
      cancelAnimationFrame(this.presentationFrame);
      this.presentationFrame = null;
    }

    const cancelled = this.pending;
    const supersedesPending = cancelled !== null;
    const request: PendingEnvironment = {
      requestId: ++this.latestRequestId,
      environment,
      requestedAt: performance.now(),
    };
    if (cancelled) {
      this.recordEvent("cancelled", cancelled, this.progressPhase);
    }
    this.pending = request;
    this.lastError = null;
    this.progress = 0;
    this.progressPhase = this.slot ? "poster" : "worker";
    this.phase = "booting";
    this.beginProbe(request.requestId);
    this.responsiveness.setPhase(this.progressPhase);
    this.recordEvent("requested", request, this.progressPhase);
    this.publish();

    if (!this.slot) {
      this.createSession(request);
      return;
    }
    const slot = this.slot;

    if (!slot.isLive) {
      this.recoveryAttempted = false;
      this.recordEvent("retrying", request, "worker", "retry after failure");
      try {
        slot.restart(this.slotStart(request));
      } catch (error) {
        this.failWithoutRecovery(
          error instanceof Error ? error.message : String(error),
          request
        );
      }
      this.publish();
      return;
    }

    // GLTF parsing itself is not abortable. Once the outgoing bitmap is safely
    // on the application thread, keeping an obsolete heavy build alive can
    // make a rapid final choice wait tens of seconds. Replace that worker and
    // context under the already-painted poster; ordinary one-at-a-time scene
    // changes continue to reuse the persistent session.
    if (supersedesPending && slot.isPosterVisible) {
      this.progressPhase = "worker";
      this.responsiveness.setPhase("worker");
      slot.restart(this.slotStart(request));
      this.publish();
      return;
    }

    slot.state = this.slotState(request, "booting");
    if (
      !slot.post({
        type: "switch-environment",
        requestId: request.requestId,
        environment: request.environment,
        reducedMotion: prefersReducedMotion(),
      })
    ) {
      this.handleFailure(slot, "Unable to queue the requested worker scene");
    }
  }

  setCamera(camera: WorkerCameraSnapshot): void {
    this.camera = camera;
    this.postSessionMessage({ type: "camera", camera });
  }

  setPixelRatio(pixelRatio: number): void {
    if (!Number.isFinite(pixelRatio) || pixelRatio <= 0) return;
    if (pixelRatio === this.pixelRatio) return;
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
    this.resizeObserver = null;
    this.container.removeEventListener("pointermove", this.handlePointerMove);
    this.container.removeEventListener("pointerdown", this.handlePointerDown);
    this.container.removeEventListener("pointerleave", this.handlePointerLeave);
    if (this.progressPublishFrame !== null) {
      cancelAnimationFrame(this.progressPublishFrame);
      this.progressPublishFrame = null;
    }
    if (this.presentationFrame !== null) {
      cancelAnimationFrame(this.presentationFrame);
      this.presentationFrame = null;
    }
    this.endProbe();
    this.slot?.destroy();
    this.slot = null;
    this.pending = null;
    this.posterEnvironment = null;
  }

  private createSession(request: PendingEnvironment): void {
    const start = this.slotStart(request);
    try {
      this.slot = new WorkerRendererSlot({
        container: this.container,
        ...start,
        createWorker: this.createWorker,
        onMessage: (source, message) =>
          this.handleWorkerMessage(source, message),
        onError: (source, message) => this.handleFailure(source, message),
        onDestroyed: (source) => {
          if (this.slot === source) this.slot = null;
          if (!this.disposed) this.publish();
        },
      });
    } catch (error) {
      this.slot = null;
      this.failWithoutRecovery(
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  private handleWorkerMessage(
    slot: WorkerRendererSlot,
    message: WorkerRendererOutMessage
  ): void {
    if (slot !== this.slot) {
      if (message.type === "poster") message.bitmap.close();
      return;
    }

    switch (message.type) {
      case "progress":
        if (this.pending?.requestId === message.requestId) {
          this.progress = message.fraction;
          if (this.progressPhase !== message.phase) {
            this.recordEvent("phase", this.pending, message.phase);
          }
          this.progressPhase = message.phase;
          this.responsiveness.setPhase(message.phase);
          this.scheduleProgressPublish();
        }
        return;
      case "poster":
        this.installPoster(slot, message);
        return;
      case "first-frame":
        this.handleFirstFrame(slot, message);
        return;
      case "frame":
        if (
          !this.posterEnvironment &&
          this.liveEnvironment === message.environment
        ) {
          this.responsiveness.recordOutgoingFrame(message.deltaMs);
          if (this.phase === "idle") this.onFrame?.(message.deltaMs);
        }
        return;
      case "error":
        // A superseded build can finish with an error after the final choice
        // has been queued. Its worker is still useful until the final request
        // has its poster, so do not turn that obsolete result into a failure
        // of the scene the user most recently chose.
        if (
          !this.pending ||
          this.pending.requestId === message.requestId ||
          this.liveEnvironment === message.environment
        ) {
          this.handleFailure(slot, message.message, this.pending ?? undefined);
        } else if (message.environment) {
          this.recordEvent(
            "ignored",
            {
              requestId: message.requestId,
              environment: message.environment,
              requestedAt: performance.now(),
            },
            this.progressPhase,
            message.message
          );
        }
        return;
      case "context-lost":
        this.handleFailure(slot, "Worker WebGL context was lost");
        return;
      case "interaction":
        if (
          this.phase === "idle" &&
          !this.posterEnvironment &&
          this.liveEnvironment === message.environment
        ) {
          this.onInteraction?.(message);
        }
        return;
      case "booting":
        if (
          this.pending?.requestId === message.requestId &&
          this.pending.environment === message.environment
        ) {
          this.recordEvent("started", this.pending, this.progressPhase);
        }
        return;
      case "disposed":
        return;
    }
  }

  private installPoster(
    slot: WorkerRendererSlot,
    message: Extract<WorkerRendererOutMessage, { type: "poster" }>
  ): void {
    const pending = this.pending;
    if (
      !pending ||
      (pending.requestId !== message.requestId &&
        this.displayedEnvironment !== message.environment &&
        this.liveEnvironment !== message.environment)
    ) {
      message.bitmap.close();
      return;
    }
    try {
      slot.installPoster(message.bitmap);
    } catch (error) {
      this.handleFailure(
        slot,
        error instanceof Error ? error.message : String(error)
      );
      return;
    }
    this.posterEnvironment = message.environment;
    this.displayedEnvironment = message.environment;
    this.progressPhase = "release";
    this.recordEvent("phase", pending, this.progressPhase);
    this.responsiveness.setPhase("release");
    this.publish();

    requestAnimationFrame(() => {
      if (this.disposed || slot !== this.slot || !slot.isLive) return;
      const latest = this.pending;
      if (latest && latest.requestId !== message.requestId) {
        this.progressPhase = "worker";
        this.responsiveness.setPhase("worker");
        slot.restart(this.slotStart(latest));
        this.publish();
        return;
      }
      if (!slot.post({ type: "poster-ready", requestId: message.requestId })) {
        this.handleFailure(slot, "Unable to acknowledge the held scene frame");
      }
    });
  }

  private handleFirstFrame(
    slot: WorkerRendererSlot,
    message: Extract<WorkerRendererOutMessage, { type: "first-frame" }>
  ): void {
    const request = this.pending;
    if (
      !request ||
      request.requestId !== message.requestId ||
      request.environment !== message.environment
    ) {
      return;
    }
    this.phase = "swapping";
    this.progress = 1;
    this.progressPhase = "handoff";
    this.recordEvent("phase", request, this.progressPhase);
    const receivedAt = performance.now();
    const posterWasVisible = slot.isPosterVisible;
    this.publish();

    this.presentationFrame = requestAnimationFrame(() => {
      this.presentationFrame = null;
      if (
        this.disposed ||
        slot !== this.slot ||
        this.pending?.requestId !== request.requestId
      ) {
        return;
      }

      if (
        !slot.post({ type: "live-presented", requestId: request.requestId })
      ) {
        this.handleFailure(slot, "Unable to confirm the replacement scene");
        return;
      }
      slot.clearPoster();
      this.posterEnvironment = null;
      this.liveEnvironment = request.environment;
      this.displayedEnvironment = request.environment;
      this.pending = null;
      this.phase = "idle";
      this.progressPhase = null;
      this.recoveryAttempted = false;
      slot.state = this.slotState(request, "active");

      const swappedAt = performance.now();
      const probe = this.endProbe();
      const measurement: WorkerSceneSwitchMeasurement = {
        requestId: request.requestId,
        environment: request.environment,
        requestedAt: probe?.requestedAt ?? receivedAt,
        swappedAt,
        clickToSwapMs: swappedAt - (probe?.requestedAt ?? receivedAt),
        workerBoot: message.metrics,
        mainThreadMaxGapMs: probe?.mainThreadMaxGapMs ?? 0,
        mainThreadMaxGapPhase: probe?.mainThreadMaxGapPhase ?? null,
        mainThreadGapsOver50Ms: probe?.mainThreadGapsOver50Ms ?? 0,
        outgoingWorkerMaxFrameGapMs: probe?.outgoingWorkerMaxFrameGapMs ?? 0,
        outgoingWorkerMaxFrameGapPhase:
          probe?.outgoingWorkerMaxFrameGapPhase ?? null,
        outgoingVisualMode: posterWasVisible
          ? "held-frame"
          : this.lastMeasurement
            ? "animated"
            : "none",
        handoffDelayMs: swappedAt - receivedAt,
        liveWorkersAtSwap: slot.isLive ? 1 : 0,
        liveWorkersAfterCleanup: slot.isLive ? 1 : 0,
        passedInputGate: (probe?.mainThreadMaxGapMs ?? 0) <= 50,
        passedFrameGate:
          posterWasVisible ||
          (probe?.outgoingWorkerMaxFrameGapMs ?? Infinity) <= 100,
        passedWorkerBound: slot.isLive,
      };
      this.lastMeasurement = measurement;
      this.history = [...this.history, measurement].slice(-20);
      this.recordEvent("ready", request, null);
      this.publish();
    });
  }

  private handleFailure(
    slot: WorkerRendererSlot,
    message: string,
    attributedRequest: PendingEnvironment | undefined = this.pending ??
      undefined
  ): void {
    if (slot !== this.slot || this.disposed) return;
    this.lastError = message;
    const request = this.pending;
    if (attributedRequest) {
      this.recordEvent(
        "failed",
        attributedRequest,
        this.progressPhase,
        message
      );
    }
    if (request && !this.recoveryAttempted) {
      this.recoveryAttempted = true;
      this.progress = 0;
      this.progressPhase = "worker";
      this.phase = "booting";
      this.responsiveness.setPhase("worker");
      this.recordEvent("retrying", request, "worker", "automatic recovery");
      try {
        slot.restart(this.slotStart(request));
        this.publish();
        return;
      } catch (error) {
        this.lastError = error instanceof Error ? error.message : String(error);
      }
    }

    slot.suspend();
    this.endProbe();
    this.phase = "error";
    this.publish();
  }

  private failWithoutRecovery(
    message: string,
    attributedRequest: PendingEnvironment | undefined = this.pending ??
      undefined
  ): void {
    this.lastError = message;
    if (attributedRequest) {
      this.recordEvent(
        "failed",
        attributedRequest,
        this.progressPhase,
        message
      );
    }
    this.endProbe();
    this.phase = "error";
    this.publish();
  }

  private slotStart(request: PendingEnvironment): WorkerRendererSlotStart {
    return {
      state: this.slotState(request, "booting"),
      viewport: this.viewport,
      camera: this.camera ?? getWorkerEnvironmentCamera(request.environment),
      qualityTier: this.qualityTier,
      performers: this.performers,
      effects: this.effects,
      reducedMotion: prefersReducedMotion(),
    };
  }

  private slotState(
    request: PendingEnvironment,
    status: WorkerRendererSlotState["status"]
  ): WorkerRendererSlotState {
    return {
      id: "a",
      requestId: request.requestId,
      environment: request.environment,
      status,
    };
  }

  private beginProbe(nextRequestId: number): void {
    this.responsiveness.begin(nextRequestId);
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

  private endProbe() {
    return this.responsiveness.end();
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

  private readonly handlePointerMove = (event: PointerEvent): void => {
    this.postPointer("move", event);
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    this.postPointer("down", event);
  };

  private readonly handlePointerLeave = (): void => {
    if (!this.slot || this.phase !== "idle") return;
    this.slot.post({
      type: "pointer",
      requestId: this.latestRequestId,
      action: "leave",
      ndcX: 0,
      ndcY: 0,
    });
  };

  private postPointer(action: "move" | "down", event: PointerEvent): void {
    if (!this.slot || this.phase !== "idle") return;
    const rect = this.container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    this.slot.post({
      type: "pointer",
      requestId: this.latestRequestId,
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
    // A terminal worker failure has already been attributed to the request.
    // Frame producers can still emit while their old slot unwinds, but those
    // updates cannot reach a worker and must not replace the useful root cause.
    if (!this.slot || !this.slot.isLive || this.phase === "error") return;
    if (
      !this.slot.post({
        ...message,
        requestId: this.latestRequestId,
      } as WorkerRendererInMessage)
    ) {
      this.lastError = `Unable to send worker ${message.type} update`;
      this.publish();
    }
  }

  private scheduleProgressPublish(): void {
    if (this.progressPublishFrame !== null) return;
    this.progressPublishFrame = requestAnimationFrame(() => {
      this.progressPublishFrame = null;
      if (!this.disposed) this.publish();
    });
  }

  private publish(): void {
    this.onSnapshot?.(this.snapshot);
  }
}
