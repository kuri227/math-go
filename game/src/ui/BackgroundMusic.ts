export type MusicTrack = "menu" | "play";

const source = (track: MusicTrack) => `/audio/bgm-${track}.ogg`;
const MUSIC_GAIN = 0.28;
const FADE_MS = 420;

export function musicFadeProgress(now: number, startedAt: number, durationMs = FADE_MS): number {
  return Math.min(1, Math.max(0, (now - startedAt) / Math.max(1, durationMs)));
}

/** Looped game music with a small crossfade between menu and play scenes. */
export class BackgroundMusic {
  private readonly tracks = new Map<MusicTrack, HTMLAudioElement>();
  private active: MusicTrack | null = null;
  private volumePercent: number;
  private fadeGeneration = 0;

  constructor(volumePercent: number) {
    this.volumePercent = volumePercent;
    for (const name of ["menu", "play"] as const) {
      const audio = new Audio(source(name));
      audio.loop = true;
      audio.preload = "auto";
      audio.volume = 0;
      this.tracks.set(name, audio);
    }
  }

  setVolume(percent: number): void {
    this.volumePercent = Math.min(100, Math.max(0, percent));
    const current = this.active ? this.tracks.get(this.active) : null;
    if (current) current.volume = this.targetVolume;
  }

  async setTrack(next: MusicTrack): Promise<void> {
    const incoming = this.tracks.get(next)!;
    if (this.active === next) {
      incoming.volume = this.targetVolume;
      if (incoming.paused) await incoming.play().catch(() => {});
      return;
    }
    const outgoing = this.active ? this.tracks.get(this.active) ?? null : null;
    this.active = next;
    const generation = ++this.fadeGeneration;
    incoming.currentTime = 0;
    incoming.volume = 0;
    await incoming.play().catch(() => {});
    const startedAt = performance.now();
    const fade = (now: number) => {
      if (generation !== this.fadeGeneration) return;
      // Some browser automation/runtime combinations report a RAF timestamp
      // from a slightly different time origin. Clamp both bounds before it is
      // assigned to HTMLMediaElement.volume.
      const progress = musicFadeProgress(now, startedAt);
      incoming.volume = this.targetVolume * progress;
      if (outgoing) outgoing.volume = this.targetVolume * (1 - progress);
      if (progress < 1) requestAnimationFrame(fade);
      else if (outgoing) { outgoing.pause(); outgoing.currentTime = 0; }
    };
    requestAnimationFrame(fade);
  }

  private get targetVolume(): number {
    return MUSIC_GAIN * this.volumePercent / 100;
  }
}
