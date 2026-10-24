/**
 * Museum narration player.
 *
 * Plays the Archive's recorded audio guide as captions. A room cue starts when
 * the visitor enters the room; an exhibit cue when they walk up to the exhibit;
 * a village cue when its moment happens in the room's village sim while the
 * visitor is there.
 * Each cue plays once per visit. Entering a different room cuts the current
 * cue, the way a PA does when you leave its speaker's range.
 * A cue with carried lines names the word the visitor carries (the pocket's),
 * read when the cue starts.
 */
import type { VillageMomentKind } from "#lib/features/village/state/village-moments.js";
import { NARRATION_CUES, cueLines, type NarrationCue } from "../data/museum-narration";

export interface ActiveCaption {
  cue: NarrationCue;
  lineIndex: number;
  line: string;
}

/** Reading time for one caption line. */
function lineDurationMs(line: string): number {
  const words = line.trim().split(/\s+/).filter(Boolean).length;
  return 1800 + words * 330;
}

export class MuseumNarrationPlayer {
  current = $state<ActiveCaption | null>(null);

  private readonly played = new Set<string>();
  private readonly queue: NarrationCue[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly roomCues = new Map<string, NarrationCue>();
  private readonly exhibitCues = new Map<string, NarrationCue>();
  private readonly villageCues: NarrationCue[] = [];
  private room: string | null = null;
  private lines: string[] = [];
  private readonly carriedWord: () => string | undefined;

  constructor(
    cues: NarrationCue[] = NARRATION_CUES,
    carriedWord: () => string | undefined = () => undefined,
  ) {
    this.carriedWord = carriedWord;
    for (const cue of cues) {
      if (cue.trigger.kind === "room") this.roomCues.set(cue.roomId, cue);
      else if (cue.trigger.kind === "exhibit")
        this.exhibitCues.set(cue.trigger.refId, cue);
      else this.villageCues.push(cue);
    }
  }

  /** Exhibit refIds that have a proximity cue, with their radius in tiles. */
  exhibitTriggers(): Array<{ refId: string; radiusTiles: number }> {
    return [...this.exhibitCues.values()].map((cue) => ({
      refId: cue.trigger.kind === "exhibit" ? cue.trigger.refId : "",
      radiusTiles:
        cue.trigger.kind === "exhibit" ? (cue.trigger.radiusTiles ?? 3) : 3,
    }));
  }

  /** The visitor crossed into a room (or into a corridor: null). */
  enterRoom(roomId: string | null): void {
    this.room = roomId;
    // Leaving the speaker's range cuts the tape mid-line.
    if (this.current && this.current.cue.roomId !== roomId) {
      this.stopCurrent();
      this.queue.length = 0;
    }
    if (!roomId) return;
    const cue = this.roomCues.get(roomId);
    if (cue) this.enqueue(cue);
  }

  /** The visitor is within an exhibit cue's radius. */
  nearExhibit(refId: string): void {
    const cue = this.exhibitCues.get(refId);
    if (cue) this.enqueue(cue);
  }

  /** Something happened in a room's village sim. Heard only from inside the
   * room; a moment missed while away stays unplayed. */
  villageMoment(moment: VillageMomentKind): void {
    for (const cue of this.villageCues) {
      if (
        cue.trigger.kind === "village" &&
        cue.trigger.moment === moment &&
        cue.roomId === this.room
      )
        this.enqueue(cue);
    }
  }

  /** Skip the rest of the current cue. */
  skip(): void {
    if (!this.current) return;
    this.stopCurrent();
    this.playNext();
  }

  dispose(): void {
    this.stopCurrent();
    this.queue.length = 0;
  }

  private enqueue(cue: NarrationCue): void {
    if (this.played.has(cue.id)) return;
    this.played.add(cue.id);
    if (this.current) {
      this.queue.push(cue);
      return;
    }
    this.play(cue);
  }

  private play(cue: NarrationCue, lineIndex = 0): void {
    if (lineIndex === 0) this.lines = cueLines(cue, this.carriedWord());
    const line = this.lines[lineIndex];
    if (line === undefined) {
      this.current = null;
      this.playNext();
      return;
    }
    this.current = { cue, lineIndex, line };
    this.timer = setTimeout(() => {
      this.timer = null;
      this.play(cue, lineIndex + 1);
    }, lineDurationMs(line));
  }

  private playNext(): void {
    const next = this.queue.shift();
    if (next) this.play(next);
  }

  private stopCurrent(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.current = null;
  }
}
