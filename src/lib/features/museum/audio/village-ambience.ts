/**
 * The Room of Collaboration's sound: the village fire and the night around it.
 *
 * Built live with Web Audio, so there are no files and no licences. The fire's
 * body is the Flow Fest fire-jam recipe (seeded brown noise through a 940 Hz
 * bandpass with a slow breath); its crackle and the crickets are seeded sample
 * loops made here; the leaves are the Flow Fest woodland recipe (noise above
 * 2.1 kHz) with a slow gust. Distance uses the Flow Fest audio field: the fire
 * is louder and brighter near it, the night bed stays even.
 *
 * Sound plays through the museum soundscape player's proceduralOutput(), so
 * it waits for the first gesture and follows mute and master volume. Cues
 * (data/village-sound-cues.json) lift, sink or add air for a few seconds.
 * There is no music here.
 */

import {
	flowFestAudioDistanceLowpassHz,
	flowFestAudioRolloffGain,
} from "#lib/features/flow-fest-sim/domain/flow-fest-audio-field.js";
import type { VillageSoundCue } from "../data/village-sound-cues";
import {
	MOMENT_SWEEPS,
	isMomentEffect,
	momentSamples,
	type VillageMomentEffect,
} from "./village-moment-sounds";
import { brownNoiseSamples, seededRandom, VILLAGE_NOISE_SEED } from "./village-noise";

/** Loudest the fire gets, right beside it, before the master volume. */
const FIRE_LEVEL = 0.55;
/** The fire never drops fully away inside the room. */
const FIRE_FLOOR = 0.1;
const NIGHT_LEVEL = 0.16;
/**
 * Scales an air-swell cue's level to the bed. Unscaled, the low noise at
 * level 0.4 sat 17 dB over the bed at the audience distance (measured on
 * /test/village-sound); with this it adds about 2 dB there, like a flare.
 */
const AIR_LEVEL = 0.1;
/**
 * Scales a one-shot moment sound (village-moment-sounds.ts) to the bed: at
 * level 0.5 it lands about 3 dB over the bed at the audience distance
 * (measured offline), a little above a flare, since it carries the moment.
 */
const MOMENT_LEVEL = 0.12;
/** Within this the fire is at full level; beyond it, inverse distance. */
const FIRE_REF_METERS = 2.5;
const FIRE_MAX_METERS = 45;
const FADE_IN_SECONDS = 2.5;
const FADE_OUT_SECONDS = 1.5;
const UPDATE_INTERVAL_SECONDS = 0.1;

export interface VillageAmbienceMix {
	fireGain: number;
	fireLowpassHz: number;
	nightGain: number;
}

/** How the room sounds from `distance` metres off the fire. */
export function villageAmbienceMix(distanceToFireMeters: number): VillageAmbienceMix {
	const near = flowFestAudioRolloffGain(distanceToFireMeters, FIRE_REF_METERS, FIRE_MAX_METERS, 1);
	return {
		fireGain: FIRE_LEVEL * Math.max(FIRE_FLOOR, near),
		fireLowpassHz: flowFestAudioDistanceLowpassHz(distanceToFireMeters),
		// The night is a touch fuller away from the fire's cover.
		nightGain: NIGHT_LEVEL * (0.75 + 0.25 * (1 - near)),
	};
}

/** A seeded loop of wood crackle: sparse, short, decaying clicks and pops. */
export function crackleSamples(sampleRate: number, seconds = 6): Float32Array {
	const out = new Float32Array(Math.round(sampleRate * seconds));
	const random = seededRandom(0x2f1a7c3b);
	let at = 0;
	while (true) {
		// About seven crackles a second, unevenly spaced.
		at += Math.round(sampleRate * (0.02 + random() * random() * 0.5));
		if (at >= out.length) break;
		const pop = random() < 0.08;
		const length = Math.round(sampleRate * (pop ? 0.02 : 0.002 + random() * 0.008));
		const amplitude = pop ? 0.8 + random() * 0.2 : 0.15 + random() * 0.45;
		for (let i = 0; i < length && at + i < out.length; i++) {
			const decay = Math.exp((-5 * i) / length);
			out[at + i] = (out[at + i] ?? 0) + (random() * 2 - 1) * amplitude * decay;
		}
	}
	return out;
}

/** A seeded loop of two crickets: short pulse trains near 4.5 kHz. */
export function cricketSamples(sampleRate: number, seconds = 5): Float32Array {
	const out = new Float32Array(Math.round(sampleRate * seconds));
	const random = seededRandom(0x6c8e9f21);
	for (const voice of [
		{ hz: 4600, period: 0.85, level: 0.5 },
		{ hz: 4150, period: 1.2, level: 0.32 },
	]) {
		let at = random() * voice.period;
		while (at < seconds) {
			const pulses = 3 + Math.floor(random() * 2);
			for (let p = 0; p < pulses; p++) {
				const start = Math.round((at + p * 0.03) * sampleRate);
				const length = Math.round(0.014 * sampleRate);
				for (let i = 0; i < length && start + i < out.length; i++) {
					const envelope = Math.sin((Math.PI * i) / length);
					const phase = (2 * Math.PI * voice.hz * i) / sampleRate;
					out[start + i] = (out[start + i] ?? 0) + Math.sin(phase) * envelope * voice.level;
				}
			}
			at += voice.period * (0.85 + random() * 0.3);
		}
	}
	return out;
}

