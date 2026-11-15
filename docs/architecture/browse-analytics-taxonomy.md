# Browse Analytics Taxonomy

**Effective:** 2026-08-22  
**Owner:** `src/lib/shared/analytics/browse-events.ts`

These events measure retrieval intent before the `Explore | You` migration.
They use stable product concepts rather than display copy and contain no user,
creator, collection, sequence, or media identifiers.

| Event                                | Fires when                                                    | Properties                                                                                                                                 | Decision supported                                                                                       |
| ------------------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `browse_destination_entered`         | Browse becomes visible or the active destination changes      | `destination`, bounded route pattern                                                                                                       | Gallery, Library, Collections, and Hall baseline usage                                                   |
| `browse_collection_opened`           | A collection-first card or shelf opens                        | `entry`: community, owned, shared, or performance shelf                                                                                    | Whether Collections earns sibling placement under Explore and how often collection-first browsing occurs |
| `browse_visual_type_opened`          | Tunnels, Mandalas, or Scenes opens from the current Art shelf | `type`                                                                                                                                     | Visual-type demand and initial promotion ordering                                                        |
| `browse_tunnel_edit_started`         | The tunnel creator handoff begins                             | `entry`: gallery card or detail                                                                                                            | Whether the direct card action removes the detail-page detour                                            |
| `browse_performance_playback_intent` | A performance-filtered sequence opens directly to Videos      | `subject_type: sequence`                                                                                                                   | Demand for contextual performance viewing without inventing an archive feed                              |
| `browse_variation_swap`              | A tap on a gallery card's variation pill ends                 | `duration_ms` (tap to the new picture loading), `outcome`: shown, tapped_again or left, `source` when known, `variation_count`, `prepared` | Whether a tapped variation waits, and whether preparing the next one ahead removes the wait              |

## Collection rules

- `browse_destination_entered` deduplicates reactive updates while Browse stays
  visible. Leaving and re-entering Browse records a new visit.
- Event capture uses `captureWhenReady`; no call site initializes a second
  analytics client.
- Local development remains governed by the canonical PostHog development gate.
- The taxonomy may gain `explore` and `you` values during Phase 1, but the event
  names remain stable so before/after behavior can be compared.
- Performance playback records intent only. It does not claim that playback
  succeeded or that the media is public.
