import {
	NOTATION_CATALOG,
	type CatalogEntry,
	type CatalogSource,
} from "$lib/shared/notation/notation-catalog";

export type ArchiveLaneId = "notation" | "languages" | "teaching" | "research";

/**
 * Evidence is described per claim, not with one record-wide badge. The five
 * bases are the 2026-08-23 living-evidence model: they say what kind of
 * support a claim has, never how important the record is.
 */
export type EvidenceBasis =
	| "directly-observed"
	| "creators-account"
	| "community-attested"
	| "independently-corroborated"
	| "unresolved";

export const EVIDENCE_BASIS_LABELS: Record<EvidenceBasis, string> = {
	"directly-observed": "Directly observed",
	"creators-account": "Creator's account",
	"community-attested": "Community attested",
	"independently-corroborated": "Independently corroborated",
	unresolved: "Unresolved",
};

/**
 * Activity is two verified endpoints, never a lifespan. A record with no
 * activity claim asserts nothing beyond its documented trace. `active` means
 * a dated public trace from the current review cycle. `archive-online` means
 * the material survives but its former community is dormant. `unknown` means
 * the latest trace is older and the archive makes no claim past it.
 */
export interface ArchiveActivity {
	status: "active" | "archive-online" | "unknown";
	lastVerifiedYear: number;
	note: string;
}

export interface ArchiveLane {
	id: ArchiveLaneId;
	label: string;
	description: string;
}

export interface ArchiveCitation {
	label: string;
	href: string;
	supports: string;
	basis: EvidenceBasis;
}

export interface ArchiveDocument {
	id: string;
	title: string;
	shortTitle: string;
	pdfHref: string;
	pageImagePrefix: string;
	pageCount: number;
	note: string;
}

export interface ArchiveEntry {
	id: string;
	lane: ArchiveLaneId;
	dateLabel: string;
	firstDocumentedYear: number;
	activity?: ArchiveActivity;
	title: string;
	shortTitle: string;
	people: string;
	summary: string;
	evidenceBasis: EvidenceBasis;
	evidenceLabel: string;
	evidenceShortLabel: string;
	evidenceNote?: string;
	citations: ArchiveCitation[];
	documents?: ArchiveDocument[];
	catalogEntry?: CatalogEntry;
}

export interface ArchiveCluster {
	id: string;
	lane: ArchiveLaneId;
	label: string;
	dateLabel: string;
	startYear: number;
	endYear: number;
	entryIds: string[];
}

export interface ArchiveTrackPlacement {
	entry: ArchiveEntry;
	track: number;
	position: number;
	spanEnd: number;
}

export const ARCHIVE_START_YEAR = 1994;
export const ARCHIVE_END_YEAR = 2026;
export const ARCHIVE_YEAR_TICKS = [1994, 2002, 2010, 2018, 2026] as const;

export const ARCHIVE_LANES: ArchiveLane[] = [
	{
		id: "notation",
		label: "Recording Systems",
		description: "Published systems that turn movement into a record.",
	},
	{
		id: "languages",
		label: "Movement Languages",
		description: "Shared geometries and vocabularies used to discuss movement.",
	},
	{
		id: "teaching",
		label: "Teaching & Archives",
		description:
			"Lessons, teaching communities, and archives.",
	},
	{
		id: "research",
		label: "Research & Experiments",
		description:
			"Public experiments testing new ways to describe movement.",
	},
];

/**
 * Four distinct records land in almost the same two calendar years. Treating
 * them as four overlapping ticks made the archive illegible and implied a
 * precision the sources do not support. The overview names the density; the
 * inline expansion preserves every record without stretching calendar time.
 */
export const ARCHIVE_CLUSTERS: ArchiveCluster[] = [
	{
		id: "movement-language-foundations",
		lane: "languages",
		label: "4 related records",
		dateLabel: "2009–2010",
		startYear: 2009,
		endYear: 2010,
		entryIds: ["caps", "trochoid", "nine-square", "vtg"],
	},
];

