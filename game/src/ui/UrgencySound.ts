const SOUND_STORAGE_KEY = "math-go-sound";
export const GAME_VOLUME_STORAGE_KEY = "math-go-volume";
const DEFAULT_VOLUME = 70;

export type GameSoundEffect = "tap" | "start" | "correct" | "wrong" | "timeout" | "finish";
const source = (name: string) => `/audio/${name}.wav`;

export class UrgencySound {
  private volumePercent = this.loadVolume();
  private readonly clips = new Map<string, HTMLAudioElement>();

  constructor() {
    for (const name of ["tap", "start", "correct", "wrong", "timeout", "finish", "tick", "tick-urgent"]) {
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
    this.play(second <= 2 ? "tick-urgent" : "tick", 0.72);
  }

  playEffect(effect: GameSoundEffect): void {
    this.play(effect, effect === "tap" ? 0.38 : 0.78);
  }

  private play(name: string, volume: number): void {
    if (!this.isEnabled) return;
    const base = this.clips.get(name);
    if (!base) return;
    const clip = base.cloneNode(true) as HTMLAudioElement;
    clip.volume = volume * this.volumePercent / 100;
    void clip.play().catch(() => {});
  }

  private loadVolume(): number {
    const stored = Number(window.localStorage.getItem(GAME_VOLUME_STORAGE_KEY));
    if (Number.isFinite(stored) && stored >= 0 && stored <= 100 && window.localStorage.getItem(GAME_VOLUME_STORAGE_KEY) !== null) return Math.round(stored);
    return window.localStorage.getItem(SOUND_STORAGE_KEY) === "off" ? 0 : DEFAULT_VOLUME;
  }
}
