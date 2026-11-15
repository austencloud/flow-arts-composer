/**
 * A row of figure cards that play in turn (pictographGroup `playInTurn`): never
 * two clips at once. The row plays left, then right, each while the other
 * waits dimmed, then neither is dimmed. A card that starts on its own (its
 * Replay, a tap on its canvas) stops every other card on its end pose.
 *
 * Owned by the row (FlowFrame); each SequenceShowcase in it registers its
 * player's controls and reports its playing state. The opening play replaces
 * each card's own autoplay.
 */
import { DURATION } from "#lib/shared/transitions/transitions.js";
import type { InlinePlayerControls } from "#lib/features/browse/sequences/display/components/media-viewer/inline-player-controls";

// The review mock's runBoth(): a beat before the first card, a breath between.
const LEAD_IN_MS = DURATION.dramatic + DURATION.instant;
const BETWEEN_MS = DURATION.dramatic;
// A card that never reports its end (hidden, unloaded) does not hold the row.
const TURN_TIMEOUT_MS = 15000;

export interface FigureRowTurnsOptions {
  count: number;
  /** Skip the opening play (reduced motion, or the row already played this
   * visit): every card rests on its end pose instead. */
  skipOpening?: boolean;
  /** The opening play is over (played through, or cut short by the reader). */
  onOpeningDone?: () => void;
}

export class FigureRowTurns {
  /** Which cards wait dimmed right now. */
  dimmed = $state<boolean[]>([]);

  private readonly count: number;
  private readonly skipOpening: boolean;
  private readonly onOpeningDone?: () => void;
  private readonly players: (InlinePlayerControls | null)[];
  private readonly readyFlags: boolean[];
  private entered = false;
  private started = false;
  private openingDone = false;
  /** Bumped to cancel a running turn sequence. */
  private run = 0;
  /** The card the row itself just started, so its play is not "external". */
  private ours: number | null = null;
  private finishers = new Map<number, () => void>();
  /** Opening cut short: done when this card stops. */
  private doneWhenStops: number | null = null;

  constructor(options: FigureRowTurnsOptions) {
    this.count = options.count;
    this.skipOpening = options.skipOpening ?? false;
    this.onOpeningDone = options.onOpeningDone;
    this.players = Array.from({ length: this.count }, () => null);
    this.readyFlags = Array.from({ length: this.count }, () => false);
    this.dimmed = Array.from({ length: this.count }, () => false);
  }

  /** A card's player is loaded and can be driven. */
  ready(index: number, controls: InlinePlayerControls): void {
    this.players[index] = controls;
    this.readyFlags[index] = true;
    if (this.skipOpening) {
      controls.restAtEnd();
      this.finishOpening();
      return;
    }
    this.maybeStart();
  }

  /** A card in the row reached the screen. */
  enterView(): void {
    this.entered = true;
    this.maybeStart();
  }

  playingChange(index: number, playing: boolean): void {
    if (playing) {
      if (this.ours === index) return;
      // The reader started this card: it plays alone.
      this.run++;
      this.ours = null;
      this.dimmed = this.dimmed.map(() => false);
      this.players.forEach((p, i) => {
        if (i !== index) p?.restAtEnd();
      });
      for (const resolve of this.finishers.values()) resolve();
      this.finishers.clear();
      if (!this.openingDone) this.doneWhenStops = index;
      return;
    }
    this.finishers.get(index)?.();
    this.finishers.delete(index);
    if (this.doneWhenStops === index) {
      this.doneWhenStops = null;
      this.finishOpening();
    }
  }

  /** Play the whole row in turn again (a wrong answer). Resolves when the
   * last card ends, or when the reader cuts in. */
  async replayRow(): Promise<void> {
    await this.playInTurn();
  }

  dispose(): void {
    this.run++;
    for (const resolve of this.finishers.values()) resolve();
    this.finishers.clear();
  }

  private maybeStart(): void {
    if (this.started || this.skipOpening || !this.entered) return;
    if (!this.readyFlags.every(Boolean)) return;
    this.started = true;
    void this.playInTurn().then(() => this.finishOpening());
  }

  private finishOpening(): void {
    if (this.openingDone) return;
    this.openingDone = true;
    this.onOpeningDone?.();
  }

  private async playInTurn(): Promise<void> {
    const run = ++this.run;
    const live = () => run === this.run;
    await wait(LEAD_IN_MS);
    for (let i = 0; i < this.count && live(); i++) {
      if (i > 0) {
        this.dimmed = this.dimmed.map(() => false);
        await wait(BETWEEN_MS);
        if (!live()) return;
      }
      this.dimmed = this.dimmed.map((_, k) => k !== i);
      const player = this.players[i];
      if (!player) continue;
      const finished = new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, TURN_TIMEOUT_MS);
        this.finishers.set(i, () => {
          clearTimeout(timer);
          resolve();
        });
      });
      this.ours = i;
      player.replay();
      await finished;
      if (this.ours === i) this.ours = null;
    }
    if (live()) this.dimmed = this.dimmed.map(() => false);
  }
}

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
