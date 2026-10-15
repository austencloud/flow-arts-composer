<script module lang="ts">
  type TrialKind = "curiosity" | "habituation" | "social" | "alarm";
  type ViewMode = "reel" | "evidence";
  type ReadChoice = "investigate" | "habituate" | "socialize" | "alarm";

  interface TrialResult {
    kind: TrialKind;
    passed: boolean;
    headline: string;
    detail: string;
    metrics: Array<{ label: string; value: string }>;
  }

  interface ActiveTrial {
    kind: TrialKind;
    elapsed: number;
    phase: string;
    startingEvents: number[];
    highInterest: number;
    lowInterest: number;
    highInvestigated: boolean;
    lowInvestigated: boolean;
    baselineInterest: number;
    finalInterest: number;
    firstSocialTarget: number | null;
    secondSocialTarget: number | null;
    sourceKind: string | null;
    neighborKind: string | null;
    sourceThreat: number;
    sourceAlarm: number;
    neighborAlarm: number;
  }

  interface AgencyBenchmarkApi {
    runTrial: (kind: TrialKind) => void;
    runSuite: () => void;
    getReport: () => Record<TrialKind, TrialResult | null>;
    getReadReport: () => {
      attempts: number;
      correct: number;
      accuracy: number;
    };
  }

  declare global {
    interface Window {
      __oceanAgencyBenchmark?: AgencyBenchmarkApi;
    }
  }
</script>

