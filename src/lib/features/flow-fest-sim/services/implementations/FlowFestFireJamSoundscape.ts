import {
  FLOW_FEST_AUDIO_FIELD_CONTRACT,
  createFlowFestAudioFieldSolution,
  flowFestAudioPhaseForMoment,
  readFlowFestAudioFieldTiers,
  solveFlowFestAudioField,
  type FlowFestAudioFieldSolution,
  type FlowFestAudioFieldSolveOptions,
  type FlowFestAudioListener,
  type FlowFestAudioSource,
  type FlowFestAudioSourceCharacter,
  type FlowFestAudioTier,
} from "../../domain/flow-fest-audio-field";
import {
  FLOW_FEST_WALLA_CONTRACT,
  flowFestWallaOccupancy,
  scheduleFlowFestWallaWindow,
  type FlowFestWallaWindow,
} from "../../domain/flow-fest-audio-walla";
import {
  computeFlowFestSiteAudioBedFilters,
  computeFlowFestSiteAudioMix,
  type FlowFestSiteAudioBedFilters,
  type FlowFestSiteAudioMix,
} from "../../domain/flow-fest-site-audio";
import type {
  FlowFestAudioFieldConfig,
  FlowFestAudioFieldFrame,
  FlowFestAudioFieldProof,
  FlowFestFireJamSpatialFrame,
  FlowFestFireJamSoundscapeSnapshot,
  FlowFestSoundscapeUnlockState,
  IFlowFestFireJamSoundscape,
} from "../contracts/IFlowFestFireJamSoundscape";

/**
 * One AudioContext, created by a user gesture, holding long-lived sources. The
 * field extends that discipline rather than replacing it: every voice starts
 * once at graph build and is only ever re-aimed, re-levelled, or re-tiered.
 * The only transient nodes are the crowd-walla grains and the join cue.
 */

interface FlowFestFireJamAudioGraph {
  master: GainNode;
  arrivalGain: GainNode;
  woodlandGain: GainNode;
  campGain: GainNode;
  fireGain: GainNode;
  ledGain: GainNode;
  crowdGain: GainNode;
  arrivalFilter: BiquadFilterNode;
  woodlandBedFilter: BiquadFilterNode;
  campFilter: BiquadFilterNode;
  fireBedFilter: BiquadFilterNode;
  ledBedFilter: BiquadFilterNode;
  crowdBedFilter: BiquadFilterNode;
  fieldBedBus: GainNode;
  heroSlots: HeroSlot[];
  noiseBuffer: AudioBuffer;
  sources: AudioScheduledSourceNode[];
  nodes: AudioNode[];
}

interface HeroSlot {
  panner: PannerNode;
  owner: FieldVoice | null;
  releaseAt: number;
}

interface FieldVoice {
  id: string;
  source: FlowFestAudioSource;
  output: GainNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  heroSend: GainNode;
  midSend: GainNode;
  bedSend: GainNode;
  equalpower: PannerNode;
  heroSlot: HeroSlot | null;
  tier: FlowFestAudioTier;
  nodes: AudioNode[];
  starts: AudioScheduledSourceNode[];
}

const SILENT_MIX: FlowFestSiteAudioMix = {
  arrival: 0,
  woodland: 0,
  camp: 0,
  fire: 0,
  led: 0,
  crowd: 0,
  master: 0,
  dominantLayer: "woodland",
};

const OPEN_BED_FILTERS: FlowFestSiteAudioBedFilters = {
  arrivalHz: FLOW_FEST_AUDIO_FIELD_CONTRACT.openLowpassHz,
  woodlandHz: FLOW_FEST_AUDIO_FIELD_CONTRACT.openLowpassHz,
  campHz: FLOW_FEST_AUDIO_FIELD_CONTRACT.openLowpassHz,
  fireHz: FLOW_FEST_AUDIO_FIELD_CONTRACT.openLowpassHz,
  ledHz: FLOW_FEST_AUDIO_FIELD_CONTRACT.openLowpassHz,
  crowdHz: FLOW_FEST_AUDIO_FIELD_CONTRACT.openLowpassHz,
};

/** Level calibration per voice character. Restrained and nocturnal by design. */
const VOICE_LEVEL: Readonly<Record<FlowFestAudioSourceCharacter, number>> =
  Object.freeze({
    "fire-bed": 0.3,
    "led-drone": 0.05,
    "hand-drum": 0.14,
    "deep-pulse": 0.11,
    "bright-rhythm": 0.09,
    "dub-swell": 0.1,
    "generator-hum": 0.05,
    walla: 0.13,
  });

/** The audio tick never needs to run at render rate. */
const MIN_UPDATE_INTERVAL_SECONDS = 0.04;
const WALLA_LOOKAHEAD_SECONDS = 1;
const WALLA_MAX_WINDOWS_PER_UPDATE = 3;

