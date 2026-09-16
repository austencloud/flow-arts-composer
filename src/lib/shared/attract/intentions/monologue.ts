/**
 * What a person would be thinking when they reach for a particular control.
 *
 * Austen, watching a tour (2026-08-05): *"He sure does say that's a lot of
 * buttons pretty often. Let's make it so he doesn't really do that and before he
 * clicks something let's have him process what he's about to click."*
 *
 * The old thoughts were written per INTENTION, so every effect chip got the same
 * line and every rail item got "What does X do?". The interesting unit is not
 * the intention, it is the CONTROL: pressing Mandala and pressing Tunnel are
 * different curiosities that happen to share a mechanism. So the vocabulary is
 * keyed by kind, with per-label overrides for the controls whose identity a
 * person would actually have an opinion about.
 *
 * Every line here is a MOTIVE — the reason to press it — not a description of
 * the button. "I want to see it from the inside" beats "Open Tunnel view".
 *
 * Lines are drawn with the seeded rng, so a replayed seed replays the monologue.
 */

import type { GhostKind } from "../domain/annotations";
import type { GhostContext } from "../domain/intention";

/**
 * Controls worth their own voice, matched on the label case-insensitively. These
 * are the ones a passerby can see the point of — the viewer's content modes, the
 * named effects, the props.
 */
const BY_LABEL: Record<string, string[]> = {
  // Viewer content rail
  "side by side": [
    "Can I watch both at once?",
    "I want to see them next to each other.",
  ],
  "2d animation": [
    "Just the clean version, no depth.",
    "Back to the flat one.",
  ],
  "3d animation": [
    "What does this look like in three dimensions?",
    "Let's see it in 3D.",
  ],
  // Austen's corrections (2026-08-05): a person names the THING, they do not
  // narrate its purpose. "Let's see what it looks like in a tunnel", not "I want
  // to see it from the inside." The card is something you review or send, not
  // something you hold. And nobody says "what does the whole thing look like as
  // one picture" — they just press it and see.
  card: [
    "Let's look at the card.",
    "I want to see the card for this.",
    "I'm going to send this to somebody.",
  ],
  mandala: ["Let's see what this is.", "What's this one?"],
  tunnel: [
    "Let's see what it looks like in a tunnel.",
    "What's this pinwheel mean?",
  ],
  playback: ["Let me get at the playback controls.", "How do I drive this?"],
  props: ["What else could I be spinning?", "Let's change what's in my hands."],
  display: [
    "What can I turn on and off here?",
    "Let me see the display options.",
  ],

  // Props
  staff: ["Staves are what this was built for.", "Back to staves."],
  fan: ["Fans would show the sweep better.", "What about fans?"],
  club: ["Clubs have a different weight to them.", "Let's try clubs."],
  buugeng: ["Buugeng do that overlapping thing.", "What about buugeng?"],
  sword: ["A sword is just a very confident staff.", "Let's try a sword."],
  hoop: ["Hoops read completely differently.", "What about hoops?"],
  triad: ["Triads, then.", "Let's see triads."],

  /*
   * One commentary per effect, against the real registry labels (16 slots as of
   * 2026-08-05). Two rules learned from Austen's corrections: name the THING
   * ("let's set it on fire"), do not narrate its purpose ("I want to see the
   * path it draws" is a designer explaining a feature). And the FIRST time the
   * ghost meets any of these it says "I wonder what this button does" instead —
   * these lines are for the second meeting onward.
   */
  fire: ["Fire. Obviously fire.", "Let's set it on fire."],
  // Draws the tip's path (trail-renderer-3d).
  trails: ["Trails on.", "I want to see the shape it makes."],
  // Billboard bulbs with continuous ribbon trails — glowstick/LED-poi look.
  led: ["Let's make it glow like glowsticks.", "LED, like a night jam."],
  // Sparks BURST from the tips on direction changes and fall under gravity,
  // hot→cool ramp (charcoal-renderer-3d). Not embers smouldering — struck sparks.
  coal: ["Let's make it throw sparks.", "Sparks off the ends, then."],
  // A bolt arcs BETWEEN the left prop's end and the right prop's matching end.
  // The interesting part is that it connects the two hands, which "let's make it
  // electric" completely misses.
  zap: ["Let's make it arc between the two.", "Lightning between the hands?"],
  sparkle: ["A bit of sparkle can't hurt.", "Let's make it twinkle."],
  // Onion-skin: faded copies of the REAL prop sprite at recent past poses.
  // First meeting goes through FIRST_ENCOUNTER ("What does Ghost do?"); coming
  // back to it is fondness, not fresh curiosity.
  ghost: ["I liked that ghost effect.", "Ghost again — the copies are nice."],
  // Per-tip light source, glow around the ends.
  bloom: ["Let's make the ends glow.", "Bloom — softer light."],
  // Beads of liquid laid along the path, merged into blobs with surface tension.
  goo: ["Goo. That sounds ridiculous.", "Let's make it gooey."],
  bubbles: ["Bubbles, why not.", "Let's fill it with bubbles."],
  // Petals launch along the prop's actual arc, then flutter down.
  petals: ["Let's throw petals off it.", "Petals would be pretty."],
  smoke: ["Let's put it in smoke.", "Smoke off the ends."],
  // Brush stamps with paper-fibre noise — it paints.
  ink: ["Let's make it paint.", "Ink — like a brush on paper."],
  // A traced ribbon following the tip.
  silk: ["Let's give it ribbons.", "Silk — that'll flow."],
  // A CREATURE whose head is the prop tip: spine chain, undulating body, snake
  // tongue, dragon crest and horns. The best-kept secret in the panel.
  // Default creature is SNAKE (defaults.ts), with dragon and caterpillar as
  // presets — so "the dragon one" would have been a lie most of the time.
  animal: [
    "Let's turn it into a creature.",
    "The snake one. Let's do that again.",
  ],
  // Expanding shockwave rings from the tip along its travel axis.
  pulse: ["Let's make it send out rings.", "Pulse — shockwaves off the ends."],

  // Tempo
  slow: ["Slower. I want to see the hands.", "Too fast — let's slow it down."],
  med: ["Somewhere in the middle.", "A normal speed."],
  fast: ["Faster — what does that feel like?", "Let's see it up to speed."],

  // Blockers / plumbing
  "skip for now": ["Not right now, thanks.", "I'd rather just poke around."],
  skip: ["I'll figure it out myself.", "Not the guided version."],
  // A motive, not a reaction. "Wait — can it see me?" belongs AFTER the stream
  // connects and lives in try-practice's `reaction`, gated on cameraLive.
  mirror: ["Let's put me behind it.", "What does the mirror do?"],
  practice: ["Can I do this with it?", "Let me try it myself."],
  stop: ["Alright, that's enough of that.", "Back to the sequence."],
};

