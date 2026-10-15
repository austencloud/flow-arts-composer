# Save Paths & Public Index Architecture

## Library save ownership

The UI save and repository save share the library repository boundary.
`getLibrarySaveService()` in
`src/lib/features/library/get-library-save-service.ts` injects
`getLibraryRepository()`. `LibrarySaveService` then calls
`libraryRepository.saveSequenceWithMetadata(sequence, metadata)` in
`src/lib/features/library/services/library-save-service.ts`.

The repository implementation is
`src/lib/shared/library/services/library-repository.ts`. The Create module's
`src/lib/features/create/shared/services/sequence-persister.ts` persists local
workspace state through the shared persistence layer; it is not the library
Firestore writer. Keep visibility and public-index concerns in the library owners.

## Public index wiring

`src/lib/shared/library/get-library-repository.ts` accepts the registered
`IPublicIndexSyncer` factory. The composition root
`src/lib/shared/composition-root/register-library-repository.ts` registers
`createLazyPublicIndexSyncer`, whose adapter is
`src/lib/shared/library/services/create-lazy-public-index-syncer.ts`.
The adapter defers loading the implementation while satisfying the repository's
synchronous dependency.

`src/lib/features/library/get-public-index-syncer.ts` composes `PublicIndexSyncer`
with moderation dependencies and `getBrowseLoader()`. Its implementation in
`src/lib/features/library/services/public-index-syncer.ts` accepts an optional
`PublicSequencesLoader`, adds normalized published data through `addToCache`,
updates cached thumbnails and removes unpublished entries through `removeFromCache`.
These are getter/factory dependencies; the old library-container/`IBrowseLoader`
account does not describe this wiring.

## Historical correction

The March account described two independent Firestore save paths and a
Create-owned `SequencePersister` library writer. That account is superseded by
the repository call and composition-root wiring above, inspected on 2026-10-14.