const CATALOG_CLASSIFICATION: Record<
	string,
	{
		lane: ArchiveLaneId;
		shortTitle: string;
		firstDocumentedYear: number;
		dateLabel?: string;
		activity?: ArchiveActivity;
		evidenceBasis: EvidenceBasis;
		evidenceLabel?: string;
		evidenceNote?: string;
	}
> = {
	caps: {
		lane: "languages",
		shortTitle: "CAPs",
		firstDocumentedYear: 2009,
		evidenceBasis: "creators-account",
	},
	trochoid: {
		lane: "languages",
		shortTitle: "Trochoid",
		firstDocumentedYear: 2009,
		evidenceBasis: "independently-corroborated",
	},
	vtg: {
		lane: "languages",
		shortTitle: "VTG",
		firstDocumentedYear: 2010,
		dateLabel: "2010 → 2026",
		evidenceBasis: "directly-observed",
		activity: {
			status: "active",
			lastVerifiedYear: 2026,
			note: "VTG 4 was announced on August 29, 2026. The linked apps were checked on September 8, 2026.",
		},
	},
	"nine-square": {
		lane: "languages",
		shortTitle: "9-Square",
		firstDocumentedYear: 2010,
		evidenceBasis: "directly-observed",
	},
	qft: {
		lane: "notation",
		shortTitle: "QFT",
		firstDocumentedYear: 2011,
		evidenceBasis: "independently-corroborated",
	},
	lorq: {
		lane: "notation",
		shortTitle: "Lorq",
		firstDocumentedYear: 2012,
		// The catalog's "2012–" implied open-ended activity; the cited sources
		// establish the publications, not current practice.
		dateLabel: "2012",
		evidenceBasis: "directly-observed",
	},
	poinotation: {
		lane: "notation",
		shortTitle: "PoiNotation",
		firstDocumentedYear: 2016,
		evidenceBasis: "directly-observed",
		evidenceLabel: "Repository record",
	},
	tka: {
		lane: "notation",
		shortTitle: "TKA",
		firstDocumentedYear: 2022,
		evidenceBasis: "directly-observed",
		evidenceLabel: "Current guide",
		activity: {
			status: "active",
			lastVerifiedYear: 2026,
			note: "The guide explains the letters and pictographs used in Flow Arts Composer.",
		},
	},
};

const CATALOG_SOURCE_SUPPORTS: Record<
	string,
	{ supports: string; basis: EvidenceBasis }[]