/**
 * Fallback by role, for the controls whose specific identity does not matter —
 * one of forty option cards, an anonymous chip. `{label}` interpolates.
 */
const BY_KIND: Partial<Record<GhostKind, string[]>> = {
  option: [
    "{label} could work next.",
    "What if {label} came next?",
    "Let's try {label} here.",
    "{label} looks like it fits.",
  ],
  "start-placement": [
    "Let's start from {label}.",
    "{label} is a good place to begin.",
    "I'll open with {label}.",
  ],
  effect: [
    "What does {label} do to it?",
    "Let's try {label}.",
    "{label}, then.",
  ],
  "effect-param": ["A little more of that.", "What if I nudge this?"],
  prop: ["What if these were {label}?", "Let's put {label} in its hands."],
  tempo: ["What about {label}?", "Let's try it {label}."],
  curio: [
    "What does {label} do?",
    "I've not pressed {label} yet.",
    "{label}. No idea what that is.",
    "Let's find out what {label} is.",
  ],
  "gallery-item": [
    "Somebody else made this one.",
    "Let's look at this one properly.",
    "What did they come up with?",
  ],
  viewer: ["Let's see this properly.", "I want a better look at it."],
  play: ["Let's see it move.", "Now watch."],
  clear: [
    "Let's try something completely different.",
    "Scrap it and start over.",
  ],
  confirm: ["Yes, get rid of it.", "Go on then."],
  dismiss: ["Not right now, thanks.", "I'd rather just look around."],
  "close-overlay": ["Right — what else was there?", "Enough of that."],
  turn: ["What if this hand turned instead?", "Let's add a turn here."],
  "option-filter": [
    "I wonder if anything continues from this.",
    "Let's narrow it down.",
  ],
  "nav-module": ["I haven't looked at {label} yet.", "What's in {label}?"],
  stage: ["…", "That's rather nice."],
};

/**
 * What you say about a control you have never touched. Austen (2026-08-05):
 * *"Or I wonder what this button does if they haven't encountered it yet."*
 *
 * This is the honest order of operations for a stranger at a laptop. You cannot
 * want to see the tunnel view before you know the pinwheel opens one — the first
 * press is curiosity about an unknown icon, and only after that does the control
 * have a name and a reason. So the specific motive is held back until the ghost
 * has actually met the thing.
 */
