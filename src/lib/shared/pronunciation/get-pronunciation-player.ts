import { browser } from "$app/env";
import { PronunciationPlayer } from "./services/pronunciation-player";

let instance: PronunciationPlayer | null = null;

export function getPronunciationPlayer(): PronunciationPlayer {
  if (!browser) throw new Error("getPronunciationPlayer() is browser-only");
  return (instance ??= new PronunciationPlayer());
}