> = {
	caps: [
		{
			supports:
				"The 2009 discussion where participants named and described Continuous Assembly Patterns.",
			basis: "creators-account",
		},
	],
	trochoid: [
		{
			supports: "The model's parameters, equations, and Zaltymbunk attribution.",
			basis: "directly-observed",
		},
		{
			supports:
				"The 2009 discussion comparing approaches to modelling poi movement.",
			basis: "community-attested",
		},
	],
	vtg: [
		{
			supports:
				"The guide and chapter credits, with Noel Yee’s account of the project’s aims.",
			basis: "directly-observed",
		},
		{
			supports:
				"Yee’s February 2019 VTG 3 announcement and a look back at the earlier transition work.",
			basis: "creators-account",
		},
		{
			supports:
				"The VTG 3 draft and its six-by-six grid, with separate hand and prop relationships. Credits Yee, Cantor, and McKenney.",
			basis: "directly-observed",
		},
		{
			supports:
				"The VTG 3 app listing credits MCP and Yee. Reviews date back to July 2019.",
			basis: "directly-observed",
		},
		{
			supports:
				"The VTG 3 grid with animated patterns. Its About page credits Yee, Cantor, and McKenney.",
			basis: "directly-observed",
		},
		{
			supports:
				"The VTG Crew identifies Mentive’s SpiroAnim work as a translation of the VTG 3 grid into elemental terminology.",
			basis: "creators-account",
		},
		{
			supports:
				"The August 29 launch calls Mentive’s application VTG 4 and describes quarter placement, quarter timing and ratios beyond 1:1, 1:3 and 1:5.",
			basis: "creators-account",
		},
		{
			supports:
				"In his reply to the launch post, Mentive credits other practitioners for the concepts and describes his contribution as definitions, exploration and visualization.",
			basis: "creators-account",
		},
		{
			supports:
				"The VTG 4 reference and grids, including separate explanations of quarter timing and quarter placement.",
			basis: "directly-observed",
		},
	],
	"nine-square": [
		{
			supports:
				"Charlie Cushing’s eleven-part series on the nine-point grid.",
			basis: "directly-observed",
		},
	],
	qft: [
		{
			supports:
				"The original primer, including the formula and contributor credits.",
			basis: "creators-account",
		},
		{
			supports:
				"The same primer in Ben Drexler's archive, including diagrams missing from the forum copy.",
			basis: "independently-corroborated",
		},
	],
	lorq: [
		{
			supports: "The Book of P.H.A.T. and its published matrices.",
			basis: "directly-observed",
		},
		{
			supports:
				"The 324 Patterns catalog and Nichols' description of its structure.",
			basis: "directly-observed",
		},
		{
			supports: "Nichols' public video archive and LORQ:TECH authorship.",
			basis: "directly-observed",
		},
		{
			supports: "Nichols’ original 144 Shape Matrix sheet and his description of its 2014 rework.",
			basis: "directly-observed",
		},
	],
	poinotation: [
		{
			supports:
				"Tiffany Fong’s code and documentation, with examples of the notation.",
			basis: "directly-observed",
		},
	],
	tka: [
		{
			supports:
				"The current Kinetic Alphabet guide, including its letters, pictographs, and sequence notation.",
			basis: "directly-observed",
		},
	],
};

function catalogCitation(
	entryId: string,
	source: CatalogSource,
	sourceIndex: number
): ArchiveCitation {
	const claim = CATALOG_SOURCE_SUPPORTS[entryId]?.[sourceIndex];
	return {
		label: source.label,
		href: source.href,
		supports:
			claim?.supports ??
			"Source for this entry.",
		basis: claim?.basis ?? "directly-observed",
	};
}

const catalogEntries: ArchiveEntry[] = NOTATION_CATALOG.map((catalogEntry) => {
	const classification = CATALOG_CLASSIFICATION[catalogEntry.id];
	if (!classification) {
		throw new Error(`Missing archive classification for ${catalogEntry.id}`);
	}

	return {
		id: catalogEntry.id,
		lane: classification.lane,
		dateLabel: classification.dateLabel ?? catalogEntry.year,
		firstDocumentedYear: classification.firstDocumentedYear,
		activity: classification.activity,
		title: catalogEntry.system,
		shortTitle: classification.shortTitle,
		people: catalogEntry.people,
		summary: catalogEntry.records,
		evidenceBasis: classification.evidenceBasis,
		evidenceLabel: classification.evidenceLabel ?? "Sources",
		evidenceShortLabel:
			catalogEntry.id === "poinotation"
				? "Repository"
				: EVIDENCE_BASIS_LABELS[classification.evidenceBasis],
		evidenceNote: classification.evidenceNote,
		citations: catalogEntry.sources.map((source, sourceIndex) =>
			catalogCitation(catalogEntry.id, source, sourceIndex)
		),
		catalogEntry,
	};
});