/** Four seconds of seeded brown noise; the museum village's fire reuses it. */
export function createDeterministicNoise(context: BaseAudioContext): AudioBuffer {
  const frameCount = context.sampleRate * 4;
  const buffer = context.createBuffer(1, frameCount, context.sampleRate);
  const samples = buffer.getChannelData(0);
  let state = 0x5f3759df;
  let brown = 0;

  for (let index = 0; index < frameCount; index += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const white = (state / 0xffffffff) * 2 - 1;
    brown = (brown + white * 0.018) / 1.018;
    samples[index] = Math.max(-1, Math.min(1, brown * 3.2));
  }
  return buffer;
}

function fireJamStateGain(state: string): number {
  return state === "active" ? 1 : state === "completed" ? 0.72 : 0.5;
}

export class FlowFestFireJamSoundscape implements IFlowFestFireJamSoundscape {
  private context: AudioContext | null = null;
  private graph: FlowFestFireJamAudioGraph | null = null;
  private voices: FieldVoice[] = [];
  private mix: FlowFestSiteAudioMix = { ...SILENT_MIX };
  private bedFilters: FlowFestSiteAudioBedFilters = { ...OPEN_BED_FILTERS };
  private graphBuildCount = 0;
  private sourceStartCount = 0;
  private spatialFrameCount = 0;
  private spatialFrame: FlowFestFireJamSpatialFrame | null = null;

  private unlockState: FlowFestSoundscapeUnlockState = "idle";
  private unlockAttemptCount = 0;
  private unlockFailureCount = 0;
  private lastUnlockError: string | null = null;

  private config: FlowFestAudioFieldConfig | null = null;
  private solution: FlowFestAudioFieldSolution =
    createFlowFestAudioFieldSolution();
  private previousTiers = new Map<string, FlowFestAudioTier>();
  private readonly listener: FlowFestAudioListener = {
    x: 0,
    y: 0,
    z: 0,
    yawRadians: 0,
  };
  private readonly solveOptions: FlowFestAudioFieldSolveOptions = {
    phase: "day",
    stateGain: 1,
    previousTiers: this.previousTiers,
  };
  private lastUpdateAt = -Infinity;
  private updateTicks = 0;
  private coalescedTicks = 0;
  private pendingHeroPromotions = 0;
  private revision = 0;
  private revisionKey = "";

  private wallaSeed = 0x5eed1;
  private wallaEpochSeconds: number | null = null;
  private nextWallaWindowIndex = 0;
  private wallaWindowsScheduled = 0;
  private wallaGrainsScheduled = 0;
  private lastWallaWindow: FlowFestWallaWindow | null = null;
  private wallaOccupancy = 0;
  private wallaNightEnergy = 0;
  private wallaNearFire = 0;

