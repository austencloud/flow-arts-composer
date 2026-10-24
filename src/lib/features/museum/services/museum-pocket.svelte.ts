/**
 * The visitor's pocket: one sequence carried out of the Cross-Reference Room.
 *
 * The decode console fills it when the key finishes ("Read it with your
 * hands"), and the Room of Collaboration lets the visitor teach what it holds
 * to a villager. It lives in localStorage so a reload or a later visit still
 * has it.
 *
 * Dev entry: `?pocket=<sequenceId>` fills it on load, so the collaboration
 * room can be tested on its own (`/museum?room=collaboration&pocket=codex-ooga-seq`)
 * without walking through the decode first. Only sequences a decode console
 * reveals are accepted, and the label is that console's reveal.
 */

import { decodeRevealOf } from "./exhibit-decode-reveal";

export interface PocketItem {
	sequenceId: string;
	/** What the visitor calls it, e.g. "OOGA" (the decode console's reveal). */
	label: string;
}

const STORAGE_KEY = "museum-pocket-v1";

function readStored(): PocketItem | null {
	if (typeof localStorage === "undefined") return null;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Partial<PocketItem>;
		if (typeof parsed.sequenceId !== "string" || typeof parsed.label !== "string") return null;
		return { sequenceId: parsed.sequenceId, label: parsed.label };
	} catch {
		return null;
	}
}

function readUrl(): PocketItem | null {
	if (typeof location === "undefined") return null;
	const sequenceId = new URLSearchParams(location.search).get("pocket");
	if (!sequenceId) return null;
	const label = decodeRevealOf(sequenceId);
	return label ? { sequenceId, label } : null;
}

function write(next: PocketItem | null): void {
	if (typeof localStorage === "undefined") return;
	try {
		if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
		else localStorage.removeItem(STORAGE_KEY);
	} catch {
		// Private mode or a full quota: the pocket still holds it for this visit.
	}
}

function createMuseumPocket() {
	const fromUrl = readUrl();
	if (fromUrl) write(fromUrl);
	let item = $state<PocketItem | null>(fromUrl ?? readStored());

	return {
		get item() {
			return item;
		},
		carry(sequenceId: string, label: string): void {
			if (item?.sequenceId === sequenceId && item.label === label) return;
			item = { sequenceId, label };
			write(item);
		},
		empty(): void {
			item = null;
			write(null);
		},
	};
}

export type MuseumPocket = ReturnType<typeof createMuseumPocket>;

let pocket: MuseumPocket | null = null;

export function getMuseumPocket(): MuseumPocket {
	pocket ??= createMuseumPocket();
	return pocket;
}
