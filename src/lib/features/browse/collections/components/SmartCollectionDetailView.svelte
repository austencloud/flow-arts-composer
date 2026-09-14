<!--
SmartCollectionDetailView.svelte

A Smart Collection's detail view. Members are NOT stored — they derive live
from the saved filter rule. An ephemeral BrowseEngine loads the rule's target
pool (community or my-library), the saved filters are replayed onto it, and
the shared BrowsePanel renders the result. Editable collections show their
rule here; TKA's founding decks use the surrounding library hierarchy instead.
-->
<script lang="ts">
	import CollectionDetailsDialog from "./CollectionDetailsDialog.svelte";
	import { onMount, untrack } from "svelte";
	import type { LibraryCollection } from "$lib/shared/library/domain/models/collection";
	import { subscribeToCollection } from "$lib/shared/library/services/collection-manager";
	import { collectionsState } from "$lib/features/library/state/collections-state.svelte";
	import { createBrowseEngine } from "$lib/shared/browse/engine/create-browse-engine.svelte";
	import { applySpecToEngine } from "$lib/shared/browse/services/smart-filter-spec";
	import BrowsePanel from "$lib/shared/browse/components/BrowsePanel.svelte";
	import ContextMenu from "$lib/shared/components/context-menu/ContextMenu.svelte";
	import type {
		ContextMenuEntry,
		ContextMenuState,
	} from "$lib/shared/components/context-menu/context-menu-types";
	import ConfirmDialog from "$lib/shared/foundation/ui/ConfirmDialog.svelte";
	import SmartCollectionBuilderSheet from "./SmartCollectionBuilderSheet.svelte";
	import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
	import { openSequenceViewer } from "$lib/shared/sequence-viewer/services/sequence-viewer-navigator";
	import { browseScrollState } from "$lib/shared/browse/state/browse-scroll-state.svelte";
	import {
		loadCanonicalTnDSequences,
		loadCanonicalBookVariations,
	} from "$lib/features/browse/gallery-home/canonical-tnd-pool";
	import {
		isFoundingId,
		getFoundingCollection,
		toSyntheticCollection,
	} from "$lib/features/browse/collections/config/founding-collections";
	import SmartCollectionDetailSurface from "./SmartCollectionDetailSurface.svelte";
	import { userPreviewState } from "$lib/shared/debug/state/user-preview-state.svelte";
	import { authState } from "$lib/shared/auth/state/auth-state.svelte";

	let {
		collectionId,
		onBack,
		showBack = true,
	}: {
		collectionId: string;
		onBack: () => void;
		showBack?: boolean;
	} = $props();

	let collection = $state<LibraryCollection | null>(null);
	let loadState = $state<"loading" | "ready" | "error">("loading");
	let reloadKey = $state(0);

	const isFounding = $derived(!!collection && isFoundingId(collection.id));
	const previewReadOnly = $derived(userPreviewState.isActive);
	const tileColor = $derived(collection?.color ?? "var(--theme-accent)");
	const spec = $derived(collection?.filterSpec ?? null);

	// One ephemeral engine for this view; its source is fixed to the rule's pool.
	// Rebuilt filters live in the engine — a rule edit clears + re-applies them.
	let engine = $state<ReturnType<typeof createBrowseEngine> | null>(null);

	// Subscribe to the collection doc so a rule edit / rename / delete elsewhere
	// reflects here. A deleted (or non-smart) doc bails to the list.
	$effect(() => {
		const id = collectionId;
		const effectiveUserId = authState.effectiveUserId;
		void reloadKey;
		collection = null;
		loadState = "loading";

		// Founding collections are config-defined, not Firestore docs.
		if (isFoundingId(id)) {
			const founding = getFoundingCollection(id);
			if (!founding) {
				onBack();
				return;
			}
			collection = toSyntheticCollection(founding);
			loadState = "ready";
			return; // no subscription to tear down
		}

		let unsubscribe = () => {};
		const timeout = setTimeout(() => {
			if (loadState === "loading") loadState = "error";
		}, 10_000);

		try {
			unsubscribe = subscribeToCollection(id, (col) => {
				if (authState.effectiveUserId !== effectiveUserId) return;
				clearTimeout(timeout);
				if (!col || col.kind !== "smart") {
					onBack();
					return;
				}
				collection = col;
				loadState = "ready";
			});
		} catch {
			clearTimeout(timeout);
			loadState = "error";
		}

		return () => {
			clearTimeout(timeout);
			unsubscribe();
		};
	});

	// Build the engine once the first spec is known; re-apply filters whenever
	// the rule changes. specSignature keys the effect so an Edit-rule write
	// re-derives without recreating the engine.
	const specSignature = $derived(spec ? JSON.stringify(spec) : "");
	onMount(() => {
		return () => engine?.destroy();
	});
	$effect(() => {
		const s = spec;
		void reloadKey;
		void specSignature; // re-run when the rule content changes
		if (!s) return;
		untrack(() => {
			if (!engine) {
				engine = createBrowseEngine({
					persistKey: null,
					initialSource: s.source,
					minColumns: 2,
					// Group into sections (letters / dates / levels per the rule's
					// sort) so the section-index rail populates and the grid renders
					// its headers — the read-only nav the rule view keeps.
					sections: true,
					// Inject the canonical T&D alphabet into the community pool, same
					// as the main gallery (BrowseModule). Without this a community
					// rule — e.g. a founding deck filtering AUTHOR "T&D Alphabet" —
					// sees only user sequences and matches nothing. The Book deck needs
					// the book reversal variants instead of the continuous alphabet.
					extraCommunitySequences:
						collectionId === "founding_book"
							? loadCanonicalBookVariations
							: loadCanonicalTnDSequences,
					// The TKA Core library already explains which deck is open. Its cards
					// should be immediately browseable, without a second technical rail
					// competing with that library hierarchy.
					defaultSectionGroupBy: isFoundingId(collectionId) ? "none" : undefined,
				});
				applySpecToEngine(engine, s);
				void engine.initialize();
				return;
			}
			if (engine.source !== s.source) {
				void engine.setSource(s.source);
			}
			engine.clearUserFilters();
			applySpecToEngine(engine, s);
		});
	});

	const hasLoadError = $derived(
		loadState === "error" ||
			!!engine?.error ||
			(loadState === "ready" && !!collection && !spec),
	);
	const resultsLoading = $derived(
		loadState === "loading" ||
			(loadState === "ready" && !!spec && (!engine || engine.isLoading)),
	);
	const liveMatchCount = $derived(
		engine && !engine.isLoading && !engine.error ? engine.resultCount : null,
	);
	const contentFirst = $derived(isFoundingId(collectionId));

	function retryLoad() {
		engine?.destroy();
		engine = null;
		reloadKey += 1;
	}

	// Self-heal the rail's cached count: once the engine finishes loading, the
	// live match count is authoritative. If the cached `sequenceCount` differs
	// (legacy smart docs stamped 0, or drift as the community pool grows), write
	// the fresh count back so the collection card reads correctly next time.
	// Best-effort; the subscribe above delivers the corrected doc, so the guard
	// prevents a re-write loop.
	$effect(() => {
		const eng = engine;
		const col = collection;
		if (!eng || !col || eng.isLoading) return;
		if (isFoundingId(col.id) || previewReadOnly) return; // config-defined or preview-only
		const live = eng.resultCount;
		if (live !== col.sequenceCount) {
			void collectionsState.syncSmartCount(col.id, live);
		}
	});

	// ── Open a sequence in the viewer (same path as AllLibraryView) ─────────

	function openViewer(sequence: SequenceData, variations?: SequenceData[]) {
		openSequenceViewer(sequence, {
			source: "browse_collection",
			collectionPropType: collection?.propType,
			returnPath: "/browse/library",
			returnLabel: collection?.name ?? "Library",
			scrollY: browseScrollState.lastScrollY,
			handPathMode: engine?.viewMode.subject === "hands",
			variations,
		});
	}

	// A card click always opens the viewer, variations or not. The viewer's own
	// strip handles switching between them.
	function handleSelect(sequence: SequenceData, variations?: SequenceData[]) {
		openViewer(sequence, variations);
	}

	// ── Options menu (rename / edit rule / delete) ──────────────────────────
	let menuState: ContextMenuState = $state({ open: false });
	let renaming = $state(false);
	let renameValue = $state("");
	let deleteConfirmOpen = $state(false);
	let editOpen = $state(false);
	let detailsOpen = $state(false);

	const menuItems: ContextMenuEntry[] = $derived.by(() => [
		{
			id: "details",
			label: "Collection details",
			icon: "fa-pen-to-square",
			action() {
				menuState = { open: false };
				detailsOpen = true;
			},
		},
		{
			id: "rename",
			label: "Rename",
			icon: "fa-pen",
			action() {
				menuState = { open: false };
				renameValue = collection?.name ?? "";
				renaming = true;
			},
		},
		{ type: "separator" } as ContextMenuEntry,
		{
			id: "delete",
			label: "Delete collection",
			icon: "fa-trash",
			danger: true,
			action() {
				menuState = { open: false };
				deleteConfirmOpen = true;
			},
		},
	]);

	function handleOptions(e: MouseEvent) {
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		menuState = { open: true, x: rect.right, y: rect.bottom + 4 };
	}

	async function commitRename() {
		const name = renameValue.trim();
		renaming = false;
		if (!collection || !name || name === collection.name) return;
		await collectionsState.rename(collectionId, name);
	}

	function handleRenameKeydown(e: KeyboardEvent) {
		if (e.key === "Enter") {
			e.preventDefault();
			void commitRename();
		} else if (e.key === "Escape") {
			e.preventDefault();
			renaming = false;
		}
	}

	async function performDelete() {
		deleteConfirmOpen = false;
		const ok = await collectionsState.remove(collectionId);
		if (ok) onBack();
	}
