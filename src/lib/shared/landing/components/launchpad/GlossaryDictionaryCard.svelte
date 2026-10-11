<!--
  GlossaryDictionaryCard.svelte

  Living media for the homepage Glossary tile: cycles through real TKA
  glossary term/definition pairs, styled like a dictionary entry (headword +
  category tag + gloss), crossfading between entries.

  Data source: the same canonical GLOSSARY the live /atlas route renders
  (src/routes/(public)/atlas/+page.server.ts imports it from "@tka/domain"
  too). This is a small curated excerpt of real keys — the definition text is
  read live from GLOSSARY at render time, never retyped, so it can't drift
  into fabricated copy. `category` is the entry's real GlossaryCategory value
  (e.g. "position", "general"), shown verbatim as the dictionary-style tag —
  not an invented part-of-speech label.

  Text is cheap content, so this uses the plain `Crossfade` primitive in
  `fill` mode per crossfade-primitive.md (no CellRenderer remount concern
  applies to text). The definition is line-clamped to a fixed number of
  lines so the box footprint never changes between entries of very different
  lengths (no-layout-shift.md) — Crossfade's `fill` mode already guarantees
  the outer box size comes from the parent, not the content, so the clamp
  only has to keep each individual entry from overflowing that fixed box.

  Cycling freezes under prefers-reduced-motion (see PictographFadeCard.svelte
  for the identical rationale — Crossfade alone only removes the fade, not
  the underlying swap).
-->
<script lang="ts">
	import Crossfade from "#lib/shared/components/Crossfade.svelte";
	import { DURATION } from "#lib/shared/transitions/transitions.js";
	import { GLOSSARY } from "@tka/domain";

	let {
		intervalMs = 7500,
		startDelayMs = 0,
	}: { intervalMs?: number; startDelayMs?: number } = $props();

	// Curated excerpt of real GLOSSARY keys: short, self-contained entries that
	// read cleanly at tile scale. None of these need the display-name overrides
	// the live /atlas page applies to acronyms (vtg, pads, cw, ...), so a
	// plain title-case of the key matches +page.server.ts's displayName()
	// fallback branch exactly.
	const KEYS = ["alpha", "beta", "gamma", "letter", "word", "glyph", "bridge", "compound"] as const;

	function titleCase(key: string): string {
		return key.charAt(0).toUpperCase() + key.slice(1);
	}

	interface Entry {
		term: string;
		category: string;
		definition: string;
	}

	const BY_KEY = new Map(Object.entries(GLOSSARY));
	const ENTRIES: Entry[] = KEYS.flatMap((k) => {
		const e = BY_KEY.get(k);
		return e ? [{ term: titleCase(k), category: e.category, definition: e.definition }] : [];
	});

	let index = $state(0);
	const current = $derived(ENTRIES[index % ENTRIES.length]);

	$effect(() => {
		if (ENTRIES.length < 2) return;

		let timer: ReturnType<typeof setInterval> | undefined;
		let starter: ReturnType<typeof setTimeout> | undefined;
		const mql = window.matchMedia("(prefers-reduced-motion: reduce)");

		function stop() {
			if (starter) clearTimeout(starter);
			if (timer) clearInterval(timer);
			starter = undefined;
			timer = undefined;
		}

		function start() {
			stop();
			if (mql.matches) return;
			starter = setTimeout(() => {
				timer = setInterval(() => {
					index = (index + 1) % ENTRIES.length;
				}, intervalMs);
			}, startDelayMs);
		}

		start();
		mql.addEventListener("change", start);
		return () => {
			stop();
			mql.removeEventListener("change", start);
		};
	});
</script>

<div class="dictionary-card">
	<Crossfade key={current?.term ?? index} duration={DURATION.dramatic} fill>
		{#if current}
			<div class="entry">
				<p class="headword">
					{current.term}<span class="cat">{current.category}</span>
				</p>
				<p class="def">{current.definition}</p>
			</div>
		{/if}
	</Crossfade>
</div>

<style>
	.dictionary-card {
		position: relative;
		width: 100%;
		height: 100%;
	}
	.entry {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 0.3rem;
	}
	.headword {
		margin: 0;
		display: flex;
		align-items: baseline;
		gap: 0.45em;
		font-family: "Cormorant Garamond", Georgia, serif;
		font-style: italic;
		font-weight: 700;
		font-size: 1.15rem;
		color: var(--c);
	}
	.cat {
		font-family: "Cormorant Garamond", Georgia, serif;
		font-style: italic;
		font-weight: 400;
		font-size: 0.68rem;
		letter-spacing: 0.02em;
		color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
		opacity: 0.75;
	}
	.def {
		margin: 0;
		font-size: 0.8rem;
		line-height: 1.4;
		color: var(--theme-text-dim, rgba(255, 255, 255, 0.68));
		display: -webkit-box;
		-webkit-line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
