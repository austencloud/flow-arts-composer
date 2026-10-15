# The Kinetic Archive — v1 Shippable Scope

**Repository status (2026-10-14):** The [museum README](README.md) declares `story-bible.md` private in `austencloud/flow-arts-private` under `museum/`; it is absent from this tree and was not inspected. This dated text-only v1 draft and the README's UE5/Steam ambition require a product decision on the next delivery target. Neither cancellation nor adoption is established here.

**Date:** 2026-06-20
**Status:** Draft (captured from design conversation)
**Relationship to story bible:** `story-bible.md` is the North Star (the full vision). This doc is the smallest buildable slice that still lands the two core payloads. The bible is the source of truth; this is the build order for v1 only.

---

## Thesis

The full story bible is a multi-studio-year UE5 production. It is intentionally over-scoped — the bible itself defers scale (L204) and names a text adventure as the MVP (L164). This doc defines the **minimum viable slice a solo developer can ship in weeks**, where writing (the cheap, high-volume capability) is ~95% of the work and 3D/voice/Steam are cut entirely.

**v1 must deliver exactly two payloads:**

1. **The K reveal** — narrator and annotator are the same person.
2. **The codex punchline** — the forms aren't a message, they're a language. "Here, make something."

Everything not serving those two payloads is cut from v1 and preserved in the bible for later.

---

## The Core Cut: browser text-museum, not a game

Build it **inside the existing SvelteKit app, on the `src/routes/1989` DOS-terminal route that already exists.** Text-first, using the **existing pictograph canvas pipeline** to render the forms. No UE5, no 3D environment, no voice acting, no Steam release.

- **Target length:** ~15 minutes first pass. Short enough that a replay is a realistic ask, short enough to actually finish.
- **Aesthetic:** the green/amber phosphor DOS framing already specced for the 1989 retro version (bible L157).

This is not descoping the dream — it is building the layer the bible explicitly says to build first.

---

## The 3-Beat Spine

Each historical wing in the bible is ~a month of production. v1 ships **three rooms**, chosen because together they carry the entire thesis:

1. **Cave (~35,000 BCE)** — establishes the forms, the Order's awe-misread-as-fear, plants **OOGA**. Renders real pictographs on cave-wall framing.
2. **The Modern Bureau** — one room. Flow-state-as-transmissible-disease comedy (exposure forms, "inability to release the object"), Vogon bureaucracy, and **one** visible bureaucratic absurdity the attentive player later reads as K's sabotage. Young-K's institutional voice at its most over-scripted.
3. **The Cross-Reference Room** — the codex climax (see below).

**Cut from v1 (kept in bible):** Egypt, Classical, Medieval, Enlightenment, Victorian, Modern-wing expansion, the Crumble + three-era architecture, the three sequential endings (Hell/Limbo/Heaven), certificate styles.

---

## The K Reveal (compressed)

A 15-minute piece cannot _depend_ on a full second playthrough, so the reveal must be **single-pass discoverable** — which matches the bible's own rule (L37: "a gift for the attentive player, not a requirement for enjoyment").

**Two voices, two cheap visual treatments:**

- **Narrator** = DOS terminal "system" text (green phosphor). Institutional, young K.
- **Annotator** = inline margin notes in a distinct visual style (handwritten font / off-color overlay). Older K.

**The reveal rides on ONE document, not a mechanic:** a late Bellweather report where K's name appears in two roles at once — the archive's narration recorder **and** the leak's key actor. The player who reads it connects narrator→annotator themselves. Everyone else just feels the museum get warmer toward the end.

**Stretch goal (NOT v1-required):** a "Read it again" button that, on pass two, pins each annotation beside the exact narration line it answers — turning the same-person inference into a visible gut-punch. Cheap to add later. Do not gate v1 on it.

---

## The Codex Punchline (the climax — cheapest, biggest beat)

Almost pure writing + existing rendering. The domain package's position→letter mapping IS the in-fiction decoder (bible L464).

1. Cross-reference room shows 3–4 cave sequences as real pictographs.
2. Order plaque, deadpan (bible L479): _"Analysis ongoing. No coherent message detected... Budget request for continued analysis: APPROVED (annually since 1947)."_
3. One interaction: player decodes a sequence → it spells **OOGA**.
4. K's annotation, the hinge (bible L481): _"They keep looking for what it says. They never asked what it IS."_
5. The turn (bible L483): it's not a message, it's a **language** — a tool to write anything. _"Here, make something."_

---

## The Handoff = the Ending (already built)

No three-room Scrooge sequence in v1. The codex reveal **is** the climax and hands off directly:

- A museum pamphlet beat, then a **deep-link into the actual Flow Arts Composer with the decoded sequence pre-loaded.**
- This is the MVP integration the bible already specifies (L348: deep-link handoff with URL parameters).
- The game stops being a game and becomes the tool, in one click, using shipped capability.

---

## Reused vs. Net-New (why this is weeks, not years)

| Reused (already in repo)                | Net-new (mostly writing)                                |
| --------------------------------------- | ------------------------------------------------------- |
| `src/routes/1989` DOS route shell       | ~12–18 short documents (bible word-count budgets, L202) |
| Pictograph rendering pipeline           | The decode interaction (one component)                  |
| Position→letter mapping (`@tka/domain`) | Annotation overlay styling                              |
| Composer app + deep-link handoff        | The Bellweather reveal document                         |
| TKA sequence data                       | Ending pamphlet + handoff copy                          |

---

## The One Real Risk

Even at 15 minutes, the writing volume — 12–18 polished, deadpan, funny documents — is the true cost, and it is the work only the author can do. **The bottleneck is writing, not code.** Everything else leans on what already exists in the repo.

---

## Explicitly Out of Scope for v1

UE5 / Steam · voice acting · all mid-era wings · the Crumble + three-era architecture · the three sequential endings · certificate styles · **the simulation layer** (keep as a single buried footnote, not a v1 beat — deep lore for an audience that does not exist yet).

---

## One-Line Summary

A ~15-minute browser text-museum on the existing 1989 route, three beats (Cave → Bureau → Codex), the K reveal carried by one document, climax = decode OOGA → "it's a language" → deep-link into Composer. Lands both payloads, funnels to the real product, buildable solo in weeks.

---

## Open / Next Steps (not yet done)

- Decide single-pass vs. two-pass annotation structure (recommended: single-pass for v1, two-pass as stretch).
- Draft the beat-by-beat script for the three rooms to size the real writing volume.
- Confirm which cave sequence decodes to OOGA via the actual `@tka/domain` letter mapping.
- Wire the decode interaction to the existing pictograph renderer.

_Captured 2026-06-20 from a design conversation. Not yet reviewed against tracker._
