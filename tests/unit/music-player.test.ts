import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MusicPlayer } from "#lib/features/write/services/music-player.js";

class FakeAudio extends EventTarget {
  static instances: FakeAudio[] = [];

  currentTime = 0;
  duration = Number.NaN;
  error: MediaError | null = null;
  pause = vi.fn();
  play = vi.fn(async () => undefined);
  src: string;

  constructor(src = "") {
    super();
    this.src = src;
    FakeAudio.instances.push(this);
  }
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];

  state: AudioContextState = "running";
  close = vi.fn(async () => undefined);
  resume = vi.fn(async () => undefined);

  constructor() {
    FakeAudioContext.instances.push(this);
  }
}

describe("MusicPlayer", () => {
  beforeEach(() => {
    FakeAudio.instances = [];
    FakeAudioContext.instances = [];
    vi.stubGlobal("Audio", FakeAudio);
    vi.stubGlobal("AudioContext", FakeAudioContext);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads without autoplay and reports metadata, time, and completion", async () => {
    const player = new MusicPlayer();
    const onLoaded = vi.fn();
    const onTime = vi.fn();
    const onEnded = vi.fn();
    player.onLoadedMetadata(onLoaded);
    player.onTimeUpdate(onTime);
    player.onEnded(onEnded);

    await player.load("blob:track", "practice.mp3");

    const audio = FakeAudio.instances[0]!;
    expect(audio.play).not.toHaveBeenCalled();
    expect(player.filename).toBe("practice.mp3");

    audio.duration = 91.5;
    audio.currentTime = 12.25;
    audio.dispatchEvent(new Event("loadedmetadata"));
    audio.dispatchEvent(new Event("timeupdate"));
    audio.dispatchEvent(new Event("ended"));

    expect(onLoaded).toHaveBeenCalledWith(91_500);
    expect(onTime).toHaveBeenCalledWith(12_250, 91_500);
    expect(onEnded).toHaveBeenCalledOnce();
  });

  it("detaches the old track before loading another one", async () => {
    const player = new MusicPlayer();
    const onTime = vi.fn();
    player.onTimeUpdate(onTime);

    await player.load("blob:first", "first.mp3");
    const first = FakeAudio.instances[0]!;
    await player.load("blob:second", "second.mp3");
    const second = FakeAudio.instances[1]!;

    expect(first.pause).toHaveBeenCalledOnce();
    first.dispatchEvent(new Event("timeupdate"));
    expect(onTime).not.toHaveBeenCalled();

    second.duration = 30;
    second.currentTime = 4;
    second.dispatchEvent(new Event("timeupdate"));
    expect(onTime).toHaveBeenCalledWith(4_000, 30_000);
  });

  it("stops playback and detaches events during cleanup", async () => {
    const player = new MusicPlayer();
    const onTime = vi.fn();
    player.onTimeUpdate(onTime);
    await player.load("blob:track", "practice.mp3");

    const audio = FakeAudio.instances[0]!;
    await player.playLoaded();
    player.cleanup();

    expect(audio.play).toHaveBeenCalledOnce();
    expect(audio.pause).toHaveBeenCalledOnce();
    expect(FakeAudioContext.instances[0]!.close).toHaveBeenCalledOnce();
    expect(player.filename).toBeUndefined();

    audio.dispatchEvent(new Event("timeupdate"));
    expect(onTime).not.toHaveBeenCalled();
  });

  it("detaches listeners when legacy play replaces a loaded track", async () => {
    const player = new MusicPlayer();
    const onEnded = vi.fn();
    player.onEnded(onEnded);
    await player.load("blob:first", "first.mp3");
    const first = FakeAudio.instances[0]!;

    await player.play("blob:second");

    expect(first.pause).toHaveBeenCalledOnce();
    first.dispatchEvent(new Event("ended"));
    expect(onEnded).not.toHaveBeenCalled();
    expect(FakeAudio.instances[1]!.play).toHaveBeenCalledOnce();
  });
});