const FIRST_ENCOUNTER = [
  "I wonder what this button does.",
  "What's this one?",
  "No idea what that does. Let's find out.",
  "Let's see what this is.",
];

/**
 * Same beat, but the control has a name on it — Austen's example (2026-08-05)
 * was Ghost: *"it can wonder what does the ghost mean or what does the ghost
 * do."* Naming the unknown thing is stronger than "this button", and it teaches
 * the passerby the vocabulary on the way past.
 */
const FIRST_ENCOUNTER_NAMED = [
  "What does {label} do?",
  "What does {label} even mean?",
  "{label}? No idea. Let's find out.",
  "What's {label}?",
];

/**
 * Said AFTER the press, once the thing has happened. A reaction, not a motive —
 * "OK, that was kind of neat" only makes sense on the way out.
 */
const REACTIONS: Record<string, string[]> = {
  tunnel: ["Oh, that's the pinwheel.", "Huh. Neat."],
  mandala: ["OK, that was kind of neat.", "That's the whole thing at once."],
  card: ["That's the card, then.", "Tidy."],
  "3d animation": ["There it is in 3D.", "Oh, that's better."],
  _default: ["Huh.", "OK.", "That was kind of neat.", "…nice."],
};

/**
 * A line for after the press. Only offered for controls worth reacting to, and
 * `null` the rest of the time — a reaction to every single click would be
 * chattier than a person.
 */
export function reactionFor(
  target: HTMLElement | null,
  ctx: GhostContext
): string | null {
  const label = tidy(readLabel(target)).toLowerCase();
  const pool = REACTIONS[label];
  if (pool) return ctx.rng.pick(pool) ?? null;
  // Occasionally react to anything at all, so the pauses are not silent every
  // time without being narrated every time either.
  if (ctx.rng.next() < 0.25) return ctx.rng.pick(REACTIONS._default!) ?? null;
  return null;
}

/**
 * The one key `askedAbout` is written and read with. It has to be a single
 * function: the first-encounter line depends on a hit in that set, so a
 * lookup that normalises differently from the write silently makes every
 * control a stranger forever.
 */
export function encounterKey(target: HTMLElement | null): string {
  return tidy(readLabel(target)).toLowerCase();
}

/** Mark a control as met, so next time it gets its real motive. */
export function noteEncounter(
  ctx: GhostContext,
  target: HTMLElement | null
): void {
  const key = encounterKey(target);
  if (key) ctx.askedAbout.add(key);
}

function readLabel(target: HTMLElement | null): string {
  return (
    target?.getAttribute("data-ghost-label") ??
    target?.getAttribute("aria-label") ??
    target?.textContent ??
    ""
  );
}

/** Strip the punctuation and boilerplate a label picks up from UI copy. */
function tidy(label: string): string {
  return label
    .replace(/\.\s*Hold to preview\.?/i, "")
    .replace(/^Select\s+/i, "")
    .replace(/^(Switch to|Show|Open|Go to)\s+/i, "")
    .trim();
}

/**
 * The line the ghost thinks before pressing `target`. Falls back through
 * label-specific → kind-generic → a plain honest line, so a control nobody has
 * written a motive for still gets something a person might say.
 */
export function monologueFor(
  kind: GhostKind,
  target: HTMLElement | null,
  ctx: GhostContext,
  fallback: string
): string {
  const label = tidy(readLabel(target));

  // Never met it: curiosity about an unknown icon, not a reason to want what it
  // does. Only applies to the discovery kinds — a person does not wonder what an
  // option card or a start position "does".
  const isDiscovery = kind === "curio" || kind === "effect" || kind === "prop";
  if (isDiscovery && label && !ctx.askedAbout.has(label.toLowerCase())) {
    // A short, real name is worth saying out loud ("What does Ghost do?"). A long
    // one is UI copy and reads badly in a thought bubble, so those stay generic.
    const named = label.length <= 12 && !label.includes(" ");
    const pool = named ? FIRST_ENCOUNTER_NAMED : FIRST_ENCOUNTER;
    const line = ctx.rng.pick(pool) ?? fallback;
    return line.replaceAll("{label}", label);
  }

  const specific = label ? BY_LABEL[label.toLowerCase()] : undefined;
  const generic = BY_KIND[kind];
  const pool = specific ?? generic;
  if (!pool?.length) return fallback;

  const line = ctx.rng.pick(pool) ?? fallback;
  // A `{label}` line with no label to put in it would read as a template bug.
  if (line.includes("{label}")) {
    return label ? line.replaceAll("{label}", label) : fallback;
  }
  return line;
}
