# Sequence Generation - Full Reference

Loaded on demand when generating sequences. Not needed every session.
Core rules are in `.claude/rules/sequence-generation.md`.

---

## Tool Selection

| Tool                  | Use When                           | Returns                     |
| --------------------- | ---------------------------------- | --------------------------- |
| `generate_sequence`   | **Default.** Show sequence to user | Opens in viewer, ~50 tokens |
| `generate_pictograph` | Single letter                      | Opens in viewer, ~50 tokens |
| `get_sequence_data`   | Need step data without image       | Data, ~500 tokens           |

---

## Bridge Letters

The constrained builder handles bridges automatically. The response may include notes like:

- "Sigma inserted between B and O"
- "W inserted between O and K"

You don't need to pre-compute bridges. Just call `generate_sequence` with a constraint preset.

---

## Humor Workflow (Named Words Only)

**This ONLY applies when the user provides a specific named word with creative intent** (e.g. "generate CAKE"). It does NOT apply when the user asks for a sequence by letter, level, loop type, length, or constraints.

### The Workflow

1. **Read the humor profile** from `E:/flow-arts-private/humor/humor-profile.json`
   in the private repo. `FLOW_ARTS_PRIVATE_DIR` overrides the clone location.
2. **Present 4 tagline options** based on the humor profile
3. **Wait for selection**
4. **Generate the sequence** with the chosen tagline:
   ```
   generate_sequence(word: "USERWORD", constraintPreset: "smooth", notes: "<tagline>")
   ```
5. **When Austen explicitly asks to save the choice as training data, save the
   training pair:**
   ```bash
   node scripts/add-humor-pair.cjs "<WORD>" "<selected text>" "<LENS>" '[{"text":"rejected1","lens":"LENS1"},{"text":"rejected2","lens":"LENS2"}]'
   ```

Do not run the training command as an automatic side effect of generating a
sequence. It modifies training data tracked in the private repo; commit that
change there with an explicit path.

### Austen's Humor Profile (Summary)

- **Primary:** DEADPAN - Flat, understated observations. Minimal words.
- **Secondary:** ABSURDIST - Non-sequiturs, logic breaks, wrong references.
- **Secondary:** SARDONIC - Bitter cultural observations, ironic praise.
- **Tertiary:** DICTIONARY - Fake definitions, formal tone for informal content.
- **Tertiary:** DOMAIN - Flow arts in-jokes, prop references, festival culture.
- **Occasional:** ACRONYM - Fake backronyms.
- **AVOID:** SELF_DEPRECATING

### Key Preferences

- Intentional ambiguity ("The prop or the admirer?")
- Double meanings
- No Twitter/X references
- Dictionary format works well for reclaiming internet slang

### When NOT to Do Humor Workflow

- User specifies exact tagline text
- User says "no tagline" or "leave it blank"
- User indicates time pressure
- Sequence is for sharing and user specifies the message

### When to Auto-Select

Once 100+ training pairs exist for a given theme, Claude may auto-select but should mention what was chosen.
