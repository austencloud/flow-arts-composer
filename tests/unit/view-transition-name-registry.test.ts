/**
 * view-transition-name uniqueness.
 *
 * A production user on /browse/gallery hit:
 *
 *   InvalidStateError: Multiple elements found with view-transition-name:
 *   sequence-d24bdaed-f3ac-4d9a-b8ac-5ae1201f28bc
 *
 * Cause: the gallery grid card for a word stays mounted underneath the
 * variation picker modal, and the modal renders a ChoreoCardThumbnail for
 * EVERY variation of that word — including the one the grid card is already
 * showing. Both stamped `sequence-<id>`, so the next view transition (a module
 * or tab switch through navigation-coordinator, a route morph in +layout)
 * aborted. The same shape exists wherever a sheet stacks a second BrowsePanel
 * over a grid: AddSequencesSheet, SmartCollectionBuilderSheet,
 * SequencePickerModal.
 *
 * The registry makes the name a claim: first mounted holds it, later copies go
 * unnamed. These assertions lock the claim semantics and the fact that the card
 * routes through them. If one fails, fix the code — do not loosen the test.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
	claimViewTransitionName,
	countViewTransitionNameClaims,
	resetViewTransitionNameRegistry,
} from "#lib/shared/transitions/view-transition-name-registry.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readSource(relative: string): string {
	return readFileSync(path.join(repoRoot, relative), "utf8");
}

/** Records every grant verdict a claimant received, newest last. */
function recorder() {
	const grants: boolean[] = [];
	return { grants, notify: (granted: boolean) => grants.push(granted) };
}

describe("view-transition-name registry", () => {
	beforeEach(() => {
		resetViewTransitionNameRegistry();
	});

	it("grants the name to the first claimant only", () => {
		const grid = recorder();
		const modalCopy = recorder();

		claimViewTransitionName("sequence-abc", grid.notify);
		claimViewTransitionName("sequence-abc", modalCopy.notify);

		expect(grid.grants).toEqual([true]);
		expect(modalCopy.grants).toEqual([false]);
		expect(countViewTransitionNameClaims("sequence-abc")).toBe(2);
	});

	it("keeps distinct names independent", () => {
		const a = recorder();
		const b = recorder();

		claimViewTransitionName("sequence-abc", a.notify);
		claimViewTransitionName("sequence-def", b.notify);

		expect(a.grants).toEqual([true]);
		expect(b.grants).toEqual([true]);
	});

	it("promotes the next claimant when the holder releases", () => {
		const grid = recorder();
		const modalCopy = recorder();

		const releaseGrid = claimViewTransitionName("sequence-abc", grid.notify);
		claimViewTransitionName("sequence-abc", modalCopy.notify);

		// The grid card scrolls out of the virtualizer while the modal is open.
		releaseGrid();

		expect(modalCopy.grants).toEqual([false, true]);
		expect(countViewTransitionNameClaims("sequence-abc")).toBe(1);
	});

	it("does not promote anyone when a non-holder releases", () => {
		const grid = recorder();
		const modalCopy = recorder();

		claimViewTransitionName("sequence-abc", grid.notify);
		const releaseModal = claimViewTransitionName("sequence-abc", modalCopy.notify);

		releaseModal();

		expect(grid.grants).toEqual([true]);
		expect(modalCopy.grants).toEqual([false]);
		expect(countViewTransitionNameClaims("sequence-abc")).toBe(1);
	});

	it("is idempotent on repeated release", () => {
		const grid = recorder();
		const modalCopy = recorder();

		const releaseGrid = claimViewTransitionName("sequence-abc", grid.notify);
		claimViewTransitionName("sequence-abc", modalCopy.notify);

		releaseGrid();
		releaseGrid();

		expect(modalCopy.grants).toEqual([false, true]);
		expect(countViewTransitionNameClaims("sequence-abc")).toBe(1);
	});

	it("frees the name entirely once every claimant releases", () => {
		const a = recorder();
		const releaseA = claimViewTransitionName("sequence-abc", a.notify);
		releaseA();

		expect(countViewTransitionNameClaims("sequence-abc")).toBe(0);

		const b = recorder();
		claimViewTransitionName("sequence-abc", b.notify);
		expect(b.grants).toEqual([true]);
	});

	it("never grants a name to two live claimants at once", () => {
		// Six copies of one sequence, mounted and unmounted in a scrambled order —
		// grid card, picker modal cards, a stacked BrowsePanel in a sheet.
		const claimants = Array.from({ length: 6 }, () => recorder());
		const releases = claimants.map((c) =>
			claimViewTransitionName("sequence-abc", c.notify)
		);

		const holders = () =>
			claimants.filter((c) => c.grants[c.grants.length - 1] === true).length;

		expect(holders()).toBe(1);

		for (const index of [3, 0, 5, 1]) {
			releases[index]();
			claimants[index].grants.push(false); // unmount clears the element's name
			expect(holders()).toBe(1);
		}
	});
});

describe("ChoreoCardThumbnail routes its morph name through the registry", () => {
	const source = readSource(
		"src/lib/shared/browse/components/ChoreoCardThumbnail/ChoreoCardThumbnail.svelte"
	);

	it("does not stamp the raw per-sequence name in markup", () => {
		// The regression shape. Every mounted copy of a sequence carried this, so
		// a grid card + a variation-picker card was an automatic duplicate.
		expect(source).not.toContain(
			'style:view-transition-name="sequence-{displayedSequence.id}"'
		);
	});

	it("binds the name to the claimed value", () => {
		expect(source).toContain("style:view-transition-name={morphName}");
		expect(source).toContain("claimViewTransitionName");
	});

	it("releases the claim when the card unmounts or changes variation", () => {
		expect(source).toMatch(/\$effect\(\(\) => \{[\s\S]*?claimViewTransitionName[\s\S]*?release\(\)/);
	});
});