export interface VillageAmbienceOutput {
	// An OfflineAudioContext renders the room to a file (village-sound-render.ts).
	context: BaseAudioContext;
	destination: AudioNode;
}

interface Graph {
	context: BaseAudioContext;
	room: GainNode;
	fire: GainNode;
	fireCue: GainNode;
	fireLowpass: BiquadFilterNode;
	night: GainNode;
	air: GainNode;
	sources: AudioScheduledSourceNode[];
}

function loopBuffer(context: BaseAudioContext, samples: Float32Array): AudioBuffer {
	const buffer = context.createBuffer(1, samples.length, context.sampleRate);
	buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
	return buffer;
}

function buildGraph({ context, destination }: VillageAmbienceOutput, noiseSeed: number): Graph {
	const sources: AudioScheduledSourceNode[] = [];
	const loop = (buffer: AudioBuffer, offset = 0) => {
		const source = context.createBufferSource();
		source.buffer = buffer;
		source.loop = true;
		source.start(context.currentTime, offset);
		sources.push(source);
		return source;
	};
	const breathe = (target: AudioParam, hz: number, depth: number) => {
		const lfo = context.createOscillator();
		lfo.frequency.value = hz;
		const amount = context.createGain();
		amount.gain.value = depth;
		lfo.connect(amount).connect(target);
		lfo.start();
		sources.push(lfo);
	};

	const room = context.createGain();
	room.gain.value = 0;
	room.connect(destination);
	const noise = loopBuffer(context, brownNoiseSamples(context.sampleRate, 4, noiseSeed));

	// Fire: body and crackle share the distance gain and air absorption.
	const fire = context.createGain();
	const fireCue = context.createGain();
	const fireLowpass = context.createBiquadFilter();
	fireLowpass.type = "lowpass";
	fire.connect(fireCue).connect(fireLowpass).connect(room);

	const bodyFilter = context.createBiquadFilter();
	bodyFilter.type = "bandpass";
	bodyFilter.frequency.value = 940;
	bodyFilter.Q.value = 0.56;
	const body = context.createGain();
	body.gain.value = 0.72;
	breathe(body.gain, 0.7, 0.18);
	loop(noise).connect(bodyFilter).connect(body).connect(fire);

	const crackleFilter = context.createBiquadFilter();
	crackleFilter.type = "highpass";
	crackleFilter.frequency.value = 1800;
	const crackle = context.createGain();
	crackle.gain.value = 0.5;
	loop(loopBuffer(context, crackleSamples(context.sampleRate))).connect(crackleFilter).connect(crackle).connect(fire);

	// Night: crickets and leaves, the same everywhere in the room.
	const night = context.createGain();
	night.connect(room);
	const crickets = context.createGain();
	crickets.gain.value = 0.35;
	loop(loopBuffer(context, cricketSamples(context.sampleRate))).connect(crickets).connect(night);

	const leavesFilter = context.createBiquadFilter();
	leavesFilter.type = "highpass";
	leavesFilter.frequency.value = 2100;
	const leaves = context.createGain();
	leaves.gain.value = 0.5;
	breathe(leaves.gain, 0.09, 0.3);
	loop(noise, 2).connect(leavesFilter).connect(leaves).connect(night);

	// Air: silent until a cue swells it.
	const airFilter = context.createBiquadFilter();
	airFilter.type = "lowpass";
	airFilter.frequency.value = 260;
	const air = context.createGain();
	air.gain.value = 0;
	loop(noise, 1).connect(airFilter).connect(air).connect(room);

	return { context, room, fire, fireCue, fireLowpass, night, air, sources };
}

export class VillageAmbience {
	private graph: Graph | null = null;
	private active = false;
	private sinceUpdate = UPDATE_INTERVAL_SECONDS;
	private stopTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(
		private readonly output: () => VillageAmbienceOutput | null,
		// The fire, leaves and air all draw on this noise (village-noise.ts).
		private readonly noiseSeed = VILLAGE_NOISE_SEED,
	) {}

