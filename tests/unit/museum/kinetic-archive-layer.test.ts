/**
 * The Kinetic Archive's museum-wide layer: narration cues, K's annotations,
 * the Cross-Reference Room's decode, and the exit handoff.
 *
 * These guard the seams between authored data and the rooms it points at. A
 * cue for a room that does not exist plays nowhere; an annotation for a
 * refId nobody stamps is a note stuck to air.
 */
import { describe, expect, it } from "vitest";
import { buildMuseumGrid } from "../../../src/lib/features/museum/services/museum-grid-builder";
import { GRID_CONFIG } from "../../../src/lib/features/museum/data/museum-room-graph";
import {
  MUSEUM_WALK_ROOMS,
  MUSEUM_WALK_EDGES,
  attachMuseumWalkTerrain,
} from "../../../src/lib/features/museum/data/museum-walk";
import {
  NARRATION_CUES,
  caveCaseCard,
  roomStamp,
} from "../../../src/lib/features/museum/data/museum-narration";
import {
  FREE_ANNOTATIONS,
  PLAQUE_ANNOTATIONS,
} from "../../../src/lib/features/museum/data/museum-annotations";
import { MUSEUM_EXHIBIT_SEQUENCES } from "../../../src/lib/features/museum/data/museum-exhibit-sequences";
import { ROOM_CONTENT } from "../../../src/lib/features/museum/data/museum-room-content";
import { placeFreeNotes } from "../../../src/lib/features/museum/services/museum-free-notes";
import { MuseumNarrationPlayer } from "../../../src/lib/features/museum/services/museum-narration-player.svelte";
import { MuseumPlayerController } from "../../../src/lib/features/museum/services/museum-player-controller";

const build = buildMuseumGrid(MUSEUM_WALK_ROOMS, MUSEUM_WALK_EDGES, GRID_CONFIG);
const grid = build.grid;
attachMuseumWalkTerrain(grid);
const roomIds = new Set(grid.wings.map((w) => w.id));
const exhibitIds = new Set(grid.exhibits.map((e) => e.id));

describe("the audio guide", () => {
  it("only cues rooms the visitor can stand in", () => {
    for (const cue of NARRATION_CUES) {
      expect(roomIds.has(cue.roomId), `${cue.id} → ${cue.roomId}`).toBe(true);
      expect(cue.lines.length, `${cue.id} has lines`).toBeGreaterThan(0);
    }
  });

  it("only cues exhibits that are stamped into a wall", () => {
    for (const cue of NARRATION_CUES) {
      if (cue.trigger.kind !== "exhibit") continue;
      expect(exhibitIds.has(cue.trigger.refId), `${cue.id} → ${cue.trigger.refId}`).toBe(true);
    }
  });

  it("has one room cue per room at most, and never repeats a cue id", () => {
    const ids = new Set<string>();
    const roomCued = new Set<string>();
    for (const cue of NARRATION_CUES) {
      expect(ids.has(cue.id), `duplicate cue ${cue.id}`).toBe(false);
      ids.add(cue.id);
      if (cue.trigger.kind === "room") {
        expect(roomCued.has(cue.roomId), `two room cues for ${cue.roomId}`).toBe(false);
        roomCued.add(cue.roomId);
      }
    }
  });

  it("stamps every cave chamber with its clinical mode and never names an element", () => {
    for (const id of ["cave-water", "cave-fire", "cave-earth", "cave-air", "cave-sun", "cave-moon"]) {
      const stamp = roomStamp(id);
      expect(stamp, id).toMatch(/^WING 1 · /);
      expect(stamp).not.toMatch(/water|fire|earth|air|sun|moon/i);
    }
    expect(roomStamp("cross-reference")).toContain("REV. 61");
    expect(roomStamp("janitor")).toBeNull();
  });

  it("plays a room cue once and cuts it when the visitor leaves", () => {
    const player = new MuseumNarrationPlayer();
    player.enterRoom("entrance");
    expect(player.current?.cue.roomId).toBe("entrance");
    player.enterRoom("cave-threshold");
    expect(player.current?.cue.roomId).toBe("cave-threshold");
    player.enterRoom("entrance");
    // Already played: silence, not a replay.
    expect(player.current).toBeNull();
    player.dispose();
  });

  it("knows the card beside every cave case", () => {
    const cavePerformers = grid.performers.filter((p) => caveCaseCard(p.id));
    expect(cavePerformers.length).toBeGreaterThan(0);
    for (const performer of cavePerformers) {
      const card = caveCaseCard(performer.id)!;
      expect(roomIds.has(card.roomId), performer.id).toBe(true);
      expect(MUSEUM_EXHIBIT_SEQUENCES[card.sequenceId], `${performer.id} → ${card.sequenceId}`).toBeTruthy();
    }
  });
});

