<script lang="ts">
  import { onMount } from "svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import { getErrorHandler } from "#lib/shared/application/get-error-handler.js";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import {
    FLOW_FEST_TRACE_VIEW,
    createTraceSubmission,
    emptyFlowFestTraces,
    imagePointToWorld,
    normalizeTraceDirection,
    parseStoredTraces,
    simplifyTrace,
    traceLengthMeters,
    validateTraceSubmission,
    worldPointToImage,
    type FlowFestImageTraces,
    type FlowFestPathId,
    type ImagePoint,
  } from "./_lib/flow-fest-trace";
  import {
    createFlowFestPlanCorrectionSubmission,
    listEditableFlowFestPlanFeatures,
    previewFlowFestPlanCorrections,
    upsertFlowFestPlanCorrection,
    validateFlowFestPlanCorrectionSubmission,
    type FlowFestPlanCorrectionProposal,
  } from "./_lib/flow-fest-camp-plan-corrections";
  import {
    FLOW_FEST_LOWER_LAYOUT_FEATURES,
    cloneFlowFestLowerLayoutDraft,
    createFlowFestLowerLayoutSubmission,
    emptyFlowFestLowerLayoutDraft,
    flowFestLowerLayoutReadiness,
    getFlowFestLowerLayoutFeaturePoints,
    parseStoredFlowFestLowerLayoutDraft,
    replaceFlowFestLowerLayoutFeature,
    validateFlowFestLowerLayoutSubmission,
    type FlowFestLowerLayoutDraft,
    type FlowFestLowerLayoutFeatureId,
  } from "./_lib/flow-fest-lower-layout";
  import { loadFlowFestRuntimeContract } from "../flow-fest-graybox/flow-fest-runtime-contract";
  import {
    createFlowFestCampPlan,
    type FlowFestCampPlan,
  } from "../flow-fest-sim/flow-fest-camp-plan";

  type WorkspaceMode = "layout" | "paths" | "plan";
  type InteractionMode = "draw" | "place" | "pan";
  type NoticeKind = "quiet" | "success" | "error";

  const STORAGE_KEY = "flow-fest-path-tracer-v1";
  const PLAN_STORAGE_KEY = "flow-fest-camp-plan-corrections-v1";
  const LOWER_LAYOUT_STORAGE_KEY = "flow-fest-lower-campground-layout-v1";
  const LOWER_LAYOUT_VIEW = {
    x: 1270,
    y: 520,
    width: 700,
    height: 362.963,
  } as const;
  const LOWER_LAYOUT_BOUNDS = {
    x: 1100,
    y: 450,
    width: 900,
    height: 466.667,
  } as const;
  const WORKSPACE_OPTIONS: Array<{
    value: WorkspaceMode;
    label: string;
    tone: "accent";
  }> = [
    { value: "layout", label: "Lower campground", tone: "accent" },
    { value: "paths", label: "Hidden paths", tone: "accent" },
    { value: "plan", label: "Camp plan", tone: "accent" },
  ];
  const PATH_OPTIONS: Array<{
    value: FlowFestPathId;
    label: string;
    shortLabel: string;
    tone: "blue" | "accent";
  }> = [
    {
      value: "upper-to-middle",
      label: "Upper clearing to Middle Earth",
      shortLabel: "Upper → Middle",
      tone: "blue",
    },
    {
      value: "middle-to-lower",
      label: "Middle Earth to lower clearing",
      shortLabel: "Middle → Lower",
      tone: "accent",
    },
  ];
  let workspaceMode = $state<WorkspaceMode>("layout");
  let activePath = $state<FlowFestPathId>("upper-to-middle");
  let interactionMode = $state<InteractionMode>("draw");
  let traces = $state<FlowFestImageTraces>(emptyFlowFestTraces());
  let draft = $state<ImagePoint[]>([]);
  let draftPath = $state<FlowFestPathId | null>(null);
  let notice = $state(
    "Draw one path at a time. Switching paths keeps both lines."
  );
  let noticeKind = $state<NoticeKind>("quiet");
  let saving = $state(false);
  let plan = $state<FlowFestCampPlan | null>(null);
  let coordinateFingerprint = $state("");
  let proposals = $state<FlowFestPlanCorrectionProposal[]>([]);
  let activeFeatureId = $state("camp-road-entrance");
  let proposalNote = $state("");
  let lowerLayout = $state<FlowFestLowerLayoutDraft>(
    emptyFlowFestLowerLayoutDraft()
  );
  let activeLayoutFeatureId =
    $state<FlowFestLowerLayoutFeatureId>("lower-road-loop");
  let draftLayoutFeature = $state<FlowFestLowerLayoutFeatureId | null>(null);
  let svgElement = $state<SVGSVGElement | null>(null);
  let mapInteractionElement = $state<HTMLButtonElement | null>(null);
  let view = $state({ ...LOWER_LAYOUT_VIEW });

  const history: Record<FlowFestPathId, ImagePoint[][]> = {
    "upper-to-middle": [],
    "middle-to-lower": [],
  };
  let pointerId: number | null = null;
  let panOrigin: {
    clientX: number;
    clientY: number;
    viewX: number;
    viewY: number;
  } | null = null;
  let proposalHistory: FlowFestPlanCorrectionProposal[][] = [];
  let lowerLayoutHistory: FlowFestLowerLayoutDraft[] = [];

  const upperReady = $derived(traces["upper-to-middle"].length >= 2);
  const lowerReady = $derived(traces["middle-to-lower"].length >= 2);
  const bothReady = $derived(upperReady && lowerReady);
  const modeOptions = $derived<
    Array<{ value: InteractionMode; label: string; tone: "accent" }>
  >(
    workspaceMode === "plan"
      ? [
          { value: "place", label: "Move marker", tone: "accent" },
          { value: "pan", label: "Pan", tone: "accent" },
        ]
      : workspaceMode === "layout" &&
          activeLayoutFeatureId === "lower-loop-entrance"
        ? [
            { value: "place", label: "Place point", tone: "accent" },
            { value: "pan", label: "Pan", tone: "accent" },
          ]
        : [
            { value: "draw", label: "Draw", tone: "accent" },
            { value: "pan", label: "Pan", tone: "accent" },
          ]
  );
  const editableFeatures = $derived(
    plan ? listEditableFlowFestPlanFeatures(plan) : []
  );
  const activeFeature = $derived(
    editableFeatures.find((feature) => feature.id === activeFeatureId) ?? null
  );
  const previewPlan = $derived(
    plan ? previewFlowFestPlanCorrections(plan, proposals) : null
  );
  const activeProposal = $derived(
    proposals.find(
      (proposal) =>
        proposal.featureId === activeFeature?.id &&
        proposal.targetKind === activeFeature?.targetKind
    ) ?? null
  );
  const activeLayoutFeature = $derived(
    FLOW_FEST_LOWER_LAYOUT_FEATURES.find(
      (feature) => feature.id === activeLayoutFeatureId
    )!
  );
  const lowerLayoutStatus = $derived(flowFestLowerLayoutReadiness(lowerLayout));
  const lowerLayoutReadyCount = $derived(
    Object.values(lowerLayoutStatus).filter(Boolean).length
  );
  const activeLayoutPoints = $derived(
    getFlowFestLowerLayoutFeaturePoints(lowerLayout, activeLayoutFeatureId)
  );

  onMount(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const restored = parseStoredTraces(stored);
      if (restored) traces = restored;
    }
    const storedLowerLayout = window.localStorage.getItem(
      LOWER_LAYOUT_STORAGE_KEY
    );
    if (storedLowerLayout) {
      const restored = parseStoredFlowFestLowerLayoutDraft(storedLowerLayout);
      if (restored) lowerLayout = restored;
    }
    void loadPlan();
  });

  async function loadPlan(): Promise<void> {
    try {
      const contract = await loadFlowFestRuntimeContract();
      const loadedPlan = createFlowFestCampPlan(contract, "lower-tent");
      const fingerprint =
        contract.coordinateContentFingerprint.canonicalPayloadSha256;
      plan = loadedPlan;
      coordinateFingerprint = fingerprint;
      const stored = window.localStorage.getItem(PLAN_STORAGE_KEY);
      if (stored) {
        const validation = validateFlowFestPlanCorrectionSubmission(
          JSON.parse(stored),
          loadedPlan,
          fingerprint
        );
        if (validation.valid) proposals = validation.value.proposals;
      }
      if (workspaceMode === "layout") {
        notice = lowerLayoutReadyCount
          ? `Restored ${lowerLayoutReadyCount} of 4 lower campground truths.`
          : activeLayoutFeature.instruction;
        noticeKind = lowerLayoutReadyCount ? "success" : "quiet";
      } else {
        notice = proposals.length
          ? `Restored ${proposals.length} camp-plan correction${proposals.length === 1 ? "" : "s"}.`
          : "Camp plan loaded. Select a feature, then place its proposed correction.";
        noticeKind = proposals.length ? "success" : "quiet";
      }
    } catch (cause) {
      reportFailure(
        "The registered camp plan could not be loaded.",
        cause,
        "loadCampPlan"
      );
    }
  }

  function reportFailure(
    message: string,
    cause: unknown,
    action: string
  ): void {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    notice = message;
    noticeKind = "error";
    getErrorHandler().showUserError({
      message,
      technicalDetails: error.message,
      error,
      severity: "error",
      context: {
        module: "flow-fest-path-tracer",
        tab: "terrain-authoring",
        action,
      },
    });
  }

  function cloneTrace(points: readonly ImagePoint[]): ImagePoint[] {
    return points.map((point) => ({ ...point }));
  }

  function persistTraces(): void {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(traces));
    } catch (cause) {
      reportFailure(
        "The paths are still on screen, but this browser could not preserve them across a refresh.",
        cause,
        "persistDraft"
      );
    }
  }

  function persistPlanProposals(): void {
    if (!plan || !coordinateFingerprint || proposals.length === 0) {
      window.localStorage.removeItem(PLAN_STORAGE_KEY);
      return;
    }
    try {
      const submission = createFlowFestPlanCorrectionSubmission(
        proposals,
        coordinateFingerprint
      );
      window.localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(submission));
    } catch (cause) {
      reportFailure(
        "The corrections remain on screen, but this browser could not preserve them across a refresh.",
        cause,
        "persistPlanCorrections"
      );
    }
  }

  function persistLowerLayout(): void {
    try {
      window.localStorage.setItem(
        LOWER_LAYOUT_STORAGE_KEY,
        JSON.stringify(lowerLayout)
      );
    } catch (cause) {
      reportFailure(
        "The lower campground layout remains on screen, but this browser could not preserve it across a refresh.",
        cause,
        "persistLowerLayout"
      );
    }
  }

  function switchWorkspace(next: WorkspaceMode): void {
    workspaceMode = next;
    interactionMode =
      next === "plan" ||
      (next === "layout" && activeLayoutFeatureId === "lower-loop-entrance")
        ? "place"
        : "draw";
    view =
      next === "layout"
        ? { ...LOWER_LAYOUT_VIEW }
        : { ...FLOW_FEST_TRACE_VIEW };
    notice =
      next === "plan"
        ? "Plan mode previews corrections without overwriting the current authority."
        : next === "layout"
          ? "Lower campground mode keeps the road, camping zones, and entrance independent."
          : "Path mode keeps both traced connectors independently.";
    noticeKind = "quiet";
  }

  function remember(pathId: FlowFestPathId): void {
    history[pathId].push(cloneTrace(traces[pathId]));
    if (history[pathId].length > 20) history[pathId].shift();
  }

  function pointsAttribute(points: readonly ImagePoint[]): string {
    return points
      .map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`)
      .join(" ");
  }

  function closedPointsAttribute(points: readonly ImagePoint[]): string {
    if (points.length === 0) return "";
    return pointsAttribute([...points, points[0]!]);
  }

  function worldPointsAttribute(
    points: readonly { x: number; z: number }[]
  ): string {
    return pointsAttribute(points.map(worldPointToImage));
  }

  function featureImagePoint(featureId: string): ImagePoint | null {
    const feature = editableFeatures.find(
      (candidate) => candidate.id === featureId
    );
    if (!feature) return null;
    const proposal = proposals.find(
      (candidate) =>
        candidate.featureId === feature.id &&
        candidate.targetKind === feature.targetKind
    );
    return worldPointToImage(proposal?.proposedWorld ?? feature.originalWorld);
  }

  function chooseFeature(featureId: string): void {
    activeFeatureId = featureId;
    const proposal = proposals.find(
      (candidate) => candidate.featureId === featureId
    );
    proposalNote = proposal?.note ?? "";
    notice =
      "Drag anywhere on the imagery to propose the selected feature's corrected center.";
    noticeKind = "quiet";
  }

  function chooseLayoutFeature(featureId: FlowFestLowerLayoutFeatureId): void {
    activeLayoutFeatureId = featureId;
    interactionMode = featureId === "lower-loop-entrance" ? "place" : "draw";
    notice = FLOW_FEST_LOWER_LAYOUT_FEATURES.find(
      (feature) => feature.id === featureId
    )!.instruction;
    noticeKind = "quiet";
  }

  function rememberLowerLayout(): void {
    lowerLayoutHistory.push(cloneFlowFestLowerLayoutDraft(lowerLayout));
    if (lowerLayoutHistory.length > 20) lowerLayoutHistory.shift();
  }

  function updateLayoutFeatureNote(value: string): void {
    lowerLayout = {
      ...lowerLayout,
      featureNotes: {
        ...lowerLayout.featureNotes,
        [activeLayoutFeatureId]: value,
      },
    };
    persistLowerLayout();
  }

  function updateLayoutOverallNote(value: string): void {
    lowerLayout = { ...lowerLayout, overallNote: value };
    persistLowerLayout();
  }

  function updateTentBandWidth(value: number): void {
    lowerLayout = { ...lowerLayout, tentBandWidthMeters: value };
    persistLowerLayout();
  }

  function updateProposalNote(): void {
    if (!activeFeature || !activeProposal) return;
    proposals = upsertFlowFestPlanCorrection(
      proposals,
      activeFeature,
      activeProposal.proposedWorld,
      proposalNote
    );
    persistPlanProposals();
  }

  function pointFromEvent(event: PointerEvent): ImagePoint | null {
    if (!svgElement) return null;
    const transform = svgElement.getScreenCTM();
    if (!transform) return null;
    const point = svgElement.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const imagePoint = point.matrixTransform(transform.inverse());
    return { x: imagePoint.x, y: imagePoint.y };
  }

  function distance(left: ImagePoint, right: ImagePoint): number {
    return Math.hypot(left.x - right.x, left.y - right.y);
  }

  function handlePointerDown(event: PointerEvent): void {
    if (!svgElement || !mapInteractionElement || pointerId !== null) return;
    const point = pointFromEvent(event);
    if (!point) return;
    pointerId = event.pointerId;
    mapInteractionElement.setPointerCapture(event.pointerId);
    if (interactionMode === "draw" && workspaceMode === "paths") {
      draftPath = activePath;
      draft = [point];
      notice = `Drawing ${activePath === "upper-to-middle" ? "upper to middle" : "middle to lower"}. Release to keep it.`;
      noticeKind = "quiet";
    } else if (
      interactionMode === "draw" &&
      workspaceMode === "layout" &&
      activeLayoutFeature.geometry !== "point"
    ) {
      rememberLowerLayout();
      draftLayoutFeature = activeLayoutFeatureId;
      draft = [point];
      notice = `Drawing ${activeLayoutFeature.label.toLowerCase()}. Release to keep this layer.`;
      noticeKind = "quiet";
    } else if (
      interactionMode === "place" &&
      workspaceMode === "layout" &&
      activeLayoutFeature.geometry === "point"
    ) {
      rememberLowerLayout();
      lowerLayout = replaceFlowFestLowerLayoutFeature(
        lowerLayout,
        activeLayoutFeatureId,
        [point]
      );
      notice = "Placing the lower loop entrance. Release to keep it.";
      noticeKind = "quiet";
    } else if (
      interactionMode === "place" &&
      workspaceMode === "plan" &&
      activeFeature
    ) {
      proposalHistory.push(
        proposals.map((proposal) => ({
          ...proposal,
          originalWorld: { ...proposal.originalWorld },
          proposedWorld: { ...proposal.proposedWorld },
        }))
      );
      if (proposalHistory.length > 20) proposalHistory.shift();
      proposals = upsertFlowFestPlanCorrection(
        proposals,
        activeFeature,
        imagePointToWorld(point),
        proposalNote
      );
      notice = `Previewing a corrected ${activeFeature.label} marker. Release to keep it.`;
      noticeKind = "quiet";
    } else {
      panOrigin = {
        clientX: event.clientX,
        clientY: event.clientY,
        viewX: view.x,
        viewY: view.y,
      };
    }
    event.preventDefault();
  }

  function handlePointerMove(event: PointerEvent): void {
    if (!svgElement || event.pointerId !== pointerId) return;
    if (
      interactionMode === "draw" &&
      (draftPath !== null || draftLayoutFeature !== null)
    ) {
      const rect = svgElement.getBoundingClientRect();
      const raw =
        typeof event.getCoalescedEvents === "function"
          ? event.getCoalescedEvents()
          : [];
      const events = raw.length > 0 ? raw : [event];
      const added: ImagePoint[] = [];
      let last = draft[draft.length - 1];
      for (const sample of events) {
        const next = pointFromEvent(sample);
        if (!next) continue;
        const threshold = Math.max(0.6, view.width / Math.max(1, rect.width));
        if (!last || distance(last, next) >= threshold) {
          added.push(next);
          last = next;
        }
      }
      if (added.length > 0) draft = [...draft, ...added];
      return;
    }
    if (
      interactionMode === "place" &&
      workspaceMode === "layout" &&
      activeLayoutFeature.geometry === "point"
    ) {
      const next = pointFromEvent(event);
      if (!next) return;
      lowerLayout = replaceFlowFestLowerLayoutFeature(
        lowerLayout,
        activeLayoutFeatureId,
        [next]
      );
      return;
    }
    if (
      interactionMode === "place" &&
      workspaceMode === "plan" &&
      activeFeature
    ) {
      const next = pointFromEvent(event);
      if (!next) return;
      proposals = upsertFlowFestPlanCorrection(
        proposals,
        activeFeature,
        imagePointToWorld(next),
        proposalNote
      );
      return;
    }
    if (interactionMode === "pan" && panOrigin) {
      const rect = svgElement.getBoundingClientRect();
      view.x =
        panOrigin.viewX -
        ((event.clientX - panOrigin.clientX) / Math.max(1, rect.width)) *
          view.width;
      view.y =
        panOrigin.viewY -
        ((event.clientY - panOrigin.clientY) / Math.max(1, rect.height)) *
          view.height;
      clampView();
    }
  }

  function finishPointer(event: PointerEvent): void {
    if (!svgElement || event.pointerId !== pointerId) return;
    if (interactionMode === "draw" && draftPath) {
      if (draft.length >= 2 && traceLengthMeters(draft) >= 2) {
        const pathId = draftPath;
        remember(pathId);
        traces[pathId] = normalizeTraceDirection(pathId, simplifyTrace(draft));
        persistTraces();
        notice = `${pathId === "upper-to-middle" ? "Upper-to-middle" : "Middle-to-lower"} path kept. The other path was not changed.`;
        noticeKind = "success";
      } else {
        notice =
          "That was only a click, so the previous path was left untouched.";
        noticeKind = "quiet";
      }
    } else if (interactionMode === "draw" && draftLayoutFeature) {
      const featureId = draftLayoutFeature;
      const feature = FLOW_FEST_LOWER_LAYOUT_FEATURES.find(
        (candidate) => candidate.id === featureId
      )!;
      const minimumPoints = feature.geometry === "polygon" ? 3 : 2;
      if (draft.length >= minimumPoints && traceLengthMeters(draft) >= 2) {
        lowerLayout = replaceFlowFestLowerLayoutFeature(
          lowerLayout,
          featureId,
          simplifyTrace(draft, 1.1)
        );
        persistLowerLayout();
        notice = `${feature.label} kept. The other lower campground layers were not changed.`;
        noticeKind = "success";
      } else {
        lowerLayoutHistory.pop();
        notice =
          "That gesture was too short, so the previous layer was left untouched.";
        noticeKind = "quiet";
      }
    } else if (
      interactionMode === "place" &&
      workspaceMode === "layout" &&
      activeLayoutFeature.geometry === "point"
    ) {
      persistLowerLayout();
      notice = "Lower loop entrance kept as Austen-annotated evidence.";
      noticeKind = "success";
    } else if (
      interactionMode === "place" &&
      workspaceMode === "plan" &&
      activeFeature
    ) {
      persistPlanProposals();
      notice = `${activeFeature.label} correction kept as a proposal. The original coordinate is still preserved.`;
      noticeKind = "success";
    }
    const releasedPointerId = pointerId;
    pointerId = null;
    if (mapInteractionElement?.hasPointerCapture(releasedPointerId)) {
      mapInteractionElement.releasePointerCapture(releasedPointerId);
    }
    draft = [];
    draftPath = null;
    draftLayoutFeature = null;
    panOrigin = null;
  }

  function handlePointerCancel(event: PointerEvent): void {
    if (!svgElement || event.pointerId !== pointerId) return;
    if (
      workspaceMode === "layout" &&
      (draftLayoutFeature !== null ||
        (interactionMode === "place" &&
          activeLayoutFeature.geometry === "point"))
    ) {
      const previous = lowerLayoutHistory.pop();
      if (previous) lowerLayout = previous;
    }
    const releasedPointerId = pointerId;
    pointerId = null;
    if (mapInteractionElement?.hasPointerCapture(releasedPointerId)) {
      mapInteractionElement.releasePointerCapture(releasedPointerId);
    }
    draft = [];
    draftPath = null;
    draftLayoutFeature = null;
    panOrigin = null;
    notice = "The interrupted gesture ended. Saved work is unchanged.";
    noticeKind = "quiet";
  }

  function handleMapKeydown(event: KeyboardEvent): void {
    if (
      event.key !== "Escape" ||
      (draftPath === null && draftLayoutFeature === null)
    )
      return;
    if (draftLayoutFeature !== null) lowerLayoutHistory.pop();
    draft = [];
    draftPath = null;
    draftLayoutFeature = null;
    notice = "The current stroke was discarded.";
    noticeKind = "quiet";
  }

  function clampView(): void {
    const bounds =
      workspaceMode === "layout"
        ? LOWER_LAYOUT_BOUNDS
        : FLOW_FEST_TRACE_VIEW;
    view.width = Math.max(216, Math.min(bounds.width, view.width));
    view.height = view.width * (bounds.height / bounds.width);
    view.x = Math.max(
      bounds.x,
      Math.min(bounds.x + bounds.width - view.width, view.x)
    );
    view.y = Math.max(
      bounds.y,
      Math.min(bounds.y + bounds.height - view.height, view.y)
    );
  }

  function zoom(factor: number): void {
    const centerX = view.x + view.width / 2;
    const centerY = view.y + view.height / 2;
    view.width *= factor;
    view.height *= factor;
    view.x = centerX - view.width / 2;
    view.y = centerY - view.height / 2;
    clampView();
  }

  function handleWheel(event: WheelEvent): void {
    event.preventDefault();
    zoom(event.deltaY > 0 ? 1.15 : 0.85);
  }

  function resetView(): void {
    view =
      workspaceMode === "layout"
        ? { ...LOWER_LAYOUT_VIEW }
        : { ...FLOW_FEST_TRACE_VIEW };
  }

  function undoActiveTrace(): void {
    const entry = history[activePath].pop();
    if (!entry) {
      notice =
        "There is no earlier version of this path in the current session.";
      noticeKind = "quiet";
      return;
    }
    traces[activePath] = cloneTrace(entry);
    persistTraces();
    notice = "Restored the previous version of the active path.";
    noticeKind = "success";
  }

  function undoPlanCorrection(): void {
    const previous = proposalHistory.pop();
    if (!previous) {
      notice = "There is no earlier camp-plan correction in this session.";
      noticeKind = "quiet";
      return;
    }
    proposals = previous;
    persistPlanProposals();
    notice = "Restored the previous correction set.";
    noticeKind = "success";
  }

  function undoLowerLayout(): void {
    const previous = lowerLayoutHistory.pop();
    if (!previous) {
      notice = "There is no earlier lower campground edit in this session.";
      noticeKind = "quiet";
      return;
    }
    lowerLayout = previous;
    persistLowerLayout();
    notice = "Restored the previous lower campground layout.";
    noticeKind = "success";
  }

  function clearActiveCorrection(): void {
    if (!activeFeature) return;
    proposalHistory.push(
      proposals.map((proposal) => ({
        ...proposal,
        originalWorld: { ...proposal.originalWorld },
        proposedWorld: { ...proposal.proposedWorld },
      }))
    );
    proposals = proposals.filter(
      (proposal) =>
        proposal.featureId !== activeFeature.id ||
        proposal.targetKind !== activeFeature.targetKind
    );
    persistPlanProposals();
    notice = `${activeFeature.label} returned to its current authoritative coordinate.`;
    noticeKind = "quiet";
  }

  function clearActiveTrace(): void {
    remember(activePath);
    traces[activePath] = [];
    persistTraces();
    notice = "Cleared only the active path. Undo Trace will restore it.";
    noticeKind = "quiet";
  }

  function clearActiveLayoutFeature(): void {
    rememberLowerLayout();
    lowerLayout = replaceFlowFestLowerLayoutFeature(
      lowerLayout,
      activeLayoutFeatureId,
      []
    );
    persistLowerLayout();
    notice = `Cleared ${activeLayoutFeature.label.toLowerCase()} only. Undo will restore it.`;
    noticeKind = "quiet";
  }

  function currentSubmission() {
    const submission = createTraceSubmission(traces);
    const validation = validateTraceSubmission(submission);
    if (!validation.valid) {
      notice = validation.error;
      noticeKind = "error";
      return null;
    }
    return validation.value;
  }

  async function saveForCodex(): Promise<void> {
    const submission = currentSubmission();
    if (!submission) return;
    saving = true;
    notice = "Saving both paths for Codex…";
    noticeKind = "quiet";
    try {
      const response = await fetch("/test/flow-fest-path-tracer/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(submission),
      });
      const result = (await response.json()) as {
        ok?: boolean;
        path?: string;
        error?: string;
      };
      if (!response.ok || !result.ok) {
        throw new Error(
          result.error ?? `Save failed with HTTP ${response.status}`
        );
      }
      notice = `Saved for Codex at ${result.path}.`;
      noticeKind = "success";
    } catch (cause) {
      reportFailure(
        "The paths could not be written to the Flow Fest spec folder.",
        cause,
        "saveTraces"
      );
    } finally {
      saving = false;
    }
  }

  function currentPlanSubmission() {
    if (!plan || !coordinateFingerprint) {
      notice = "The camp plan is still loading.";
      noticeKind = "error";
      return null;
    }
    const submission = createFlowFestPlanCorrectionSubmission(
      proposals,
      coordinateFingerprint
    );
    const validation = validateFlowFestPlanCorrectionSubmission(
      submission,
      plan,
      coordinateFingerprint
    );
    if (!validation.valid) {
      notice = validation.error;
      noticeKind = "error";
      return null;
    }
    return validation.value;
  }

  async function savePlanForCodex(): Promise<void> {
    const submission = currentPlanSubmission();
    if (!submission) return;
    saving = true;
    notice = "Saving camp-plan corrections for Codex…";
    noticeKind = "quiet";
    try {
      const response = await fetch("/test/flow-fest-path-tracer/save-plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(submission),
      });
      const result = (await response.json()) as {
        ok?: boolean;
        path?: string;
        error?: string;
      };
      if (!response.ok || !result.ok) {
        throw new Error(
          result.error ?? `Save failed with HTTP ${response.status}`
        );
      }
      notice = `Saved ${submission.proposals.length} correction${submission.proposals.length === 1 ? "" : "s"} at ${result.path}.`;
      noticeKind = "success";
    } catch (cause) {
      reportFailure(
        "The camp-plan corrections could not be written to the Flow Fest spec folder.",
        cause,
        "savePlanCorrections"
      );
    } finally {
      saving = false;
    }
  }

  function currentLowerLayoutSubmission() {
    if (!coordinateFingerprint) {
      notice = "The registered coordinate frame is still loading.";
      noticeKind = "error";
      return null;
    }
    const submission = createFlowFestLowerLayoutSubmission(
      lowerLayout,
      coordinateFingerprint
    );
    const validation = validateFlowFestLowerLayoutSubmission(
      submission,
      coordinateFingerprint
    );
    if (!validation.valid) {
      notice = validation.error;
      noticeKind = "error";
      return null;
    }
    return validation.value;
  }

  async function saveLowerLayoutForCodex(): Promise<void> {
    const submission = currentLowerLayoutSubmission();
    if (!submission) return;
    saving = true;
    notice = "Saving the registered lower campground layout for Codex…";
    noticeKind = "quiet";
    try {
      const response = await fetch(
        "/test/flow-fest-path-tracer/save-lower-layout",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(submission),
        }
      );
      const result = (await response.json()) as {
        ok?: boolean;
        path?: string;
        error?: string;
      };
      if (!response.ok || !result.ok) {
        throw new Error(
          result.error ?? `Save failed with HTTP ${response.status}`
        );
      }
      notice = `Saved the lower campground truth at ${result.path}.`;
      noticeKind = "success";
    } catch (cause) {
      reportFailure(
        "The lower campground layout could not be written to the Flow Fest spec folder.",
        cause,
        "saveLowerLayout"
      );
    } finally {
      saving = false;
    }
  }

  async function copyCoordinates(): Promise<void> {
    const submission =
      workspaceMode === "plan"
        ? currentPlanSubmission()
        : workspaceMode === "layout"
          ? currentLowerLayoutSubmission()
          : currentSubmission();
    if (!submission) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(submission, null, 2));
      notice =
        workspaceMode === "plan"
          ? "Copied the registered correction proposal as JSON."
          : workspaceMode === "layout"
            ? "Copied the registered lower campground layout as JSON."
            : "Copied both registered paths as JSON.";
      noticeKind = "success";
    } catch (cause) {
      reportFailure(
        "The browser could not copy the path coordinates.",
        cause,
        "copyTraces"
      );
    }
  }
</script>

<svelte:head>
  <title>Flow Fest Ground Truth | TKA</title>
  <meta
    name="description"
    content="Correct the shared Flow Fest camp plan over its registered public orthophoto."
  />
</svelte:head>

<main class="trace-page">
  <header class="page-header">
    <div class="title-block">
      <p class="eyebrow">Flow Fest Sim · Reality Lock</p>
      <h1>
        {workspaceMode === "layout"
          ? "Show me the lower campground"
          : workspaceMode === "plan"
            ? "Place the camp on Earth"
            : "Draw the paths that the trees hide"}
      </h1>
      <p class="lede">
        {workspaceMode === "layout"
          ? "Trace the actual loop, tent perimeter, car-camping interior, and entrance as four independent layers. Nothing here silently becomes authoritative."
          : workspaceMode === "plan"
            ? "The official road is locked. Every camp correction keeps the old coordinate and its evidence trail."
            : "Each stroke replaces only its selected route. Your other route remains on the map, and both survive a refresh."}
      </p>
    </div>
    <div class="completion" aria-label="Authoring status">
      {#if workspaceMode === "layout"}
        {#each FLOW_FEST_LOWER_LAYOUT_FEATURES as feature}
          <span class:ready={lowerLayoutStatus[feature.id]}>
            <span class={`status-dot layout ${feature.id}`} aria-hidden="true"
            ></span>
            {feature.label}
            {lowerLayoutStatus[feature.id] ? "ready" : "missing"}
          </span>
        {/each}
      {:else if workspaceMode === "plan"}
        <span class:ready={Boolean(plan)}>
          <span class="status-dot authority" aria-hidden="true"></span>
          {plan ? "Shared plan loaded" : "Loading plan"}
        </span>
        <span class:ready={proposals.length > 0}>
          <span class="status-dot correction" aria-hidden="true"></span>
          {proposals.length} correction{proposals.length === 1 ? "" : "s"}
        </span>
      {:else}
        <span class:ready={upperReady}>
          <span class="route-dot upper" aria-hidden="true"></span>
          Upper → Middle {upperReady ? "ready" : "not drawn"}
        </span>
        <span class:ready={lowerReady}>
          <span class="route-dot lower" aria-hidden="true"></span>
          Middle → Lower {lowerReady ? "ready" : "not drawn"}
        </span>
      {/if}
    </div>
  </header>

  <section class="workspace" aria-label="Flow Fest path authoring workspace">
    <aside class="control-panel">
      <div class="control-group">
        <h2 id="workspace-picker-label">Authoring layer</h2>
        <SegmentedControl
          options={WORKSPACE_OPTIONS}
          value={workspaceMode}
          onchange={switchWorkspace}
          color="accent"
          semantics="radiogroup"
          ariaLabelledby="workspace-picker-label"
        />
      </div>

      {#if workspaceMode === "paths"}
        <div class="control-group">
          <h2 id="path-picker-label">Path to edit</h2>
          <SegmentedControl
            options={PATH_OPTIONS}
            value={activePath}
            onchange={(value) => (activePath = value)}
            color="accent"
            semantics="radiogroup"
            ariaLabelledby="path-picker-label"
          />
        </div>
      {:else if workspaceMode === "layout"}
        <div class="control-group feature-picker">
          <label for="lower-layout-feature">Lower campground truth</label>
          <select
            id="lower-layout-feature"
            value={activeLayoutFeatureId}
            onchange={(event) =>
              chooseLayoutFeature(
                event.currentTarget.value as FlowFestLowerLayoutFeatureId
              )}
          >
            {#each FLOW_FEST_LOWER_LAYOUT_FEATURES as feature}
              <option value={feature.id}>
                {lowerLayoutStatus[feature.id] ? "✓" : "○"}
                {feature.label}
              </option>
            {/each}
          </select>
          <span class="evidence-readout">
            Austen annotation · pinned 2023 aerial
          </span>
        </div>
      {:else}
        <div class="control-group feature-picker">
          <label for="plan-feature">Feature to correct</label>
          <select
            id="plan-feature"
            value={activeFeatureId}
            onchange={(event) => chooseFeature(event.currentTarget.value)}
          >
            {#each editableFeatures as feature}
              <option value={feature.id}>{feature.label}</option>
            {/each}
          </select>
          {#if activeFeature}
            <span class="evidence-readout">
              Current source · {activeFeature.evidence.replaceAll("-", " ")}
            </span>
          {/if}
        </div>
      {/if}

      <div class="control-group">
        <h2 id="mode-picker-label">Map gesture</h2>
        <SegmentedControl
          options={modeOptions}
          value={interactionMode}
          onchange={(value) => (interactionMode = value)}
          color="accent"
          semantics="radiogroup"
          ariaLabelledby="mode-picker-label"
        />
      </div>

      <div class="instructions">
        {#if workspaceMode === "layout"}
          <p>
            <strong>{activeLayoutFeature.label}:</strong>
            {activeLayoutFeature.instruction}
          </p>
          <p>
            <strong>Other colors stay visible:</strong> editing this layer never erases
            another layer.
          </p>
          <p>
            <strong>Dashed white:</strong> current sim context only. It is not accepted
            ground truth.
          </p>
          <p>
            <strong>Pan:</strong> move after zooming. The mouse wheel also zooms.
          </p>
        {:else if workspaceMode === "plan"}
          <p>
            <strong>Move marker:</strong> drag the selected feature to its real center.
          </p>
          <p>
            <strong>Gold road:</strong> official ODOT geometry, intentionally locked.
          </p>
          <p>
            <strong>Dashed lines:</strong> interpreted camp drives. Paths remain in
            their own authoring layer.
          </p>
        {:else}
          <p>
            <strong>Draw:</strong> drag across the real trail and release to keep
            it.
          </p>
          <p>
            <strong>Pan:</strong> move around after zooming. The mouse wheel also
            zooms.
          </p>
          <p>
            A click without a drag is discarded, so it cannot erase a finished
            route.
          </p>
        {/if}
      </div>

      <div class="action-grid" aria-label="Map and trace actions">
        <PanelButton onclick={() => zoom(0.75)}>Zoom in</PanelButton>
        <PanelButton onclick={() => zoom(1.25)}>Zoom out</PanelButton>
        <PanelButton onclick={resetView}>Reset view</PanelButton>
        <PanelButton
          onclick={workspaceMode === "layout"
            ? undoLowerLayout
            : workspaceMode === "plan"
              ? undoPlanCorrection
              : undoActiveTrace}
        >
          {workspaceMode === "layout"
            ? "Undo edit"
            : workspaceMode === "plan"
              ? "Undo move"
              : "Undo trace"}
        </PanelButton>
        <PanelButton
          onclick={workspaceMode === "layout"
            ? clearActiveLayoutFeature
            : workspaceMode === "plan"
              ? clearActiveCorrection
              : clearActiveTrace}
        >
          Clear active
        </PanelButton>
        <PanelButton onclick={copyCoordinates}>Copy JSON</PanelButton>
      </div>

      {#if workspaceMode === "layout"}
        <div class="layout-readout">
          <div class="layout-progress" aria-label="Lower campground completion">
            <strong>{lowerLayoutReadyCount} of 4 truths mapped</strong>
            <span
              >{activeLayoutPoints.length} captured point{activeLayoutPoints.length ===
              1
                ? ""
                : "s"}</span
            >
          </div>
          {#if activeLayoutFeatureId === "tent-perimeter-band"}
            <label for="tent-band-width">
              Tent-band width · {lowerLayout.tentBandWidthMeters.toFixed(0)} m
            </label>
            <input
              id="tent-band-width"
              type="range"
              min="2"
              max="30"
              step="1"
              value={lowerLayout.tentBandWidthMeters}
              oninput={(event) =>
                updateTentBandWidth(Number(event.currentTarget.value))}
            />
          {/if}
          <label for="layout-feature-note">What should Codex understand?</label>
          <textarea
            id="layout-feature-note"
            value={lowerLayout.featureNotes[activeLayoutFeatureId]}
            maxlength="500"
            placeholder="Example: the road runs inside this tent line, not through it."
            oninput={(event) =>
              updateLayoutFeatureNote(event.currentTarget.value)}
          ></textarea>
          <label for="layout-overall-note"
            >Anything about the whole lower level?</label
          >
          <textarea
            id="layout-overall-note"
            value={lowerLayout.overallNote}
            maxlength="1000"
            placeholder="Describe circulation, exceptions, or relationships the shapes alone cannot show."
            oninput={(event) =>
              updateLayoutOverallNote(event.currentTarget.value)}
          ></textarea>
        </div>
      {:else if workspaceMode === "plan"}
        <div class="plan-readout">
          <span class="lock-row"
            ><span aria-hidden="true">◆</span> Camden College Corner Rd · locked</span
          >
          {#if activeFeature}
            <strong>{activeFeature.label}</strong>
            <span>
              {activeProposal
                ? `${activeProposal.proposedWorld.x.toFixed(1)} E · ${activeProposal.proposedWorld.z.toFixed(1)} S`
                : "Using current plan coordinate"}
            </span>
            <label for="correction-note">Field note</label>
            <textarea
              id="correction-note"
              bind:value={proposalNote}
              maxlength="500"
              placeholder="What identifies this spot?"
              onblur={updateProposalNote}
            ></textarea>
          {/if}
        </div>
      {:else}
        <div class="path-readout">
          <div>
            <span
              ><span class="route-dot upper" aria-hidden="true"></span>Upper →
              Middle</span
            >
            <strong
              >{traces["upper-to-middle"].length} points · {traceLengthMeters(
                traces["upper-to-middle"]
              ).toFixed(1)} m</strong
            >
          </div>
          <div>
            <span
              ><span class="route-dot lower" aria-hidden="true"></span>Middle →
              Lower</span
            >
            <strong
              >{traces["middle-to-lower"].length} points · {traceLengthMeters(
                traces["middle-to-lower"]
              ).toFixed(1)} m</strong
            >
          </div>
        </div>
      {/if}

      <div class="save-block">
        <PanelButton
          variant="primary"
          fullWidth={true}
          onclick={workspaceMode === "layout"
            ? saveLowerLayoutForCodex
            : workspaceMode === "plan"
              ? savePlanForCodex
              : saveForCodex}
          disabled={saving}
          ariaBusy={saving}
        >
          {saving
            ? "Saving…"
            : workspaceMode === "layout"
              ? "Send lower layout to Codex"
              : workspaceMode === "plan"
                ? "Save correction proposal"
                : "Save both paths for Codex"}
        </PanelButton>
        <p class="save-hint">
          {workspaceMode === "layout"
            ? "The button stays available. If a truth is missing, it names exactly what still needs drawing."
            : workspaceMode === "plan"
              ? "Saving never silently promotes a coordinate. Codex reviews the proposal against the pinned evidence first."
              : "This button stays available. If a path is missing, it says which one instead of silently disabling itself."}
        </p>
      </div>
    </aside>

    <div class="map-panel">
      <div class="map-heading">
        <div>
          <span class="active-label">
            {workspaceMode === "layout"
              ? `Mapping ${activeLayoutFeature.label}`
              : workspaceMode === "plan"
                ? `Correcting ${activeFeature?.label ?? "camp plan"}`
                : `Editing ${activePath === "upper-to-middle" ? "Upper → Middle" : "Middle → Lower"}`}
          </span>
          <span class="source-label">
            {workspaceMode === "layout"
              ? "2023 NAIP · north up · dashed white = current sim draft"
              : "2023 NAIP · north up · 0.5 m per source pixel"}
          </span>
        </div>
        <span class="mode-label"
          >{interactionMode === "draw"
            ? activeLayoutFeature.geometry === "polygon" &&
              workspaceMode === "layout"
              ? "Drag around the area"
              : "Drag to draw"
            : interactionMode === "place"
              ? "Drag to place"
              : "Drag to pan"}</span
        >
      </div>

      <button
        type="button"
        class:panning={interactionMode === "pan"}
        class:placing={interactionMode === "place"}
        class="terrain-map-interaction"
        bind:this={mapInteractionElement}
        aria-label="Flow Fest terrain drawing map"
        onpointerdown={handlePointerDown}
        onpointermove={handlePointerMove}
        onpointerup={finishPointer}
        onpointercancel={handlePointerCancel}
        onlostpointercapture={handlePointerCancel}
        onkeydown={handleMapKeydown}
        onwheel={handleWheel}
      >
        <svg
          class="terrain-map"
          bind:this={svgElement}
          viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
          role="img"
          aria-label="North-up registered aerial map with camp plan and route overlays"
        >
          <image
            href="/data/flow-fest-sim/ortho.webp"
            x="0"
            y="0"
            width="2048"
            height="2048"
            preserveAspectRatio="none"
          />

          {#if workspaceMode === "layout"}
            {#if previewPlan}
              <g
                class="layout-plan-context"
                aria-label="Current sim context, not ground truth"
              >
                {#each previewPlan.publicRoads as road}
                  <polyline points={worldPointsAttribute(road.points)} />
                {/each}
                {#each previewPlan.internalDrives as drive}
                  <polyline points={worldPointsAttribute(drive.points)} />
                {/each}
              </g>
            {/if}
            <g
              class="lower-layout"
              aria-label="Austen lower campground annotations"
            >
              {#if lowerLayout.carCampingArea.length > 0}
                <polygon
                  class="layout-car-area"
                  class:active={activeLayoutFeatureId === "car-camping-area"}
                  points={closedPointsAttribute(lowerLayout.carCampingArea)}
                />
              {/if}
              {#if lowerLayout.tentPerimeterBand.length > 0}
                <polyline
                  class="layout-tent-band"
                  class:active={activeLayoutFeatureId === "tent-perimeter-band"}
                  stroke-width={lowerLayout.tentBandWidthMeters * 2}
                  points={pointsAttribute(lowerLayout.tentPerimeterBand)}
                />
                <polyline
                  class="layout-tent-centerline"
                  points={pointsAttribute(lowerLayout.tentPerimeterBand)}
                />
              {/if}
              {#if lowerLayout.lowerRoadLoop.length > 0}
                <polyline
                  class="layout-road-loop"
                  class:active={activeLayoutFeatureId === "lower-road-loop"}
                  points={closedPointsAttribute(lowerLayout.lowerRoadLoop)}
                />
              {/if}
              {#if lowerLayout.lowerLoopEntrance}
                <g
                  class="layout-entrance"
                  class:active={activeLayoutFeatureId === "lower-loop-entrance"}
                  transform={`translate(${lowerLayout.lowerLoopEntrance.x} ${lowerLayout.lowerLoopEntrance.y})`}
                >
                  <path d="M 0 -10 L 10 0 L 0 10 L -10 0 Z" />
                  <text x="14" y="-12">Loop entrance</text>
                </g>
              {/if}
            </g>
            {#if draftLayoutFeature}
              {#if draftLayoutFeature === "car-camping-area"}
                <polygon
                  class="layout-draft car"
                  points={closedPointsAttribute(draft)}
                />
              {:else}
                <polyline
                  class="layout-draft"
                  class:road={draftLayoutFeature === "lower-road-loop"}
                  class:tent={draftLayoutFeature === "tent-perimeter-band"}
                  points={pointsAttribute(draft)}
                />
              {/if}
            {/if}
            <g
              class="layout-scale"
              transform={`translate(${view.x + 22} ${view.y + view.height - 22})`}
            >
              <line x1="0" y1="0" x2="50" y2="0" />
              <line x1="0" y1="-5" x2="0" y2="5" />
              <line x1="50" y1="-5" x2="50" y2="5" />
              <text x="25" y="-9" text-anchor="middle">25 m</text>
            </g>
          {:else if workspaceMode === "plan" && previewPlan}
            <g class="plan-regions" aria-label="Camp plan regions">
              {#each previewPlan.regions as region}
                {#if region.shape === "ellipse" && region.center}
                  {@const center = worldPointToImage(region.center)}
                  <ellipse
                    class:woodland={region.kind === "woodland"}
                    class:clearing={region.kind === "clearing"}
                    class:parking={region.kind === "parking-field"}
                    cx={center.x}
                    cy={center.y}
                    rx={(region.radiusXMeters ?? 1) * 2}
                    ry={(region.radiusZMeters ?? 1) * 2}
                  />
                {:else if region.points}
                  <polygon
                    class="crop"
                    points={worldPointsAttribute(region.points)}
                  />
                {/if}
              {/each}
            </g>
            <g class="plan-lines" aria-label="Camp plan routes">
              {#each previewPlan.publicRoads as road}
                <polyline
                  class="plan-line official"
                  points={worldPointsAttribute(road.points)}
                />
              {/each}
              {#each previewPlan.internalDrives as drive}
                <polyline
                  class="plan-line internal"
                  points={worldPointsAttribute(drive.points)}
                />
              {/each}
              {#each previewPlan.footConnectors as connector}
                <polyline
                  class="plan-line connector"
                  points={worldPointsAttribute(connector.points)}
                />
              {/each}
            </g>
            <g class="plan-landmarks" aria-label="Camp plan landmarks">
              {#each previewPlan.landmarks.filter((landmark) => landmark.id !== "selected-camp") as landmark}
                {@const point = worldPointToImage(landmark.position)}
                <g
                  class="plan-marker"
                  class:selected={landmark.id === activeFeatureId}
                  class:corrected={proposals.some(
                    (proposal) => proposal.featureId === landmark.id
                  )}
                  transform={`translate(${point.x} ${point.y})`}
                >
                  <circle r={landmark.id === activeFeatureId ? 10 : 6} />
                  <text x="11" y="-10">{landmark.mapLabel}</text>
                </g>
              {/each}
              {#each previewPlan.regions.filter((region) => region.center) as region}
                {@const point = featureImagePoint(region.id)}
                {#if point}
                  <g
                    class="region-center-marker"
                    class:selected={region.id === activeFeatureId}
                    class:corrected={proposals.some(
                      (proposal) => proposal.featureId === region.id
                    )}
                    transform={`translate(${point.x} ${point.y})`}
                  >
                    <path d="M -5 0 L 0 -5 L 5 0 L 0 5 Z" />
                  </g>
                {/if}
              {/each}
            </g>
            {#if activeFeature && activeProposal}
              {@const original = worldPointToImage(activeFeature.originalWorld)}
              {@const proposed = worldPointToImage(
                activeProposal.proposedWorld
              )}
              <line
                class="correction-vector"
                x1={original.x}
                y1={original.y}
                x2={proposed.x}
                y2={proposed.y}
              />
              <circle
                class="original-marker"
                cx={original.x}
                cy={original.y}
                r="6"
              />
            {/if}
          {:else}
            <polyline
              class="stored-path upper"
              class:active={activePath === "upper-to-middle"}
              points={pointsAttribute(traces["upper-to-middle"])}
            />
            <polyline
              class="stored-path lower"
              class:active={activePath === "middle-to-lower"}
              points={pointsAttribute(traces["middle-to-lower"])}
            />
            {#if draftPath}
              <polyline
                class="draft-path"
                class:upper={draftPath === "upper-to-middle"}
                class:lower={draftPath === "middle-to-lower"}
                points={pointsAttribute(draft)}
              />
            {/if}

            <g class="clearing-marker" transform="translate(900 876)">
              <circle r="9" />
              <text x="14" y="-14">Upper clearing</text>
            </g>
            <g class="clearing-marker" transform="translate(1224 794)">
              <circle r="9" />
              <text x="14" y="-14">Middle Earth</text>
            </g>
            <g class="clearing-marker" transform="translate(1596 764)">
              <circle r="9" />
              <text x="-14" y="-14" text-anchor="end">Lower clearing</text>
            </g>
          {/if}
          <g
            class="north-arrow"
            transform="translate(1718 622)"
            aria-label="North"
          >
            <text x="0" y="0" text-anchor="middle">N</text>
            <path d="M 0 10 L -8 34 L 0 29 L 8 34 Z" />
          </g>
        </svg>
      </button>
    </div>
  </section>

  <footer
    class="notice"
    class:success={noticeKind === "success"}
    class:error={noticeKind === "error"}
    aria-live="polite"
  >
    <span class="notice-dot" aria-hidden="true"></span>
    {notice}
    {#if workspaceMode === "layout" && lowerLayoutReadyCount === 4 && noticeKind === "quiet"}
      <span class="ready-copy"
        >All four lower campground truths can be sent.</span
      >
    {:else if workspaceMode === "paths" && bothReady && noticeKind === "quiet"}
      <span class="ready-copy">Both paths can be saved.</span>
    {/if}
  </footer>
</main>

<style>
  .trace-page {
    --upper-trace: var(--prop-blue, #67a7ff);
    --lower-trace: var(--semantic-success, #5ee6a8);
    --layout-road: #68b9ff;
    --layout-tent: #72e49a;
    --layout-car: #ff9b47;
    --layout-gate: #ffd65a;
    box-sizing: border-box;
    width: min(var(--shell-w, 92vw), calc(100% - 2rem));
    min-height: 100dvh;
    margin: 0 auto;
    padding: clamp(1rem, 2vw, 2.5rem) 0;
    color: var(--theme-text, #f5f2eb);
    container-type: inline-size;
  }

  .page-header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 2rem;
    margin-bottom: 1.25rem;
  }

  .title-block {
    min-width: 0;
  }

  .eyebrow {
    margin: 0 0 0.4rem;
    color: var(--theme-accent, #d6a84e);
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h1 {
    margin: 0;
    font-size: clamp(2rem, 4cqw, 4.5rem);
    line-height: 0.98;
  }

  .lede {
    margin: 0.75rem 0 0;
    color: var(--theme-text-dim, rgba(245, 242, 235, 0.75));
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.5;
  }

  .completion {
    display: grid;
    flex: 0 0 auto;
    gap: 0.45rem;
    padding: 0.85rem 1rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
    border-radius: var(--radius-lg, 0.75rem);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    color: var(--theme-text-dim, rgba(245, 242, 235, 0.75));
    font-size: var(--font-size-sm, 0.875rem);
  }

  .completion span {
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }

  .completion span.ready {
    color: var(--theme-text, #f5f2eb);
  }

  .status-dot {
    display: inline-block;
    width: 0.7rem;
    height: 0.7rem;
    flex: 0 0 auto;
    border-radius: 999px;
  }

  .status-dot.authority {
    background: var(--theme-accent, #d6a84e);
  }

  .status-dot.correction {
    background: var(--semantic-success, #5ee6a8);
  }

  .status-dot.lower-road-loop {
    background: var(--layout-road);
  }

  .status-dot.tent-perimeter-band {
    background: var(--layout-tent);
  }

  .status-dot.car-camping-area {
    background: var(--layout-car);
  }

  .status-dot.lower-loop-entrance {
    background: var(--layout-gate);
  }

  .route-dot {
    display: inline-block;
    width: 0.75rem;
    height: 0.75rem;
    flex: 0 0 auto;
    border-radius: 999px;
  }

  .route-dot.upper {
    background: var(--upper-trace);
  }

  .route-dot.lower {
    background: var(--lower-trace);
  }

  .workspace {
    display: grid;
    grid-template-columns: minmax(18rem, 24rem) minmax(0, 1fr);
    gap: 1rem;
    min-height: 0;
    padding: 1rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
    border-radius: var(--radius-xl, 1rem);
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
  }

  .control-panel {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    min-width: 0;
  }

  .control-group h2 {
    margin: 0 0 0.45rem;
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 500;
  }

  .feature-picker {
    display: grid;
    gap: 0.4rem;
  }

  .feature-picker label,
  .plan-readout label,
  .layout-readout label {
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 500;
  }

  .feature-picker select,
  .plan-readout textarea,
  .layout-readout textarea {
    box-sizing: border-box;
    width: 100%;
    min-height: var(--min-touch-target, 44px);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.16));
    border-radius: var(--radius-md, 0.5rem);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    color: var(--theme-text, #f5f2eb);
    font: inherit;
  }

  .feature-picker select {
    padding: 0 0.7rem;
  }

  .feature-picker option {
    background: var(--theme-panel-bg, #12121c);
  }

  .evidence-readout {
    color: var(--theme-text-dim, rgba(245, 242, 235, 0.72));
    font-size: var(--font-size-compact, 0.75rem);
    text-transform: capitalize;
  }

  .instructions {
    padding: 0.85rem;
    border-radius: var(--radius-md, 0.5rem);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    color: var(--theme-text-dim, rgba(245, 242, 235, 0.75));
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.45;
  }

  .instructions p {
    margin: 0;
  }

  .instructions p + p {
    margin-top: 0.45rem;
  }

  .instructions strong {
    color: var(--theme-text, #f5f2eb);
  }

  .action-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.5rem;
  }

  .path-readout {
    display: grid;
    gap: 0.6rem;
    padding-top: 0.25rem;
  }

  .plan-readout {
    display: grid;
    gap: 0.4rem;
    padding: 0.85rem;
    border-radius: var(--radius-md, 0.5rem);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    font-size: var(--font-size-sm, 0.875rem);
  }

  .layout-readout {
    display: grid;
    gap: 0.55rem;
    max-height: 24rem;
    overflow-y: auto;
    padding: 0.85rem;
    border-radius: var(--radius-md, 0.5rem);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    font-size: var(--font-size-sm, 0.875rem);
  }

  .layout-progress {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    color: var(--theme-text-dim, rgba(245, 242, 235, 0.74));
    font-variant-numeric: tabular-nums;
  }

  .layout-progress strong {
    color: var(--theme-text, #f5f2eb);
  }

  .layout-readout textarea {
    min-height: 4.25rem;
    padding: 0.55rem 0.65rem;
    resize: vertical;
  }

  .layout-readout input[type="range"] {
    width: 100%;
    min-height: var(--min-touch-target, 44px);
    accent-color: var(--layout-tent);
  }

  .plan-readout > span {
    color: var(--theme-text-dim, rgba(245, 242, 235, 0.74));
    font-variant-numeric: tabular-nums;
  }

  .plan-readout .lock-row {
    color: var(--theme-accent, #d6a84e);
  }

  .plan-readout textarea {
    min-height: 4.5rem;
    padding: 0.55rem 0.65rem;
    resize: vertical;
  }

  .path-readout > div {
    display: grid;
    gap: 0.2rem;
  }

  .path-readout span {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    color: var(--theme-text-dim, rgba(245, 242, 235, 0.75));
    font-size: var(--font-size-sm, 0.875rem);
  }

  .path-readout strong {
    font-size: var(--font-size-min, 0.875rem);
    font-variant-numeric: tabular-nums;
  }

  .save-block {
    margin-top: auto;
  }

  .save-hint {
    margin: 0.5rem 0 0;
    color: var(--theme-text-dim, rgba(245, 242, 235, 0.72));
    font-size: var(--font-size-compact, 0.75rem);
    line-height: 1.4;
  }

  .map-panel {
    display: flex;
    align-self: start;
    min-width: 0;
    min-height: 0;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
    border-radius: var(--radius-lg, 0.75rem);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
  }

  .map-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    min-height: var(--min-touch-target, 44px);
    padding: 0.65rem 0.9rem;
    color: var(--theme-text-dim, rgba(245, 242, 235, 0.75));
    font-size: var(--font-size-compact, 0.75rem);
  }

  .map-heading > div {
    display: flex;
    align-items: baseline;
    gap: 0.7rem;
    min-width: 0;
  }

  .active-label {
    color: var(--theme-text, #f5f2eb);
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 500;
  }

  .source-label,
  .mode-label {
    white-space: nowrap;
  }

  .terrain-map-interaction {
    width: 100%;
    aspect-ratio: 1080 / 560;
    padding: 0;
    border: 0;
    background: var(--theme-panel-bg, #12121c);
    color: inherit;
    text-align: initial;
    cursor: crosshair;
    touch-action: none;
    user-select: none;
  }

  .terrain-map {
    display: block;
    width: 100%;
    height: 100%;
  }

  .terrain-map-interaction.panning {
    cursor: grab;
  }

  .terrain-map-interaction.placing {
    cursor: move;
  }

  .terrain-map-interaction:focus-visible {
    outline: 3px solid var(--theme-accent, #d6a84e);
    outline-offset: -3px;
  }

  .stored-path,
  .draft-path {
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }

  .stored-path {
    stroke-width: 6;
    opacity: 0.78;
  }

  .stored-path.active {
    stroke-width: 9;
    opacity: 1;
    filter: drop-shadow(0 0 3px var(--theme-panel-bg, #12121c));
  }

  .stored-path.upper,
  .draft-path.upper {
    stroke: var(--upper-trace);
  }

  .stored-path.lower,
  .draft-path.lower {
    stroke: var(--lower-trace);
  }

  .draft-path {
    stroke-width: 8;
    stroke-dasharray: 12 8;
  }

  .clearing-marker circle {
    fill: var(--theme-accent, #d6a84e);
    stroke: var(--theme-text-on-accent, #111);
    stroke-width: 2;
    vector-effect: non-scaling-stroke;
  }

  .clearing-marker text,
  .north-arrow text {
    fill: var(--theme-text, #f5f2eb);
    stroke: var(--theme-panel-bg, #12121c);
    stroke-width: 5;
    paint-order: stroke;
    font-size: 1.125rem;
    font-weight: 500;
    pointer-events: none;
  }

  .north-arrow path {
    fill: var(--theme-text, #f5f2eb);
    stroke: var(--theme-panel-bg, #12121c);
    stroke-width: 2;
    paint-order: stroke;
  }

  .layout-plan-context polyline {
    fill: none;
    stroke: rgba(255, 255, 255, 0.62);
    stroke-width: 3;
    stroke-dasharray: 7 6;
    stroke-linecap: round;
    vector-effect: non-scaling-stroke;
  }

  .layout-car-area {
    fill: var(--layout-car);
    fill-opacity: 0.24;
    stroke: var(--layout-car);
    stroke-width: 4;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }

  .layout-tent-band {
    fill: none;
    stroke: var(--layout-tent);
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: 0.3;
  }

  .layout-tent-centerline {
    fill: none;
    stroke: var(--layout-tent);
    stroke-width: 4;
    stroke-dasharray: 8 6;
    stroke-linecap: round;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }

  .layout-road-loop {
    fill: none;
    stroke: var(--layout-road);
    stroke-width: 7;
    stroke-linecap: round;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }

  .layout-car-area.active,
  .layout-tent-band.active,
  .layout-road-loop.active,
  .layout-entrance.active {
    filter: drop-shadow(0 0 5px var(--theme-panel-bg, #12121c));
  }

  .layout-entrance path {
    fill: var(--layout-gate);
    stroke: var(--theme-panel-bg, #12121c);
    stroke-width: 3;
    vector-effect: non-scaling-stroke;
  }

  .layout-entrance text,
  .layout-scale text {
    fill: var(--theme-text, #f5f2eb);
    stroke: var(--theme-panel-bg, #12121c);
    stroke-width: 5;
    paint-order: stroke;
    font-size: 0.9rem;
    font-weight: 650;
    pointer-events: none;
  }

  .layout-draft {
    fill: none;
    stroke: var(--layout-road);
    stroke-width: 6;
    stroke-dasharray: 10 7;
    stroke-linecap: round;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }

  .layout-draft.tent {
    stroke: var(--layout-tent);
  }

  .layout-draft.car {
    fill: var(--layout-car);
    fill-opacity: 0.18;
    stroke: var(--layout-car);
  }

  .layout-scale line {
    stroke: var(--theme-text, #f5f2eb);
    stroke-width: 3;
    vector-effect: non-scaling-stroke;
  }

  .plan-regions ellipse,
  .plan-regions polygon {
    fill-opacity: 0.16;
    stroke-width: 2;
    vector-effect: non-scaling-stroke;
  }

  .plan-regions .woodland {
    fill: #2b6b43;
    stroke: #75c792;
  }

  .plan-regions .clearing {
    fill: #d8bd76;
    stroke: #f4d893;
  }

  .plan-regions .parking {
    fill: #7da6bd;
    stroke: #a9d9ed;
  }

  .plan-regions .crop {
    fill: #c99e3b;
    stroke: #f4c65b;
  }

  .plan-line {
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }

  .plan-line.official {
    stroke: #ffd368;
    stroke-width: 8;
    filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.7));
  }

  .plan-line.internal {
    stroke: #f3f0df;
    stroke-width: 5;
    stroke-dasharray: 11 7;
  }

  .plan-line.connector {
    stroke: #67a7ff;
    stroke-width: 4;
    stroke-dasharray: 4 6;
  }

  .plan-marker circle {
    fill: #f6f2e7;
    stroke: #182018;
    stroke-width: 2;
    vector-effect: non-scaling-stroke;
  }

  .plan-marker.corrected circle,
  .region-center-marker.corrected path {
    fill: var(--semantic-success, #5ee6a8);
  }

  .plan-marker.selected circle,
  .region-center-marker.selected path {
    stroke: var(--theme-accent, #d6a84e);
    stroke-width: 5;
  }

  .plan-marker text {
    fill: var(--theme-text, #f5f2eb);
    stroke: var(--theme-panel-bg, #12121c);
    stroke-width: 5;
    paint-order: stroke;
    font-size: 0.95rem;
    font-weight: 650;
    pointer-events: none;
  }

  .region-center-marker path {
    fill: rgba(255, 255, 255, 0.48);
    stroke: #182018;
    stroke-width: 2;
    vector-effect: non-scaling-stroke;
  }

  .correction-vector {
    stroke: var(--semantic-success, #5ee6a8);
    stroke-width: 3;
    stroke-dasharray: 6 5;
    vector-effect: non-scaling-stroke;
  }

  .original-marker {
    fill: transparent;
    stroke: #ffffff;
    stroke-width: 2;
    stroke-dasharray: 3 3;
    vector-effect: non-scaling-stroke;
  }

  .notice {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    min-height: var(--min-touch-target, 44px);
    margin-top: 0.75rem;
    padding: 0 0.25rem;
    color: var(--theme-text-dim, rgba(245, 242, 235, 0.75));
    font-size: var(--font-size-sm, 0.875rem);
  }

  .notice-dot {
    width: 0.55rem;
    height: 0.55rem;
    flex: 0 0 auto;
    border-radius: 999px;
    background: var(--theme-text-dim, rgba(245, 242, 235, 0.5));
  }

  .notice.success {
    color: var(--semantic-success, #5ee6a8);
  }

  .notice.success .notice-dot {
    background: var(--semantic-success, #5ee6a8);
  }

  .notice.error {
    color: var(--semantic-error, #ff6b6b);
  }

  .notice.error .notice-dot {
    background: var(--semantic-error, #ff6b6b);
  }

  .ready-copy {
    margin-left: auto;
    color: var(--semantic-success, #5ee6a8);
  }

  @media (max-width: 1100px) {
    .workspace {
      grid-template-columns: 1fr;
    }

    .control-panel {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      align-items: start;
    }

    .instructions,
    .path-readout {
      grid-row: span 2;
    }

    .save-block {
      margin-top: 0;
    }
  }

  @media (max-width: 820px) {
    .trace-page {
      width: min(100% - 1rem, var(--shell-w, 100%));
      padding: 0.75rem 0 1.25rem;
    }

    .page-header {
      align-items: stretch;
      flex-direction: column;
      gap: 0.8rem;
    }

    .completion {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .workspace {
      padding: 0.65rem;
    }

    .control-panel {
      display: flex;
    }

    .map-heading,
    .map-heading > div {
      align-items: flex-start;
      flex-direction: column;
      gap: 0.25rem;
    }

    .source-label,
    .mode-label {
      white-space: normal;
    }

    .ready-copy {
      display: none;
    }
  }

  @media (max-width: 430px) {
    .completion,
    .action-grid {
      grid-template-columns: 1fr;
    }

    .terrain-map {
      min-height: 15rem;
      aspect-ratio: auto;
    }
  }

  @media (max-height: 32rem) and (min-width: 50rem) {
    .trace-page {
      width: calc(100% - 1rem);
      padding: 0.5rem 0;
    }

    .page-header {
      align-items: center;
      margin-bottom: 0.5rem;
    }

    .lede,
    .completion,
    .instructions,
    .save-hint,
    .path-readout {
      display: none;
    }

    h1 {
      font-size: 1.75rem;
    }

    .workspace {
      grid-template-columns: 18rem minmax(0, 1fr);
      gap: 0.65rem;
      padding: 0.65rem;
    }

    .control-panel {
      display: flex;
      gap: 0.5rem;
    }

    .map-heading {
      padding: 0.35rem 0.7rem;
    }

    .notice {
      margin-top: 0.25rem;
    }
  }
</style>