  async unlock(): Promise<boolean> {
    if (typeof window === "undefined") {
      this.unlockState = "unsupported";
      return false;
    }
    const AudioContextOwner =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextOwner) {
      this.unlockState = "unsupported";
      return false;
    }
    this.unlockAttemptCount += 1;
    try {
      if (!this.context || this.context.state === "closed") {
        this.context = new AudioContextOwner();
        this.graph = this.buildGraph(this.context);
        this.rebuildVoices();
      }
      if (this.context.state === "suspended") await this.context.resume();
    } catch (error) {
      // A browser that refuses the gesture must leave the soundscape armed for
      // the next one. It must never surface as an unhandled rejection, and the
      // caller must be able to see that audio did not actually start.
      this.unlockFailureCount += 1;
      this.lastUnlockError =
        error instanceof Error ? error.message : String(error);
      this.unlockState = "awaiting-gesture";
      this.bumpRevision();
      return false;
    }
    const running = this.context.state === "running";
    this.unlockState = running ? "running" : "awaiting-gesture";
    if (!running) {
      this.unlockFailureCount += 1;
      this.lastUnlockError = `AudioContext stayed ${this.context.state} after resume`;
    } else {
      this.lastUnlockError = null;
    }
    this.applyMix();
    this.applyBedFilters();
    this.applySpatialFrame();
    this.bumpRevision();
    return running;
  }

  configure(config: FlowFestAudioFieldConfig): void {
    const previousIds = this.config?.sources.map((source) => source.id).join("|");
    const nextIds = config.sources.map((source) => source.id).join("|");
    this.config = {
      layout: config.layout,
      sources: config.sources,
      sampleGroundY: config.sampleGroundY ?? null,
      wallaSeed: config.wallaSeed,
    };
    if (config.wallaSeed !== undefined) this.wallaSeed = config.wallaSeed;
    this.solveOptions.sampleGroundY = this.config.sampleGroundY ?? null;
    if (this.graph && previousIds !== nextIds) this.rebuildVoices();
    this.bumpRevision();
  }

  update(frame: FlowFestAudioFieldFrame): void {
    this.listener.x = frame.listener.x;
    this.listener.y = frame.listener.y;
    this.listener.z = frame.listener.z;
    this.listener.yawRadians = frame.listener.yawRadians;

    const config = this.config;
    if (!config) return;
    const context = this.context;
    const nowSeconds = context ? context.currentTime : this.lastUpdateAt + 1;
    if (context && nowSeconds - this.lastUpdateAt < MIN_UPDATE_INTERVAL_SECONDS) {
      this.coalescedTicks += 1;
      return;
    }
    this.lastUpdateAt = nowSeconds;
    this.updateTicks += 1;

    const nextMix = computeFlowFestSiteAudioMix(
      config.layout,
      this.listener,
      frame.fireJamState,
      frame.masterVolume
    );
    this.mix.arrival = nextMix.arrival;
    this.mix.woodland = nextMix.woodland;
    this.mix.camp = nextMix.camp;
    this.mix.fire = nextMix.fire;
    this.mix.led = nextMix.led;
    this.mix.crowd = nextMix.crowd;
    this.mix.master = nextMix.master;
    this.mix.dominantLayer = nextMix.dominantLayer;

    const nextFilters = computeFlowFestSiteAudioBedFilters(
      config.layout,
      this.listener
    );
    this.bedFilters.arrivalHz = nextFilters.arrivalHz;
    this.bedFilters.woodlandHz = nextFilters.woodlandHz;
    this.bedFilters.campHz = nextFilters.campHz;
    this.bedFilters.fireHz = nextFilters.fireHz;
    this.bedFilters.ledHz = nextFilters.ledHz;
    this.bedFilters.crowdHz = nextFilters.crowdHz;

    this.solveOptions.phase = flowFestAudioPhaseForMoment(frame.moment);
    this.solveOptions.stateGain = fireJamStateGain(frame.fireJamState);
    this.solveOptions.sampleGroundY = config.sampleGroundY ?? null;
    solveFlowFestAudioField(
      config.sources,
      this.listener,
      this.solveOptions,
      this.solution
    );

    this.wallaOccupancy = flowFestWallaOccupancy(frame.crowdOccupancy);
    this.wallaNightEnergy =
      this.solveOptions.phase === "night"
        ? 1
        : this.solveOptions.phase === "dusk"
          ? 0.55
          : 0.2;
    this.wallaNearFire = Math.max(0, Math.min(1, frame.nearFire));

    this.applyMix();
    this.applyBedFilters();
    this.applyField();
    this.applySpatialFrame();
    this.scheduleWalla();
    readFlowFestAudioFieldTiers(this.solution, this.previousTiers);
    this.bumpRevision();
  }

  setMix(mix: FlowFestSiteAudioMix): void {
    this.mix.arrival = mix.arrival;
    this.mix.woodland = mix.woodland;
    this.mix.camp = mix.camp;
    this.mix.fire = mix.fire;
    this.mix.led = mix.led;
    this.mix.crowd = mix.crowd;
    this.mix.master = mix.master;
    this.mix.dominantLayer = mix.dominantLayer;
    this.applyMix();
  }

  setSpatialFrame(frame: FlowFestFireJamSpatialFrame): void {
    this.spatialFrame = {
      listener: { ...frame.listener },
      fire: { ...frame.fire },
      led: { ...frame.led },
      crowd: { ...frame.crowd },
    };
    this.listener.x = frame.listener.x;
    this.listener.y = frame.listener.y;
    this.listener.z = frame.listener.z;
    this.listener.yawRadians = frame.listener.yawRadians;
    this.spatialFrameCount += 1;
    this.applySpatialFrame();
  }

  triggerJoinCue(): void {
    const context = this.context;
    const graph = this.graph;
    if (!context || !graph || context.state !== "running") return;
    const now = context.currentTime;
    for (const [index, frequency] of [196, 293.66, 392, 587.33].entries()) {
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      oscillator.type = index % 2 === 0 ? "sine" : "triangle";
      oscillator.frequency.setValueAtTime(frequency, now);
      envelope.gain.setValueAtTime(0.0001, now + index * 0.055);
      envelope.gain.exponentialRampToValueAtTime(
        0.055,
        now + index * 0.055 + 0.025
      );
      envelope.gain.exponentialRampToValueAtTime(
        0.0001,
        now + 1.15 + index * 0.07
      );
      oscillator.connect(envelope);
      envelope.connect(graph.master);
      oscillator.start(now + index * 0.055);
      oscillator.stop(now + 1.25 + index * 0.07);
      oscillator.onended = () => {
        oscillator.disconnect();
        envelope.disconnect();
      };
    }
  }

  proofRevision(): number {
    return this.revision;
  }

  snapshot(): FlowFestFireJamSoundscapeSnapshot {
    const supported =
      typeof window !== "undefined" &&
      Boolean(
        window.AudioContext ??
          (
            window as unknown as {
              webkitAudioContext?: typeof AudioContext;
            }
          ).webkitAudioContext
      );
    return {
      supported,
      unlocked: this.context?.state === "running",
      playing: Boolean(this.graph && this.context?.state === "running"),
      unlockState: supported ? this.unlockState : "unsupported",
      unlockAttemptCount: this.unlockAttemptCount,
      unlockFailureCount: this.unlockFailureCount,
      lastUnlockError: this.lastUnlockError,
      graphBuildCount: this.graphBuildCount,
      sourceStartCount: this.sourceStartCount,
      longLivedSourceCount:
        (this.graph?.sources.length ?? 0) +
        this.voices.reduce((total, voice) => total + voice.starts.length, 0),
      spatialFrameCount: this.spatialFrameCount,
      spatializedSources: this.graph
        ? this.solution.heroCount + this.solution.midCount
        : 0,
      mix: { ...this.mix },
      field: this.fieldProof(),
    };
  }

  dispose(): void {
    const context = this.context;
    const graph = this.graph;
    const voices = this.voices;
    this.graph = null;
    this.context = null;
    this.voices = [];
    this.previousTiers.clear();
    this.solution = createFlowFestAudioFieldSolution();
    this.wallaEpochSeconds = null;
    this.nextWallaWindowIndex = 0;
    this.unlockState = "idle";
    for (const voice of voices) {
      for (const source of voice.starts) {
        try {
          source.stop();
        } catch {
          // A source that has already stopped is already in the state we need.
        }
      }
      for (const node of voice.nodes) node.disconnect();
    }
    if (graph) {
      for (const source of graph.sources) {
        try {
          source.stop();
        } catch {
          // A source that has already stopped is already in the state we need.
        }
      }
      for (const node of graph.nodes) node.disconnect();
      for (const slot of graph.heroSlots) {
        slot.owner = null;
        slot.panner.disconnect();
      }
    }
    if (context && context.state !== "closed") void context.close();
    this.bumpRevision();
  }

  private fieldProof(): FlowFestAudioFieldProof {
    return {
      configured: Boolean(this.config),
      phase: this.solution.phase,
      heroLimit: this.solution.heroLimit,
      heroCount: this.solution.heroCount,
      midCount: this.solution.midCount,
      bedCount: this.solution.bedCount,
      hrtfPannerCount: this.graph?.heroSlots.length ?? 0,
      equalpowerPannerCount: this.voices.length,
      pendingHeroPromotions: this.pendingHeroPromotions,
      promotions: [...this.solution.promotions],
      demotions: [...this.solution.demotions],
      crossfadeSeconds: this.solution.crossfadeSeconds,
      occlusionEnabled: Boolean(this.config?.sampleGroundY),
      occludedSourceCount: this.solution.sources.filter(
        (state) => state.occluded
      ).length,
      updateTicks: this.updateTicks,
      coalescedTicks: this.coalescedTicks,
      bedFilterHz: {
        arrival: this.bedFilters.arrivalHz,
        woodland: this.bedFilters.woodlandHz,
        camp: this.bedFilters.campHz,
        fire: this.bedFilters.fireHz,
        led: this.bedFilters.ledHz,
        crowd: this.bedFilters.crowdHz,
      },
      sources: this.solution.sources.map((state) => ({
        id: state.id,
        label: state.label,
        sourceClass: state.sourceClass,
        character: state.character,
        tier: state.tier,
        panningModel: state.panningModel,
        distanceMeters: state.distanceMeters,
        gain: state.gain,
        lowpassHz: state.lowpassHz,
        occluded: state.occluded,
        occlusionMeters: state.occlusionMeters,
        provenance: state.provenance,
      })),
      walla: {
        seed: this.wallaSeed,
        onsetsPerSecond: this.lastWallaWindow?.onsetsPerSecond ?? 0,
        occupancy: this.wallaOccupancy,
        nightEnergy: this.wallaNightEnergy,
        windowsScheduled: this.wallaWindowsScheduled,
        grainsScheduled: this.wallaGrainsScheduled,
        lastWindowIndex: this.lastWallaWindow?.windowIndex ?? -1,
        lastWindowGrains: this.lastWallaWindow?.grains.length ?? 0,
      },
    };
  }

  /**
   * Discrete-change tracking. Gains move continuously and must not force a
   * host re-render; tier composition, unlock state, and scheduled walla
   * windows are the things a proof reader actually needs to see change.
   */
  private bumpRevision(): void {
    const key = [
      this.unlockState,
      this.config ? this.config.sources.length : -1,
      this.solution.heroCount,
      this.solution.midCount,
      this.solution.bedCount,
      this.solution.phase,
      this.mix.dominantLayer,
      this.pendingHeroPromotions,
      this.wallaWindowsScheduled,
      this.solution.promotions.join(","),
      this.solution.demotions.join(","),
    ].join("|");
    if (key === this.revisionKey) return;
    this.revisionKey = key;
    this.revision += 1;
  }

  private buildGraph(context: AudioContext): FlowFestFireJamAudioGraph {
    this.graphBuildCount += 1;
    const nodes: AudioNode[] = [];
    const master = context.createGain();
    master.gain.value = 0;
    master.connect(context.destination);
    nodes.push(master);

    const noiseBuffer = createDeterministicNoise(context);
    const noise = context.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;

    const bed = (
      type: BiquadFilterType,
      frequency: number,
      q: number | null
    ): { filter: BiquadFilterNode; gain: GainNode; post: BiquadFilterNode } => {
      const filter = context.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = frequency;
      if (q !== null) filter.Q.value = q;
      const gain = context.createGain();
      gain.gain.value = 0;
      // Distance brightness for the non-panned beds. A far stage has to arrive
      // as a bass-heavy murmur, not a quiet copy of the close sound.
      const post = context.createBiquadFilter();
      post.type = "lowpass";
      post.frequency.value = FLOW_FEST_AUDIO_FIELD_CONTRACT.openLowpassHz;
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(post);
      post.connect(master);
      nodes.push(filter, gain, post);
      return { filter, gain, post };
    };

    const arrival = bed("lowpass", 240, null);
    const woodland = bed("highpass", 2100, null);
    const camp = bed("bandpass", 380, 0.34);
    const fire = bed("bandpass", 940, 0.56);
    const crowd = bed("lowpass", 520, null);

    const ledFundamental = context.createOscillator();
    ledFundamental.type = "sine";
    ledFundamental.frequency.value = 55;
    const ledOvertone = context.createOscillator();
    ledOvertone.type = "triangle";
    ledOvertone.frequency.value = 110;
    const ledGain = context.createGain();
    ledGain.gain.value = 0;
    const ledBedFilter = context.createBiquadFilter();
    ledBedFilter.type = "lowpass";
    ledBedFilter.frequency.value = FLOW_FEST_AUDIO_FIELD_CONTRACT.openLowpassHz;
    ledFundamental.connect(ledGain);
    ledOvertone.connect(ledGain);
    ledGain.connect(ledBedFilter);
    ledBedFilter.connect(master);
    nodes.push(ledGain, ledBedFilter);

    const fieldBedBus = context.createGain();
    fieldBedBus.gain.value = 1;
    fieldBedBus.connect(master);
    nodes.push(fieldBedBus);

    // A fixed pool. HRTF is convolution-heavy, so the number of HRTF panners
    // that exist is capped structurally rather than by hoping the ranker holds.
    const heroSlots: HeroSlot[] = [];
    for (let index = 0; index < FLOW_FEST_AUDIO_FIELD_CONTRACT.heroLimit; index += 1) {
      const panner = this.createPanner(context, "HRTF");
      panner.connect(master);
      nodes.push(panner);
      heroSlots.push({ panner, owner: null, releaseAt: 0 });
    }

    noise.start();
    ledFundamental.start();
    ledOvertone.start();
    this.sourceStartCount += 3;

    return {
      master,
      arrivalGain: arrival.gain,
      woodlandGain: woodland.gain,
      campGain: camp.gain,
      fireGain: fire.gain,
      ledGain,
      crowdGain: crowd.gain,
      arrivalFilter: arrival.post,
      woodlandBedFilter: woodland.post,
      campFilter: camp.post,
      fireBedFilter: fire.post,
      ledBedFilter,
      crowdBedFilter: crowd.post,
      fieldBedBus,
      heroSlots,
      noiseBuffer,
      sources: [noise, ledFundamental, ledOvertone],
      nodes,
    };
  }

  private createPanner(
    context: AudioContext,
    panningModel: PanningModelType
  ): PannerNode {
    const panner = context.createPanner();
    panner.panningModel = panningModel;
    panner.distanceModel = "inverse";
    panner.refDistance = 1;
    panner.maxDistance = 200;
    // The domain field solve already owns distance attenuation and air
    // absorption. The panner contributes direction only, so approaching a
    // source never gets attenuated twice.
    panner.rolloffFactor = 0;
    panner.coneInnerAngle = 360;
    panner.coneOuterAngle = 360;
    return panner;
  }

  private rebuildVoices(): void {
    const context = this.context;
    const graph = this.graph;
    if (!context || !graph) return;
    for (const voice of this.voices) {
      for (const source of voice.starts) {
        try {
          source.stop();
        } catch {
          // Already stopped.
        }
      }
      for (const node of voice.nodes) node.disconnect();
      if (voice.heroSlot) {
        voice.heroSlot.owner = null;
        voice.heroSlot.releaseAt = 0;
      }
    }
    this.voices = (this.config?.sources ?? []).map((source) =>
      this.buildVoice(context, graph, source)
    );
  }

  private buildVoice(
    context: AudioContext,
    graph: FlowFestFireJamAudioGraph,
    source: FlowFestAudioSource
  ): FieldVoice {
    const nodes: AudioNode[] = [];
    const starts: AudioScheduledSourceNode[] = [];
    const output = context.createGain();
    output.gain.value = VOICE_LEVEL[source.character] ?? 0.1;
    nodes.push(output);

    this.buildCharacter(context, graph, source.character, output, nodes, starts);

    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = FLOW_FEST_AUDIO_FIELD_CONTRACT.openLowpassHz;
    const gain = context.createGain();
    gain.gain.value = 0;
    output.connect(filter);
    filter.connect(gain);
    nodes.push(filter, gain);

    const heroSend = context.createGain();
    heroSend.gain.value = 0;
    const midSend = context.createGain();
    midSend.gain.value = 0;
    const bedSend = context.createGain();
    bedSend.gain.value = 0;
    const equalpower = this.createPanner(context, "equalpower");
    gain.connect(heroSend);
    gain.connect(midSend);
    gain.connect(bedSend);
    midSend.connect(equalpower);
    equalpower.connect(graph.master);
    bedSend.connect(graph.fieldBedBus);
    nodes.push(heroSend, midSend, bedSend, equalpower);

    for (const started of starts) {
      started.start();
      this.sourceStartCount += 1;
    }

    return {
      id: source.id,
      source,
      output,
      filter,
      gain,
      heroSend,
      midSend,
      bedSend,
      equalpower,
      heroSlot: null,
      tier: "bed",
      nodes,
      starts,
    };
  }

  /**
   * Every character is synthesized. There are no flow-fest audio assets on
   * disk and this build does not add any, so a "camp sound system" is an
   * oscillator family with a pulse, not a music file.
   */
  private buildCharacter(
    context: AudioContext,
    graph: FlowFestFireJamAudioGraph,
    character: FlowFestAudioSourceCharacter,
    output: GainNode,
    nodes: AudioNode[],
    starts: AudioScheduledSourceNode[]
  ): void {
    const noise = (): AudioBufferSourceNode => {
      const node = context.createBufferSource();
      node.buffer = graph.noiseBuffer;
      node.loop = true;
      starts.push(node);
      return node;
    };
    const oscillator = (
      type: OscillatorType,
      frequency: number
    ): OscillatorNode => {
      const node = context.createOscillator();
      node.type = type;
      node.frequency.value = frequency;
      starts.push(node);
      return node;
    };
    const band = (
      type: BiquadFilterType,
      frequency: number,
      q?: number
    ): BiquadFilterNode => {
      const node = context.createBiquadFilter();
      node.type = type;
      node.frequency.value = frequency;
      if (q !== undefined) node.Q.value = q;
      nodes.push(node);
      return node;
    };
    /** Continuous amplitude motion without a scheduler: an LFO on a gain param. */
    const pulse = (rateHz: number, depth: number, base: number): GainNode => {
      const gain = context.createGain();
      gain.gain.value = base;
      const lfo = oscillator("sine", rateHz);
      const lfoDepth = context.createGain();
      lfoDepth.gain.value = depth;
      lfo.connect(lfoDepth);
      lfoDepth.connect(gain.gain);
      nodes.push(gain, lfoDepth);
      return gain;
    };

    switch (character) {
      case "fire-bed": {
        const body = noise();
        const shaped = band("bandpass", 940, 0.56);
        const crackle = pulse(0.7, 0.18, 0.72);
        body.connect(shaped);
        shaped.connect(crackle);
        crackle.connect(output);
        break;
      }
      case "led-drone": {
        const fundamental = oscillator("sine", 55);
        const overtone = oscillator("triangle", 110);
        const swell = pulse(0.18, 0.22, 0.6);
        fundamental.connect(swell);
        overtone.connect(swell);
        swell.connect(output);
        break;
      }
      case "hand-drum": {
        const body = noise();
        const skin = band("bandpass", 180, 4);
        const beat = pulse(2.35, 0.46, 0.34);
        body.connect(skin);
        skin.connect(beat);
        beat.connect(output);
        break;
      }
      case "deep-pulse": {
        const sub = oscillator("sine", 48);
        const air = noise();
        const airFilter = band("lowpass", 160);
        const beat = pulse(0.85, 0.42, 0.5);
        sub.connect(beat);
        air.connect(airFilter);
        airFilter.connect(beat);
        beat.connect(output);
        break;
      }
      case "bright-rhythm": {
        const tone = oscillator("sawtooth", 196);
        const shaped = band("bandpass", 1100, 2);
        const beat = pulse(2.9, 0.4, 0.44);
        tone.connect(shaped);
        shaped.connect(beat);
        beat.connect(output);
        break;
      }
      case "dub-swell": {
        const tone = oscillator("triangle", 62);
        const shaped = band("lowpass", 320);
        const shimmer = noise();
        const shimmerFilter = band("highpass", 3000);
        const shimmerGain = context.createGain();
        shimmerGain.gain.value = 0.06;
        const swell = pulse(0.4, 0.34, 0.5);
        tone.connect(shaped);
        shaped.connect(swell);
        shimmer.connect(shimmerFilter);
        shimmerFilter.connect(shimmerGain);
        shimmerGain.connect(swell);
        nodes.push(shimmerGain);
        swell.connect(output);
        break;
      }
      case "generator-hum": {
        const mains = oscillator("sawtooth", 60);
        const harmonic = oscillator("sine", 120);
        const shaped = band("lowpass", 400);
        mains.connect(shaped);
        harmonic.connect(shaped);
        shaped.connect(output);
        break;
      }
      case "walla": {
        // A low murmur floor under the grains, so silence between onsets does
        // not read as the crowd vanishing.
        const floor = noise();
        const shaped = band("bandpass", 700, 0.8);
        const level = context.createGain();
        level.gain.value = 0.12;
        floor.connect(shaped);
        shaped.connect(level);
        level.connect(output);
        nodes.push(level);
        break;
      }
    }
  }

  private applyField(): void {
    const context = this.context;
    const graph = this.graph;
    if (!context || !graph) return;
    const now = context.currentTime;
    const crossfade = this.solution.crossfadeSeconds;
    const byId = new Map<string, FieldVoice>();
    for (const voice of this.voices) byId.set(voice.id, voice);

    for (const state of this.solution.sources) {
      const voice = byId.get(state.id);
      if (voice) voice.tier = state.tier;
    }

    // Release slots whose owner is no longer a hero, after the crossfade the
    // demotion already started. Reclaiming before then would pop.
    for (const slot of graph.heroSlots) {
      const owner = slot.owner;
      if (!owner) continue;
      if (owner.tier === "hero") {
        slot.releaseAt = 0;
        continue;
      }
      if (slot.releaseAt === 0) {
        slot.releaseAt = now + crossfade;
      } else if (now >= slot.releaseAt) {
        try {
          owner.heroSend.disconnect(slot.panner);
        } catch {
          // Already disconnected.
        }
        owner.heroSlot = null;
        slot.owner = null;
        slot.releaseAt = 0;
      }
    }

    this.pendingHeroPromotions = 0;
    for (const voice of this.voices) {
      if (voice.tier !== "hero" || voice.heroSlot) continue;
      const free = graph.heroSlots.find((slot) => slot.owner === null);
      if (!free) {
        // No slot yet. The voice keeps sounding through its equalpower panner
        // until a demotion frees one, so a promotion never drops audio.
        this.pendingHeroPromotions += 1;
        continue;
      }
      free.owner = voice;
      free.releaseAt = 0;
      voice.heroSlot = free;
      voice.heroSend.gain.cancelScheduledValues(now);
      voice.heroSend.gain.setValueAtTime(0, now);
      voice.heroSend.connect(free.panner);
    }

    for (const state of this.solution.sources) {
      const voice = byId.get(state.id);
      if (!voice) continue;
      const heroActive = voice.tier === "hero" && voice.heroSlot !== null;
      const midActive =
        voice.tier === "mid" || (voice.tier === "hero" && !heroActive);
      const bedActive = voice.tier === "bed";
      voice.gain.gain.setTargetAtTime(state.gain, now, 0.12);
      voice.filter.frequency.setTargetAtTime(state.lowpassHz, now, 0.18);
      voice.heroSend.gain.setTargetAtTime(heroActive ? 1 : 0, now, crossfade / 3);
      voice.midSend.gain.setTargetAtTime(midActive ? 1 : 0, now, crossfade / 3);
      voice.bedSend.gain.setTargetAtTime(bedActive ? 1 : 0, now, crossfade / 3);
      const panner = voice.heroSlot?.panner ?? null;
      if (panner) {
        panner.positionX.setValueAtTime(state.x, now);
        panner.positionY.setValueAtTime(state.y, now);
        panner.positionZ.setValueAtTime(state.z, now);
      }
      voice.equalpower.positionX.setValueAtTime(state.x, now);
      voice.equalpower.positionY.setValueAtTime(state.y, now);
      voice.equalpower.positionZ.setValueAtTime(state.z, now);
    }
  }

  private scheduleWalla(): void {
    const context = this.context;
    const graph = this.graph;
    if (!context || !graph || context.state !== "running") return;
    const walla = this.voices.find((voice) => voice.source.character === "walla");
    if (!walla) return;
    if (this.wallaEpochSeconds === null) {
      this.wallaEpochSeconds = context.currentTime;
      this.nextWallaWindowIndex = 0;
    }
    const windowSeconds = FLOW_FEST_WALLA_CONTRACT.windowSeconds;
    let scheduled = 0;
    while (scheduled < WALLA_MAX_WINDOWS_PER_UPDATE) {
      const startSeconds =
        this.wallaEpochSeconds + this.nextWallaWindowIndex * windowSeconds;
      if (startSeconds > context.currentTime + WALLA_LOOKAHEAD_SECONDS) break;
      const scheduledWindow = scheduleFlowFestWallaWindow({
        seed: this.wallaSeed,
        windowIndex: this.nextWallaWindowIndex,
        occupancy: this.wallaOccupancy,
        nightEnergy: this.wallaNightEnergy,
        nearFire: this.wallaNearFire,
      });
      this.emitWallaWindow(context, graph, walla, scheduledWindow, startSeconds);
      this.lastWallaWindow = scheduledWindow;
      this.wallaWindowsScheduled += 1;
      this.wallaGrainsScheduled += scheduledWindow.grains.length;
      this.nextWallaWindowIndex += 1;
      scheduled += 1;
    }
  }

  private emitWallaWindow(
    context: AudioContext,
    graph: FlowFestFireJamAudioGraph,
    walla: FieldVoice,
    window: FlowFestWallaWindow,
    startSeconds: number
  ): void {
    for (const grain of window.grains) {
      const at = Math.max(context.currentTime, startSeconds + grain.offsetSeconds);
      const source = context.createBufferSource();
      source.buffer = graph.noiseBuffer;
      source.playbackRate.value = grain.pitchRatio;
      const shaped = context.createBiquadFilter();
      shaped.type = grain.kind === "distant-drum" ? "lowpass" : "bandpass";
      shaped.frequency.value = grain.centerHz;
      if (shaped.type === "bandpass") shaped.Q.value = 1.4;
      const envelope = context.createGain();
      envelope.gain.setValueAtTime(0.0001, at);
      envelope.gain.exponentialRampToValueAtTime(
        Math.max(0.0002, grain.gain),
        at + Math.min(0.03, grain.durationSeconds * 0.35)
      );
      envelope.gain.exponentialRampToValueAtTime(
        0.0001,
        at + grain.durationSeconds
      );
      source.connect(shaped);
      shaped.connect(envelope);
      envelope.connect(walla.output);
      // The pan value decorrelates the grain by reading a different slice of
      // the shared noise buffer rather than adding a stereo stage the field
      // panner would then flatten.
      const offset =
        ((grain.pan + 1) / 2) * Math.max(0, graph.noiseBuffer.duration - 1);
      source.start(at, offset);
      source.stop(at + grain.durationSeconds + 0.02);
      source.onended = () => {
        source.disconnect();
        shaped.disconnect();
        envelope.disconnect();
      };
    }
  }

  private applySpatialFrame(): void {
    const context = this.context;
    const graph = this.graph;
    if (!context || !graph) return;
    const now = context.currentTime;
    const listener = context.listener;
    listener.positionX.setValueAtTime(this.listener.x, now);
    listener.positionY.setValueAtTime(this.listener.y, now);
    listener.positionZ.setValueAtTime(this.listener.z, now);
    listener.forwardX.setValueAtTime(Math.sin(this.listener.yawRadians), now);
    listener.forwardY.setValueAtTime(0, now);
    listener.forwardZ.setValueAtTime(Math.cos(this.listener.yawRadians), now);
    listener.upX.setValueAtTime(0, now);
    listener.upY.setValueAtTime(1, now);
    listener.upZ.setValueAtTime(0, now);
  }

  private applyBedFilters(): void {
    const context = this.context;
    const graph = this.graph;
    if (!context || !graph) return;
    const now = context.currentTime;
    graph.arrivalFilter.frequency.setTargetAtTime(
      this.bedFilters.arrivalHz,
      now,
      0.5
    );
    graph.woodlandBedFilter.frequency.setTargetAtTime(
      this.bedFilters.woodlandHz,
      now,
      0.5
    );
    graph.campFilter.frequency.setTargetAtTime(this.bedFilters.campHz, now, 0.5);
    graph.fireBedFilter.frequency.setTargetAtTime(
      this.bedFilters.fireHz,
      now,
      0.35
    );
    graph.ledBedFilter.frequency.setTargetAtTime(
      this.bedFilters.ledHz,
      now,
      0.35
    );
    graph.crowdBedFilter.frequency.setTargetAtTime(
      this.bedFilters.crowdHz,
      now,
      0.4
    );
  }

  private applyMix(): void {
    const context = this.context;
    const graph = this.graph;
    if (!context || !graph) return;
    const now = context.currentTime;
    graph.master.gain.setTargetAtTime(this.mix.master * 0.22, now, 0.18);
    graph.arrivalGain.gain.setTargetAtTime(this.mix.arrival * 0.09, now, 0.8);
    graph.woodlandGain.gain.setTargetAtTime(
      this.mix.woodland * 0.055,
      now,
      1.1
    );
    graph.campGain.gain.setTargetAtTime(this.mix.camp * 0.075, now, 0.75);
    graph.fireGain.gain.setTargetAtTime(this.mix.fire * 0.28, now, 0.24);
    graph.ledGain.gain.setTargetAtTime(this.mix.led * 0.035, now, 0.32);
    graph.crowdGain.gain.setTargetAtTime(this.mix.crowd * 0.12, now, 0.4);
  }
}
