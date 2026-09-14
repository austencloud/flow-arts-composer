<!--
  Trochoid model artifact. These curves are TKA-owned SVG recreations generated
  from the exact parameters Zaltymbunk posted in the archived 2009 thread.
  The generator and the full seven-pattern set live with the CAPs article.
-->
<script lang="ts">
	let { active = false }: { active?: boolean } = $props();

	const PATTERNS = [
		{ file: "rosette-1-4.svg", notation: "1 4 ; 1 1", kind: "Inspin rosette" },
		{ file: "rosette-1-neg6.svg", notation: "1 -6 ; 1 1", kind: "Antispin rosette" },
		{ file: "cycloid-1-4.svg", notation: "1 4 ; 1 1/5", kind: "Cycloid" },
		{ file: "antispin-1-neg3.svg", notation: "1 -3 ; 1 1", kind: "Three-petal antispin" },
	] as const;
</script>

<div class="drafting" class:active>
	<div class="film">
		<div class="formula-row">
			<span class="formula">Θ₁ Θ₂ ; ρ₁ ρ₂</span>
			<span class="sheet-note">turns ; radii</span>
		</div>
		<div class="curve-grid">
			{#each PATTERNS as pattern (pattern.file)}
				<figure>
					<img
						src={`/caps/${pattern.file}`}
						alt={`${pattern.kind}, written ${pattern.notation}`}
						loading="lazy"
					/>
					<figcaption>
						<span>{pattern.notation}</span>
						<small>{pattern.kind}</small>
					</figcaption>
				</figure>
			{/each}
		</div>
	</div>
</div>

<style>
	.drafting {
		box-sizing: border-box;
		min-height: 0;
		grid-template-rows: minmax(0, 1fr);
		width: 100%;
		height: 100%;
		display: grid;
		place-items: center;
		padding: clamp(0.45rem, 2.4cqi, 1.35rem);
	}

	.film {
		box-sizing: border-box;
		min-height: 0;
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		gap: clamp(0.3rem, 1.4cqh, 0.75rem);
		width: min(100%, 48rem);
		height: min(100%, 38rem);
		padding: clamp(0.45rem, 2cqi, 1rem);
		border: 1px solid oklch(0.75 0.06 250 / 0.35);
		border-radius: 8px;
		background: oklch(0.94 0.01 250);
		box-shadow:
			0 14px 34px oklch(0 0 0 / 0.45),
			inset 0 0 60px oklch(0.8 0.05 250 / 0.15);
		transition: box-shadow 400ms ease;
		overflow: hidden;
	}

	.drafting.active .film {
		box-shadow:
			0 18px 44px oklch(0 0 0 / 0.5),
			0 0 30px oklch(0.75 0.1 250 / 0.25),
			inset 0 0 60px oklch(0.8 0.05 250 / 0.15);
	}

	.formula-row {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.75rem;
		padding-bottom: clamp(0.25rem, 0.8cqh, 0.5rem);
		border-bottom: 1px solid oklch(0.48 0.04 250 / 0.25);
	}

	.formula,
	figcaption span {
		font-family: ui-monospace, "Cascadia Code", monospace;
		font-variant-numeric: tabular-nums;
	}

	.formula {
		font-size: clamp(0.72rem, 3.4cqi, 1.35rem);
		font-weight: 700;
		color: oklch(0.28 0.07 250);
	}

	.sheet-note {
		font-size: clamp(0.55rem, 1.8cqi, 0.78rem);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: oklch(0.48 0.04 250);
		white-space: nowrap;
	}

	.curve-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		grid-template-rows: repeat(2, minmax(0, 1fr));
		gap: clamp(0.25rem, 1.2cqi, 0.7rem);
		min-height: 0;
	}

	figure {
		display: grid;
		grid-template-rows: minmax(0, 1fr) auto;
		min-width: 0;
		min-height: 0;
		margin: 0;
		padding: clamp(0.15rem, 0.8cqi, 0.45rem);
		border: 1px solid oklch(0.5 0.04 250 / 0.18);
		background: oklch(0.975 0.006 250 / 0.78);
	}

	figure img {
		display: block;
		width: 100%;
		height: 100%;
		min-height: 0;
		object-fit: contain;
	}

	figcaption {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.35rem;
		padding-top: 0.15rem;
		color: oklch(0.3 0.05 250);
		font-size: clamp(0.5rem, 1.5cqi, 0.72rem);
		line-height: 1.2;
	}

	figcaption small {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: oklch(0.5 0.035 250);
	}

	@container (max-width: 18rem) {
		.sheet-note,
		figcaption small {
			display: none;
		}

		figcaption {
			justify-content: center;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.film {
			transition: none;
		}
	}
</style>
