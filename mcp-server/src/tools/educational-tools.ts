/**
 * Educational Tools
 *
 * Tools for learning about TKA: get_alphabet_info, get_letter_explanation,
 * get_term_definition, compare_letters, list_letters_by_type, get_placement_info
 * (get_position_info kept as a deprecated alias for get_placement_info)
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  ensureDataLoaded,
  LETTER_TO_TYPE,
  getGlossary,
  getLetterTypes,
} from "../shared/server-context.js";
import {
  resolveTermAlias,
  PLACEMENT_DEFINITIONS,
  listDomainTopics,
  findDomainTopic,
} from "@tka/domain";

export function registerEducationalTools(server: McpServer): void {
  // Tool: get_alphabet_info
  server.tool(
    "get_alphabet_info",
    "Get comprehensive information about the TKA (The Kinetic Alphabet) system. Use this to understand the domain before working with pictographs.",
    {
      compact: z
        .boolean()
        .optional()
        .default(false)
        .describe("Compact output - essential facts only (saves ~1500 tokens)"),
    },
    async ({ compact = false }) => {
      if (compact) {
        return {
          content: [
            {
              type: "text" as const,
              text: `TKA Quick Reference:
- Grid: 8 points (N,E,S,W + NE,SE,SW,NW) + center (Level 4)
- Placements: Alpha=opposite, Beta=same, Gamma=right-angle, Zeta=obtuse, Eta=acute, Tau=one-center, Terra=both-center
- Hand paths: Static=stay, Shift=arc to adjacent, Dash=straight to opposite(180°), Hash=straight to/from center (L4, "half-dash")
- Prop rotations: Pro=with hand path (0 turns=isolation, preserves center-relative orientation), Anti=against, Float=holds absolute spatial angle
- Types: 1=Dual-Shift(A-V), 2=Shift(W-Ω), 3=Cross-Shift(W--Ω-), 4=Dash(base Φ,Ψ,Λ; registered L4 extension τ-), 5=Dual-Dash(Φ-,Ψ-,Λ-), 6=Static(α,β,γ)
- Skewed placements (zeta/eta) are their own L5 placements. A-L and M-V are Type 1 letters for the 4-point grid (alpha/beta and gamma respectively); how Type 1 letters apply to zeta/eta transitions is a separate, unresolved question — don't assume either group "handles" skewed transitions. Type 4 in skewed uses Phi(diverge)/Psi(converge), Lambda can't be skewed
- "[Letter] dash" = Type 3 with "-" suffix (e.g. "Σ dash" = Σ-)
- Orientations: in, out, clock, counter + Level 6 interradial: clockIn, clockOut, counterIn, counterOut
- VTG (Vulcan Tech Gospel): Split-Same, Tog-Same, Split-Opp, Tog-Opp
- Levels: 1=0 turns, 2=whole turns, 3=half turns+float, 4=centric grid, 5=skewed grid, 6=interradials (2D complete), 7=conjoined grids, 8=atomics (3D), 9=Rubik's cube (3D complete)
- Compounds: DJ, EK, FL (β↔α cycles), MP, NQ, OR (γ→γ cycles), ΦΨ (dash cycle)`,
            },
          ],
        };
      }
      const info = `# The Kinetic Alphabet (TKA) - Domain Reference

## Overview

TKA is a notation system for flow arts, built for double staves. Each staff has two visible ends -- a thumb reference and a pinky reference -- that never change with proper technique. This dual-end landmark system is the foundation of TKA's orientation framework. Other static props (fans, clubs, buugeng) work but staves are canonical. Each "pictograph" represents one step of motion showing:
- Left and right props at specific grid locations (canonically blue and red)
- Motion arrows showing how each hand moves
- Start and end placements

## The Grid System

Pictographs use a grid with up to 9 points:
- **Cardinal** (4): North (n), East (e), South (s), West (w)
- **Intercardinal** (4): Northeast (ne), Southeast (se), Southwest (sw), Northwest (nw)
- **Center** (1): The center point (Level 4)

**Grid Modes:**
- **Diamond**: Cardinal points only (default)
- **Box**: Intercardinal points only
- **Centric**: At least one hand at center (Level 4)
- **Skewed**: One cardinal + one intercardinal (Level 5)

## Hand Placements

- **Alpha (α)**: Hands at opposite points (180°)
- **Beta (β)**: Hands at the same point (0°)
- **Gamma (γ)**: Hands form a right angle (90°)
- **Tau (τ)**: One hand at center, one not (Level 4)
- **Terra**: Both hands at center (Level 4)
- **Zeta (ζ)**: Hands form an obtuse angle (~135°, Level 5)
- **Eta (η)**: Hands form an acute angle (~45°, Level 5)

## Hand Paths

- **Static**: Hand stays at current grid point
- **Shift**: Hand arcs along the perimeter to an adjacent grid point (curved path)
- **Dash**: Hand moves in a straight line to the opposite grid point (180°)
- **Hash**: Hand moves in a straight line to or from the center point (Level 4). A "half-dash."

## Prop Rotation Types

- **Pro (prospin)**: Prop rotates with hand's travel direction. At 0 turns = isolation (center-relative orientation preserved, creating the visual effect of a fixed point — distinct from float, which holds absolute spatial angle)
- **Anti (antispin)**: Prop rotates against hand's travel. Creates petal-like patterns
- **Float**: Prop does not rotate at all during a shift. Pure translation

## Orientations

The facing direction of a prop relative to the performer's center. Eight values across the level system:
- **Cardinal** (all levels): in, out, clock, counter
- **Interradial** (Level 6+): clockIn, clockOut, counterIn, counterOut — at 45° between the cardinal orientations

## Turns

Additional prop rotation beyond base behavior. 1 turn = 180° additional rotation.
- Level 1: 0 turns only
- Level 2: whole turns (0, 1, 2, 3)
- Level 3: half turns + float (0, 0.5, 1, 1.5, 2, 2.5, 3)

## Spinning Planes

Props trace circles on a plane in space. Three planes exist:
- **Wall**: Vertical, facing the audience
- **Wheel**: Vertical, perpendicular to audience (like a bicycle wheel)
- **Overhead**: Horizontal, above the performer

All levels 1-7 work on a single plane at a time (any of the three). Level 8 (atomics) will introduce patterns where two props are on different planes simultaneously — analogous to how Level 5 expanded from single-grid to mixed-grid.

## Conjoined Grids (Level 7)

Two grids sharing a junction point, each showing one hand's motion. Expands the spatial canvas while staying in 2D. Creates new placement combinations that can't exist on a single grid, including patterns with two center points. Uses existing placement terminology (alpha, beta, gamma) to express the new spatial relationships across paired grids.

## The 6 Letter Types

### Type 1: Dual-Shift (22 letters: A-V)
Both hands shift. The most common type.

### Type 2: Shift (8 letters: W, X, Y, Z, Σ, Δ, Θ, Ω)
One hand shifts, one stays static.

### Type 3: Cross-Shift (8 letters: W-, X-, Y-, Z-, Σ-, Δ-, Θ-, Ω-)
One hand shifts + one hand dashes. Named with "-" suffix.
- **CRITICAL**: "Sigma dash" = Σ- (the Type 3 letter), NOT "Sigma with dash motion"

### Type 4: Dash (3 Level 1 letters: Φ, Ψ, Λ; Level 4 extension: τ-)
One hand follows the dash family and one stays static. Tau-Dash (τ-) is a registered Level 4 letter with the static hand at center; it does not yet have variations in the Level 1 pictograph dataframe.

### Type 5: Dual-Dash (3 letters: Φ-, Ψ-, Λ-)
Both hands dash. Named with "-" suffix.

### Type 6: Static (3 letters: α, β, γ)
Both hands remain stationary.

## Compound Letters

Pairs that complete a full cycle of motion:
- **DJ** (Disco Jam): D (β→α) + J (α→β) — pro/pro isolation
- **EK** (Exploding Kitten): anti/anti compound
- **FL** (Fruity Loops): hybrid compound
- **MP** (Magic Potion), **NQ** (Never Quit), **OR** (Open Road): γ→γ compounds
- **ΦΨ**: dash compound (one hand dashes, one stays static)

## VTG (Vulcan Tech Gospel)

An older, widely-adopted notation from the Vulcan Lofts in Oakland. Ground-referenced (downbeat = south).
"Same/opposite" refers to **hand path direction** (both hands arc the same way vs opposite ways), not prop rotation direction.
- **Split-Same (SS)**: props 180° out of phase, hands arc same way. Alpha letters (A, B, C) are always SS.
- **Together-Same (TS)**: props in sync, hands arc same way. Beta letters (G, H, I) are always TS.
- **Split-Opposite (SO)**: out of phase, hands arc opposite ways.
- **Together-Opposite (TO)**: in sync, hands arc opposite ways.

TKA maps: split = alpha (opposite), tog/together = beta (same point).

## Reversals

Three types of directional changes, indicated by colored dots on the left edge of the pictograph:
- **Hand reversal**: Hand goes back, prop continues. Switches pro↔anti.
- **Prop reversal**: Hand continues, prop reverses. Switches pro↔anti.
- **Full reversal**: Both retrace. Maintains pro/anti.

## LOOPs (Circular Sequences)

Sequences that return home through transformations:
- **Rotated**: Placements continue rotating same direction (180° or 90° slices)
- **Reflection**: Reflect across N-S, E-W, NE-SW, or NW-SE
- **Mirrored**: Familiar name for N-S reflection
- **Flipped**: Familiar name for E-W reflection
- **Swapped**: Left/right hand roles swap
- **Inverted**: Pro↔Anti motions swap
- **Rewound**: Second half plays in reverse

Reflection axis is independent of grid mode. Diamond, Box, and Skewed
sequences can use any of the four axes. A direct reflected LOOP closes because
reflection is its own inverse: S→R(S), then R(S)→S. Do not require S to lie on
the axis unless an already-closed block is being wrapped by an absolute outer
reflection.

## Letters on the 8-Point Grid (Skewed Placements)

Skewed placements (Zeta at 135°, Eta at 45°) are asymmetric like gamma. This affects which letters apply:

**Type 1 (Dual-Shift):** A-L and M-V are defined by 4-point-grid placements (alpha/beta and gamma respectively). How Type 1 letters apply to zeta/eta transitions is a separate question this system prompt does NOT answer. Do not assume "all skewed Type 1 uses M-V, not A-L" — that earlier claim was wrong. If asked, defer to the Skewed pictograph dataframe or Austen directly rather than guessing.

**Type 4 (Dash):** Phi = diverging (Eta→Zeta, angle increases). Psi = converging (Zeta→Eta, angle decreases). Lambda cannot be skewed because gamma (90°) requires both hands on the same grid.

**Placement halves:** Gamma, Zeta, and Eta each have two internal halves based on which hand is directionally ahead. In gamma, opposite-direction shifts swap halves while staying in gamma. In Zeta/Eta, opposite-direction shifts leave the placement entirely (Zeta becomes Eta and vice versa), so the halves are more isolated.

**Notation:** In written sequences, curly braces delimit skewed territory: A{MP}G means A in standard, MP in skewed, G back to standard.

## Variations

Each letter has multiple variations based on starting/ending placements, rotation directions, and grid locations.
Use \`list_letter_variations\` to see all variations for a specific letter.`;

      return {
        content: [
          {
            type: "text" as const,
            text: info,
          },
        ],
      };
    }
  );

  // Tool: get_letter_explanation
  server.tool(
    "get_letter_explanation",
    "Get a comprehensive explanation of a TKA letter including its type, motion characteristics, and all variations. Perfect for teaching users about specific letters.",
    {
      letter: z.string().describe("The letter to explain (A-Z or Greek)"),
      variation: z
        .number()
        .optional()
        .default(0)
        .describe("Specific variation to focus on (0-based, optional)"),
      compact: z
        .boolean()
        .optional()
        .default(false)
        .describe("Compact output - key facts only (saves ~600 tokens)"),
    },
    async ({ letter, variation = 0, compact = false }) => {
      const allPictographs = ensureDataLoaded();
      const letterTypes = getLetterTypes();
      const variations = allPictographs.filter((p) => p.letter === letter);

      if (variations.length === 0) {
        const registeredType = LETTER_TO_TYPE[letter];
        return {
          content: [
            {
              type: "text" as const,
              text: registeredType
                ? `Letter "${letter}" is registered as Type ${registeredType.type.replace("type", "")}, but it has no variations in the current pictograph dataframe. Use get_term_definition for its glossary entry.`
                : `Letter "${letter}" is not in the registered TKA alphabet or the current pictograph dataframe. Use list_available_letters to inspect the dataframe set.`,
            },
          ],
          isError: !registeredType,
        };
      }

      const typeInfo = LETTER_TO_TYPE[letter];
      const typeNum = typeInfo?.type.replace("type", "") || "unknown";
      const fullTypeInfo = letterTypes[typeNum];

      if (compact) {
        const varData = variations[Math.min(variation, variations.length - 1)];
        return {
          content: [
            {
              type: "text" as const,
              text: `${letter}: Type ${typeNum} (${fullTypeInfo?.name || "?"}) | Left hand: ${varData.leftMotion.motionType} | Right hand: ${varData.rightMotion.motionType} | ${variations.length} variations | Var ${variation}: ${varData.startPlacement}→${varData.endPlacement}`,
            },
          ],
        };
      }

      const varData = variations[Math.min(variation, variations.length - 1)];

      // Describe rotation type in human-readable form
      const describeMotion = (motion: typeof varData.leftMotion) => {
        const mt = motion.motionType;
        const rd = motion.rotationDirection;
        if (mt === "static") return "static (no hand movement)";
        if (mt === "dash") return "dash (moves to opposite point)";
        // shift: motionType is pro/anti, rotationDirection is the absolute CW/CCW
        const dirLabel =
          rd === "cw" ? "clockwise" : rd === "ccw" ? "counter-clockwise" : "";
        return dirLabel ? `${mt} (${dirLabel})` : mt;
      };

      const explanation = `# Letter: ${letter}

## Type Information
**Type ${typeNum}: ${fullTypeInfo?.name || typeInfo?.name || "Unknown"}**

${fullTypeInfo?.description || ""}

${fullTypeInfo?.characteristics ? "**Characteristics:**\n" + fullTypeInfo.characteristics.map((c) => `- ${c}`).join("\n") : ""}

## Motion Pattern
- **Left hand:** ${describeMotion(varData.leftMotion)}
- **Right hand:** ${describeMotion(varData.rightMotion)}

## Variation ${variation} Details
- **Start placement:** ${varData.startPlacement}
- **End placement:** ${varData.endPlacement}
- **Left-hand motion:** ${varData.leftMotion.startLocation} → ${varData.leftMotion.endLocation}
- **Right-hand motion:** ${varData.rightMotion.startLocation} → ${varData.rightMotion.endLocation}

## All Variations (${variations.length} total)
${variations
  .slice(0, 5)
  .map((v, i) => `[${i}] ${v.startPlacement} → ${v.endPlacement}`)
  .join(
    "\n"
  )}${variations.length > 5 ? `\n... and ${variations.length - 5} more` : ""}

## Related Letters
Other Type ${typeNum} letters: ${
        fullTypeInfo?.letters
          ?.filter((l) => l !== letter)
          .slice(0, 5)
          .join(", ") || "N/A"
      }`;

      return {
        content: [{ type: "text" as const, text: explanation }],
      };
    }
  );

  // Tool: get_term_definition
  server.tool(
    "get_term_definition",
    "Get the definition of a TKA domain term like alpha, pro, shift, static, etc. Returns definition, examples, and related terms.",
    {
      term: z
        .string()
        .describe(
          "The term to define (e.g., alpha, pro, shift, dash, static, beta, gamma)"
        ),
    },
    async ({ term }) => {
      const glossary = getGlossary();
      const normalizedTerm = term.toLowerCase().trim();

      const resolvedTerm = glossary[normalizedTerm]
        ? normalizedTerm
        : resolveTermAlias(normalizedTerm);
      const entry = glossary[resolvedTerm];

      if (!entry) {
        // Fuzzy match: check for substring matches and Levenshtein-like proximity
        const allKeys = Object.keys(glossary);
        const possibleMatches = allKeys
          .filter(
            (key) =>
              key.includes(normalizedTerm) || normalizedTerm.includes(key)
          )
          .slice(0, 5);

        // If no substring match, try finding keys that share significant characters
        if (possibleMatches.length === 0) {
          const scored = allKeys
            .map((key) => {
              let score = 0;
              const shorter =
                normalizedTerm.length < key.length ? normalizedTerm : key;
              const longer =
                normalizedTerm.length < key.length ? key : normalizedTerm;
              for (const char of shorter) {
                if (longer.includes(char)) score++;
              }
              return { key, score: score / longer.length };
            })
            .filter(({ score }) => score > 0.5)
            .sort((a, b) => b.score - a.score)
            .slice(0, 5);
          if (scored.length > 0) {
            possibleMatches.push(...scored.map((s) => s.key));
          }
        }

        return {
          content: [
            {
              type: "text" as const,
              text: `Term "${term}" not found in the TKA glossary.${
                possibleMatches.length > 0
                  ? `\n\nDid you mean: ${possibleMatches.join(", ")}?`
                  : "\n\nAvailable terms include: " +
                    allKeys.slice(0, 10).join(", ") +
                    "..."
              }`,
            },
          ],
        };
      }

      const output = `# ${term.charAt(0).toUpperCase() + term.slice(1)}

**Definition:** ${entry.definition}

**Examples:**
${entry.examples.map((e) => `- ${e}`).join("\n")}

**Related terms:** ${entry.relatedTerms.join(", ")}

**Category:** ${entry.category}`;

      return {
        content: [{ type: "text" as const, text: output }],
      };
    }
  );

  // Tool: compare_letters
  server.tool(
    "compare_letters",
    "Compare two TKA letters side by side, explaining their differences in type, motion patterns, and characteristics.",
    {
      letter1: z.string().describe("First letter to compare"),
      letter2: z.string().describe("Second letter to compare"),
    },
    async ({ letter1, letter2 }) => {
      const allPictographs = ensureDataLoaded();
      const letterTypes = getLetterTypes();

      const var1 = allPictographs.filter((p) => p.letter === letter1);
      const var2 = allPictographs.filter((p) => p.letter === letter2);

      if (var1.length === 0) {
        return {
          content: [
            { type: "text" as const, text: `Letter "${letter1}" not found.` },
          ],
          isError: true,
        };
      }
      if (var2.length === 0) {
        return {
          content: [
            { type: "text" as const, text: `Letter "${letter2}" not found.` },
          ],
          isError: true,
        };
      }

      const type1 = LETTER_TO_TYPE[letter1];
      const type2 = LETTER_TO_TYPE[letter2];
      const typeNum1 = type1?.type.replace("type", "") || "?";
      const typeNum2 = type2?.type.replace("type", "") || "?";

      const rep1 = var1[0];
      const rep2 = var2[0];

      // Helper to describe rotation type
      const describeRotation = (motion: typeof rep1.leftMotion) => {
        if (motion.motionType === "static") return "static";
        if (motion.motionType === "dash") return "dash";
        const dir = motion.rotationDirection;
        const dirLabel =
          dir === "cw" ? "clockwise" : dir === "ccw" ? "counter-clockwise" : "";
        return dirLabel
          ? `${motion.motionType} (${dirLabel})`
          : motion.motionType;
      };

      const similarities: string[] = [];
      const differences: string[] = [];

      if (typeNum1 === typeNum2) {
        similarities.push(
          `Both are Type ${typeNum1} (${letterTypes[typeNum1]?.name || type1?.name})`
        );
      } else {
        differences.push(
          `Different types: ${letter1} is Type ${typeNum1} (${letterTypes[typeNum1]?.name}), ${letter2} is Type ${typeNum2} (${letterTypes[typeNum2]?.name})`
        );
      }

      // Compare motion types
      if (rep1.leftMotion.motionType === rep2.leftMotion.motionType) {
        similarities.push(
          `Both have ${rep1.leftMotion.motionType} left-hand motion`
        );
      } else {
        differences.push(
          `Left-hand motion differs: ${letter1} uses ${rep1.leftMotion.motionType}, ${letter2} uses ${rep2.leftMotion.motionType}`
        );
      }

      if (rep1.rightMotion.motionType === rep2.rightMotion.motionType) {
        similarities.push(
          `Both have ${rep1.rightMotion.motionType} right-hand motion`
        );
      } else {
        differences.push(
          `Right-hand motion differs: ${letter1} uses ${rep1.rightMotion.motionType}, ${letter2} uses ${rep2.rightMotion.motionType}`
        );
      }

      // Compare rotation directions (the key differentiator for same-type letters)
      if (
        rep1.leftMotion.rotationDirection === rep2.leftMotion.rotationDirection
      ) {
        if (rep1.leftMotion.rotationDirection !== "noRotation") {
          similarities.push(
            `Both have ${describeRotation(rep1.leftMotion)} left-hand rotation`
          );
        }
      } else {
        differences.push(
          `Left-hand rotation differs: ${letter1} is ${describeRotation(rep1.leftMotion)}, ${letter2} is ${describeRotation(rep2.leftMotion)}`
        );
      }

      if (
        rep1.rightMotion.rotationDirection ===
        rep2.rightMotion.rotationDirection
      ) {
        if (rep1.rightMotion.rotationDirection !== "noRotation") {
          similarities.push(
            `Both have ${describeRotation(rep1.rightMotion)} right-hand rotation`
          );
        }
      } else {
        differences.push(
          `Right-hand rotation differs: ${letter1} is ${describeRotation(rep1.rightMotion)}, ${letter2} is ${describeRotation(rep2.rightMotion)}`
        );
      }

      // Compare placement patterns
      const startPos1 = rep1.startPlacement.replace(/\d+/g, "");
      const endPos1 = rep1.endPlacement.replace(/\d+/g, "");
      const startPos2 = rep2.startPlacement.replace(/\d+/g, "");
      const endPos2 = rep2.endPlacement.replace(/\d+/g, "");
      const pattern1 = `${startPos1}→${endPos1}`;
      const pattern2 = `${startPos2}→${endPos2}`;

      if (pattern1 === pattern2) {
        similarities.push(`Same placement pattern: ${pattern1}`);
      } else {
        differences.push(
          `Placement pattern differs: ${letter1} is ${pattern1}, ${letter2} is ${pattern2}`
        );
      }

      if (Math.abs(var1.length - var2.length) <= 2) {
        similarities.push(
          `Similar variation count: ${letter1} has ${var1.length}, ${letter2} has ${var2.length}`
        );
      } else {
        differences.push(
          `Different variation counts: ${letter1} has ${var1.length}, ${letter2} has ${var2.length}`
        );
      }

      // Detect special relationships
      const relationships: string[] = [];

      // Check inversion pair (same motions, opposite rotations)
      if (
        rep1.leftMotion.motionType === rep2.leftMotion.motionType &&
        rep1.rightMotion.motionType === rep2.rightMotion.motionType &&
        rep1.leftMotion.rotationDirection !==
          rep2.leftMotion.rotationDirection &&
        rep1.leftMotion.rotationDirection !== "noRotation" &&
        pattern1 === pattern2
      ) {
        relationships.push(
          `**Inversion pair**: ${letter1} and ${letter2} are the same motion with opposite rotations (pro↔anti). Used in the inverted LOOP transformation.`
        );
      }

      // Check compound pair (opposite placement transitions)
      if (
        startPos1 === endPos2 &&
        endPos1 === startPos2 &&
        startPos1 !== endPos1
      ) {
        relationships.push(
          `**Compound pair**: ${letter1} (${pattern1}) and ${letter2} (${pattern2}) complete a full cycle together.`
        );
      }

      const output = `# Comparison: ${letter1} vs ${letter2}

## At a Glance
| Property | ${letter1} | ${letter2} |
|----------|------------|------------|
| Type | ${typeNum1} (${letterTypes[typeNum1]?.name || "?"}) | ${typeNum2} (${letterTypes[typeNum2]?.name || "?"}) |
| Left-hand motion | ${describeRotation(rep1.leftMotion)} ${rep1.leftMotion.motionType} | ${describeRotation(rep2.leftMotion)} ${rep2.leftMotion.motionType} |
| Right-hand motion | ${describeRotation(rep1.rightMotion)} ${rep1.rightMotion.motionType} | ${describeRotation(rep2.rightMotion)} ${rep2.rightMotion.motionType} |
| Placement pattern | ${pattern1} | ${pattern2} |
| Variations | ${var1.length} | ${var2.length} |

## Similarities
${similarities.length > 0 ? similarities.map((s) => `- ${s}`).join("\n") : "- No major similarities"}

## Differences
${differences.length > 0 ? differences.map((d) => `- ${d}`).join("\n") : "- No major differences"}
${relationships.length > 0 ? `\n## Relationships\n${relationships.map((r) => `- ${r}`).join("\n")}` : ""}

## When to Use Each
- **${letter1}:** ${letterTypes[typeNum1]?.description || "Type " + typeNum1 + " letter"}
- **${letter2}:** ${letterTypes[typeNum2]?.description || "Type " + typeNum2 + " letter"}`;

      return {
        content: [{ type: "text" as const, text: output }],
      };
    }
  );

  // Tool: list_letters_by_type
  server.tool(
    "list_letters_by_type",
    "List all letters of a specific type (1-6) with descriptions and motion patterns.",
    {
      type: z
        .number()
        .min(1)
        .max(6)
        .describe(
          "Letter type (1-6): 1=Dual-Shift, 2=Shift, 3=Cross-Shift, 4=Dash, 5=Dual-Dash, 6=Static"
        ),
      compact: z
        .boolean()
        .optional()
        .default(false)
        .describe("Compact output - just letters (saves ~400 tokens)"),
    },
    async ({ type, compact = false }) => {
      const letterTypes = getLetterTypes();
      const typeKey = type.toString();
      const typeInfo = letterTypes[typeKey];

      if (!typeInfo) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Invalid type number. Valid types are 1-6:\n1=Dual-Shift, 2=Shift, 3=Cross-Shift, 4=Dash, 5=Dual-Dash, 6=Static`,
            },
          ],
          isError: true,
        };
      }

      if (compact) {
        const extensionText = typeInfo.extendedLetters?.length
          ? ` | Registered extension${typeInfo.extendedLetters.length === 1 ? "" : "s"}: ${typeInfo.extendedLetters.join(", ")} (no dataframe variations)`
          : "";
        return {
          content: [
            {
              type: "text" as const,
              text: `Type ${type} (${typeInfo.name}) — Level 1/dataframe: ${typeInfo.letters.join(", ")}${extensionText}`,
            },
          ],
        };
      }

      const allPictographs = ensureDataLoaded();

      const letterCounts = typeInfo.letters.map((letter) => {
        const count = allPictographs.filter((p) => p.letter === letter).length;
        return { letter, count };
      });

      const output = `# Type ${type}: ${typeInfo.name}

**Description:** ${typeInfo.description}

**Motion Pattern:**
- Left hand: ${typeInfo.motionPattern.leftMotion}
- Right hand: ${typeInfo.motionPattern.rightMotion}
${typeInfo.motionPattern.note ? `- Note: ${typeInfo.motionPattern.note}` : ""}

**Characteristics:**
${typeInfo.characteristics.map((c) => `- ${c}`).join("\n")}

**Letters (${typeInfo.letters.length} total):**
${letterCounts.map(({ letter, count }) => `- **${letter}** (${count} variations)`).join("\n")}
${typeInfo.extendedLetters?.length ? `\n**Registered higher-level extensions (no dataframe variations):**\n${typeInfo.extendedLetters.map((letter) => `- **${letter}**`).join("\n")}` : ""}`;

      return {
        content: [{ type: "text" as const, text: output }],
      };
    }
  );

  async function getPlacementInfoOutput(placementInput: string) {
    const normalizedPlacement = placementInput.toLowerCase().trim();

    const placementInfo =
      PLACEMENT_DEFINITIONS[
        normalizedPlacement as keyof typeof PLACEMENT_DEFINITIONS
      ];

    if (!placementInfo) {
      const availablePlacements = Object.keys(PLACEMENT_DEFINITIONS).join(", ");
      return {
        content: [
          {
            type: "text" as const,
            text: `Placement "${placementInput}" not recognized. Available placements: ${availablePlacements}`,
          },
        ],
      };
    }

    const allPictographs = ensureDataLoaded();
    const startCount = allPictographs.filter((p) =>
      p.startPlacement.toLowerCase().startsWith(normalizedPlacement)
    ).length;
    const endCount = allPictographs.filter((p) =>
      p.endPlacement.toLowerCase().startsWith(normalizedPlacement)
    ).length;

    const output = `# ${placementInfo.name}

**Angle:** ${placementInfo.angle} between hands

**Description:** ${placementInfo.description}

**Grid Configuration:** ${placementInfo.gridDescription}

**Examples:**
${placementInfo.examples.map((e) => `- ${e}`).join("\n")}

**Introduced:** Level ${placementInfo.level}

**Usage in Pictographs:**
- Used as starting placement: ${startCount} pictographs
- Used as ending placement: ${endCount} pictographs

**Related:** ${Object.keys(PLACEMENT_DEFINITIONS)
      .filter((p) => p !== normalizedPlacement)
      .join(", ")}`;

    return {
      content: [{ type: "text" as const, text: output }],
    };
  }

  // Tool: get_placement_info
  server.tool(
    "get_placement_info",
    "Get detailed information about a TKA placement (alpha, beta, gamma, zeta, eta, tau, terra) including grid configuration and examples. 'Placement' is the current term; older TKA material and this tool's deprecated alias (get_position_info) call it 'position'. VTG's term for the same idea is 'placement'.",
    {
      placement: z
        .string()
        .describe("Placement name (alpha, beta, gamma, zeta, eta, tau, terra)"),
    },
    async ({ placement }) => {
      return getPlacementInfoOutput(placement);
    }
  );

  // Tool: get_position_info (deprecated alias)
  server.tool(
    "get_position_info",
    "Deprecated. Use get_placement_info instead. 'Position' is the older TKA term for what this system now calls a placement. Kept for backward compatibility only.",
    {
      position: z
        .string()
        .describe("Placement name (alpha, beta, gamma, zeta, eta, tau, terra)"),
    },
    async ({ position }) => {
      return getPlacementInfoOutput(position);
    }
  );
}