<script lang="ts">
  import { onMount } from "svelte";
  import {
    OceanBackgroundOrchestrator,
    fishDebugConfig,
    setOceanFishSimulationSeed,
    type FishMarineLife,
  } from "@austencloud/backgrounds";

  const SEED = "phase-three-agency-benchmark";
  const TRIAL_ORDER: [TrialKind, ...TrialKind[]] = [
    "curiosity",
    "habituation",
    "social",
    "alarm",
  ];
  const TRIAL_META: Record<
    TrialKind,
    { label: string; short: string; color: string }
  > = {
    curiosity: {
      label: "Curiosity split",
      short: "Same stimulus, different character",
      color: "#66d9ff",
    },
    habituation: {
      label: "Habituation",
      short: "Familiarity without lost emergency response",
      color: "#9de37b",
    },
    social: {
      label: "Social choice",
      short: "Familiar first, then another neighbor",
      color: "#d8b4ff",
    },
    alarm: {
      label: "Alarm relay",
      short: "One local hop, no chain reaction",
      color: "#ffb86b",
    },
  };
  const READ_OPTIONS: Array<{
    value: ReadChoice;
    label: string;
    description: string;
  }> = [
    {
      value: "investigate",
      label: "Inspect",
      description: "One fish chose to approach and study something.",
    },
    {
      value: "habituate",
      label: "Recognize",
      description: "A fish settled after deciding something was familiar.",
    },
    {
      value: "socialize",
      label: "Choose company",
      description: "A fish made a deliberate social choice.",
    },
    {
      value: "alarm",
      label: "Warn nearby",
      description: "A startle reached a neighbor but stopped there.",
    },
  ];
  const EXPECTED_READ: Record<TrialKind, ReadChoice> = {
    curiosity: "investigate",
    habituation: "habituate",
    social: "socialize",
    alarm: "alarm",
  };

  let canvas: HTMLCanvasElement | undefined = $state();
  let stage: HTMLDivElement | undefined = $state();
  let ready = $state(false);
  let status = $state("Preparing the resident cast");
  let activeKind = $state<TrialKind | null>(null);
  let activePhase = $state("idle");
  let participants = $state.raw<FishMarineLife[]>([]);
  let pointerMarker = $state<{ x: number; y: number } | null>(null);
  let fps = $state(0);
  let suiteRunning = $state(false);
  let viewMode = $state<ViewMode>("reel");
  let awaitingRead = $state(false);
  let revealed = $state(false);
  let completedKind = $state<TrialKind | null>(null);
  let selectedRead = $state<ReadChoice | null>(null);
  let reelIndex = $state(0);
  let readAttempts = $state(0);
  let correctReads = $state(0);
  let results = $state<Record<TrialKind, TrialResult | null>>({
    curiosity: null,
    habituation: null,
    social: null,
    alarm: null,
  });

  let system: OceanBackgroundOrchestrator | null = null;
  let activeTrial: ActiveTrial | null = null;
  let dimensions = { width: 1, height: 1 };
  let animationTime = 0;
  let disposed = false;
  let queuedTrialIndex = -1;
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const passedCount = $derived(
    TRIAL_ORDER.filter((kind) => results[kind]?.passed).length
  );
  const readAccuracy = $derived(
    readAttempts > 0 ? correctReads / readAttempts : 0
  );
  const readMatched = $derived(
    completedKind !== null && selectedRead === EXPECTED_READ[completedKind]
  );

  function formatPercent(value: number): string {
    return `${Math.round(value * 100)}%`;
  }

  function queue(callback: () => void, delay: number): void {
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (!disposed) callback();
    }, delay);
    timers.add(timer);
  }

  function chooseParticipants(count: number): FishMarineLife[] {
    if (!system) return [];
    const fish = system.getFish();
    const preferred = fish
      .filter(
        (candidate) =>
          candidate.schoolId === undefined && candidate.useSpineChain
      )
      .sort((first, second) => {
        if (first.resident !== second.resident) return first.resident ? -1 : 1;
        return (
          second.bodyLength * (1 - second.z * 0.6) -
          first.bodyLength * (1 - first.z * 0.6)
        );
      });
    const pool = preferred.length >= count ? preferred : fish;
    return pool.slice(0, count);
  }

  function placeFish(
    fish: FishMarineLife,
    x: number,
    y: number,
    direction: 1 | -1 = 1
  ): void {
    if (!system) return;
    const animator = system.getFishAnimator();
    const spineHead = animator.getSpineChain(fish)?.head;
    const dx = x - (spineHead?.x ?? fish.x);
    const dy = y - (spineHead?.y ?? fish.baseY);

    fish.x = x;
    fish.y = y;
    fish.baseY = y;
    animator.repositionFish(fish, dx, dy);
    fish.direction = direction;
    fish.headingFactor = direction;
    fish.rotation = 0;
    fish.speed = fish.baseSpeed;
    fish.targetSpeed = fish.baseSpeed;
    fish.verticalDrift = 0;
    fish.behavior = "cruising";
    fish.behaviorTimer = 20;
    fish.intent = "cruise";
    fish.intentTimer = 0;
    fish.escapeManeuver = undefined;
    fish.fleeTimer = 0;
    fish.fleeIntensity = 0;
    fish.mood = "calm";
    fish.moodTimer = 0;
    fish.bodyFlexAmount = 0.15;
    fish.schoolId = undefined;
    fish.resident = true;
    fish.z = Math.min(fish.z, 0.24);
    fish.targetZ = fish.z;
    fish.opacity = 1;
    fish.attention = {
      kind: "none",
      x: x + direction * fish.bodyLength,
      y,
      salience: 0,
      dwellRemaining: 0,
    };
    fish.focusPoint = undefined;
    fish.behaviorTarget = undefined;
    fish.perception.cursorThreat = 0;
    fish.perception.cursorInterest = 0;
    fish.perception.cursorSpeed = 0;
    fish.perception.socialOpportunity = 0;
    fish.perception.threatStimulus = false;
    fish.perception.threatSource = undefined;
    fish.memory.cursorFamiliarity = 0;
    fish.memory.cursorAlarm = 0;
    fish.memory.cursorThreatLatched = false;
    fish.memory.cursorInterestCooldown = 0;
    fish.memory.socialAffinity.clear();
    fish.memory.socialInterestCooldowns ??= new Map();
    fish.memory.socialInterestCooldowns.clear();
    fish.depthBand = {
      min: Math.max(0, y - dimensions.height * 0.3),
      max: Math.min(dimensions.height, y + dimensions.height * 0.3),
    };
  }

  function holdFishAt(fish: FishMarineLife, x: number, y: number): void {
    if (!system) return;
    const animator = system.getFishAnimator();
    const spineHead = animator.getSpineChain(fish)?.head;
    const dx = x - (spineHead?.x ?? fish.x);
    const dy = y - (spineHead?.y ?? fish.baseY);
    fish.x = x;
    fish.y = y;
    fish.baseY = y;
    fish.speed = 0;
    fish.targetSpeed = 0;
    fish.verticalDrift = 0;
    animator.repositionFish(fish, dx, dy);
  }

  function excludeOtherSocialTargets(
    focal: FishMarineLife,
    allowed: number[]
  ): void {
    if (!system) return;
    for (const other of system.getFish()) {
      if (
        other.fishId === undefined ||
        other === focal ||
        allowed.includes(other.fishId)
      ) {
        continue;
      }
      focal.memory.socialInterestCooldowns.set(other.fishId, 999);
    }
  }

  function createTrial(kind: TrialKind): ActiveTrial {
    return {
      kind,
      elapsed: 0,
      phase: "observe",
      startingEvents: participants.map((fish) => fish.escapeEventCount),
      highInterest: 0,
      lowInterest: 0,
      highInvestigated: false,
      lowInvestigated: false,
      baselineInterest: 0,
      finalInterest: 0,
      firstSocialTarget: null,
      secondSocialTarget: null,
      sourceKind: null,
      neighborKind: null,
      sourceThreat: 0,
      sourceAlarm: 0,
      neighborAlarm: 0,
    };
  }

  function beginTrial(kind: TrialKind): void {
    if (!ready || !system || activeTrial) return;
    system.setPointer(0, 0, false);
    pointerMarker = null;
    participants = chooseParticipants(
      kind === "habituation" ? 1 : kind === "curiosity" ? 2 : 3
    );
    if (
      participants.length <
      (kind === "habituation" ? 1 : kind === "curiosity" ? 2 : 3)
    ) {
      status =
        "The production ocean did not provide enough fish for this assay";
      return;
    }

    for (const current of system.getFish()) current.resident = false;

    if (kind === "curiosity") setupCuriosity();
    if (kind === "habituation") setupHabituation();
    if (kind === "social") setupSocial();
    if (kind === "alarm") setupAlarm();

    activeTrial = createTrial(kind);
    activeKind = kind;
    activePhase = "observe";
    results[kind] = null;
    awaitingRead = false;
    revealed = false;
    completedKind = null;
    selectedRead = null;
    if (viewMode === "reel") {
      status = "Watch the fish before choosing a label";
    }
  }

  function setupCuriosity(): void {
    const [curious, reserved] = participants;
    if (!curious || !reserved || !system) return;
    const x = dimensions.width * 0.34;
    const upperY = dimensions.height * 0.42;
    const lowerY = dimensions.height * 0.62;
    placeFish(curious, x, upperY);
    placeFish(reserved, x, lowerY);
    curious.personality = {
      boldness: 0.8,
      curiosity: 1,
      sociability: 0.05,
      activity: 0.55,
    };
    reserved.personality = {
      boldness: 0.8,
      curiosity: 0.05,
      sociability: 0.05,
      activity: 0.55,
    };
    excludeOtherSocialTargets(curious, []);
    excludeOtherSocialTargets(reserved, []);
    curious.behaviorTimer = 0;
    reserved.behaviorTimer = 0;
    pointerMarker = {
      x: x + Math.max(curious.bodyLength, reserved.bodyLength) * 2.35,
      y: (upperY + lowerY) / 2,
    };
    system.setPointer(pointerMarker.x, pointerMarker.y, true);
    status = "A harmless target enters both fields of view";
  }

  function setupHabituation(): void {
    const fish = participants[0];
    if (!fish || !system) return;
    const x = dimensions.width * 0.36;
    const y = dimensions.height * 0.52;
    placeFish(fish, x, y);
    fish.personality = {
      boldness: 0.55,
      curiosity: 0.9,
      sociability: 0.3,
      activity: 0.5,
    };
    fish.speed = 0;
    fish.targetSpeed = 0;
    excludeOtherSocialTargets(fish, []);
    pointerMarker = { x: x + fish.bodyLength * 2.4, y };
    system.setPointer(pointerMarker.x, pointerMarker.y, true);
    status = "A harmless stationary visitor becomes familiar";
  }

  function setupSocial(): void {
    const [focal, familiar, alternate] = participants;
    if (!focal || !familiar || !alternate || !system) return;
    const x = dimensions.width * 0.34;
    const y = dimensions.height * 0.52;
    placeFish(focal, x, y);
    placeFish(familiar, x + 120, y - 42, -1);
    placeFish(alternate, x + 120, y + 42, -1);
    familiar.species = focal.species;
    alternate.species = focal.species;
    focal.personality = {
      boldness: 0.6,
      curiosity: 0.5,
      sociability: 1,
      activity: 0.5,
    };
    focal.memory.socialAffinity.set(familiar.fishId!, 1);
    excludeOtherSocialTargets(focal, [familiar.fishId!, alternate.fishId!]);
    focal.behaviorTimer = 0;
    status = "Two equally close neighbors differ only by familiarity";
  }

  function setupAlarm(): void {
    const [source, neighbor, secondHop] = participants;
    if (!source || !neighbor || !secondHop || !system) return;
    const x = dimensions.width * 0.36;
    const y = dimensions.height * 0.52;
    placeFish(source, x, y);
    placeFish(neighbor, x + 12, y);
    placeFish(secondHop, x + 175, y);
    source.personality!.boldness = 0.1;
    neighbor.personality!.boldness = 1;
    secondHop.personality!.boldness = 1;
    pointerMarker = null;
    system.setPointer(0, 0, false);
    status =
      "One fish sees the threat; only its nearest neighbor hears the alarm";
  }

  function updateTrial(deltaSeconds: number): void {
    const trial = activeTrial;
    if (!trial || !system) return;
    trial.elapsed += deltaSeconds;

    if (trial.kind === "curiosity") updateCuriosity(trial);
    if (trial.kind === "habituation") updateHabituation(trial);
    if (trial.kind === "social") updateSocial(trial);
    if (trial.kind === "alarm") updateAlarm(trial);
  }

  function updateCuriosity(trial: ActiveTrial): void {
    const [curious, reserved] = participants;
    if (!curious || !reserved) return;
    trial.highInterest = Math.max(
      trial.highInterest,
      curious.perception.cursorInterest
    );
    trial.lowInterest = Math.max(
      trial.lowInterest,
      reserved.perception.cursorInterest
    );
    trial.highInvestigated ||= curious.intent === "investigate";
    trial.lowInvestigated ||= reserved.intent === "investigate";
    if (trial.elapsed < (viewMode === "reel" ? 3.4 : 1.1)) return;

    finishTrial({
      kind: "curiosity",
      passed:
        trial.highInterest >= 0.2 &&
        trial.lowInterest < 0.2 &&
        trial.highInvestigated &&
        !trial.lowInvestigated,
      headline: "Curiosity changes the decision",
      detail:
        "The matched resident with high curiosity investigated. The reserved resident kept swimming.",
      metrics: [
        { label: "Curious interest", value: formatPercent(trial.highInterest) },
        { label: "Reserved interest", value: formatPercent(trial.lowInterest) },
        {
          label: "Curious intent",
          value: trial.highInvestigated ? "investigate" : "none",
        },
        {
          label: "Reserved intent",
          value: trial.lowInvestigated ? "investigate" : "cruise",
        },
      ],
    });
  }

  function updateHabituation(trial: ActiveTrial): void {
    const fish = participants[0];
    if (!fish || !system) return;
    holdFishAt(fish, dimensions.width * 0.36, dimensions.height * 0.52);
    if (trial.elapsed <= 0.05 && trial.baselineInterest === 0) {
      trial.baselineInterest = fish.perception.cursorInterest;
    }

    if (trial.phase === "observe" && trial.elapsed >= 7.8) {
      trial.finalInterest = fish.perception.cursorInterest;
      trial.phase = "prime-emergency";
      activePhase = "emergency check";
      system.setPointer(fish.x + fish.bodyLength * 5, fish.baseY, true);
      pointerMarker = { x: fish.x + fish.bodyLength * 5, y: fish.baseY };
      fish.memory.cursorThreatLatched = false;
      return;
    }

    if (trial.phase === "prime-emergency" && trial.elapsed >= 7.84) {
      trial.phase = "emergency";
      pointerMarker = { x: fish.x + fish.bodyLength * 0.12, y: fish.baseY };
      system.setPointer(pointerMarker.x, pointerMarker.y, true);
      return;
    }

    if (trial.phase !== "emergency" || trial.elapsed < 7.9) return;
    const emergencyWorked =
      fish.escapeEventCount > trial.startingEvents[0]! ||
      fish.perception.threatSource?.kind === "cursor";
    finishTrial({
      kind: "habituation",
      passed:
        fish.memory.cursorFamiliarity >= 0.85 &&
        trial.finalInterest < trial.baselineInterest &&
        emergencyWorked,
      headline: "Familiarity softens interest, not safety",
      detail:
        "The stationary visitor became familiar. A sudden close intrusion still produced an escape.",
      metrics: [
        {
          label: "Familiarity",
          value: formatPercent(fish.memory.cursorFamiliarity),
        },
        {
          label: "Initial interest",
          value: formatPercent(trial.baselineInterest),
        },
        { label: "Later interest", value: formatPercent(trial.finalInterest) },
        { label: "Emergency", value: emergencyWorked ? "preserved" : "missed" },
      ],
    });
  }

  function updateSocial(trial: ActiveTrial): void {
    const [focal, familiar, alternate] = participants;
    if (!focal || !familiar || !alternate) return;
    const partnerX = dimensions.width * 0.34 + 120;
    const centerY = dimensions.height * 0.52;
    holdFishAt(familiar, partnerX, centerY - 42);
    holdFishAt(alternate, partnerX, centerY + 42);
    if (trial.firstSocialTarget === null && focal.attention.kind === "fish") {
      trial.firstSocialTarget = focal.attention.targetFishId ?? null;
    }
    if (
      trial.phase === "observe" &&
      trial.elapsed >= (viewMode === "reel" ? 1.3 : 0.45)
    ) {
      trial.phase = "complete-first-visit";
      activePhase = "refractory handoff";
      focal.behavior = "socializing";
      focal.intent = "socialize";
      focal.behaviorTimer = 0;
      return;
    }
    if (
      trial.phase === "complete-first-visit" &&
      focal.attention.kind === "fish" &&
      focal.attention.targetFishId !== familiar.fishId
    ) {
      trial.secondSocialTarget = focal.attention.targetFishId ?? null;
    }
    if (trial.elapsed < (viewMode === "reel" ? 3.2 : 1.15)) return;
    const cooldown =
      focal.memory.socialInterestCooldowns.get(familiar.fishId!) ?? 0;
    finishTrial({
      kind: "social",
      passed:
        trial.firstSocialTarget === familiar.fishId &&
        trial.secondSocialTarget === alternate.fishId &&
        cooldown > 0,
      headline: "Familiarity guides without pair lock",
      detail:
        "The familiar neighbor won the first choice. Its refractory period opened the next visit to another fish.",
      metrics: [
        {
          label: "First choice",
          value:
            trial.firstSocialTarget === familiar.fishId ? "familiar" : "other",
        },
        {
          label: "Next choice",
          value:
            trial.secondSocialTarget === alternate.fishId
              ? "alternate"
              : "none",
        },
        {
          label: "Affinity",
          value: formatPercent(
            focal.memory.socialAffinity.get(familiar.fishId!) ?? 0
          ),
        },
        { label: "Revisit delay", value: `${cooldown.toFixed(1)} s` },
      ],
    });
  }

  function updateAlarm(trial: ActiveTrial): void {
    const [source, neighbor, secondHop] = participants;
    if (!source || !neighbor || !secondHop || !system) return;
    if (trial.phase === "observe") {
      if (trial.elapsed < 0.064) return;
      trial.phase = "threat";
      activePhase = "alarm relay";
      pointerMarker = { x: source.x - 8, y: source.baseY };
      system.setPointer(pointerMarker.x, pointerMarker.y, true);
      return;
    }
    trial.sourceKind ??= source.perception.threatSource?.kind ?? null;
    trial.neighborKind ??= neighbor.perception.threatSource?.kind ?? null;
    trial.sourceThreat = Math.max(
      trial.sourceThreat,
      source.perception.cursorThreat
    );
    trial.sourceAlarm = Math.max(trial.sourceAlarm, source.memory.cursorAlarm);
    trial.neighborAlarm = Math.max(
      trial.neighborAlarm,
      neighbor.memory.cursorAlarm
    );
    if (trial.elapsed < (viewMode === "reel" ? 2.5 : 0.3)) return;
    const sourceEntries = source.escapeEventCount - trial.startingEvents[0]!;
    const neighborEntries =
      neighbor.escapeEventCount - trial.startingEvents[1]!;
    const secondHopEntries =
      secondHop.escapeEventCount - trial.startingEvents[2]!;
    finishTrial({
      kind: "alarm",
      passed:
        trial.sourceKind === "cursor" &&
        trial.neighborKind === "alarm" &&
        sourceEntries === 1 &&
        neighborEntries === 1 &&
        secondHopEntries === 0,
      headline: "Alarm stays local",
      detail:
        "The directly threatened fish and one neighbor reacted. The next fish remained undisturbed.",
      metrics: [
        { label: "Direct entries", value: String(sourceEntries) },
        { label: "Neighbor entries", value: String(neighborEntries) },
        { label: "Second-hop entries", value: String(secondHopEntries) },
        { label: "Neighbor source", value: trial.neighborKind ?? "none" },
        {
          label: "Threat / relay",
          value: `${formatPercent(trial.sourceThreat)} / ${formatPercent(trial.neighborAlarm)}`,
        },
      ],
    });
  }

  function finishTrial(result: TrialResult): void {
    if (!system) return;
    results[result.kind] = result;
    system.setPointer(0, 0, false);
    pointerMarker = null;
    activeTrial = null;
    activeKind = null;
    activePhase = "complete";
    completedKind = result.kind;

    if (viewMode === "reel") {
      awaitingRead = true;
      status = "What did the fish appear to do?";
      return;
    }

    status = result.detail;

    if (suiteRunning) {
      queuedTrialIndex += 1;
      if (queuedTrialIndex < TRIAL_ORDER.length) {
        queue(() => beginTrial(TRIAL_ORDER[queuedTrialIndex]!), 420);
      } else {
        suiteRunning = false;
        queuedTrialIndex = -1;
        status = "All four character assays completed";
      }
    }
  }

  function runTrial(kind: TrialKind): void {
    if (activeTrial) return;
    viewMode = "evidence";
    suiteRunning = false;
    queuedTrialIndex = -1;
    beginTrial(kind);
  }

  function runSuite(): void {
    if (activeTrial) return;
    viewMode = "evidence";
    results = {
      curiosity: null,
      habituation: null,
      social: null,
      alarm: null,
    };
    suiteRunning = true;
    queuedTrialIndex = 0;
    beginTrial(TRIAL_ORDER[0]);
  }

  function runReelTrial(kind: TrialKind = TRIAL_ORDER[reelIndex]!): void {
    if (activeTrial) return;
    viewMode = "reel";
    suiteRunning = false;
    queuedTrialIndex = -1;
    beginTrial(kind);
  }

  function submitRead(choice: ReadChoice): void {
    if (!awaitingRead || revealed || !completedKind) return;
    selectedRead = choice;
    readAttempts += 1;
    if (choice === EXPECTED_READ[completedKind]) correctReads += 1;
    revealed = true;
    status = results[completedKind]?.detail ?? "Diagnostic reveal ready";
  }

  function nextReelTrial(): void {
    if (activeTrial) return;
    reelIndex = (reelIndex + 1) % TRIAL_ORDER.length;
    runReelTrial(TRIAL_ORDER[reelIndex]);
  }

  function showEvidenceMode(): void {
    if (activeTrial) return;
    viewMode = "evidence";
    awaitingRead = false;
    revealed = true;
    completedKind = null;
    runSuite();
  }

  function showReelMode(): void {
    if (activeTrial) return;
    runReelTrial(TRIAL_ORDER[reelIndex]);
  }

  function drawOverlay(context: CanvasRenderingContext2D): void {
    if (participants.length === 0 || (viewMode === "reel" && !revealed)) return;
    const overlayKind = activeKind ?? completedKind;
    const colors =
      overlayKind === "curiosity"
        ? ["#66d9ff", "#f6d48b"]
        : overlayKind === "habituation"
          ? ["#9de37b"]
          : overlayKind === "social"
            ? ["#d8b4ff", "#66d9ff", "#f4f7fb"]
            : ["#ff8d62", "#ffc66d", "#6f8795"];
    const labels =
      overlayKind === "curiosity"
        ? ["CURIOUS", "RESERVED"]
        : overlayKind === "habituation"
          ? ["RESIDENT"]
          : overlayKind === "social"
            ? ["CHOOSER", "FAMILIAR", "ALTERNATE"]
            : ["DIRECT", "NEIGHBOR", "SECOND HOP"];

    context.save();
    context.lineWidth = 2;
    context.font = "600 12px ui-monospace, monospace";
    context.textAlign = "center";
    for (let index = 0; index < participants.length; index++) {
      const fish = participants[index]!;
      const color = colors[index] ?? "#ffffff";
      const radius = Math.max(24, fish.bodyLength * 0.52);
      context.beginPath();
      context.arc(fish.x, fish.baseY, radius, 0, Math.PI * 2);
      context.strokeStyle = color;
      context.globalAlpha = 0.82;
      context.stroke();
      context.globalAlpha = 1;
      context.fillStyle = color;
      context.fillText(
        labels[index] ?? "FISH",
        fish.x,
        fish.baseY - radius - 9
      );
    }
    if (pointerMarker) {
      context.setLineDash([5, 5]);
      context.beginPath();
      context.arc(pointerMarker.x, pointerMarker.y, 14, 0, Math.PI * 2);
      context.strokeStyle = "#ffb86b";
      context.stroke();
      context.setLineDash([]);
    }
    context.restore();
  }

  onMount(() => {
    if (!canvas || !stage) return;
    const context = canvas.getContext("2d");
    if (!context) {
      status = "Canvas context unavailable";
      return;
    }

    const previousDebug = { ...fishDebugConfig };
    Object.assign(fishDebugConfig, {
      enableFlocking: false,
      enableInteractions: false,
      enableRareBehaviors: false,
      enableHomeZones: false,
      enableHunting: false,
      showHomeZones: false,
      showInteractions: false,
      showHunts: false,
    });

    system = OceanBackgroundOrchestrator.create();
    system.setLayerVisibility({ jellyfish: false, bubbles: false });
    let previousFrame = performance.now();
    let simulationRemainder = 0;
    let fpsAccumulator = 0;
    let fpsFrames = 0;
    let raf = 0;

    function resize(): void {
      if (!canvas || !stage) return;
      const rect = stage.getBoundingClientRect();
      dimensions = {
        width: Math.max(1, Math.floor(rect.width)),
        height: Math.max(1, Math.floor(rect.height)),
      };
      if (
        canvas.width !== dimensions.width ||
        canvas.height !== dimensions.height
      ) {
        canvas.width = dimensions.width;
        canvas.height = dimensions.height;
      }
    }

    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    resize();

    async function boot(): Promise<void> {
      setOceanFishSimulationSeed(SEED);
      await system!.initialize(dimensions, "high", { spawnFishOnScreen: true });
      if (disposed) return;
      ready = system!.getFish().length >= 3;
      status = ready
        ? "Resident cast ready"
        : "The production ocean did not provide enough fish";
      if (ready) queue(() => runReelTrial(TRIAL_ORDER[0]), 320);
    }

    function animate(now: number): void {
      if (disposed || !system) return;
      const elapsedSeconds = Math.min(
        0.25,
        Math.max(0.001, (now - previousFrame) / 1000)
      );
      previousFrame = now;
      simulationRemainder += elapsedSeconds;
      while (simulationRemainder >= 0.016) {
        animationTime += 0.016;
        system.update(dimensions, 1);
        if (activeTrial) updateTrial(0.016);
        simulationRemainder -= 0.016;
      }
      system.draw(context!, dimensions);
      drawOverlay(context!);

      fpsAccumulator += elapsedSeconds;
      fpsFrames += 1;
      if (fpsAccumulator >= 0.5) {
        fps = fpsFrames / fpsAccumulator;
        fpsAccumulator = 0;
        fpsFrames = 0;
      }
      raf = requestAnimationFrame(animate);
    }

    window.__oceanAgencyBenchmark = {
      runTrial,
      runSuite,
      getReport: () => ({ ...results }),
      getReadReport: () => ({
        attempts: readAttempts,
        correct: correctReads,
        accuracy: readAttempts > 0 ? correctReads / readAttempts : 0,
      }),
    };

    void boot();
    raf = requestAnimationFrame(animate);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      Object.assign(fishDebugConfig, previousDebug);
      system?.cleanup();
      system = null;
      delete window.__oceanAgencyBenchmark;
    };
  });