	/**
	 * Call each frame. `active` is whether the visitor is in the room; the
	 * distance is from the listener (the camera) to the fire.
	 */
	update(active: boolean, distanceToFireMeters: number, deltaSeconds: number): void {
		if (active !== this.active) {
			this.active = active;
			if (active) this.fadeIn();
			else this.fadeOut();
		}
		// Before the first gesture there is no output yet; keep asking.
		if (this.active && !this.graph) this.fadeIn();
		if (!this.active || !this.graph) return;
		this.sinceUpdate += deltaSeconds;
		if (this.sinceUpdate < UPDATE_INTERVAL_SECONDS) return;
		this.sinceUpdate = 0;
		const { context, fire, fireLowpass, night } = this.graph;
		const mix = villageAmbienceMix(distanceToFireMeters);
		const now = context.currentTime;
		fire.gain.setTargetAtTime(mix.fireGain, now, 0.15);
		fireLowpass.frequency.setTargetAtTime(mix.fireLowpassHz, now, 0.15);
		night.gain.setTargetAtTime(mix.nightGain, now, 0.3);
	}

	/**
	 * Play one cue from the room's cue list; ignored while the room is quiet.
	 * `at` (context seconds, default now) lets a render schedule every cue
	 * before it starts, in time order.
	 */
	play(cue: VillageSoundCue, at?: number): void {
		if (!this.active || !this.graph) return;
		if (isMomentEffect(cue.effect)) {
			this.playMoment(cue, cue.effect, at);
			return;
		}
		const { context, fireCue, air } = this.graph;
		const target = cue.effect === "air-swell" ? air.gain : fireCue.gain;
		const rest = cue.effect === "air-swell" ? 0 : 1;
		const peak =
			cue.effect === "fire-flare"
				? 1 + cue.level
				: cue.effect === "fire-gutter"
					? 1 - cue.level
					: cue.level * AIR_LEVEL;
		const start = at ?? context.currentTime;
		// Ramps from the value now; a render scheduling ahead (`at`) gets the
		// resting value, so its cues on one effect must not overlap.
		target.cancelScheduledValues(start);
		target.setValueAtTime(target.value, start);
		target.linearRampToValueAtTime(peak, start + cue.attack);
		target.setValueAtTime(peak, start + cue.attack + cue.hold);
		target.linearRampToValueAtTime(rest, start + cue.attack + cue.hold + cue.release);
	}

	/**
	 * A one-shot: its seeded samples, the length of the cue, through its
	 * filter sweep and the cue's envelope into the room, so the room's fade,
	 * mute and master volume still apply. It stops on its own.
	 */
	private playMoment(cue: VillageSoundCue, effect: VillageMomentEffect, at?: number): void {
		if (!this.graph) return;
		const { context, room } = this.graph;
		const seconds = cue.attack + cue.hold + cue.release;
		const samples = momentSamples(effect, context.sampleRate, seconds);
		const source = context.createBufferSource();
		source.buffer = loopBuffer(context, samples);

		const sweep = MOMENT_SWEEPS[effect];
		const filter = context.createBiquadFilter();
		filter.type = sweep.type;
		filter.Q.value = sweep.q;
		const start = at ?? context.currentTime;
		filter.frequency.setValueAtTime(sweep.from, start);
		filter.frequency.exponentialRampToValueAtTime(sweep.to, start + seconds);

		const envelope = context.createGain();
		const peak = cue.level * MOMENT_LEVEL;
		envelope.gain.setValueAtTime(0, start);
		envelope.gain.linearRampToValueAtTime(peak, start + cue.attack);
		envelope.gain.setValueAtTime(peak, start + cue.attack + cue.hold);
		envelope.gain.linearRampToValueAtTime(0, start + seconds);

		source.connect(filter).connect(envelope).connect(room);
		source.onended = () => envelope.disconnect();
		source.start(start);
	}

	dispose(): void {
		this.active = false;
		this.stop();
	}

	private fadeIn(): void {
		if (this.stopTimer) clearTimeout(this.stopTimer);
		this.stopTimer = null;
		if (!this.graph) {
			const output = this.output();
			if (!output) return;
			this.graph = buildGraph(output, this.noiseSeed);
			this.sinceUpdate = UPDATE_INTERVAL_SECONDS;
		}
		const { context, room } = this.graph;
		room.gain.cancelScheduledValues(context.currentTime);
		room.gain.setTargetAtTime(1, context.currentTime, FADE_IN_SECONDS / 3);
	}

	private fadeOut(): void {
		if (!this.graph) return;
		const { context, room } = this.graph;
		room.gain.cancelScheduledValues(context.currentTime);
		room.gain.setTargetAtTime(0, context.currentTime, FADE_OUT_SECONDS / 3);
		// Stop the loops once they are silent, so an empty room costs nothing.
		this.stopTimer = setTimeout(() => this.stop(), FADE_OUT_SECONDS * 1500);
	}

	private stop(): void {
		if (this.stopTimer) clearTimeout(this.stopTimer);
		this.stopTimer = null;
		if (!this.graph) return;
		for (const source of this.graph.sources) source.stop();
		this.graph.room.disconnect();
		this.graph = null;
	}
}
