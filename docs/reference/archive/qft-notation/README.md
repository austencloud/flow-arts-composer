# QfT Notation — sourcing archive

Reference material for the notation catalog
(`docs/superpowers/specs/2026-07-26-notation-catalog-design.md`). Captured
2026-07-26.

**This is a private sourcing archive, not publishable content.** The prose and
video lectures belong to Charlie Cushing and Ben "DrexFactor" Drexler. Nothing
here goes into `static/` or onto a public page. If any of it becomes
public-facing, ask them first. Their contact details are published in the
source article.

## Why this exists

The Home of Poi original has lost every image (the forum replaced them with
"Non-Https Image Link" placeholders). The blog mirror still serves them, but
that is one hosting bill away from gone. Charlie's own video series has
88–846 views per chapter. This is the least durable notation system in the
catalog and the one most likely to vanish.

## Sources, in order of authority

| Rank | Source | URL | State |
|---|---|---|---|
| 1 | Charlie Cushing, "QfT Tutorial Series" | https://www.youtube.com/playlist?list=PL45D3844B85CB8D80 | live, 10 videos, ~45 min total |
| 2 | Drex, forum original (has the intro the blog drops) | https://www.homeofpoi.com/en/community/forums/topics/932537/A-Beginner-s-Guide-to-Prop-QFT-Notation | live, login-gated, images dead |
| 3 | Drex, blog mirror (has the images) | https://drexfactor.com/weirdscience/2011/05/18/beginners_guide_poi_qft_notation | live, images intact |
| 4 | Drex, "Charlie's QFT instruction videos" | https://drexfactor.com/weirdscience/2011/11/02/charlies_qft_instruction_videos_now_easier_watch | live, embed dead |

Playlist ID recovered from the Wayback snapshot dated 2018-06-16 of source 4,
because the live page's embed no longer renders.

## Catalog corrections this archive forces

1. **The acronym has a primary.** The catalog rule "no acronym gets expanded
   without a primary; the page writes 'QFT Notation' and stops" was written
   on the belief that no source expands it. The Home of Poi original does,
   in Drex's own first-person voice, in a post whose acknowledgements credit
   Charlie with "dreaming up this whole concept": *"Charlie's Quantized Field
   Theory for poi and one of its applications: notation for props."* Drex's
   own tag on the follow-up post is `quantum field theory`, which is where the
   confusion comes from. The AI-generated wiki is not the source and never
   needed to be.
2. **Charlie's own capitalization is QfT** — lowercase f — in his playlist
   title and chapter titles ("2.16: QfT Notation: Syntax Overview"). Drex
   writes QFT. If the catalog names the system, match the author.
3. **There is no single canonical QfT.** Charlie and Drex disagree in print
   about the poi's direction of travel at odd-numbered positions. See below.
   A catalog entry should not imply one settled system.
4. **The published system is single-plane and the write-up is incomplete.**
   The formula's hand term and class term were both deferred to follow-up
   posts that do not appear to exist. A forum question about horizontal-plane
   moves (corkscrew) went unanswered for 11 years.

## The system, as published

Quantize the circle into eighths. Number clockwise, **8 at the top**: 1 =
up/right, 2 = right, 3 = down/right, 4 = down, 5 = down/left, 6 = left,
7 = up/left, 8 = up. Drex on the direction choice: *"Because we made this
thing up and we say so."* He calls the diagram "home base."

A move is written as origin → destination per increment, with the path between
assumed continuous. Static spin is 8→1→2→3→4→5→6→7→8. A pendulum never touches
7, 8, or 1, because those point upward.

### The formula

```
a,b( h(±x±y±z)h' ){Class}a',b'
```

| Term | Meaning |
|---|---|
| `a` | prop position at origin |
| `b` | prop direction of movement at origin |
| `h(±x±y±z)h'` | the accurate hand-tracking method. Deferred by Drex; covered in Charlie's chapters 2.03–2.08 |
| `{Class}` | move-abbreviation system. Deferred by Drex; almost certainly Charlie's "Socket Syntax" (2.18–2.19) |
| `a'` | prop position at arrival |
| `b'` | prop direction of movement at arrival |

The article's tables are this formula with the variables spelled out as column
headings. The simplified hand substitution Drex uses throughout is
`hand depart / hand path radius / hand arrive`.

### Radius carries the shape

Radius is expressed in units of one poi length, *"because it's the only
constant distance we can think of in spinning."*

- Extension: radius 1, hand and poi orientations identical.
- Isolation: radius 0.5, hand and poi orientations flipped — the poi sits on
  the opposite side of the compass from the hand when both trace one circle.
- Cateye: radius 0.5, but poi orientation advances by 1 per step instead of
  skipping.