</script>

<svelte:head>
  <title>Ocean Character Read</title>
</svelte:head>

<main class="agency-shell">
  <header class="agency-header">
    <div>
      <p class="eyebrow">
        {viewMode === "reel" ? "PHASE IV / BLIND READ" : "PHASE III / EVIDENCE"}
      </p>
      <h1>
        {viewMode === "reel"
          ? "Can you read the fish without labels?"
          : "Character leaves a trace."}
      </h1>
      <p class="dek">
        {viewMode === "reel"
          ? "Watch spacing, gaze, speed, and recovery. Choose what happened after the clip."
          : "Curiosity, memory, social choice, and alarm measured in the production ocean."}
      </p>
    </div>
    <div class="run-state" aria-live="polite">
      <span class:active={activeKind !== null}></span>
      <strong>{Math.round(fps)} fps</strong>
      <small>
        {viewMode === "reel"
          ? activeKind
            ? "WATCHING"
            : revealed
              ? "REVEALED"
              : "YOUR READ"
          : activeKind
            ? activePhase
            : `${passedCount} / 4 passed`}
      </small>
    </div>
  </header>

  <section class="workspace">
    <div class="ocean-stage" bind:this={stage}>
      <canvas bind:this={canvas} aria-label="Production ocean character trials"
      ></canvas>
      {#if viewMode === "reel" && activeKind}
        <span class="blind-badge">BLIND CLIP {reelIndex + 1} OF 4</span>
      {/if}
      {#if viewMode === "evidence" || revealed}
        <div class="stage-legend">
          <span>
            {completedKind
              ? TRIAL_META[completedKind].label
              : activeKind
                ? TRIAL_META[activeKind].label
                : "Resident cast"}
          </span>
          <strong>{status}</strong>
        </div>
      {/if}
    </div>

    <aside class="control-rail">
      {#if viewMode === "reel"}
        <section class="read-block">
          <div class="section-heading">
            <div>
              <p class="eyebrow">YOUR READ</p>
              <h2>
                {activeKind
                  ? "Watch before naming it"
                  : revealed
                    ? readMatched
                      ? "The behavior came through"
                      : "The intended read was different"
                    : "What did the fish do?"}
              </h2>
            </div>
            <span class="seed"
              >{readAttempts ? formatPercent(readAccuracy) : "UNSCORED"}</span
            >
          </div>

          {#if activeKind}
            <div class="watch-cue" aria-live="polite">
              <span></span>
              <strong>No rings. No names. Just movement.</strong>
              <small>The question appears when the clip ends.</small>
            </div>
          {:else if awaitingRead && !revealed}
            <div class="read-options">
              {#each READ_OPTIONS as option}
                <button type="button" onclick={() => submitRead(option.value)}>
                  <strong>{option.label}</strong>
                  <span>{option.description}</span>
                </button>
              {/each}
            </div>
          {:else if revealed && completedKind}
            {@const result = results[completedKind]}
            <article class:passed={readMatched} class="reveal-card">
              <header>
                <span
                  class="result-dot"
                  style={`--trial-color: ${TRIAL_META[completedKind].color}`}
                ></span>
                <div>
                  <h3>{TRIAL_META[completedKind].label}</h3>
                  <p>{result?.headline}</p>
                </div>
                <strong>{readMatched ? "MATCH" : "MISS"}</strong>
              </header>
              <p class="reveal-detail">{result?.detail}</p>
              <div class="metric-grid">
                {#each result?.metrics ?? [] as metric}
                  <span>{metric.label}<b>{metric.value}</b></span>
                {/each}
              </div>
            </article>
            <div class="reel-actions">
              <button type="button" onclick={nextReelTrial}
                >Next blind clip</button
              >
              <button
                type="button"
                onclick={() => runReelTrial(completedKind ?? undefined)}
                >Replay without labels</button
              >
            </div>
          {:else}
            <div class="watch-cue">
              <strong>Preparing the resident cast</strong>
            </div>
          {/if}
        </section>

        <section class="recognition-block">
          <div class="section-heading compact">
            <div>
              <p class="eyebrow">RECOGNITION GATE</p>
              <h2>{correctReads} of {readAttempts} reads matched</h2>
            </div>
            <span class:complete={readAccuracy >= 0.8} class="gate-state">
              {readAttempts === 0
                ? "TARGET 80%"
                : readAccuracy >= 0.8
                  ? "PASSING"
                  : "BELOW 80%"}
            </span>
          </div>
          <p>
            The diagnostic name and target rings stay hidden until a choice is
            recorded.
          </p>
          <button
            class="mode-switch"
            type="button"
            disabled={activeKind !== null}
            onclick={showEvidenceMode}>Run measured evidence suite</button
          >
        </section>
      {:else}
        <section class="control-block">
          <div class="section-heading">
            <div>
              <p class="eyebrow">CONTROLLED ASSAYS</p>
              <h2>Run the character, not a loop</h2>
            </div>
            <span class="seed">SEED {SEED}</span>
          </div>
          <div class="trial-buttons">
            {#each TRIAL_ORDER as kind}
              <button
                type="button"
                class:running={activeKind === kind}
                disabled={!ready || activeKind !== null}
                onclick={() => runTrial(kind)}
              >
                <span style={`--trial-color: ${TRIAL_META[kind].color}`}></span>
                {TRIAL_META[kind].label}
              </button>
            {/each}
          </div>
          <button
            class="run-all"
            type="button"
            disabled={!ready || activeKind !== null}
            onclick={runSuite}>Run all four</button
          >
        </section>

        <section class="evidence-block">
          <div class="section-heading compact">
            <div>
              <p class="eyebrow">EVIDENCE</p>
              <h2>{passedCount} of 4 gates passing</h2>
            </div>
            <span class:complete={passedCount === 4} class="gate-state">
              {passedCount === 4
                ? "COMPLETE"
                : activeKind
                  ? "RUNNING"
                  : "READY"}
            </span>
          </div>

          <div class="result-list">
            {#each TRIAL_ORDER as kind}
              {@const result = results[kind]}
              <article
                class:passed={result?.passed}
                class:running={activeKind === kind}
              >
                <header>
                  <span
                    class="result-dot"
                    style={`--trial-color: ${TRIAL_META[kind].color}`}
                  ></span>
                  <div>
                    <h3>{TRIAL_META[kind].label}</h3>
                    <p>{result?.headline ?? TRIAL_META[kind].short}</p>
                  </div>
                  <strong>
                    {result
                      ? result.passed
                        ? "PASS"
                        : "FAIL"
                      : activeKind === kind
                        ? "LIVE"
                        : "WAIT"}
                  </strong>
                </header>
                <div class="metric-grid">
                  {#if result}
                    {#each result.metrics as metric}
                      <span>{metric.label}<b>{metric.value}</b></span>
                    {/each}
                  {:else}
                    <span>Signal<b>—</b></span>
                    <span>Decision<b>—</b></span>
                    <span>Memory<b>—</b></span>
                    <span>Outcome<b>—</b></span>
                  {/if}
                </div>
              </article>
            {/each}
          </div>
          <button
            class="mode-switch"
            type="button"
            disabled={activeKind !== null}
            onclick={showReelMode}>Return to blind reel</button
          >
        </section>
      {/if}

      <footer>
        <span>PRODUCTION OWNERS</span>
        <strong>Perception → decision → motion</strong>
        <small
          >{viewMode === "reel"
            ? "Labels after judgment"
            : "Deterministic seed"}</small
        >
      </footer>
    </aside>
  </section>
</main>

<style>
  :global(*) {
    box-sizing: border-box;
  }

  :global(html),
  :global(body) {
    margin: 0;
    min-width: 320px;
    min-height: 100%;
    background: #06151f;
    color: #f4f8fa;
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  }

  :global(button) {
    font: inherit;
  }

  .agency-shell {
    --theme-panel-bg: #071b27;
    --theme-card-bg: #0a2230;
    --theme-stroke: rgba(148, 205, 228, 0.18);
    --semantic-cyan: #66d9ff;
    min-height: 100vh;
    background: #06151f;
  }

  .agency-header {
    min-height: 7.75rem;
    padding: 1.45rem 2rem 1.25rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 2rem;
    border-bottom: 1px solid var(--theme-stroke);
    background: #05131c;
  }

  .eyebrow {
    margin: 0 0 0.38rem;
    color: #7cb6ca;
    font:
      700 0.75rem/1.2 ui-monospace,
      SFMono-Regular,
      Consolas,
      monospace;
    letter-spacing: 0.18em;
  }

  h1,
  h2,
  h3,
  p {
    margin-top: 0;
  }

  h1 {
    margin-bottom: 0.3rem;
    font-size: clamp(1.85rem, 2.2vw, 2.85rem);
    line-height: 1;
    letter-spacing: -0.035em;
  }

  .dek {
    margin-bottom: 0;
    color: #afc5cf;
    font-size: 0.95rem;
  }

  .run-state {
    min-width: 8rem;
    display: grid;
    grid-template-columns: 0.7rem 1fr;
    align-items: center;
    column-gap: 0.65rem;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .run-state > span {
    grid-row: 1 / 3;
    width: 0.7rem;
    aspect-ratio: 1;
    border-radius: 50%;
    background: #48616d;
    box-shadow: 0 0 0 0.35rem rgba(72, 97, 109, 0.12);
  }

  .run-state > span.active {
    background: #66d9ff;
    box-shadow: 0 0 0 0.35rem rgba(102, 217, 255, 0.12);
  }

  .run-state strong {
    font-size: 0.92rem;
  }

  .run-state small {
    min-width: 10ch;
    color: #7cb6ca;
    font:
      700 0.75rem/1.2 ui-monospace,
      monospace;
    text-transform: uppercase;
  }

  .workspace {
    min-height: calc(100vh - 7.75rem);
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(26rem, 31vw);
  }

  .ocean-stage {
    position: relative;
    min-width: 0;
    min-height: calc(100vh - 7.75rem);
    overflow: hidden;
    background: #0b2937;
  }

  canvas {
    width: 100%;
    height: 100%;
    display: block;
  }

  .blind-badge {
    position: absolute;
    top: 1.2rem;
    right: 1.2rem;
    padding: 0.5rem 0.7rem;
    border: 1px solid rgba(151, 208, 229, 0.24);
    border-radius: 999px;
    color: #a8c7d3;
    background: rgba(4, 18, 26, 0.72);
    font:
      700 0.72rem/1 ui-monospace,
      monospace;
    letter-spacing: 0.12em;
  }

  .stage-legend {
    position: absolute;
    left: 1.2rem;
    bottom: 1.2rem;
    width: min(34rem, calc(100% - 2.4rem));
    min-height: 4.4rem;
    padding: 0.85rem 1rem;
    display: grid;
    gap: 0.25rem;
    border: 1px solid rgba(157, 227, 123, 0.28);
    border-radius: 0.9rem;
    background: rgba(4, 18, 26, 0.88);
  }

  .stage-legend span {
    color: #8bd8ee;
    font:
      700 0.75rem/1.2 ui-monospace,
      monospace;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .stage-legend strong {
    min-height: 1.35rem;
    font-size: 0.9rem;
    font-weight: 600;
  }

  .control-rail {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    border-left: 1px solid var(--theme-stroke);
    background: var(--theme-panel-bg);
  }

  .control-block,
  .evidence-block,
  .read-block,
  .recognition-block {
    padding: 1.25rem;
    border-bottom: 1px solid var(--theme-stroke);
  }

  .evidence-block,
  .recognition-block {
    flex: 1;
  }

  .read-options {
    display: grid;
    gap: 0.6rem;
  }

  .read-options button {
    min-height: 4.6rem;
    padding: 0.8rem 0.9rem;
    display: grid;
    gap: 0.22rem;
    border: 1px solid rgba(125, 190, 215, 0.32);
    border-radius: 0.8rem;
    color: #eef8fb;
    background: #0a2533;
    text-align: left;
    cursor: pointer;
    transition:
      border-color 150ms ease,
      background 150ms ease,
      transform 150ms ease;
  }

  .read-options button strong {
    font-size: 0.9rem;
  }

  .read-options button span {
    color: #8fafbc;
    font-size: 0.77rem;
    line-height: 1.35;
  }

  .watch-cue {
    min-height: 16rem;
    padding: 1.1rem;
    display: grid;
    align-content: center;
    justify-items: center;
    gap: 0.6rem;
    border: 1px solid rgba(102, 217, 255, 0.2);
    border-radius: 0.9rem;
    color: #dff6fc;
    background: radial-gradient(
      circle at 50% 38%,
      rgba(102, 217, 255, 0.1),
      rgba(10, 34, 48, 0.45) 55%
    );
    text-align: center;
  }

  .watch-cue > span {
    width: 0.8rem;
    aspect-ratio: 1;
    border-radius: 50%;
    background: #66d9ff;
    box-shadow: 0 0 0 0.5rem rgba(102, 217, 255, 0.08);
  }

  .watch-cue strong {
    font-size: 0.88rem;
  }

  .watch-cue small {
    color: #7599a8;
    font-size: 0.75rem;
  }

  .reveal-card {
    min-height: 0;
  }

  .reveal-card .reveal-detail {
    margin: 0.75rem 0 0;
    color: #bdd0d8;
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .reel-actions {
    margin-top: 0.65rem;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.55rem;
  }

  .reel-actions button,
  .mode-switch {
    min-height: 2.8rem;
    padding: 0.65rem 0.8rem;
    border: 1px solid rgba(125, 190, 215, 0.35);
    border-radius: 0.72rem;
    color: #eaf6fa;
    background: #0b2937;
    font-size: 0.8rem;
    font-weight: 750;
    cursor: pointer;
  }

  .reel-actions button:first-child {
    border-color: rgba(102, 217, 255, 0.58);
    background: #103548;
  }

  .recognition-block > p {
    margin: 0 0 1rem;
    color: #8fafbc;
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .mode-switch {
    width: 100%;
  }

  .mode-switch:disabled {
    cursor: default;
    opacity: 0.58;
  }

  .section-heading {
    margin-bottom: 1rem;
    min-height: 3.2rem;
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 1rem;
  }

  .section-heading.compact {
    min-height: 2.65rem;
  }

  .section-heading h2 {
    margin-bottom: 0;
    font-size: 1.08rem;
    line-height: 1.15;
  }

  .seed,
  .gate-state {
    color: #7599a8;
    font:
      700 0.75rem/1.25 ui-monospace,
      monospace;
    text-align: right;
  }

  .gate-state {
    min-width: 8ch;
  }

  .gate-state.complete {
    color: #83e5a9;
  }

  .trial-buttons {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.55rem;
  }

  .trial-buttons button,
  .run-all {
    min-height: 2.75rem;
    border: 1px solid rgba(125, 190, 215, 0.35);
    border-radius: 0.72rem;
    color: #eaf6fa;
    background: #0b2937;
    cursor: pointer;
    transition:
      border-color 150ms ease,
      background 150ms ease;
  }

  .trial-buttons button {
    padding: 0.65rem 0.75rem;
    display: flex;
    align-items: center;
    gap: 0.55rem;
    text-align: left;
    font-size: 0.82rem;
    font-weight: 700;
  }

  .trial-buttons button > span,
  .result-dot {
    width: 0.55rem;
    aspect-ratio: 1;
    flex: 0 0 auto;
    border-radius: 50%;
    background: var(--trial-color);
  }

  .trial-buttons button.running {
    border-color: var(--semantic-cyan);
    background: #103548;
  }

  .trial-buttons button:disabled,
  .run-all:disabled {
    cursor: default;
    opacity: 0.58;
  }

  .run-all {
    width: 100%;
    margin-top: 0.55rem;
    font-weight: 800;
  }

  @media (hover: hover) {
    .trial-buttons button:not(:disabled):hover,
    .run-all:not(:disabled):hover,
    .read-options button:hover,
    .reel-actions button:hover,
    .mode-switch:not(:disabled):hover {
      border-color: #66d9ff;
      background: #103548;
    }

    .read-options button:hover {
      transform: translateY(-1px);
    }
  }

  .trial-buttons button:focus-visible,
  .run-all:focus-visible,
  .read-options button:focus-visible,
  .reel-actions button:focus-visible,
  .mode-switch:focus-visible {
    outline: 2px solid #66d9ff;
    outline-offset: 2px;
  }

  .result-list {
    display: grid;
    gap: 0.62rem;
  }

  article {
    min-height: 8.3rem;
    padding: 0.85rem;
    border: 1px solid var(--theme-stroke);
    border-radius: 0.85rem;
    background: var(--theme-card-bg);
  }

  article.passed {
    border-color: rgba(131, 229, 169, 0.42);
  }

  article.running {
    border-color: rgba(102, 217, 255, 0.65);
  }

  article header {
    min-height: 2.8rem;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: start;
    gap: 0.6rem;
  }

  article h3 {
    margin-bottom: 0.12rem;
    font-size: 0.86rem;
  }

  article p {
    margin-bottom: 0;
    overflow: hidden;
    color: #8fafbc;
    font-size: 0.75rem;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  article header > strong {
    min-width: 4ch;
    color: #83e5a9;
    font:
      800 0.75rem/1.2 ui-monospace,
      monospace;
    text-align: right;
  }

  .metric-grid {
    margin-top: 0.6rem;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.35rem 0.8rem;
    font-variant-numeric: tabular-nums;
  }

  .metric-grid span {
    min-width: 0;
    display: flex;
    justify-content: space-between;
    gap: 0.4rem;
    color: #7599a8;
    font-size: 0.75rem;
  }

  .metric-grid b {
    overflow: hidden;
    color: #eaf6fa;
    font-family: ui-monospace, monospace;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  footer {
    min-height: 4rem;
    padding: 0.9rem 1.25rem;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.8rem;
    color: #7599a8;
    font:
      700 0.75rem/1.2 ui-monospace,
      monospace;
  }

  footer strong {
    color: #83e5a9;
    text-align: center;
  }

  footer small {
    font: inherit;
    text-align: right;
  }

  @media (min-width: 1680px) {
    .agency-header {
      padding-inline: 2.5rem;
    }

    .workspace {
      grid-template-columns: minmax(0, 1fr) minmax(29rem, 30vw);
    }

    .control-block,
    .evidence-block,
    .read-block,
    .recognition-block {
      padding: 1.45rem;
    }
  }

  @media (min-width: 2600px) {
    .agency-header {
      min-height: 12rem;
      padding: 2.5rem 3.5rem;
    }

    .workspace,
    .ocean-stage {
      min-height: calc(100vh - 12rem);
    }

    .workspace {
      grid-template-columns: minmax(0, 1fr) 62rem;
    }

    .control-block,
    .evidence-block,
    .read-block,
    .recognition-block {
      padding: 2rem;
    }

    article {
      min-height: 11rem;
      padding: 1.35rem;
    }

    h1 {
      font-size: 4.1rem;
    }

    .eyebrow {
      font-size: 0.95rem;
    }

    .dek,
    .run-state strong {
      font-size: 1.2rem;
    }

    .run-state small,
    .seed,
    .gate-state {
      font-size: 0.95rem;
    }

    .section-heading h2 {
      font-size: 1.45rem;
    }

    .read-options button {
      min-height: 6rem;
      padding: 1.1rem 1.2rem;
    }

    .read-options button strong,
    article h3 {
      font-size: 1.12rem;
    }

    .read-options button span,
    article p,
    .metric-grid span,
    .recognition-block > p {
      font-size: 0.95rem;
    }

    .reel-actions button,
    .mode-switch {
      min-height: 4rem;
      font-size: 1rem;
    }

    .blind-badge,
    footer {
      font-size: 0.95rem;
    }
  }

  @media (max-width: 980px) and (min-height: 620px) {
    .agency-header {
      min-height: auto;
      padding: 1.15rem 1.25rem;
    }

    .workspace {
      min-height: 0;
      grid-template-columns: 1fr;
    }

    .ocean-stage {
      min-height: 34rem;
      height: 58vh;
    }

    .control-rail {
      border-top: 1px solid var(--theme-stroke);
      border-left: 0;
    }

    .result-list {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-height: 619px) {
    .agency-header {
      min-height: 4.1rem;
      padding: 0.65rem 1rem;
    }

    .agency-header .dek {
      display: none;
    }

    h1 {
      font-size: 1.45rem;
    }

    .workspace {
      height: calc(100vh - 4.1rem);
      min-height: 0;
      grid-template-columns: minmax(0, 1fr) minmax(19rem, 33vw);
    }

    .ocean-stage {
      min-height: 0;
    }

    .control-rail {
      overflow-y: auto;
    }

    .control-block,
    .evidence-block,
    .read-block,
    .recognition-block {
      padding: 0.8rem;
    }

    .watch-cue {
      min-height: 10rem;
    }

    .section-heading {
      min-height: 2.3rem;
      margin-bottom: 0.6rem;
    }

    .section-heading h2 {
      font-size: 0.9rem;
    }

    article {
      min-height: 7.4rem;
      padding: 0.65rem;
    }

    .stage-legend {
      left: 0.75rem;
      bottom: 0.75rem;
      min-height: 3.6rem;
      padding: 0.65rem 0.75rem;
    }
  }

  @media (max-width: 560px) {
    .agency-header {
      align-items: end;
      padding: 1rem;
    }

    h1 {
      font-size: 1.65rem;
    }

    .dek {
      max-width: 24rem;
      font-size: 0.82rem;
    }

    .run-state {
      min-width: 5.6rem;
    }

    .ocean-stage {
      min-height: 27rem;
      height: 64vh;
    }

    .control-block,
    .evidence-block,
    .read-block,
    .recognition-block {
      padding: 1rem;
    }

    .seed {
      display: none;
    }

    .result-list {
      grid-template-columns: 1fr;
    }

    footer {
      grid-template-columns: 1fr;
      text-align: center;
    }

    footer strong,
    footer small {
      text-align: center;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .trial-buttons button,
    .run-all,
    .read-options button {
      transition: none;
    }
  }
</style>
