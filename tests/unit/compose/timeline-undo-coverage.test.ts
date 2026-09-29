import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTimelineState } from "$lib/shared/animation-engine/state/timeline-state.svelte";
import {
  getTimelineUndoManager,
  resetTimelineUndoManager,
} from "$lib/shared/animation-engine/timeline/services/timeline-undo-manager";
import { createProject } from "$lib/shared/animation-engine/domain/timeline-types";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

describe("Timeline undo coverage", () => {
  beforeEach(() => {
    resetTimelineUndoManager();
    localStorage.clear();
    getTimelineUndoManager().clear();
  });

  it("undoes project and track edits, and skips unchanged values", () => {
    const state = createTimelineState();
    const originalName = state.project.name;
    state.setProjectName(originalName);
    expect(state.canUndo).toBe(false);

    state.setProjectName("Edited show");
    const track = state.project.tracks[0]!;
    state.setTrackMuted(track.id, !track.muted);
    state.undo();
    expect(state.project.tracks[0]!.muted).toBe(track.muted);
    state.undo();
    expect(state.project.name).toBe(originalName);
  });

  it("groups a drag into one undo and leaves a click out of history", () => {
    const state = createTimelineState();
    const track = state.project.tracks[0]!;
    state.beginEdit("UPDATE_TRACK", "Resize track");
    state.endEdit();
    expect(state.canUndo).toBe(false);

    state.beginEdit("UPDATE_TRACK", "Resize track");
    state.updateTrack(track.id, { height: track.height + 10 });
    state.updateTrack(track.id, { height: track.height + 20 });
    state.endEdit();
    state.undo();
    expect(state.project.tracks[0]!.height).toBe(track.height);
    expect(state.canUndo).toBe(false);
  });

  it("keeps redo after a gesture returns to its starting value", () => {
    vi.useFakeTimers();
    try {
      const state = createTimelineState();
      const originalName = state.project.name;
      const track = state.project.tracks[0]!;
      state.setProjectName("Renamed");
      state.undo();
      expect(state.canRedo).toBe(true);

      state.beginEdit("UPDATE_TRACK", "Resize track");
      vi.setSystemTime(new Date("2026-09-28T12:00:00Z"));
      state.updateTrack(track.id, { height: track.height + 10 });
      vi.setSystemTime(new Date("2026-09-28T12:01:00Z"));
      state.updateTrack(track.id, { height: track.height });
      state.endEdit();

      expect(state.canUndo).toBe(false);
      expect(state.canRedo).toBe(true);
      state.redo();
      expect(state.project.name).toBe("Renamed");
      state.undo();
      expect(state.project.name).toBe(originalName);
    } finally {
      vi.useRealTimers();
    }
  });

  it("finalizes an active edit when undo is requested", () => {
    const state = createTimelineState();
    const track = state.project.tracks[0]!;
    state.beginEdit("UPDATE_TRACK", "Resize track");
    state.updateTrack(track.id, { height: track.height + 10 });
    state.undo();
    expect(state.project.tracks[0]!.height).toBe(track.height);
    state.updateTrack(track.id, { height: track.height + 20 });
    expect(state.canUndo).toBe(true);
  });

  it("groups clip move, resize, and trim gestures and restores full clip state", () => {
    const state = createTimelineState();
    const sequence = {
      id: "sequence-1",
      name: "Pattern",
      word: "P",
      steps: [],
      thumbnails: [],
    } as unknown as SequenceData;
    const clip = state.addClip(sequence, state.project.tracks[0]!.id, 0);
    const original = JSON.parse(
      JSON.stringify(state.allClips.find((item) => item.id === clip.id)!)
    );
    getTimelineUndoManager().clear();

    state.beginEdit("MOVE_CLIP", "Move clip");
    state.moveClip(clip.id, 2, undefined, { skipSnap: true });
    state.moveClip(clip.id, 4, undefined, { skipSnap: true });
    state.endEdit();
    state.beginEdit("RESIZE_CLIP", "Resize clip");
    state.setClipDuration(clip.id, original.duration + 2);
    state.setClipDuration(clip.id, original.duration + 4);
    state.endEdit();
    state.beginEdit("TRIM_CLIP", "Trim clip");
    state.setClipInOutPoints(clip.id, 0.1, 0.9);
    state.setClipInOutPoints(clip.id, 0.2, 0.8);
    state.endEdit();
    const edited = JSON.parse(
      JSON.stringify(state.allClips.find((item) => item.id === clip.id)!)
    );

    state.undo();
    state.undo();
    state.undo();
    expect(state.allClips.find((item) => item.id === clip.id)).toEqual(
      original
    );
    expect(state.canUndo).toBe(false);
    state.redo();
    state.redo();
    state.redo();
    expect(state.allClips.find((item) => item.id === clip.id)).toEqual(edited);

    state.undo();
    state.beginEdit("TRIM_CLIP", "Trim clip");
    state.setClipInOutPoints(clip.id, 0.3, 0.7);
    state.setClipInOutPoints(clip.id, original.inPoint, original.outPoint);
    state.endEdit();
    expect(state.canRedo).toBe(true);
    state.redo();
    expect(state.allClips.find((item) => item.id === clip.id)).toEqual(edited);
  });

  it("clears history when a different project is loaded", () => {
    const state = createTimelineState();
    state.setProjectName("Old show");
    const other = createProject();
    other.name = "New show";
    state.loadProject(other);
    expect(state.canUndo).toBe(false);
  });

  it("restores the playable source through select, replace, and clear", () => {
    const revoke = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
    try {
      const state = createTimelineState();
      state.setAudioFile("first.wav", "blob:first");
      expect(state.getAudioUrl()).toBe("blob:first");
      state.undo();
      expect(state.project.audio.hasAudio).toBe(false);
      expect(state.getAudioUrl()).toBeNull();
      state.redo();
      expect(state.getAudioUrl()).toBe("blob:first");

      state.setAudioDuration(12);
      state.setAudioFile("second.wav", "blob:second");
      expect(state.project.audio).toMatchObject({
        fileName: "second.wav",
        duration: 0,
      });
      state.undo();
      expect(state.project.audio).toMatchObject({
        fileName: "first.wav",
        duration: 12,
      });
      expect(state.getAudioUrl()).toBe("blob:first");
      state.redo();
      expect(state.getAudioUrl()).toBe("blob:second");

      state.clearAudio();
      expect(state.getAudioUrl()).toBeNull();
      state.undo();
      expect(state.project.audio.fileName).toBe("second.wav");
      expect(state.getAudioUrl()).toBe("blob:second");
      state.redo();
      expect(state.project.audio.hasAudio).toBe(false);
      expect(state.getAudioUrl()).toBeNull();
      expect(revoke).not.toHaveBeenCalled();
      expect(localStorage.getItem("timeline-undo-history")).not.toContain(
        "blob:"
      );
      expect(localStorage.getItem("timeline-redo-history")).not.toContain(
        "blob:"
      );
    } finally {
      revoke.mockRestore();
    }
  });

  it("keeps audio metadata and source paired during unrelated undo", () => {
    const state = createTimelineState();
    state.setAudioFile("first.wav", "blob:first");
    state.setAudioDuration(12);
    state.setProjectName("Edited show");
    state.setAudioFile("second.wav", "blob:second");
    state.undo();
    expect(state.project.audio).toMatchObject({
      fileName: "first.wav",
      duration: 12,
    });
    expect(state.getAudioUrl()).toBe("blob:first");
    state.undo();
    expect(state.project.name).not.toBe("Edited show");
    expect(state.project.audio.fileName).toBe("first.wav");
    expect(state.getAudioUrl()).toBe("blob:first");
  });

  it("preserves redo when an audio action changes nothing", () => {
    const state = createTimelineState();
    state.setAudioFile("first.wav", "blob:first");
    state.setAudioFile("first.wav", "blob:first");
    expect(getTimelineUndoManager().undoCount).toBe(1);
    state.undo();
    state.clearAudio();
    expect(state.canRedo).toBe(true);
    state.redo();
    expect(state.getAudioUrl()).toBe("blob:first");
  });

  it("releases unreachable URLs on a branch, project switch, and reset", () => {
    const revoke = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
    try {
      const state = createTimelineState();
      state.setAudioFile("first.wav", "blob:first");
      state.setAudioFile("second.wav", "blob:second");
      state.undo();
      state.setAudioFile("third.wav", "blob:third");
      expect(revoke).toHaveBeenCalledWith("blob:second");
      expect(revoke).not.toHaveBeenCalledWith("blob:first");

      const other = createProject();
      other.audio = {
        hasAudio: true,
        fileName: "stale.wav",
        duration: 5,
        bpm: null,
      };
      state.loadProject(other);
      expect(state.project.audio.hasAudio).toBe(false);
      expect(state.getAudioUrl()).toBeNull();
      expect(revoke).toHaveBeenCalledWith("blob:first");
      expect(revoke).toHaveBeenCalledWith("blob:third");

      state.setAudioFile("fourth.wav", "blob:fourth");
      state.resetProject();
      expect(state.getAudioUrl()).toBeNull();
      expect(revoke).toHaveBeenCalledWith("blob:fourth");
    } finally {
      revoke.mockRestore();
    }
  });

  it("does not persist source URLs or restore unusable audio after reload", () => {
    const state = createTimelineState();
    state.setAudioFile("session.wav", "blob:session");
    const undoHistory = localStorage.getItem("timeline-undo-history") ?? "";
    const project = localStorage.getItem("timeline-current-project") ?? "";
    expect(undoHistory).not.toContain("blob:session");
    expect(project).not.toContain("blob:session");

    resetTimelineUndoManager();
    const reloaded = createTimelineState();
    expect(reloaded.getAudioUrl()).toBeNull();
    expect(reloaded.project.audio.hasAudio).toBe(false);
    expect(
      JSON.parse(localStorage.getItem("timeline-current-project") ?? "{}").audio
        .hasAudio
    ).toBe(false);
    expect(reloaded.canUndo).toBe(false);
  });
});