const researchEntries: ArchiveEntry[] = [
	{
		id: "modern-club-swinging",
		lane: "teaching",
		dateLabel: "1994",
		firstDocumentedYear: 1994,
		title: "Modern Club Swinging and Pole Spinning",
		shortTitle: "Jillings",
		people: "Anna Jillings (now Anna Semlyen), illustrated by Julie Wilson",
		summary:
			"Twenty lessons on club swinging and related pole techniques, including alternating timing, grips, and transitions. Read the complete book and further articles free on the author’s Cosmos Jugglers website.",
		evidenceBasis: "creators-account",
		evidenceLabel: "Author's online edition",
		evidenceShortLabel: "Author source",
		evidenceNote:
			"Published in 1994, with Julie Wilson’s illustrations based on Anna Jillings’ sketches.",
		// The author serves these files over HTTP; the HTTPS URLs do not load.
		// Keep this record link-only. The personal reading copy is not a site asset.
		citations: [
			{
				label: "Read the complete book",
				href: "http://www.semlyen.net/cosmosjugglers/lib/contents.htm",
				supports: "20 lessons, chapters, and pole articles.",
				basis: "creators-account",
			},
			{
				label: "Lesson 6: Reels",
				href: "http://www.semlyen.net/cosmosjugglers/lib/lesson6.pdf",
				supports: "Alternating timing, club reels, and pole holds.",
				basis: "directly-observed",
			},
			{
				label: "Author and illustrator",
				href: "http://www.semlyen.net/cosmosjugglers/lib/ackbook.htm",
				supports: "Original author and illustrator credits.",
				basis: "creators-account",
			},
			{
				label: "Earlier teaching resources",
				href: "http://www.semlyen.net/cosmosjugglers/lib/bibcs.htm",
				supports: "Earlier teaching and publication details.",
				basis: "creators-account",
			},
		],
	},
	{
		id: "home-of-poi",
		lane: "teaching",
		dateLabel: "1998",
		firstDocumentedYear: 1998,
		activity: {
			status: "archive-online",
			lastVerifiedYear: 2026,
			note: "Lessons and forum discussions remain available in the online archive.",
		},
		title: "Home of Poi",
		shortTitle: "Home of Poi",
		people: "Malcolm Crawshay and the Home of Poi community",
		summary:
			"Malcolm Crawshay launched Home of Poi in 1998 as an online poi school. Its lessons and hundreds of thousands of forum posts document how spinners taught techniques, discussed safety, and debated what to call their moves.",
		evidenceBasis: "creators-account",
		evidenceLabel: "Organization history",
		evidenceShortLabel: "Org source",
		evidenceNote:
			"Home of Poi gives October 26, 1998 as its launch date.",
		citations: [
			{
				label: "Home of Poi: Our mission and values",
				href: "https://www.homeofpoi.com/us/company/information-mission.php",
				supports:
					"The 1998 launch, founder Malcolm Crawshay, and the site's teaching mission.",
				basis: "creators-account",
			},
			{
				label: "Home of Poi forum archive",
				href: "https://www.homeofpoi.com/us/community/forums/",
				supports:
					"Discussions of poi technique, safety, and community life.",
				basis: "directly-observed",
			},
			{
				label: "How do you define a weave?, 2002",
				href: "https://www.homeofpoi.com/en/community/forums/topics/120838/How-do-you-define-a-weave",
				supports:
					"Spinners discussing how to define and teach a weave in 2002.",
				basis: "community-attested",
			},
		],
	},
	{
		id: "fan-alphabet",
		lane: "languages",
		dateLabel: "documented 2019",
		firstDocumentedYear: 2019,
		activity: {
			status: "active",
			lastVerifiedYear: 2026,
			note: "Flow Collective Chicago advertised a Fan Alphabet workshop in 2026.",
		},
		title: "Fan Alphabet",
		shortTitle: "Fan Alphabet",
		people:
			"A community vocabulary. Clarissa Ohm is an early documented teacher.",
		summary:
			"A vocabulary for relationships between fans and the transitions that connect them. The linked teaching posts use the name Fan Alphabet in 2019 and 2026.",
		evidenceBasis: "unresolved",
		evidenceLabel: "Attribution unresolved",
		evidenceShortLabel: "Unresolved",
		evidenceNote:
			"The vocabulary’s origin remains unclear. Clarissa Ohm’s 2019 teaching post is the earliest source linked here.",
		citations: [
			{
				label: "Clarissa Ohm: Intro to Tech Fans discussion, 2019",
				href: "https://www.reddit.com/r/flowarts/comments/e2kulk",
				supports:
					"Ohm’s 2019 tutorial plan includes a Fan Alphabet lesson.",
				basis: "creators-account",
			},
			{
				label: "Flow Collective Chicago workshop post, 2026",
				href: "https://www.instagram.com/p/DbjxPAnRUmC/",
				supports:
					"A 2026 workshop advertised as Fan Alphabet.",
				basis: "community-attested",
			},
		],
	},
	{
		id: "quarter-space-tech",
		lane: "languages",
		dateLabel: "PDF archive · 2024",
		firstDocumentedYear: 2024,
		title: "Quarter Space Tech",
		shortTitle: "QST",
		people: "Mentive, based on Alex Kurowski's grid",
		summary:
			"Mentive’s three diagram collections contain 228 patterns, based on Alex Kurowski’s grid. They cover Quarter “Time” Breaks, Quarter “Time” Advanced, and Quarter Space Beyond.",
		evidenceBasis: "creators-account",
		evidenceLabel: "Creator attribution and preserved documents",
		evidenceShortLabel: "Creator source",
		evidenceNote:
			"These PDFs were exported from quarterspace.tech on March 15, 2024. The archive uses that export date. The system’s creation date is unknown. Mentive credits Alex Kurowski’s grid as the basis for his documents.",
		citations: [
			{
				label: 'Quarter “Time” Breaks, complete PDF',
				href: "/history/sources/quarter-space-tech/quarter-time-breaks.pdf",
				supports:
					"The seven-page diagram set and its 56 Quarter “Time” Break patterns.",
				basis: "directly-observed",
			},
			{
				label: 'Quarter “Time” Advanced, complete PDF',
				href: "/history/sources/quarter-space-tech/quarter-time-advanced.pdf",
				supports:
					"The sixteen-page diagram set and its 64 advanced patterns.",
				basis: "directly-observed",
			},
			{
				label: "Quarter Space Beyond, complete PDF",
				href: "/history/sources/quarter-space-tech/quarter-space-beyond.pdf",
				supports:
					"The twenty-seven-page diagram set and its 108 beyond patterns.",
				basis: "directly-observed",
			},
			{
				label: "SpiroAnim Quarter Space Tech document archive",
				href:
					"https://github.com/rbgirard/spiroanim/tree/main/public/docs/qst",
				supports:
					"Mentive's public software archive containing all three PDF exports.",
				basis: "directly-observed",
			},
		],
		documents: [
			{
				id: "breaks",
				title: 'Quarter “Time” Breaks',
				shortTitle: "Breaks",
				pdfHref:
					"/history/sources/quarter-space-tech/quarter-time-breaks.pdf",
				pageImagePrefix:
					"/images/history/quarter-space-tech/breaks",
				pageCount: 7,
				note: "56 patterns in seven parts, on seven diagram pages.",
			},
			{
				id: "advanced",
				title: 'Quarter “Time” Advanced',
				shortTitle: "Advanced",
				pdfHref:
					"/history/sources/quarter-space-tech/quarter-time-advanced.pdf",
				pageImagePrefix:
					"/images/history/quarter-space-tech/advanced",
				pageCount: 16,
				note: "64 advanced patterns on sixteen diagram pages.",
			},
			{
				id: "beyond",
				title: "Quarter Space Beyond",
				shortTitle: "Beyond",
				pdfHref:
					"/history/sources/quarter-space-tech/quarter-space-beyond.pdf",
				pageImagePrefix:
					"/images/history/quarter-space-tech/beyond",
				pageCount: 27,
				note: "108 patterns on twenty-seven diagram pages.",
			},
		],
	},
	{
		id: "playpoi",
		lane: "teaching",
		dateLabel: "2004",
		firstDocumentedYear: 2004,
		activity: {
			status: "active",
			lastVerifiedYear: 2026,
			note: "The linked Leviathan Flow Camp listing was checked in 2026.",
		},
		title: "PLAYPOI",
		shortTitle: "PLAYPOI",
		people: "Nick Woolsey",
		summary:
			"Nick Woolsey’s poi teaching project, founded in fall 2004. It combines instructional videos with workshops and retreats where people practise together.",
		evidenceBasis: "creators-account",
		evidenceLabel: "Organization source",
		evidenceShortLabel: "Org source",
		citations: [
			{
				label: "About PLAYPOI",
				href: "https://playpoi.com/about-playpoi/",
				supports:
					"The story of PLAYPOI’s 2004 launch and its approach to teaching.",
				basis: "creators-account",
			},
			{
				label: "What is Poi?",
				href: "https://playpoi.com/inspiration/what-is-poi/",
				supports:
					"Nick Woolsey's account that PLAYPOI was founded in fall 2004.",
				basis: "creators-account",
			},
			{
				label: "Leviathan Flow Camp listing",
				href: "https://playpoi.com/2025/01/08/leviathan-flow-camp-2025/",
				supports:
					"Details of Leviathan Flow Camp.",
				basis: "creators-account",
			},
		],
	},
	{
		id: "flow-arts-institute",
		lane: "teaching",
		dateLabel: "documented 2007",
		firstDocumentedYear: 2007,
		activity: {
			status: "active",
			lastVerifiedYear: 2026,
			note: "The linked festival listings were checked in 2026.",
		},
		title: "Flow Arts Institute",
		shortTitle: "FAI",
		people: "Flow Arts Institute",
		summary:
			"An organization that teaches flow arts through festivals and published resources. Its own history dates its involvement with Fire Drums to 2007.",
		evidenceBasis: "creators-account",
		evidenceLabel: "Organization retrospective",
		evidenceShortLabel: "Org source",
		citations: [
			{
				label: "The History of the Term ‘Flow Arts’",
				href: "https://flowartsinstitute.com/history-of-term-flow-arts/",
				supports:
					"The organization's account of its involvement with Fire Drums in 2007 and the wider teaching network.",
				basis: "creators-account",
			},
			{
				label: "Flow Arts Institute team",
				href: "https://flowartsinstitute.com/about-us/",
				supports:
					"The team behind the organization and its teaching programs.",
				basis: "creators-account",
			},
			{
				label: "Flow Arts Institute festival listings, 2026",
				href: "https://flowartsinstitute.com/",
				supports:
					"The organization’s festival listings.",
				basis: "creators-account",
			},
		],
	},
	{
		id: "drexfactor",
		lane: "teaching",
		dateLabel: "2008",
		firstDocumentedYear: 2008,
		activity: {
			status: "active",
			lastVerifiedYear: 2026,
			note: "Drexler lists teaching events in his 2026 calendar.",
		},
		title: "DrexFactor / Weird Science",
		shortTitle: "DrexFactor",
		people: "Ben Drexler",
		summary:
			"Ben Drexler’s tutorials and writing about poi theory. His Weird Science blog records experiments and discussions, with diagrams and documents from other spinners.",
		evidenceBasis: "creators-account",
		evidenceLabel: "Creator archive",
		evidenceShortLabel: "Creator source",
		evidenceNote:
			"Drexler's own archive dates his first tech blog to September 2008. The surviving written blog begins in October 2009.",
		citations: [
			{
				label: "Weird Science: all posts",
				href: "https://drexfactor.com/weirdscience/all",
				supports:
					"Drexler's statement that his first tech blog was published September 8, 2008.",
				basis: "creators-account",
			},
			{
				label: "And so it begins, 2009",
				href: "https://drexfactor.com/weirdscience/2009/10/06/and_so_it_begins",
				supports:
					"Drexler’s first written blog post explains why he wants to discuss poi’s art and science in public.",
				basis: "creators-account",
			},
			{
				label: "DrexFactor event calendar, 2026",
				href: "https://drexfactor.com/calendar/2026",
				supports:
					"Drexler’s 2026 teaching schedule.",
				basis: "creators-account",
			},
		],
	},
	{
		id: "staff-science",
		lane: "research",
		dateLabel: "2019 → 2024",
		firstDocumentedYear: 2019,
		activity: {
			status: "unknown",
			lastVerifiedYear: 2024,
			note: "In 2024, Camacho and Haines described the system as still in development.",
		},
		title: "Staff Science",
		shortTitle: "Staff Science",
		people: "Jay-J Camacho and Stephen Haines",
		summary:
			"Jay-J Camacho and Stephen Haines’ contact-staff terminology and tutorial project. In their 2024 account, they date the work to 2019 and describe teaching it before releasing the mini-series.",
		evidenceBasis: "creators-account",
		evidenceLabel: "Creators' account",
		evidenceShortLabel: "Creator source",
		citations: [
			{
				label: "Staff Science profile",
				href: "https://www.instagram.com/staff_science/",
				supports:
					"Camacho and Haines introduce Staff Science and its tutorial mini-series.",
				basis: "creators-account",
			},
			{
				label: "Staff Science development note, 2024",
				href: "https://www.instagram.com/p/C8x3MzKuHkY/",
				supports:
					"The creators' statement that they had worked on the system since 2019 and taught it before public release.",
				basis: "creators-account",
			},
		],
	},
	{
		id: "visual-notes-01",
		lane: "research",
		dateLabel: "2026",
		firstDocumentedYear: 2026,
		title: "Visual Notes 01",
		shortTitle: "Visual Notes",
		people: "Charlie Nayler",
		summary:
			"Charlie Nayler’s experiment with drawing diagrams over contact-staff footage. Arrows annotate the movement as the video plays.",
		evidenceBasis: "creators-account",
		evidenceLabel: "Creator-defined experiment",
		evidenceShortLabel: "Creator source",
		citations: [
			{
				label: "Visual Notes 01",
				href: "https://www.instagram.com/p/DW6-yF5DL9F/",
				supports:
					"The annotated video, with an arrow key and Nayler’s explanation of the experiment.",
				basis: "creators-account",
			},
		],
	},
	{
		id: "flowgoesapien",
		lane: "research",
		dateLabel: "2026",
		firstDocumentedYear: 2026,
		activity: {
			status: "active",
			lastVerifiedYear: 2026,
			note: "Hatt shared the linked practice notes in August 2026.",
		},
		title: "Contact-staff pathway research",
		shortTitle: "Flowgoesapien",
		people: "Alex Hatt, publishing as flowgoesapien",
		summary:
			"Alex Hatt names and demonstrates contact-staff pathways in his practice notes, including a movement he calls a ‘smudge.’",
		evidenceBasis: "creators-account",
		evidenceLabel: "Current creator posts",
		evidenceShortLabel: "Creator source",
		citations: [
			{
				label: "Smudge concept post",
				href: "https://www.instagram.com/flowgoesapien/reel/DaE-hUHxnU1/",
				supports:
					"Hatt defines and demonstrates a contact-staff ‘smudge.’",
				basis: "creators-account",
			},
			{
				label: "Alex Hatt / flowgoesapien",
				href: "https://www.instagram.com/flowgoesapien/",
				supports:
					"Hatt’s profile and further contact-staff practice notes.",
				basis: "creators-account",
			},
		],
	},
];

