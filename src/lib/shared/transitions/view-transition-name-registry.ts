/**
 * view-transition-name-registry
 *
 * The View Transitions API requires every `view-transition-name` to be unique
 * across the whole document at capture time. Two elements sharing a name make
 * the browser abort the transition with:
 *
 *   InvalidStateError: Multiple elements found with view-transition-name: <name>
 *
 * TKA hits this because the same sequence legitimately renders twice at once.
 * The gallery grid card stays mounted underneath the variation picker modal,
 * the "add sequences" sheet stacks a second BrowsePanel over a collection's
 * grid, and so on. Every one of those copies is a ChoreoCardThumbnail asking
 * for `sequence-<id>`.
 *
 * Rather than teach each of the seven-plus hosts which copy is the "real" one,
 * the name itself is claimed. The first element to claim a name holds it; every
 * later claimant renders without a name until the holder releases (unmount, or
 * the card cycling to a different variation). Because overlays mount after the
 * grid underneath them, the holder is always the primary surface — the
 * shared-element morph keeps working on the path that has one, and the extra
 * copies simply do not participate.
 *
 * Plain module state, not a rune: claims are keyed to component lifetime and
 * the grant flows back through a callback, so there is nothing to make reactive.
 */

/** Called with `true` when this claim owns the name, `false` when it does not. */
export type NameGrantListener = (granted: boolean) => void;

interface Claim {
	readonly notify: NameGrantListener;
}

/** name -> claims in arrival order. Index 0 is the holder. */
const claimsByName = new Map<string, Claim[]>();

/**
 * Claim `name` for one element.
 *
 * `onGrant` fires synchronously with the initial verdict, and again if this
 * claim is promoted to holder after the previous holder releases. Call the
 * returned function on unmount (or when the element wants a different name).
 */
export function claimViewTransitionName(
	name: string,
	onGrant: NameGrantListener
): () => void {
	const claim: Claim = { notify: onGrant };

	let queue = claimsByName.get(name);
	if (!queue) {
		queue = [];
		claimsByName.set(name, queue);
	}
	queue.push(claim);

	const isHolder = queue[0] === claim;
	onGrant(isHolder);

	let released = false;
	return () => {
		if (released) return;
		released = true;

		const current = claimsByName.get(name);
		if (!current) return;

		const index = current.indexOf(claim);
		if (index === -1) return;

		const wasHolder = index === 0;
		current.splice(index, 1);

		if (current.length === 0) {
			claimsByName.delete(name);
			return;
		}

		// Promote the next in line so a name freed by the primary surface is
		// picked up by whatever copy is still on screen.
		if (wasHolder) current[0]?.notify(true);
	};
}

/**
 * Live claim count for a name. Gates the generate card morph in
 * generate-card-morph.ts; tests use it to assert claims move.
 */
export function countViewTransitionNameClaims(name: string): number {
	return claimsByName.get(name)?.length ?? 0;
}

/** Drop every claim. Testing only. */
export function resetViewTransitionNameRegistry(): void {
	claimsByName.clear();
}
