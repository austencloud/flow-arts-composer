/**
 * ClaudeCodeCopier - Copy sequence data formatted for AI analysis
 *
 * Generates a compact sequence encoding optimized for token efficiency.
 * Uses a key/legend at the top so AI can decode the abbreviated format.
 * Strips rendering metadata (placement data, arrow locations, prop types)
 * and keeps only semantically meaningful motion fields.
 */

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { MotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { SequenceDetailLoader } from "$lib/shared/browse/services/sequence-detail-loader";
import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";

export interface CopyResult {
  success: boolean;
  error?: Error;
}

export class ClaudeCodeCopier {
  constructor(private readonly detailLoader: SequenceDetailLoader) {}

  async copyForClaude(sequence: SequenceData): Promise<CopyResult> {
    try {
      const text = await this.generatePrompt(sequence);
      await navigator.clipboard.writeText(text);
      return { success: true };
    } catch (error) {
      console.error("[ClaudeCodeCopier] Failed to copy sequence:", error);
      return { success: false, error: error as Error };
    }
  }

  async generatePrompt(sequence: SequenceData): Promise<string> {
    let fullSequence = sequence;
    if (this.detailLoader.needsFullLoad(sequence)) {
      const loaded = await this.detailLoader.loadFullSequence(sequence);
      if (loaded) {
        fullSequence = loaded;
      }
    }

    const stepCount = fullSequence.steps?.length ?? 0;
    const lines: string[] = [];

    // Header - deduplicate repeated word in circular sequences
    const rawWord = fullSequence.word || fullSequence.name || "Untitled";
    lines.push(`# ${simplifyRepeatedWord(rawWord)}`);
    lines.push(`id: ${fullSequence.id}`);
    lines.push(`owner: ${fullSequence.ownerId || "unknown"}`);
    lines.push(
      `${stepCount} beats | ` +
      `difficulty: ${fullSequence.difficultyLevel || fullSequence.level || "?"} | ` +
      `loop: ${fullSequence.loopType || "none"} | ` +
      `grid: ${fullSequence.gridMode || "diamond"}`
    );
    if (fullSequence.tags?.length) {
      lines.push(`tags: ${fullSequence.tags.join(", ")}`);
    }
    if (fullSequence.notes) {
      lines.push(`notes: ${fullSequence.notes}`);
    }

    // Key/legend
    lines.push("");
    lines.push("## Format Key");
    lines.push("step = number [letter] [position>position] d=beats [rev:BR]");
    lines.push("motion = type rot loc>loc t=turns ori>ori [prefloat:type,rot] [hand:path] [skew:steps,dir]");
    lines.push("loc = n/e/s/w/ne/se/sw/nw/c (grid locations)");
    lines.push("ori = in/out/cw/ccw/clockIn/clockOut/counterIn/counterOut");
    lines.push("rot = cw/ccw/no (rotation direction)");
    lines.push("rev = reversal indicator (B=blue, R=red)");

    // Steps
    lines.push("");
    lines.push("## Steps");

    if (fullSequence.steps?.length) {
      for (let i = 0; i < fullSequence.steps.length; i++) {
        const step = fullSequence.steps[i];
        if (!step) continue;
        const beatNum = i + 1;
        const letter = step.letter ? ` ${step.letter}` : "";
        const pos = step.startPlacement && step.endPlacement
          ? ` ${step.startPlacement}>${step.endPlacement}`
          : "";

        const left = this.formatMotionCompact(step.motions?.left);
        const right = this.formatMotionCompact(step.motions?.right);

        const revParts: string[] = [];
        if (step.leftReversal) revParts.push("B");
        if (step.rightReversal) revParts.push("R");
        const rev = revParts.length ? ` rev:${revParts.join("")}` : "";
        const duration = step.duration ?? 1;

        lines.push(`${beatNum}${letter}${pos} d=${duration}${rev}`);
        lines.push(`  blue: ${left}`);
        lines.push(`  red:  ${right}`);
      }
    } else {
      lines.push("No step data available");
    }

    return lines.join("\n");
  }

  private formatMotionCompact(motion: MotionData | undefined | null): string {
    if (!motion) return "none";

    const loc = `${this.abbrevLoc(motion.startLocation)}>${this.abbrevLoc(motion.endLocation)}`;
    const rot = this.abbrevRot(motion.rotationDirection);
    const turns = motion.turns === "fl" ? "fl" : String(motion.turns);
    const ori = `${this.abbrevOri(motion.startOrientation)}>${this.abbrevOri(motion.endOrientation)}`;

    let line = `${motion.motionType} ${rot} ${loc} t=${turns} ${ori}`;

    // Optional fields (only when present and meaningful)
    if (motion.prefloatMotionType) {
      line += ` prefloat:${motion.prefloatMotionType},${this.abbrevRot(motion.prefloatRotationDirection)}`;
    }
    if (motion.handPath) {
      line += ` hand:${motion.handPath}`;
    }
    if (motion.skewSteps && motion.skewSteps > 0) {
      line += ` skew:${motion.skewSteps},${motion.skewDir || "?"}`;
    }

    return line;
  }

  private abbrevLoc(loc: string | undefined | null): string {
    if (!loc) return "?";
    const map: Record<string, string> = {
      NORTH: "n", SOUTH: "s", EAST: "e", WEST: "w",
      NORTHEAST: "ne", SOUTHEAST: "se", SOUTHWEST: "sw", NORTHWEST: "nw",
      CENTER: "c",
    };
    return map[loc] ?? loc.toLowerCase();
  }

  private abbrevRot(rot: string | undefined | null): string {
    if (!rot) return "no";
    const map: Record<string, string> = {
      CLOCKWISE: "cw", CW: "cw",
      COUNTER_CLOCKWISE: "ccw", CCW: "ccw",
      NO_ROTATION: "no",
    };
    return map[rot] ?? rot.toLowerCase();
  }

  private abbrevOri(ori: string | undefined | null): string {
    if (!ori) return "?";
    const map: Record<string, string> = {
      IN: "in", OUT: "out",
      CLOCKWISE: "cw", COUNTER_CLOCKWISE: "ccw",
      CLOCK_IN: "clockIn", CLOCK_OUT: "clockOut",
      COUNTER_IN: "counterIn", COUNTER_OUT: "counterOut",
    };
    return map[ori] ?? ori.toLowerCase();
  }
}
