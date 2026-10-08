const SOUND_STORAGE_KEY = "math-go-sound";

export class UrgencySound {
  private enabled = window.localStorage.getItem(SOUND_STORAGE_KEY) !== "off";
  private audioContext: AudioContext | null = null;

  get isEnabled(): boolean {
    return this.enabled;
  }

  toggle(): boolean {
    this.enabled = !this.enabled;
    window.localStorage.setItem(SOUND_STORAGE_KEY, this.enabled ? "on" : "off");
    return this.enabled;
  }

  play(second: number): void {
    if (!this.enabled) return;
    this.audioContext ??= new AudioContext();
    if (this.audioContext.state === "suspended") void this.audioContext.resume();

    const oscillator = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = second <= 2 ? 880 : 660;
    gain.gain.setValueAtTime(0.0001, this.audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, this.audioContext.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.audioContext.currentTime + 0.11);
    oscillator.connect(gain).connect(this.audioContext.destination);
    oscillator.start();
    oscillator.stop(this.audioContext.currentTime + 0.12);
  }
}
