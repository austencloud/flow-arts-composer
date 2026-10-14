/**
 * Restrained accents sampled from the archive's existing artifact palette.
 * They identify records; they do not encode evidence quality or importance.
 */
export const ARCHIVE_ACCENTS: Record<string, string> = {
	caps: "oklch(0.78 0.13 230)",
	trochoid: "oklch(0.78 0.09 250)",
	vtg: "oklch(0.74 0.15 40)",
	"nine-square": "oklch(0.75 0.16 25)",
	qft: "oklch(0.75 0.16 295)",
	lorq: "oklch(0.8 0.14 80)",
	poinotation: "oklch(0.78 0.14 150)",
	tka: "oklch(0.74 0.15 305)",
	"fan-alphabet": "oklch(0.8 0.13 335)",
	"quarter-space-tech": "oklch(0.76 0.16 325)",
	"eight-step": "oklch(0.78 0.13 175)",
	"home-of-poi": "oklch(0.76 0.13 275)",
	playpoi: "oklch(0.78 0.14 195)",
	"flow-arts-institute": "oklch(0.76 0.13 150)",
	drexfactor: "oklch(0.78 0.13 60)",
	"staff-science": "oklch(0.75 0.14 35)",
	"visual-notes-01": "oklch(0.76 0.14 255)",
	flowgoesapien: "oklch(0.76 0.14 115)",
};

export function archiveAccent(entryId: string): string {
	return ARCHIVE_ACCENTS[entryId] ?? "oklch(0.76 0.1 270)";
}
