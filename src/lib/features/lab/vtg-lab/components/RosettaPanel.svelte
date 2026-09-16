<script lang="ts">
	/**
	 * RosettaPanel - Visual VTG <-> TKA reference.
	 * Every concept gets a rendered pictograph example.
	 */

	import CollapsibleLabSection from "$lib/shared/components/lab/CollapsibleLabSection.svelte";
	import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
	import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
	import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
	import { getSettings } from "$lib/shared/application/state/app-state.svelte";
	import { getModeChains, expandChain } from "../domain/vtg-sequence-data";
	import { TURN_RATIO_MAPPINGS } from "../domain/vtg-pattern-data";
	import BeyondVtgPanel from "./BeyondVtgPanel.svelte";

	// ─── Prop types from user settings ───
	const leftPropType = $derived.by(() => {
		const settings = getSettings();
		return (settings.leftPropType ?? settings.propType ?? PropType.STAFF) as PropType;
	});

	const rightPropType = $derived.by(() => {
		const settings = getSettings();
		return (settings.rightPropType ?? settings.propType ?? PropType.STAFF) as PropType;
	});

	const examples = $derived.by(() => {
		const ss = getModeChains("SS");
		const ts = getModeChains("TS");
		const qs = getModeChains("QS");

		return {
			a: expandChain(ss[0]!, leftPropType, rightPropType)[0],
			b: expandChain(ss[1]!, leftPropType, rightPropType)[0],
			c: expandChain(ss[2]!, leftPropType, rightPropType)[0],
			g: expandChain(ts[0]!, leftPropType, rightPropType)[0],
			s: expandChain(qs[0]!, leftPropType, rightPropType)[0],
		};
	});

	interface ConceptDef {
		vtg: string;
		tka: string;
		desc: string;
		letter: string;
		key: "a" | "b" | "c" | "g" | "s";
	}

	const TIMING: ConceptDef[] = [
		{ vtg: "Split", tka: "Alpha", desc: "Hands at opposite grid points", letter: "A", key: "a" },
		{ vtg: "Together", tka: "Beta", desc: "Hands at the same grid point", letter: "G", key: "g" },
		{ vtg: "Quarter", tka: "Gamma", desc: "Hands form a right angle", letter: "S", key: "s" },
	];

	const SPIN: ConceptDef[] = [
		{ vtg: "Inspin", tka: "Pro", desc: "Prop rotates with hand path", letter: "A", key: "a" },
		{ vtg: "Antispin", tka: "Anti", desc: "Prop rotates against hand path", letter: "B", key: "b" },
		{ vtg: "Hybrid", tka: "Hybrid", desc: "One hand pro, one hand anti", letter: "C", key: "c" },
	];

	const SHAPES: ConceptDef[] = [
		{ vtg: "Extension", tka: "Pro, 0 turns", desc: "No extra rotation (0 petals)", letter: "A", key: "a" },
		{ vtg: "Cat-eye", tka: "Anti, 0 turns", desc: "Lens shape (2 petals)", letter: "B", key: "b" },
	];

	// ─── Source documents ───
	interface DocCard {
		title: string;
		subtitle: string;
		url: string;
		icon: string;
	}

	const VTG1_DOC: DocCard = {
		title: "Vulcan Tech Gospel",
		subtitle: "Noel Yee  \u00b7  2010  \u00b7  The original framework",
		url: "http://noelyee.weebly.com/uploads/7/2/9/6/7296674/vulcan_tech_gospel.pdf",
		icon: "fa-scroll",
	};

	const VTG2_DOCS: DocCard[] = [
		{ title: "Index 1/3", subtitle: "Pattern catalog", url: "https://noelyee.com/wp-content/uploads/2015/09/vtg2index.pdf", icon: "fa-file-pdf" },
		{ title: "Index 2/3", subtitle: "Pattern catalog", url: "https://noelyee.com/wp-content/uploads/2015/09/vtg2index2of3.pdf", icon: "fa-file-pdf" },
		{ title: "Index 3/3", subtitle: "Pattern catalog", url: "https://noelyee.com/wp-content/uploads/2015/09/vtg2index3of3.pdf", icon: "fa-file-pdf" },
		{ title: "Chapter 1", subtitle: "Theory", url: "https://noelyee.com/wp-content/uploads/2015/09/vtg2ch1.pdf", icon: "fa-file-pdf" },
		{ title: "Chapter 2", subtitle: "Applications", url: "https://noelyee.com/wp-content/uploads/2015/09/vtg2chapter2_.pdf", icon: "fa-file-pdf" },
	];

	const OTHER_DOCS: DocCard[] = [
		{ title: "Book of P.H.A.T.", subtitle: "Nichols, Thompson, Cantor, Yee", url: "https://sirlorq.wordpress.com/wp-content/uploads/2013/05/bop-manual-small.pdf", icon: "fa-book" },
		{ title: "Pattern Tiles", subtitle: "64 visual patterns", url: "https://sirlorq.wordpress.com/wp-content/uploads/2013/05/bop-tiles-small.pdf", icon: "fa-th" },
		{ title: "Noel Yee", subtitle: "Official site", url: "https://noelyee.com/instruction/vulcan-tech-gospel/", icon: "fa-globe" },
		{ title: "DrexFactor", subtitle: "VTG Explained", url: "https://drexfactor.com/weirdscience/2015/11/25/vulcan_tech_gospel_vtg_explained", icon: "fa-graduation-cap" },
	];

	// ─── Supplementary terms (concepts without pictograph representation) ───
	const EXTRA_TERMS = [
		{ vtg: "Downbeat", tka: "No equivalent", desc: "VTG anchors timing to the lowest point of the circle (6 o\u2019clock). TKA uses grid center instead." },
		{ vtg: "Stall", tka: "Static", desc: "Prop stops momentarily. In TKA, zero-turn static motion at a grid point." },
		{ vtg: "Wall plane", tka: "Wall", desc: "Prop spins in a vertical circle facing the audience." },
		{ vtg: "Wheel plane", tka: "Wheel", desc: "Prop spins in a vertical circle at the spinner\u2019s side." },
	];
