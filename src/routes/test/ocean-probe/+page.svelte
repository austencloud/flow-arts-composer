<!--
  Ocean Probe — the 2D ocean background, alone, instrumented.

  Diagnostic harness for the fish-twitch / fish-population investigation.
  Two modes over one orchestrator instance:

  - LIVE: painted to a canvas on rAF at true device resolution, with the real
    mouse wired to setPointer, so cursor-flee behaves as it does in the app.
  - HEADLESS: window.__ocean.runHeadless(n) steps update() on a fixed timestep
    in a tight loop, so thousands of simulated seconds run in under a second and
    the numbers don't depend on tab focus or frame pacing.

  Detectors log to the console as they fire (teleports, direction ping-pong,
  frozen fish) plus a rolling summary every 10s. Nothing else is on this page —
  no app chrome, no BackgroundHost, no visibility gate.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { OceanBackgroundOrchestrator } from '@austencloud/backgrounds';

	type Dir = 1 | -1;
	interface ProbeFish {
		x: number;
		y: number;
		baseY: number;
		direction: Dir;
		targetDirection?: Dir;
		behavior: string;
		species: string;
		mood?: string;
		speed: number;
		baseSpeed: number;
		schoolId?: number;
		fleeTimer: number;
		huntState?: string;
		fishId?: number;
		z: number;
	}

	/** A single-frame position jump this large (px) is not swimming. */
	const TELEPORT_PX = 24;
	/** Direction flips closer together than this (s) are a buzz, not a turn. */
	const PING_PONG_SEC = 0.5;
	/** Fish whose baseY hasn't moved in this many frames is stuck. */
	const FROZEN_FRAMES = 300;

	let canvasEl: HTMLCanvasElement | undefined = $state();
	let hud = $state('booting…');
	let liveStats = $state({ fish: 0, teleports: 0, pingPongs: 0, frozen: 0 });

	onMount(() => {
		let raf = 0;
		let disposed = false;
		let dims = { width: 0, height: 0 };

		const sys = (OceanBackgroundOrchestrator as any).create();

		function makeCollector() {
			interface Track {
				dir: Dir;
				behavior: string;
				x: number;
				baseY: number;
				lastFlipStep: number;
				stillFrames: number;
			}
			const prev = new Map<object, Track>();
			const s = {
				steps: 0,
				flips: 0,
				pingPongFlips: 0,
				flipGaps: [] as number[],
				flipSource: {} as Record<string, number>,
				teleports: 0,
				teleportMax: 0,
				teleportByBehavior: {} as Record<string, number>,
				frozenFish: new Set<number>(),
				turnsEntered: 0,
				nullTurns: 0,
				despawns: 0,
				behaviorSteps: {} as Record<string, number>,
				orphanedHuntSteps: 0,
				huntStateSteps: 0,
				fishSeries: [] as number[],
				bubbleSeries: [] as number[]
			};
			let seen = new Set<object>();
			/** Detectors log at most this many times each, so live mode stays readable. */
			const logBudget = { teleport: 12, pingPong: 8, frozen: 6 };

			const sample = (verbose: boolean) => {
				const fish: ProbeFish[] = sys.getFish();
				const st = sys.state;
				s.steps++;
				const next = new Set<object>();

				for (const f of fish as unknown as object[]) {
					next.add(f);
					const ff = f as unknown as ProbeFish;
					s.behaviorSteps[ff.behavior] = (s.behaviorSteps[ff.behavior] ?? 0) + 1;

					// A predator/prey pinned in a hunt state that no live hunt owns
					// never re-decides — FishDecisionMaker short-circuits on huntState.
					if (ff.huntState === 'stalking' || ff.huntState === 'chasing') {
						s.huntStateSteps++;
						const hunts = (sys.getFishAnimator?.().getHuntingHandler?.() as any)?.activeHunts;
						const owned = hunts instanceof Map ? hunts.has(ff.fishId ?? -1) : false;
						if (!owned) s.orphanedHuntSteps++;
					}

					const p = prev.get(f);
					if (p) {
						// Teleport: a position delta no swim speed can produce in one frame.
						const jump = Math.hypot(ff.x - p.x, ff.baseY - p.baseY);
						if (jump > TELEPORT_PX) {
							s.teleports++;
							s.teleportMax = Math.max(s.teleportMax, jump);
							const key = `${p.behavior}→${ff.behavior}`;
							s.teleportByBehavior[key] = (s.teleportByBehavior[key] ?? 0) + 1;
							if (verbose && logBudget.teleport-- > 0) {
								console.warn(
									`[teleport] fish#${ff.fishId} ${jump.toFixed(1)}px  ${key}  ` +
										`baseY ${p.baseY.toFixed(1)}→${ff.baseY.toFixed(1)}  x ${p.x.toFixed(1)}→${ff.x.toFixed(1)}`
								);
							}
						}

						// Ping-pong: repeated direction flips inside a fraction of a second.
						// `direction` is mirrored instantly by the renderer, so a flip is a
						// visible snap; two in quick succession is the twitch.
						if (p.dir !== ff.direction) {
							s.flips++;
							const gapSec = (s.steps - p.lastFlipStep) / 60;
							const src = ff.fleeTimer > 0 ? 'cursor-flee' : p.behavior;
							s.flipSource[src] = (s.flipSource[src] ?? 0) + 1;
							if (p.lastFlipStep > 0) {
								s.flipGaps.push(gapSec);
								if (gapSec < PING_PONG_SEC) {
									s.pingPongFlips++;
									if (verbose && logBudget.pingPong-- > 0) {
										console.warn(
											`[ping-pong] fish#${ff.fishId} flipped again after ${gapSec.toFixed(3)}s  ` +
												`behavior=${ff.behavior} hunt=${ff.huntState ?? '-'} x=${ff.x.toFixed(0)}`
										);
									}
								}
							}
							prev.set(f, { ...p, dir: ff.direction, lastFlipStep: s.steps });
						}

						// Frozen: a fish that has stopped moving in BOTH axes.
						// Checking baseY alone is useless — bob is added at render
						// (y = baseY + bob), so a fish cruising straight across the
						// screen legitimately holds baseY constant, and a baseY-only
						// test flags nearly the whole population.
						const still =
							Math.hypot(ff.x - p.x, ff.baseY - p.baseY) < 0.05 * (ff.baseSpeed / 60 + 1);
						const stillFrames = still ? p.stillFrames + 1 : 0;
						if (stillFrames === FROZEN_FRAMES) {
							s.frozenFish.add(ff.fishId ?? -1);
							if (verbose && logBudget.frozen-- > 0) {
								console.warn(
									`[frozen] fish#${ff.fishId} baseY pinned at ${ff.baseY.toFixed(1)} for ` +
										`${FROZEN_FRAMES} frames  behavior=${ff.behavior} hunt=${ff.huntState ?? '-'} x=${ff.x.toFixed(1)}`
								);
							}
						}

						if (p.behavior !== 'turning' && ff.behavior === 'turning') {
							s.turnsEntered++;
							// A turn whose target heading already equals the current heading
							// changes nothing but still plays the full slowdown + arc.
							if (ff.targetDirection === ff.direction) s.nullTurns++;
						}

						const cur = prev.get(f)!;
						prev.set(f, {
							...cur,
							behavior: ff.behavior,
							x: ff.x,
							baseY: ff.baseY,
							stillFrames
						});
					} else {
						prev.set(f, {
							dir: ff.direction,
							behavior: ff.behavior,
							x: ff.x,
							baseY: ff.baseY,
							lastFlipStep: 0,
							stillFrames: 0
						});
					}
				}

				for (const old of seen) if (!next.has(old)) s.despawns++;
				seen = next;

				if (s.steps % 60 === 0) {
					s.fishSeries.push(fish.length);
					s.bubbleSeries.push(st.bubbles.length);
				}
			};

			const report = () => {
				const total = Object.values(s.behaviorSteps).reduce((a, b) => a + b, 0) || 1;
				const fishN = s.fishSeries[0] || 1;
				const simMin = s.steps / 60 / 60 || 1;
				const gaps = [...s.flipGaps].sort((a, b) => a - b);
				const median = gaps[Math.floor(gaps.length / 2)] ?? null;
				return {
					simulatedSeconds: +(s.steps / 60).toFixed(1),
					quality: (sys as any).quality,
					population: {
						fishFirst: s.fishSeries[0],
						fishLast: s.fishSeries[s.fishSeries.length - 1],
						bubblesFirst: s.bubbleSeries[0],
						bubblesLast: s.bubbleSeries[s.bubbleSeries.length - 1]
					},
					despawnsPerMin: +(s.despawns / simMin).toFixed(2),
					teleports: {
						total: s.teleports,
						perMin: +(s.teleports / simMin).toFixed(2),
						maxPx: +s.teleportMax.toFixed(1),
						byTransition: s.teleportByBehavior
					},
					headingFlips: {
						total: s.flips,
						perFishPerMin: +(s.flips / fishN / simMin).toFixed(2),
						pingPongFlips: s.pingPongFlips,
						medianGapSec: median === null ? null : +median.toFixed(3),
						bySourceBehavior: s.flipSource
					},
					frozenFish: [...s.frozenFish],
					huntState: {
						steps: s.huntStateSteps,
						orphanedSteps: s.orphanedHuntSteps,
						orphanRate:
							s.huntStateSteps > 0
								? ((s.orphanedHuntSteps / s.huntStateSteps) * 100).toFixed(1) + '%'
								: 'n/a'
					},
					turns: {
						entered: s.turnsEntered,
						nullTurns: s.nullTurns,
						nullTurnRate:
							s.turnsEntered > 0
								? ((s.nullTurns / s.turnsEntered) * 100).toFixed(1) + '%'
								: 'n/a'
					},
					behaviorMix: Object.fromEntries(
						Object.entries(s.behaviorSteps)
							.sort((a, b) => b[1] - a[1])
							.map(([k, v]) => [k, ((v / total) * 100).toFixed(1) + '%'])
					)
				};
			};

			return { sample, report, raw: s };
		}

		let collector = makeCollector();

		/** Step the sim `frames` times with no rendering and no wall clock. */
		function runHeadless(frames: number, opts?: { pointer?: { x: number; y: number } }) {
			if (opts?.pointer) sys.setPointer(opts.pointer.x, opts.pointer.y, true);
			else sys.setPointer(0, 0, false);
			for (let i = 0; i < frames; i++) {
				sys.update(dims, 1);
				collector.sample(false);
			}
			const r = collector.report();
			console.log('[ocean-probe] headless report', r);
			return r;
		}

		/**
		 * Size the backing store in CSS pixels, with NO devicePixelRatio scale.
		 *
		 * This matches BackgroundHost, which sets canvas.width/height straight
		 * from getBoundingClientRect(). Fish are sized in absolute backing-store
		 * px, so multiplying dimensions by DPR halves their apparent size — the
		 * probe has to use the app's convention or it misreports scale.
		 */
		function resize() {
			if (!canvasEl) return;
			const w = Math.max(1, Math.floor(window.innerWidth));
			const h = Math.max(1, Math.floor(window.innerHeight));
			canvasEl.width = w;
			canvasEl.height = h;
			dims = { width: w, height: h };
		}

		const onPointerMove = (e: PointerEvent) => {
			sys.setPointer(e.clientX, e.clientY, true);
		};
		const onPointerLeave = () => sys.setPointer(0, 0, false);

		const boot = async () => {
			resize();
			await sys.initialize(dims, 'high', { spawnFishOnScreen: true });
			collector = makeCollector();

			window.addEventListener('resize', resize);
			window.addEventListener('pointermove', onPointerMove);
			window.addEventListener('pointerleave', onPointerLeave);

			(window as any).__ocean = {
				sys,
				get dims() {
					return dims;
				},
				runHeadless,
				report: () => collector.report(),
				reset: () => {
					collector = makeCollector();
				},
				fish: () => sys.getFish(),
				setQuality: async (q: string) => {
					await sys.initialize(dims, q, { spawnFishOnScreen: true });
					collector = makeCollector();
				}
			};
			console.log(
				`[ocean-probe] ready — ${dims.width}x${dims.height} backing store. ` +
					`Detectors: teleport >${TELEPORT_PX}px/frame, ping-pong <${PING_PONG_SEC}s between flips, ` +
					`frozen ${FROZEN_FRAMES} frames. window.__ocean.{report,runHeadless,reset,fish,setQuality}`
			);
			hud = 'ready';

			const ctx = canvasEl?.getContext('2d');
			let lastSummary = 0;
			if (ctx) {
				const loop = (t: number) => {
					if (disposed) return;
					raf = requestAnimationFrame(loop);
					sys.update(dims, 1);
					sys.draw(ctx, dims);
					collector.sample(true);

					const r = collector.raw;
					liveStats = {
						fish: sys.getFish().length,
						teleports: r.teleports,
						pingPongs: r.pingPongFlips,
						frozen: r.frozenFish.size
					};
					hud =
						`${dims.width}×${dims.height} · ${liveStats.fish} fish · ` +
						`${r.teleports} teleports · ${r.pingPongFlips} ping-pongs · ${r.frozenFish.size} frozen`;

					if (t - lastSummary > 10000) {
						lastSummary = t;
						console.log('[ocean-probe] 10s summary', collector.report());
					}
				};
				raf = requestAnimationFrame(loop);
			}
		};
		boot();

		return () => {
			disposed = true;
			cancelAnimationFrame(raf);
			window.removeEventListener('resize', resize);
			window.removeEventListener('pointermove', onPointerMove);
			window.removeEventListener('pointerleave', onPointerLeave);
			sys.dispose?.();
		};
	});
</script>

<svelte:head><title>Ocean Probe</title></svelte:head>

<canvas bind:this={canvasEl} class="stage"></canvas>
<div class="hud">{hud}</div>

<style>
	:global(body) {
		margin: 0;
		background: #04101c;
		overflow: hidden;
	}
	.stage {
		/* behind the status bar: the full-screen probe canvas, its readout clears the bar */
		position: fixed;
		inset: 0;
		width: 100vw;
		height: 100vh;
		display: block;
	}
	.hud {
		position: fixed;
		top: calc(0.5rem + var(--safe-top));
		left: 0.5rem;
		padding: 0.4rem 0.7rem;
		font: 12px ui-monospace, monospace;
		color: #cfe9ff;
		background: rgba(4, 16, 28, 0.7);
		border-radius: 6px;
		pointer-events: none;
	}
</style>