export const ARCHIVE_ENTRIES: ArchiveEntry[] = [
	...catalogEntries,
	...researchEntries,
].sort(
	(a, b) =>
		a.firstDocumentedYear - b.firstDocumentedYear ||
		a.title.localeCompare(b.title)
);

export function entriesForLane(lane: ArchiveLaneId): ArchiveEntry[] {
	return ARCHIVE_ENTRIES.filter((entry) => entry.lane === lane);
}

export function archiveLane(lane: ArchiveLaneId): ArchiveLane {
	const match = ARCHIVE_LANES.find((candidate) => candidate.id === lane);
	if (!match) throw new Error(`Unknown archive lane: ${lane}`);
	return match;
}

export function historicalYearPosition(year: number): number {
	const clamped = Math.min(
		ARCHIVE_END_YEAR,
		Math.max(ARCHIVE_START_YEAR, year)
	);
	return (
		((clamped - ARCHIVE_START_YEAR) / (ARCHIVE_END_YEAR - ARCHIVE_START_YEAR)) *
		100
	);
}

export function archiveEntry(entryId: string): ArchiveEntry {
	const match = ARCHIVE_ENTRIES.find((entry) => entry.id === entryId);
	if (!match) throw new Error(`Unknown archive entry: ${entryId}`);
	return match;
}

