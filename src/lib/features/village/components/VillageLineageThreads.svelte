<!--
  VillageLineageThreads - A faint, low drift of light from each learner
  toward the person who taught them, in the sequence's stone colour. It is
  brightest at each person and fades with distance, and goes dark where it
  would cross a chair, the fire or a body (state/village-thread-path).
  Anyone whose teacher has died keeps a faint glow at their feet. A thread flares while its
  learner and teacher share the pause of recognition at the end of a lesson.
  An elder sitting out their last moments glows in the colour of what they
  know best; that glow goes out first when they pass.
  Someone who learned from the museum visitor has a thread to where the
  visitor stands, live, while the visitor is in the room; when they leave it
  holds where they last stood and goes dark like any other.

  Which threads exist is worked out per tick (state/village-lineage-threads);
  this only draws them. Lines and glows come from fixed pools built once, and
  each frame rewrites their vertices in place, so nothing is allocated while
  the village runs.
-->
<script lang="ts">
	import { onDestroy, untrack } from "svelte";
	import { T, useTask } from "@threlte/core";
	import {
		AdditiveBlending,
		BufferAttribute,
		BufferGeometry,
		CanvasTexture,
		Group,
		Line,
		LineBasicMaterial,
		Mesh,
		MeshBasicMaterial,
		PlaneGeometry,
	} from "three";
	import { getVillageContext } from "../state/village-context";
	import { planCampLayout, sequenceColour } from "../domain/village-campfire";
	import {
		THREAD_CLEARANCE,
		THREAD_SEGMENTS,
		writeThreadPath,
	} from "../state/village-thread-path";
	import {
		elderGlows,
		lineageGlows,
		lineageThreadOpacity,
		MAX_LINEAGE_THREADS,
		updateLineageThreads,
		type LineageThread,
	} from "../state/village-lineage-threads";
	import { passingFade, passingWindowSeconds } from "../state/village-passing-fade";
	import { VISITOR_ID } from "../domain/village-types";

	interface Props {
		// Where the visitor stands now, in village space, while they are in
		// the room; null (or left out) when they are not.
		visitor?: { x: number; z: number } | null;
	}

	const { visitor = null }: Props = $props();
	// Re-plan when the visitor arrives or leaves, not every step they take;
	// the drawn end follows them per frame below.
	const visitorHere = $derived(visitor !== null);

	const villageState = getVillageContext();
	const colourOf = (id: string) => sequenceColour(villageState.rules, id);

	const THREAD_OPACITY = 0.45;
	// Room for the chairs, the fire and more people than the village holds.
	const MAX_OBSTACLES = 64;
	const GLOW_OPACITY = 0.32;
	const GLOW_SIZE = 1.3;
	const ELDER_GLOW_OPACITY = 0.5;
	// Per second: how fast a thread flares, settles, and an elder's glow comes up.
	const FLARE_RISE = 4;
	const FLARE_FALL = 1.5;
	const GLOW_RISE = 1;

	const root = new Group();
	const lines: Line<BufferGeometry, LineBasicMaterial>[] = [];
	const brightness = new Float32Array(THREAD_SEGMENTS + 1);
	for (let i = 0; i < MAX_LINEAGE_THREADS; i++) {
		const geometry = new BufferGeometry();
		geometry.setAttribute(
			"position",
			new BufferAttribute(new Float32Array((THREAD_SEGMENTS + 1) * 3), 3),
		);
		// Grey per point: under additive blending, black is no light at all.
		geometry.setAttribute("color", new BufferAttribute(new Float32Array((THREAD_SEGMENTS + 1) * 3), 3));
		const material = new LineBasicMaterial({
			transparent: true,
			opacity: 0,
			vertexColors: true,
			blending: AdditiveBlending,
			depthWrite: false,
		});
		const line = new Line(geometry, material);
		line.visible = false;
		line.frustumCulled = false;
		lines.push(line);
		root.add(line);
	}

	const glowTexture = createGlowTexture();
	const glowGeometry = new PlaneGeometry(GLOW_SIZE, GLOW_SIZE);
	glowGeometry.rotateX(-Math.PI / 2);
	const glows: Mesh<PlaneGeometry, MeshBasicMaterial>[] = [];
	for (let i = 0; i < MAX_LINEAGE_THREADS; i++) {
		const glow = new Mesh(
			glowGeometry,
			new MeshBasicMaterial({
				map: glowTexture,
				transparent: true,
				opacity: GLOW_OPACITY,
				blending: AdditiveBlending,
				depthWrite: false,
			}),
		);
		glow.visible = false;
		glow.position.y = 0.02;
		glows.push(glow);
		root.add(glow);
	}

	function createGlowTexture(): CanvasTexture {
		const size = 64;
		const canvas = document.createElement("canvas");
		canvas.width = canvas.height = size;
		const context = canvas.getContext("2d")!;
		const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
		gradient.addColorStop(0, "rgba(255,255,255,1)");
		gradient.addColorStop(0.45, "rgba(255,255,255,0.35)");
		gradient.addColorStop(1, "rgba(255,255,255,0)");
		context.fillStyle = gradient;
		context.fillRect(0, 0, size, size);
		return new CanvasTexture(canvas);
	}

	const now = () => performance.now() / 1000;

	// Chairs and the fire never move; people are written in after them each
	// frame.
	const obstacles = new Float32Array(MAX_OBSTACLES * 3);
	const camp = planCampLayout(villageState.rules);
	let fixedObstacles = 0;
	for (const seat of camp.seats) {
		obstacles.set([seat.x, seat.z, THREAD_CLEARANCE.chair], fixedObstacles * 3);
		fixedObstacles++;
	}
	obstacles.set([camp.fire.x, camp.fire.z, THREAD_CLEARANCE.fire], fixedObstacles * 3);
	fixedObstacles++;

	interface Glow {
		id: string;
		colour: string;
		elder: boolean;
	}

	let threads: LineageThread[] = [];
	let glowList: Glow[] = [];
	// Eased per pair and per person, so a slot changing hands never jumps.
	const flare = new Map<string, number>();
	const glowLevel = new Map<string, number>();
	const passingSince = new Map<string, number>();

	// Re-plan once per sim tick, not per frame.
	$effect(() => {
		const avatars = villageState.snapshot.avatars;
		const here = visitorHere;
		threads = updateLineageThreads(
			threads,
			avatars,
			colourOf,
			now(),
			{ visitor: here ? untrack(() => visitor) : null },
		);
		const elders = elderGlows(avatars, colourOf);
		glowList = [
			...[...elders].map(([id, colour]) => ({ id, colour, elder: true })),
			...[...lineageGlows(avatars, colourOf)]
				.filter(([id]) => !elders.has(id))
				.map(([id, colour]) => ({ id, colour, elder: false })),
		];
		const t = now();
		for (const avatar of avatars) {
			if (avatar.state === "passing" && !passingSince.has(avatar.id)) passingSince.set(avatar.id, t);
		}
		const present = new Set(avatars.map((a) => a.id));
		for (const id of passingSince.keys()) if (!present.has(id)) passingSince.delete(id);
		for (const id of glowLevel.keys()) if (!glowList.some((g) => g.id === id)) glowLevel.delete(id);
		for (const key of flare.keys()) if (!threads.some((th) => th.key === key)) flare.delete(key);
		for (let i = 0; i < lines.length; i++) {
			const thread = threads[i];
			lines[i]!.visible = thread !== undefined;
			if (thread) lines[i]!.material.color.set(thread.colour);
		}
		for (let i = 0; i < glows.length; i++) {
			const entry = glowList[i];
			glows[i]!.visible = entry !== undefined;
			if (entry) glows[i]!.material.color.set(entry.colour);
		}
	});

	// Rendered positions, which ease between ticks.
	const records = $derived(new Map(villageState.avatarList.map((r) => [r.entityId, r])));

	const ease = (from: number, to: number, rise: number, fall: number, delta: number) =>
		to > from ? Math.min(to, from + rise * delta) : Math.max(to, from - fall * delta);

	useTask((delta) => {
		const t = now();
		const passingWindow = passingWindowSeconds(
			villageState.rules.population.passingTicks,
			villageState.rules.ticksPerSecond,
			villageState.speed,
		);
		let obstacleCount = fixedObstacles;
		const people = villageState.avatarList;
		for (let i = 0; i < people.length && obstacleCount < MAX_OBSTACLES; i++) {
			const at = people[i]!.instanceState.position;
			obstacles[obstacleCount * 3] = at.x;
			obstacles[obstacleCount * 3 + 1] = at.z;
			obstacles[obstacleCount * 3 + 2] = THREAD_CLEARANCE.body;
			obstacleCount++;
		}
		for (let i = 0; i < threads.length; i++) {
			const thread = threads[i]!;
			const learner = records.get(thread.learnerId)?.instanceState.position;
			if (!learner) continue;
			const live = thread.fadingSince === null;
			const teacher = !live
				? undefined
				: thread.teacherId === VISITOR_ID
					? (visitor ?? undefined)
					: records.get(thread.teacherId)?.instanceState.position;
			const tx = teacher?.x ?? thread.teacherX;
			const tz = teacher?.z ?? thread.teacherZ;
			const line = lines[i]!;
			const position = line.geometry.getAttribute("position") as BufferAttribute;
			const colour = line.geometry.getAttribute("color") as BufferAttribute;
			const shade = colour.array as Float32Array;
			writeThreadPath(
				learner.x,
				learner.z,
				tx,
				tz,
				obstacles,
				obstacleCount,
				position.array as Float32Array,
				brightness,
			);
			for (let s = 0; s <= THREAD_SEGMENTS; s++) {
				shade[s * 3] = shade[s * 3 + 1] = shade[s * 3 + 2] = brightness[s]!;
			}
			position.needsUpdate = true;
			colour.needsUpdate = true;
			const learnerNow = records.get(thread.learnerId)?.avatar;
			const recognising =
				learnerNow?.lessonPhase === "recognition" && learnerNow.partnerId === thread.teacherId;
			const level = ease(flare.get(thread.key) ?? 0, recognising ? 1 : 0, FLARE_RISE, FLARE_FALL, delta);
			flare.set(thread.key, level);
			line.material.opacity =
				(THREAD_OPACITY + (1 - THREAD_OPACITY) * level) * lineageThreadOpacity(thread, t);
		}
		for (let i = 0; i < glowList.length && i < glows.length; i++) {
			const glow = glowList[i]!;
			const at = records.get(glow.id)?.instanceState.position;
			if (!at) continue;
			glows[i]!.position.x = at.x;
			glows[i]!.position.z = at.z;
			if (!glow.elder) {
				glows[i]!.material.opacity = GLOW_OPACITY;
				continue;
			}
			const level = ease(glowLevel.get(glow.id) ?? 0, 1, GLOW_RISE, GLOW_RISE, delta);
			glowLevel.set(glow.id, level);
			const since = passingSince.get(glow.id);
			const fade = since === undefined ? 1 : passingFade(t - since, passingWindow).glow;
			glows[i]!.material.opacity = ELDER_GLOW_OPACITY * level * fade;
		}
	});

	onDestroy(() => {
		for (const line of lines) {
			line.geometry.dispose();
			line.material.dispose();
		}
		for (const glow of glows) glow.material.dispose();
		glowGeometry.dispose();
		glowTexture.dispose();
	});
</script>

<T is={root} />