### Direction is what separates inspin from antispin

The 4-petal inspin and antispin flowers have **identical position columns**:

```
poi 8 → hand 8 → r1 → hand 1 → poi 5
poi 5 → hand 1 → r1 → hand 2 → poi 2
poi 2 → hand 2 → r1 → hand 3 → poi 7
poi 7 → hand 3 → r1 → hand 4 → poi 4
...
```

Only when direction-at-depart and direction-at-arrive are added do they
separate, and then they are exact opposites at every snapshot. This is the
load-bearing idea of the system.

Corner orientations read 5, 7, 1, 3 rather than the intuitive values because
**prop orientation is measured from the hand, not from the center of the
body**. Imagine home base projected out from the hand itself.

### The Charlie/Drex disagreement

At positions 1, 3, 5, 7, what direction is the prop traveling?

- **Drex:** always at a right angle to the tether. Nothing is ever out of
  resolution.
- **Charlie:** parallel to the instantaneous slope — the derivative of the
  curve. True only at 8, 2, 4, 6. Everywhere else is written **`n`**, "out of
  resolution."

Drex prints both table variants for cateye and triquetra. Unresolved as
published.

### Shortcuts

- Know the prop's downbeat count relative to the hand, then skip prop
  orientations by that number. Triquetra is 2 prop downbeats per hand
  downbeat, so hand 8→1 means prop 8→6.
- Counterclockwise hand paths: count down from 8 rather than up.

### Known weak spot

Drex concedes the triquetra comes out *"weird... REALLY weird"* at 8-point
resolution, because its interior points land at angles the eighths cannot
represent. He says he verified the points by hand and they are accurate,
just unintuitive. He notes both of his own usual transition points do appear.

## Images

`images/` — 20 files, 984K, pulled from the blog mirror 2026-07-26, all
HTTP 200, all verified as real JPEG/GIF data. These are the diagrams and
animations that are already dead on the forum original.

| File | Shows |
|---|---|
| `static.jpg`, `static2.gif` | home base diagram; static spin |
| `pendulum.gif` | pendulum |
| `homebasehand.jpg` | home base applied to the hand |
| `extension.jpg`, `extension.gif` | extension |
| `inspin4petal.jpg`, `inspinanimated.gif` | 4-petal inspin |
| `antispin4petal.jpg`, `antispinanimated.gif` | 4-petal antispin |
| `homebasedir.jpg` | home base as a direction compass |
| `extensiondir.jpg`, `extensiondiranimated.gif` | extension with direction |
| `antispindir.jpg`, `antispindiranimated.gif` | antispin with direction |
| `inspindir.jpg`, `inspindiranimated.gif` | inspin with direction |
| `isolationanimated.gif` | isolation |
| `cateyeanimated.gif` | cateye |
| `triquetraanimated.gif` | triquetra |

## Charlie's chapters (the only source for the complete formula)

| # | Title | Length | Video |
|---|---|---|---|
| 1 | 2.01, 2.02: Hand, Tether and Head Fields | 3:03 | VYeovga9DyA |
| 2 | 2.03, 2.04: Hand Position Field | 5:20 | UrARqFZ4smw |
| 3 | 2.5: Vector Fields h, a & b | 1:53 | hUsqhgWnKpA |
| 4 | 2.6: Hand Vector Field | 7:00 | FMwlBRk8ZDQ |
| 5 | 2.07, 2.08: Combining X,Y,Z (h) & (h') | 4:32 | skvUsT4KuZQ |
| 6 | 2.09, 2.10, 2.11, 2.12: Prop Vector Fields | 4:22 | DTH1adsN8iw |
| 7 | 2.13, 2.14, 2.15: Combining Tether & Momentum Vectors | 3:30 | 9KC_WBYZzoY |
| 8 | 2.16: QfT Notation: Syntax Overview | 2:59 | y3EuDza5hKU |
| 9 | 2.17: Writing and Reading QfT | 6:02 | h0EkQnOPMP4 |
| 10 | 2.18, 2.19: Socket Syntax | 3:40 | s-JZXO8HB-0 |

Watch as `https://www.youtube.com/watch?v=<id>`.

Chapters 5 and 10 are the two pieces the written guide never delivered. The
"2.x" numbering implies a section 1 that is not in this playlist.

## Not captured

Transcripts of the ten videos. Charlie's spoken lectures are his work, and a
full verbatim mirror of a 45-minute lecture is a different act from archiving
diagrams and structural facts. What is worth extracting is the *system* —
field definitions, the hand vector method, socket syntax rules — written up
as technical description, the way the sections above describe the written
guide. That is the remaining work, and it is the part worth asking Charlie
about directly, since he is reachable and the videos have under 1,200 views.
