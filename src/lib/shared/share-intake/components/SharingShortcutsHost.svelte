<script lang="ts">
	/**
	 * Keeps the Android share sheet's Direct Share targets in step with the
	 * inbox.
	 *
	 * Renders nothing. Mounted inside MainApplication for the same structural
	 * reason as ShareIntakeHost: inboxState.conversations is only populated
	 * under the app shell, so observing it from here means the publisher cannot
	 * run against an empty list on the marketing landing.
	 *
	 * authState has no callback subscription API - it is getters over a $state
	 * rune - so a $effect is the only way to observe a sign-out.
	 */
	import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
	import { inboxState } from "#lib/shared/inbox/state/inbox-state.svelte.js";
	import { selectShareTargets } from "../domain/share-target-selection";
	import {
		clearShareTargets,
		publishShareTargets,
	} from "../services/sharing-shortcuts-publisher";

	$effect(() => {
		// Read both dependencies unconditionally so the effect re-runs on either.
		const signedIn = authState.isFullAccount;
		const conversations = inboxState.conversations;

		if (!signedIn) {
			// Contact names must not outlive the session in a system-level surface.
			void clearShareTargets();
			return;
		}

		void publishShareTargets(selectShareTargets(conversations));
	});
</script>
