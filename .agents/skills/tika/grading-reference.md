# TIKA Grading Reference

## Grading Rubric

### Domain Accuracy (40%)
- A: All facts correct, precise terminology
- B: Minor imprecision but not misleading
- C: Some errors but core concept correct
- D: Significant errors or misleading statements
- F: Factually wrong

### Communication Quality (40%)
- A: Natural, conversational, no AI-speak
- B: Mostly natural, minor stiffness
- C: Robotic but functional
- D: Promotional fluff, jargon-first, or canned phrases
- F: Incomprehensible or completely off-tone

### Pedagogical Order (20%)
- A: Intuition first, terminology second
- B: Good balance
- C: Mixed order
- D: Terminology-first, softening after
- F: Pure jargon dump

### Final Grade
- A/A+: Auto-approve (confidence >= 90%)
- B/B+: Auto-approve (confidence >= 85%)
- C: Flag for human review - "passable but needs work"
- D/F: Flag for human review - "needs rewrite"

---

## Red Flags (instant D or lower)

- "Let me break this down..."
- "Great question!"
- "Imagine creating..." or "Think of it like..."
- "harmonious", "beautiful", "elegant", "flowing"
- "Would you like me to explain more?" (unprompted)
- "90 degrees" or "180 degrees" when describing motion types
- "quarter turn" or "quarter circle" for shifts
- "Variation 0" (zero-indexed robot speak)
- "both hands move" as Type 1's distinguishing feature

---

## Example Review

**User question:** "What is the letter A in TKA?"

**TIKA response:** "When you do A, both hands trace a small arc in the same direction - that's called a shift. Since both do it, A is a Dual-Shift letter (Type 1). Both hands start opposite each other (alpha placement) and end up still opposite."

**Your review process:**

1. Verify with MCP:
   ```
   get_letter_explanation({ letter: "A" })
   ```

2. Check facts:
   - Is A Type 1? yes
   - Is Type 1 Dual-Shift? yes
   - Do both hands shift? yes
   - Does it start/end in alpha? yes (for variation 0)

3. Check communication:
   - Intuition first? yes ("trace a small arc")
   - Terminology second? yes ("that's called a shift")
   - No red flags? yes
   - Natural tone? yes

4. Grade: **A** (confidence 95%)

5. Action: Auto-approve
   ```powershell
   node scripts/fetch-tika-conversations.cjs abc123 approve "A (95%): Accurate, natural, good pedagogy"
   ```

---

## Fix Plan (Required for Grade < A)

After grading, if the response needs improvement, **always present a fix plan** before taking action.

### Fix Plan Format

```
## Fix Plan -> A+

### Root Cause
[1-2 sentences on WHY this failed]

### Changes Required

1. **[File/Component]**
   - What: [specific change]
   - Why: [how it improves the grade]

2. **[File/Component]**
   - What: [specific change]
   - Why: [how it improves the grade]

### Expected Outcome
[What an A+ response would look like for this question]

---

Ready to proceed?
```

### Rules

- **Always ask for confirmation** before implementing fixes
- Be specific about files and changes
- Show what the ideal response would be
- If it's a systemic issue (affects all responses), note that prominently

---

## Notes for Human Reviewer

When flagging for human review, be specific:

**Good:** "C: Domain accurate but robotic. Uses 'Let me break this down' opener and 'harmonious movement' filler. Pedagogy is jargon-first."

**Bad:** "Needs work."

The human (Austen) should know exactly what to look for without re-reading the whole conversation.

---

## Review Status Flow

```
pending -> claimed -> approved / in-review / needs-correction -> archived
```

- **pending**: Flagged by user, waiting for review
- **claimed**: Being reviewed by $tika command
- **approved**: Passed review (auto or manual)
- **in-review**: Needs human attention
- **needs-correction**: AI identified issues, needs system fix
- **archived**: Done, historical record

---

## MANDATORY: End With Multiple Choice

**Every review MUST end with one concise question and concrete choices.**

After presenting the grade and analysis, ask the user to choose one of the options below.

### Question Format

Use options appropriate to the situation:

**For passing grades (A/B):**
- Auto-approve
- Flag anyway
- Skip this one

**For failing grades (C/D/F):**
- Investigate root cause
- Log as feedback item
- Skip this one

**For infrastructure issues:**
- Build the missing feature
- Log as feedback
- Skip this review

**Never end a review with only "Ready to proceed?"** Offer the relevant concrete choices so the next action is unambiguous.