</script>

{#if collection && !isFounding && !previewReadOnly}
	<CollectionDetailsDialog {collection} bind:open={detailsOpen} />
{/if}

<SmartCollectionDetailSurface
	name={collection?.name}
	description={collection?.description}
	icon={collection?.icon}
	color={tileColor}
	{spec}
	matchCount={liveMatchCount}
	{contentFirst}
	backLabel={contentFirst ? "TKA Core" : undefined}
	loading={resultsLoading}
	error={hasLoadError}
	readOnly={isFounding || previewReadOnly}
	{showBack}
	editing={renaming}
	{onBack}
	onEdit={collection && !isFounding && !previewReadOnly ? () => (editOpen = true) : undefined}
	onOptions={collection && !isFounding && !previewReadOnly ? handleOptions : undefined}
	onRetry={retryLoad}
>
	{#snippet titleEditor()}
		<!-- svelte-ignore a11y_autofocus -->
		<input
			type="text"
			class="rename-field"
			aria-label="Collection name"
			bind:value={renameValue}
			onkeydown={handleRenameKeydown}
			onblur={() => void commitRename()}
			maxlength="60"
			autofocus
		/>
	{/snippet}

	{#snippet children()}
		{#if engine}
			<!-- The saved rule is only changed through Edit rule. BrowsePanel's
			     mutation controls stay hidden, while multi-section collections keep
			     their read-only navigation. Empty and error states are
			     intercepted by SmartCollectionDetailSurface. -->
			<BrowsePanel
				collectionPropType={collection?.propType}
				{engine}
				layout="compact"
				eager={false}
				showToolbar={false}
				showFilterBar={false}
				showSidebar={true}
				onSelect={handleSelect}
			/>
		{/if}
	{/snippet}
</SmartCollectionDetailSurface>

<ContextMenu
	{menuState}
	items={previewReadOnly ? [] : menuItems}
	onClose={() => (menuState = { open: false })}
/>

<ConfirmDialog
	bind:isOpen={deleteConfirmOpen}
	title={`Delete "${collection?.name ?? "collection"}"?`}
	message="The rule goes away. The sequences it matched stay in the community library."
	confirmText="Delete"
	cancelText="Keep"
	variant="danger"
	onConfirm={performDelete}
	onCancel={() => (deleteConfirmOpen = false)}
/>

{#if editOpen && collection && !previewReadOnly}
	<SmartCollectionBuilderSheet
		mode="edit"
		editCollectionId={collectionId}
		initialSpec={collection.filterSpec}
		onClose={() => (editOpen = false)}
	/>
{/if}

<style>
	.rename-field {
		width: 100%;
		min-width: 0;
		height: 48px;
		padding: 0 14px;
		background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
		border: 1.5px solid color-mix(in srgb, var(--theme-accent) 45%, transparent);
		border-radius: 12px;
		color: var(--theme-text, white);
		font-size: var(--font-size-sm, 14px);
		font-family: inherit;
	}

	.rename-field:focus-visible {
		border-color: var(--theme-accent);
		outline: none;
		box-shadow: 0 0 0 3px
			color-mix(in srgb, var(--theme-accent) 18%, transparent);
	}
</style>
