# TKA Museum Documentation

> **Project:** The Kinetic Archive
> **Engine:** Unreal Engine 5 (Steam release) + Web App integration (deep link handoff to TKA Scribe)
> **Status:** Pre-production (Story Bible phase)
> **Tone:** Museum of Jurassic Technology meets Stanley Parable

---

## Source of Truth

**`story-bible.md` is the canonical document.** Everything else is supplementary. If anything conflicts with the story bible, the story bible wins.

The story bible, `gift-shop.md` and `real-story.md` are private. They live in the private repo `austencloud/flow-arts-private` under `museum/`, cloned at `E:/flow-arts-private/museum/`. Edit and commit them there, never here.

The museum-dev tracker (`node scripts/museum-dev.js`) records how decisions were made. The story bible records where the lore stands now.

---

## Document Index

| Document | Status | Description |
|----------|--------|-------------|
| `story-bible.md` (private) | **Canon** | Master document. Creative principles, K's arc, factions, endings, deep lore, all locked decisions. |
| [museum-layout.md](./museum-layout.md) | Needs revision | Physical wing layout. Still uses retired Wing 1-8 numbering. Spatial reference only. |
| [vtg-wing.md](./vtg-wing.md) | Partially superseded | Vulcan Cave elemental design. Some content folded into story bible. |
| [story-audit-march-2026.md](./story-audit-march-2026.md) | Active | Story quality audit with predicted Steam rating and comp titles. |
| [stanley-parable-reference.md](./stanley-parable-reference.md) | Active | Stanley Parable design lessons and source URLs. |
| `gift-shop.md` (private) | Active | Fake items, digital unlocks, real merch concepts. |
| `real-story.md` (private) | Active | Austen's actual development story (outside the fiction). |
| [tka-os/design.md](./tka-os/design.md) | Active | The retro Windows 93 app experience design. |
| [plaques/lascaux-tablets.md](./plaques/lascaux-tablets.md) | Active | Sample plaque text and audio script. |

---

## Key Decisions (Locked)

From the story bible's Canonical Decisions table:

| Decision | Detail |
|----------|--------|
| Engine | Unreal Engine 5 |
| Tone | Museum of Jurassic Technology meets Stanley Parable. Commit to the bit, never wink. |
| K | One character: narrator + annotator + defector + developer + renovator. Never seen, traces only. Male, born ~1968. |
| Endings | Three sequential rooms (Fear / Isolation / Collaboration), not branching choices. Scrooge effect. |
| Austen | Meta-only. Not a character. No exhibit, no named mention. Developer and voice actor. |
| Factions | Order of the Closed Palm (Bureau of Kinetic Containment) vs. The Scribes. |
| Vessels | Concept retired. Historical figures are Scribes, not reincarnating souls. |
| Lethe | Ancient, repeated across history, always incomplete. Not a single 1994 event. |
| Building | "The Kinetic Archive" on entrance. Three architectural eras: Order-built (pre-2003), Crumble (2003-2008), K's museum (post-2008). |
| VTG handling | Terms as Easter eggs. System name "Vulcan Tech Gospel" never appears in fiction. |
| Andy Kaufman Rule | The audience's confusion about what's real IS the art. |

---

## Open Questions

See story bible for the full list. Major unresolved:

- K's current status (alive when player enters? Born ~1968, would be ~58 in 2026)
- Infrastructure during the gap (who kept the lights on?)
- The Space Age (missing aesthetic chapter: 1950s-1980s)
- Flow state as disease (Order's specific pathological model)
- Re-emergence theories (each deserves its own exhibit)
- Interactive exhibits (biggest addressable risk per story audit)

---

## Tracker Commands

```bash
node scripts/museum-dev.js list                    # All items
node scripts/museum-dev.js list --tag lore         # Lore items only
node scripts/museum-dev.js <id>                    # Item details
node scripts/museum-dev.js session "Title"         # Start brainstorm
node scripts/museum-dev.js help                    # Full command list
```

Staleness check: `node scripts/check-lore-staleness.cjs` (reads the private story bible; `FLOW_ARTS_PRIVATE_DIR` overrides the clone location)

---

## Skills

| Skill | Purpose |
|-------|---------|
| `/museum` | Full department briefing (dispatches 7 parallel agents) or focused department view |
| `/museum-lore` | Writers' room lore discussion. Mandatory session-close protocol. |

---

*Last updated: 2026-09-27*