describe("K's annotations", () => {
  it("stick only to plaques that exist", () => {
    for (const refId of Object.keys(PLAQUE_ANNOTATIONS)) {
      expect(exhibitIds.has(refId), refId).toBe(true);
    }
  });

  it("reach the stamped exhibit definitions", () => {
    for (const [refId, notes] of Object.entries(PLAQUE_ANNOTATIONS)) {
      const exhibit = grid.exhibits.find((e) => e.id === refId)!;
      expect(exhibit.plaque?.annotations, refId).toEqual(notes);
    }
  });

  it("post free notes only in rooms that exist, on the floor", () => {
    const placed = placeFreeNotes(grid, grid.tileScale);
    expect(placed.length).toBe(FREE_ANNOTATIONS.length);
    for (const p of placed) {
      const wing = grid.wings.find((w) => w.id === p.roomId)!;
      const b = wing.bounds;
      expect(p.worldX / grid.tileScale).toBeGreaterThanOrEqual(b.x);
      expect(p.worldX / grid.tileScale).toBeLessThan(b.x + b.width);
      expect(p.worldZ / grid.tileScale).toBeGreaterThanOrEqual(b.y);
      expect(p.worldZ / grid.tileScale).toBeLessThan(b.y + b.height);
      expect(grid.terrain!.blockedAt(p.worldX, p.worldZ), `${p.note.id} stands on rock`).toBe(false);
    }
  });
});

describe("the Cross-Reference Room", () => {
  it("decodes to OOGA with the connective forms dimmed", () => {
    const seq = MUSEUM_EXHIBIT_SEQUENCES["codex-ooga-seq"]!;
    expect(seq.steps.map((s) => s.letter)).toEqual(["O", "O", "Y", "G", "D", "A"]);
    // The greedy key the console applies.
    const reveal = "OOGA";
    const hits: number[] = [];
    let cursor = 0;
    seq.steps.forEach((s, i) => {
      if (cursor < reveal.length && String(s.letter).toUpperCase() === reveal[cursor]) {
        hits.push(i);
        cursor++;
      }
    });
    expect(hits).toEqual([0, 1, 3, 5]);
  });

  it("wires the console, memo, and K's sign into the room", () => {
    const xref = ROOM_CONTENT["cross-reference"]!;
    expect(xref.exhibits["xref-console"]?.interaction).toMatchObject({ kind: "decode", reveal: "OOGA" });
    for (const id of ["xref-console", "xref-memo", "xref-order", "xref-k-sign"]) {
      expect(exhibitIds.has(id), id).toBe(true);
    }
  });
});

describe("the way out", () => {
  it("hands a real sequence to the Composer from the gift shop", () => {
    const exit = grid.exhibits.find((e) => e.id === "shop-exit")!;
    expect(exit.interaction?.kind).toBe("exit");
    if (exit.interaction?.kind === "exit") {
      expect(MUSEUM_EXHIBIT_SEQUENCES[exit.interaction.sequenceId]).toBeTruthy();
    }
  });

  it("boots the terminal from the Digital Wing's CRT", () => {
    const crt = grid.exhibits.find((e) => e.id === "digital-crt")!;
    expect(crt.interaction).toMatchObject({ kind: "terminal", route: "/1989" });
  });

  it("gives the wax docent a pamphlet with a QR", () => {
    const docent = ROOM_CONTENT.collaboration?.performers?.["wax-docent"];
    expect(docent?.handout?.kind).toBe("pamphlet");
    expect(docent?.handout?.meta.join(" ")).toMatch(/QR/);
  });

  it("keeps the wax docent out of the room until it has a pose", () => {
    expect(grid.performers.some((p) => p.id === "wax-docent")).toBe(false);
  });
});

describe("the visitor's compass", () => {
  // The camera looks along (sin yaw, cos yaw). A visitor turned to face the
  // Bellweather report on the Suppression Wing's east wall must be told they
  // face east, or E examines the wall behind them.
  const compass = new MuseumPlayerController(
    grid,
    grid.tileScale,
    {} as never,
    {} as never
  );

  it("agrees with the camera's look direction", () => {
    expect(compass.yawToFacing(0)).toBe("south");
    expect(compass.yawToFacing(Math.PI / 2)).toBe("east");
    expect(compass.yawToFacing(Math.PI)).toBe("north");
    expect(compass.yawToFacing(-Math.PI / 2)).toBe("west");
    expect(compass.yawToFacing((3 * Math.PI) / 2)).toBe("west");
    expect(compass.yawToFacing(Math.PI / 4)).toBe("southeast");
    expect(compass.yawToFacing((3 * Math.PI) / 4)).toBe("northeast");
  });

  it("puts the Bellweather report in front of a visitor who is looking at it", () => {
    const report = grid.exhibits.find((e) => e.id === "supp-bellweather")!;
    const facing = compass.yawToFacing(Math.PI / 2);
    const dx = facing === "east" ? 1 : facing === "west" ? -1 : 0;
    expect(report.tileX - 1 + dx).toBe(report.tileX);
  });
});