export function archiveDocumentPageImage(
	document: ArchiveDocument,
	pageNumber: number
): string {
	if (
		!Number.isInteger(pageNumber) ||
		pageNumber < 1 ||
		pageNumber > document.pageCount
	) {
		throw new Error(
			`Page ${pageNumber} is outside ${document.title}'s ${document.pageCount}-page range`
		);
	}

	return `${document.pageImagePrefix}-${String(pageNumber).padStart(2, "0")}.webp`;
}

export function archiveClusterForEntry(
	entryId: string
): ArchiveCluster | undefined {
	return ARCHIVE_CLUSTERS.find((cluster) =>
		cluster.entryIds.includes(entryId)
	);
}

/**
 * The year through which a record occupies its track: the last verified
 * activity endpoint when one exists, otherwise the documented year alone.
 */
export function entrySpanEndYear(entry: ArchiveEntry): number {
	return entry.activity?.lastVerifiedYear ?? entry.firstDocumentedYear;
}

/**
 * The honest activity phrase, or nothing when the record makes no activity
 * claim. Never "2004–present": the evidence supports two endpoints, not an
 * uninterrupted span.
 */
export function activityLabel(entry: ArchiveEntry): string | undefined {
	if (!entry.activity) return undefined;
	if (entry.activity.status === "active") {
		return `Sources checked in ${entry.activity.lastVerifiedYear}`;
	}
	if (entry.activity.status === "archive-online") {
		return "Online archive";
	}
	return `Latest source: ${entry.activity.lastVerifiedYear}`;
}

/**
 * Assign compact vertical tracks without changing horizontal calendar
 * position. This is presentation math only: every marker still begins at its
 * evidence-backed year, while near neighbors move to a second row instead of
 * colliding. A track stays occupied through a record's verified activity
 * endpoint so no chip lands on another record's observation connector.
 */
export function placeArchiveEntries(
	entries: ArchiveEntry[],
	// On the 32-year map, four years leaves the edge-aligned 1994 book
	// overlapping the centered Home of Poi marker. Keep those on separate tracks.
	minimumGapYears = 5
): ArchiveTrackPlacement[] {
	const lastYearByTrack: number[] = [];

	return entries.map((entry) => {
		let track = lastYearByTrack.findIndex(
			(lastYear) => entry.firstDocumentedYear - lastYear >= minimumGapYears
		);
		if (track === -1) track = lastYearByTrack.length;
		lastYearByTrack[track] = entrySpanEndYear(entry);

		return {
			entry,
			track,
			position: historicalYearPosition(entry.firstDocumentedYear),
			spanEnd: historicalYearPosition(entrySpanEndYear(entry)),
		};
	});
}
