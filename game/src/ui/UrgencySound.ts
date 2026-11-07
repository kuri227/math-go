const SOUND_STORAGE_KEY = "math-go-sound";
export const GAME_VOLUME_STORAGE_KEY = "math-go-volume";
const DEFAULT_VOLUME = 70;

export type GameSoundEffect = "tap" | "start" | "correct" | "wrong" | "timeout" | "finish";
const CLIP_NAMES = ["tap", "start", "correct", "wrong", "timeout", "finish", "tick", "tick-urgent"] as const;
const EFFECT_VOLUME: Readonly<Record<GameSoundEffect, number>> = {
  tap: 0.24,
  start: 0.58,
  correct: 0.62,
  wrong: 0.54,
  timeout: 0.52,
  finish: 0.62,
};
const source = (name: string) => `/audio/${name}.wav`;
// A minor third and then a fifth are easier to hear over the BGM.
const CORRECT_STREAK_SEMITONES = [0, 3, 7, 9, 12] as const;

export function correctPlaybackRate(streak: number): number {
  const stage = Math.min(CORRECT_STREAK_SEMITONES.length - 1, Math.max(0, Math.floor(streak) - 1));
  return 2 ** ((CORRECT_STREAK_SEMITONES[stage] ?? 0) / 12);
}

// The third note in generate_game_sfx.mjs starts at 210 ms at normal speed.
export const correctFinalNoteMs = (streak: number): number => 210 / correctPlaybackRate(streak);

export class UrgencySound {
  private volumePercent = this.loadVolume();
  private readonly clips = new Map<string, HTMLAudioElement>();

  constructor() {
    for (const name of CLIP_NAMES) {
      const clip = new Audio(source(name));
      clip.preload = "auto";
      this.clips.set(name, clip);
    }
  }

  get isEnabled(): boolean {
    return this.volumePercent > 0;
  }

  get volume(): number {
    return this.volumePercent;
  }

  setVolume(percent: number, persist = true): number {
    this.volumePercent = Math.round(Math.min(100, Math.max(0, Number.isFinite(percent) ? percent : DEFAULT_VOLUME)));
    if (persist) {
      window.localStorage.setItem(GAME_VOLUME_STORAGE_KEY, String(this.volumePercent));
      window.localStorage.setItem(SOUND_STORAGE_KEY, this.isEnabled ? "on" : "off");
    }
    return this.volumePercent;
  }

  arm(): void {
    if (this.isEnabled) this.clips.get("tap")?.load();
  }

  playUrgency(second: number): void {
    this.play(second <= 2 ? "tick-urgent" : "tick", 0.46);
  }

  playEffect(effect: GameSoundEffect, streak = 0, onPlaying?: () => void): void {
    this.play(effect, EFFECT_VOLUME[effect], effect === "correct" ? correctPlaybackRate(streak) : 1, onPlaying);
  }

  private play(name: string, volume: number, playbackRate = 1, onPlaying?: () => void): void {
    const base = this.clips.get(name);
    if (!this.isEnabled || !base) {
      onPlaying?.();
      return;
    }
    const clip = base.cloneNode(true) as HTMLAudioElement;
    clip.volume = volume * this.volumePercent / 100;
    clip.preservesPitch = playbackRate === 1;
    clip.playbackRate = playbackRate;
    if (onPlaying) clip.addEventListener("playing", onPlaying, { once: true });
    void clip.play().catch(() => {
      if (onPlaying) clip.removeEventListener("playing", onPlaying);
      onPlaying?.();
    });
  }

  private loadVolume(): number {
    const stored = Number(window.localStorage.getItem(GAME_VOLUME_STORAGE_KEY));
    if (Number.isFinite(stored) && stored >= 0 && stored <= 100 && window.localStorage.getItem(GAME_VOLUME_STORAGE_KEY) !== null) return Math.round(stored);
    return window.localStorage.getItem(SOUND_STORAGE_KEY) === "off" ? 0 : DEFAULT_VOLUME;
  }
}