</script>

<div class="rosetta-panel">
	<!-- Reference Frames -->
	<section class="concept-section">
		<div class="section-header">
			<i class="fas fa-eye section-icon" aria-hidden="true"></i>
			<h2>Two Reference Frames</h2>
			<div class="header-line"></div>
		</div>

		<div class="frame-cards">
			<div class="frame-card">
				<div class="frame-icon-box">
					<i class="fas fa-arrow-down" aria-hidden="true"></i>
				</div>
				<div class="frame-body">
					<h3>VTG: Ground-Referenced</h3>
					<p>
						Anchored to the <strong>downbeat</strong> (bottom of the circle).
						Timing = when props cross the downbeat.
						Direction = same way or opposite ways.
					</p>
				</div>
			</div>

			<div class="frame-card">
				<div class="frame-icon-box">
					<i class="fas fa-crosshairs" aria-hidden="true"></i>
				</div>
				<div class="frame-body">
					<h3>TKA: Center-Referenced</h3>
					<p>
						Anchored to the <strong>grid center</strong>.
						Placement = where hands sit on the grid.
						Motion type = how hands move between grid points.
					</p>
				</div>
			</div>
		</div>
	</section>

	<!-- Timing -->
	<section class="concept-section">
		<div class="section-header">
			<i class="fas fa-clock section-icon" aria-hidden="true"></i>
			<h2>Timing</h2>
			<div class="header-line"></div>
		</div>

		<div class="concept-grid three-col">
			{#each TIMING as concept (concept.vtg)}
				<div class="concept-card">
					<div class="concept-picto">
						{#if examples[concept.key]}
							<PictographContainer
								pictographData={examples[concept.key]}
								gridMode={GridMode.DIAMOND}
							/>
						{/if}
					</div>
					<div class="concept-letter">{concept.letter}</div>
					<div class="concept-mapping">
						<span class="from-label">{concept.vtg}</span>
						<i class="fas fa-arrow-right mapping-arrow" aria-hidden="true"></i>
						<span class="to-label">{concept.tka}</span>
					</div>
					<p class="concept-desc">{concept.desc}</p>
				</div>
			{/each}
		</div>
	</section>

	<!-- Spin Type -->
	<section class="concept-section">
		<div class="section-header">
			<i class="fas fa-sync-alt section-icon" aria-hidden="true"></i>
			<h2>Spin Type</h2>
			<div class="header-line"></div>
		</div>

		<div class="concept-grid three-col">
			{#each SPIN as concept (concept.vtg)}
				<div class="concept-card">
					<div class="concept-picto">
						{#if examples[concept.key]}
							<PictographContainer
								pictographData={examples[concept.key]}
								gridMode={GridMode.DIAMOND}
							/>
						{/if}
					</div>
					<div class="concept-letter">{concept.letter}</div>
					<div class="concept-mapping">
						<span class="from-label">{concept.vtg}</span>
						<i class="fas fa-arrow-right mapping-arrow" aria-hidden="true"></i>
						<span class="to-label">{concept.tka}</span>
					</div>
					<p class="concept-desc">{concept.desc}</p>
				</div>
			{/each}
		</div>
	</section>

	<!-- Shapes -->
	<section class="concept-section">
		<div class="section-header">
			<i class="fas fa-fan section-icon" aria-hidden="true"></i>
			<h2>Shapes</h2>
			<div class="header-line"></div>
		</div>

		<div class="concept-grid two-col">
			{#each SHAPES as concept (concept.vtg)}
				<div class="concept-card">
					<div class="concept-picto">
						{#if examples[concept.key]}
							<PictographContainer
								pictographData={examples[concept.key]}
								gridMode={GridMode.DIAMOND}
							/>
						{/if}
					</div>
					<div class="concept-letter">{concept.letter}</div>
					<div class="concept-mapping">
						<span class="from-label">{concept.vtg}</span>
						<i class="fas fa-arrow-right mapping-arrow" aria-hidden="true"></i>
						<span class="to-label">{concept.tka}</span>
					</div>
					<p class="concept-desc">{concept.desc}</p>
				</div>
			{/each}
		</div>
	</section>

	<!-- Additional Terms -->
	<CollapsibleLabSection title="More Terminology" icon="fa-list" accentColor="orange">
		<div class="extra-terms">
			{#each EXTRA_TERMS as term (term.vtg)}
				<div class="extra-term-row">
					<div class="extra-term-labels">
						<span class="from-label">{term.vtg}</span>
						<i class="fas fa-arrow-right mapping-arrow" aria-hidden="true"></i>
						<span class="to-label">{term.tka}</span>
					</div>
					<p class="extra-term-desc">{term.desc}</p>
				</div>
			{/each}
		</div>
	</CollapsibleLabSection>

	<!-- Turn Ratios -->
	<section class="concept-section">
		<div class="section-header">
			<i class="fas fa-calculator section-icon" aria-hidden="true"></i>
			<h2>Turn Ratios</h2>
			<div class="header-line"></div>
		</div>

		<div class="formula-row">
			<div class="formula-card">
				<span class="formula-label">Conversion</span>
				<span class="formula-value">TKA = (VTG - 1) / 2</span>
			</div>
			<div class="formula-card">
				<span class="formula-label">Inspin petals</span>
				<span class="formula-value">ratio - 1</span>
			</div>
			<div class="formula-card">
				<span class="formula-label">Antispin petals</span>
				<span class="formula-value">ratio + 1</span>
			</div>
		</div>

		<div class="ratio-cards">
			{#each TURN_RATIO_MAPPINGS as mapping (mapping.vtgRatio)}
				<div class="ratio-card">
					<div class="ratio-values">
						<span class="ratio-from">{mapping.vtgRatio}</span>
						<i class="fas fa-arrow-right mapping-arrow" aria-hidden="true"></i>
						<span class="ratio-to">{mapping.tkaTurns} turns</span>
					</div>
					<p class="ratio-desc">{mapping.vtgDescription}</p>
				</div>
			{/each}
		</div>
	</section>

	<!-- Source Documents -->
	<section class="concept-section">
		<div class="section-header">
			<i class="fas fa-archive section-icon" aria-hidden="true"></i>
			<h2>Source Documents</h2>
			<div class="header-line"></div>
		</div>

		<a
			class="doc-hero"
			href={VTG1_DOC.url}
			target="_blank"
			rel="noopener noreferrer"
		>
			<div class="doc-hero-bg"></div>
			<div class="doc-hero-icon">
				<i class="fas {VTG1_DOC.icon}" aria-hidden="true"></i>
			</div>
			<div class="doc-hero-info">
				<span class="doc-hero-title">{VTG1_DOC.title}</span>
				<span class="doc-hero-subtitle">{VTG1_DOC.subtitle}</span>
			</div>
			<div class="doc-hero-arrow">
				<i class="fas fa-arrow-right" aria-hidden="true"></i>
			</div>
		</a>

		<div class="doc-group-label">VTG 2 Beta</div>
		<div class="doc-grid">
			{#each VTG2_DOCS as doc (doc.title)}
				<a
					class="doc-card"
					href={doc.url}
					target="_blank"
					rel="noopener noreferrer"
				>
					<div class="doc-card-icon">
						<i class="fas {doc.icon}" aria-hidden="true"></i>
					</div>
					<div class="doc-card-info">
						<span class="doc-card-title">{doc.title}</span>
						<span class="doc-card-subtitle">{doc.subtitle}</span>
					</div>
					<i class="fas fa-external-link-alt doc-card-ext" aria-hidden="true"></i>
				</a>
			{/each}
		</div>

		<div class="doc-group-label">Related Works</div>
		<div class="doc-grid">
			{#each OTHER_DOCS as doc (doc.title)}
				<a
					class="doc-card"
					href={doc.url}
					target="_blank"
					rel="noopener noreferrer"
				>
					<div class="doc-card-icon">
						<i class="fas {doc.icon}" aria-hidden="true"></i>
					</div>
					<div class="doc-card-info">
						<span class="doc-card-title">{doc.title}</span>
						<span class="doc-card-subtitle">{doc.subtitle}</span>
					</div>
					<i class="fas fa-external-link-alt doc-card-ext" aria-hidden="true"></i>
				</a>
			{/each}
		</div>
	</section>

	<!-- Beyond VTG -->
	<section class="concept-section">
		<div class="section-header">
			<i class="fas fa-rocket section-icon" aria-hidden="true"></i>
			<h2>Beyond VTG</h2>
			<div class="header-line"></div>
		</div>
		<BeyondVtgPanel />
	</section>
</div>

<style>
	.rosetta-panel {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		max-width: 1000px;
		margin: 0 auto;
		padding-bottom: 1.5rem;
	}

	.concept-section {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.section-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.section-icon {
		font-size: 1rem;
		color: var(--theme-accent);
		filter: drop-shadow(0 0 6px var(--theme-accent-glow));
	}

	h2 {
		margin: 0;
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--theme-text, #fff);
		white-space: nowrap;
	}

	.header-line {
		flex: 1;
		height: 1px;
		background: linear-gradient(
			to right,
			var(--theme-accent-glow, rgba(255, 255, 255, 0.15)),
			transparent
		);
	}

	.frame-cards {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}

	.frame-card {
		display: flex;
		gap: 0.75rem;
		padding: 1rem;
		border-radius: 12px;
		border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
		background: var(--theme-card-bg);
		transition: border-color var(--theme-transition, 150ms ease-out);
	}

	.frame-card:hover {
		border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.14));
	}

	.frame-icon-box {
		flex-shrink: 0;
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 10px;
		background: var(--theme-accent-bg);
		color: var(--theme-accent);
		font-size: 1.125rem;
	}

	.frame-body h3 {
		margin: 0 0 0.375rem;
		font-size: var(--font-size-min, 14px);
		font-weight: 600;
		color: var(--theme-text, #fff);
	}

	.frame-body p {
		margin: 0;
		font-size: var(--font-size-min, 14px);
		color: var(--theme-text-dim, rgba(255, 255, 255, 0.75));
		line-height: 1.5;
	}

	.frame-body p strong {
		color: var(--theme-text, #fff);
		font-weight: 600;
	}

	.concept-grid {
		display: grid;
		gap: 0.75rem;
	}

	.concept-grid.three-col {
		grid-template-columns: repeat(3, 1fr);
	}

	.concept-grid.two-col {
		grid-template-columns: repeat(2, 1fr);
	}

	.concept-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 1rem 0.75rem;
		border-radius: 12px;
		border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
		background: var(--theme-card-bg);
		transition:
			transform var(--theme-transition, 150ms ease-out),
			border-color var(--theme-transition, 150ms ease-out);
	}

	.concept-card:hover {
		transform: translateY(-2px);
		border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.14));
	}

	.concept-picto {
		width: 120px;
		height: 120px;
		margin-bottom: 0.5rem;
	}

	.concept-letter {
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--theme-text, #fff);
		margin-bottom: 0.375rem;
	}

	.concept-mapping {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		margin-bottom: 0.25rem;
	}

	.from-label {
		font-size: var(--font-size-min, 14px);
		font-weight: 600;
		color: var(--theme-text-dim, rgba(255, 255, 255, 0.75));
	}

	.mapping-arrow {
		font-size: 0.625rem;
		color: var(--theme-text-dim, rgba(255, 255, 255, 0.75));
		opacity: 0.4;
	}

	.to-label {
		font-size: var(--font-size-min, 14px);
		font-weight: 600;
		color: var(--theme-accent);
	}

	.concept-desc {
		margin: 0;
		font-size: var(--font-size-compact, 12px);
		color: var(--theme-text-dim, rgba(255, 255, 255, 0.75));
		text-align: center;
		line-height: 1.4;
	}

	/* ─── Extra Terms (collapsible) ─── */
	.extra-terms {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.extra-term-row {
		padding: 0.625rem 0.75rem;
		border-radius: 8px;
		background: var(--theme-card-bg);
		border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
	}

	.extra-term-labels {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		margin-bottom: 0.25rem;
	}

	.extra-term-desc {
		margin: 0;
		font-size: var(--font-size-compact, 12px);
		color: var(--theme-text-dim, rgba(255, 255, 255, 0.75));
		line-height: 1.4;
	}

	.formula-row {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.75rem;
	}

	.formula-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		padding: 0.75rem;
		border-radius: 10px;
		background: var(--theme-accent-bg);
		border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
	}

	.formula-label {
		font-size: var(--font-size-compact, 12px);
		font-weight: 500;
		color: var(--theme-text-dim, rgba(255, 255, 255, 0.75));
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.formula-value {
		font-size: var(--font-size-min, 14px);
		font-weight: 600;
		color: var(--theme-accent);
		font-family: "JetBrains Mono", "Fira Code", monospace;
	}

	.ratio-cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 0.75rem;
	}

	.ratio-card {
		padding: 0.75rem 1rem;
		border-radius: 10px;
		border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
		background: var(--theme-card-bg);
	}

	.ratio-values {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		margin-bottom: 0.25rem;
	}

	.ratio-from {
		font-size: 1.125rem;
		font-weight: 700;
		color: var(--theme-text, #fff);
	}

	.ratio-to {
		font-size: 1.125rem;
		font-weight: 700;
		color: var(--theme-accent);
	}

	.ratio-desc {
		margin: 0;
		font-size: var(--font-size-compact, 12px);
		color: var(--theme-text-dim, rgba(255, 255, 255, 0.75));
		line-height: 1.4;
	}

	/* ─── Source Document Hero Card ─── */
	.doc-hero {
		position: relative;
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1.25rem;
		border-radius: 12px;
		border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
		overflow: hidden;
		text-decoration: none;
		transition:
			transform var(--theme-transition, 150ms ease-out),
			border-color var(--theme-transition, 150ms ease-out);
	}

	.doc-hero:hover {
		transform: translateY(-2px);
		border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.14));
	}

	.doc-hero-bg {
		position: absolute;
		inset: 0;
		background: linear-gradient(
			135deg,
			var(--theme-accent-bg, rgba(255, 255, 255, 0.05)),
			var(--theme-card-bg, rgba(0, 0, 0, 0.75))
		);
		z-index: 0;
	}

	.doc-hero > * {
		position: relative;
		z-index: 1;
	}

	.doc-hero-icon {
		flex-shrink: 0;
		width: 48px;
		height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 12px;
		background: var(--theme-accent-bg);
		color: var(--theme-accent);
		font-size: 1.25rem;
	}

	.doc-hero-info {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		flex: 1;
	}

	.doc-hero-title {
		font-size: 1.125rem;
		font-weight: 700;
		color: var(--theme-text, #fff);
	}

	.doc-hero-subtitle {
		font-size: var(--font-size-min, 14px);
		color: var(--theme-text-dim, rgba(255, 255, 255, 0.75));
	}

	.doc-hero-arrow {
		flex-shrink: 0;
		width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		background: var(--theme-accent-bg);
		color: var(--theme-accent);
		font-size: 0.875rem;
		transition: transform var(--theme-transition, 150ms ease-out);
	}

	.doc-hero:hover .doc-hero-arrow {
		transform: translateX(3px);
	}

	.doc-group-label {
		font-size: var(--font-size-compact, 12px);
		font-weight: 600;
		color: var(--theme-text-dim, rgba(255, 255, 255, 0.75));
		text-transform: uppercase;
		letter-spacing: 0.04em;
		margin-top: 0.25rem;
	}

	.doc-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 0.75rem;
	}

	.doc-card {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		padding: 0.75rem;
		border-radius: 10px;
		border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
		background: var(--theme-card-bg);
		text-decoration: none;
		transition:
			transform var(--theme-transition, 150ms ease-out),
			border-color var(--theme-transition, 150ms ease-out);
	}

	.doc-card:hover {
		transform: translateY(-2px);
		border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.14));
	}

	.doc-card-icon {
		flex-shrink: 0;
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 8px;
		background: var(--theme-accent-bg);
		color: var(--theme-accent);
		font-size: 0.875rem;
	}

	.doc-card-info {
		display: flex;
		flex-direction: column;
		gap: 1px;
		flex: 1;
		min-width: 0;
	}

	.doc-card-title {
		font-size: var(--font-size-min, 14px);
		font-weight: 600;
		color: var(--theme-text, #fff);
	}

	.doc-card-subtitle {
		font-size: var(--font-size-compact, 12px);
		color: var(--theme-text-dim, rgba(255, 255, 255, 0.75));
	}

	.doc-card-ext {
		font-size: var(--font-size-compact, 12px);
		color: var(--theme-text-dim, rgba(255, 255, 255, 0.75));
		opacity: 0.3;
		flex-shrink: 0;
		transition: opacity var(--theme-transition, 150ms ease-out);
	}

	.doc-card:hover .doc-card-ext {
		opacity: 0.7;
	}

	@media (max-width: 700px) {
		.frame-cards {
			grid-template-columns: 1fr;
		}

		.concept-grid.three-col {
			grid-template-columns: repeat(2, 1fr);
		}

		.formula-row {
			grid-template-columns: 1fr;
		}

		.concept-picto {
			width: 100px;
			height: 100px;
		}
	}

	@media (max-width: 500px) {
		.concept-grid.three-col {
			grid-template-columns: 1fr;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.frame-card,
		.concept-card,
		.doc-hero,
		.doc-card,
		.doc-hero-arrow {
			transition: none;
		}
	}
</style>
