/**
 * Library Adapter - maps LibraryRepository data to DOS-style file listings
 *
 * Bridges the real library (Firestore-backed sequences) into the
 * RetroFileManager's FAT16 world. Each saved sequence becomes a .SEQ
 * file with an 8.3 DOS name, a size derived from beat count, and a date
 * pulled from the sequence's updatedAt timestamp.
 *
 * Domain: Retro File Manager
 */

import type { LibraryQueryOptions } from "#lib/features/library/services/types.js";
import type { LibrarySequence } from "#lib/shared/library/domain/models/library-sequence.js";
import { convertFileName } from "../services/file-name-converter";

import { getLibraryRepository } from "#lib/shared/library/get-library-repository.js";
import type { LibraryRepository } from "#lib/shared/library/services/library-repository.js";
import { toDate } from "#lib/shared/library/services/collection-firestore-mapper.js";

export interface RetroFile {
	id: string;
	/** 8.3 format: "FIRFLOWB.SEQ" */
	dosName: string;
	/** Human-readable: "Fire Flow Basics" */
	fullName: string;
	/** Derived from beat count (128 bytes per beat) */
	size: number;
	date: Date;
	type: "SEQ" | "BAK";
	sequence: LibrarySequence;
}

function sequenceToRetroFile(seq: LibrarySequence, dosNames: string[]): RetroFile {
	const dosName = convertFileName(
		seq.displayName || seq.name || seq.word || "UNTITLED",
		".SEQ",
		dosNames,
	);
	dosNames.push(dosName);

	return {
		id: seq.id,
		dosName,
		fullName: seq.displayName || seq.name || seq.word || "Untitled",
		size: (seq.steps?.length ?? 0) * 128,
		date: toDate(seq.updatedAt),
		type: "SEQ" as const,
		sequence: seq,
	};
}

/**
 * Fetch all non-deleted sequences as DOS files, sorted by the given options.
 */
export async function listSequenceFiles(options?: {
	sortBy?: LibraryQueryOptions["sortBy"];
	sortDirection?: "asc" | "desc";
}): Promise<RetroFile[]> {
	const repo = getLibraryRepository() as LibraryRepository;
	const sequences = await repo.getSequences({
		sortBy: options?.sortBy ?? "updatedAt",
		sortDirection: options?.sortDirection ?? "desc",
	});

	const dosNames: string[] = [];
	return sequences
		.filter((seq) => !seq.isDeleted)
		.map((seq) => sequenceToRetroFile(seq, dosNames));
}

/**
 * Soft-delete a sequence (moves it to the recycle bin).
 */
export async function deleteFile(sequenceId: string): Promise<void> {
	const repo = getLibraryRepository() as LibraryRepository;
	await repo.softDeleteSequence(sequenceId);
}

/**
 * Subscribe to real-time library changes. Returns an unsubscribe function.
 * The callback receives the full file list on every change.
 */
export function subscribeToLibrary(callback: (files: RetroFile[]) => void): () => void {
	const repo = getLibraryRepository() as LibraryRepository;
	return repo.subscribeToLibrary((sequences) => {
		const dosNames: string[] = [];
		const files = sequences
			.filter((seq) => !seq.isDeleted)
			.map((seq) => sequenceToRetroFile(seq, dosNames));
		callback(files);
	});
}
