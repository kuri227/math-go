import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sampleRate = 44_100;
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const output = resolve(root, "game/public/audio");
mkdirSync(output, { recursive: true });

const note = (start, duration, frequency, volume = 0.3, wave = "square", slide = 0, attack = 0.06, release = 0.22) =>
  ({ start, duration, frequency, volume, wave, slide, attack, release });

const sounds = {
  tap: [note(0, 0.095, 390, 0.12, "sine", -55, 0.18, 0.55)],
  start: [note(0, 0.09, 440, 0.2), note(0.1, 0.09, 660, 0.22), note(0.2, 0.18, 880, 0.24)],
  correct: [note(0, 0.14, 523.25, 0.25, "triangle"), note(0.09, 0.17, 659.25, 0.26, "triangle"), note(0.18, 0.3, 783.99, 0.28, "triangle")],
  wrong: [note(0, 0.16, 261.63, 0.22, "saw", -80), note(0.13, 0.25, 196, 0.2, "saw", -55)],
  timeout: [note(0, 0.16, 330, 0.2, "square", -90), note(0.15, 0.28, 246.94, 0.2, "square", -70)],
  finish: [note(0, 0.14, 392, 0.22, "triangle"), note(0.11, 0.14, 523.25, 0.23, "triangle"), note(0.22, 0.14, 659.25, 0.24, "triangle"), note(0.33, 0.38, 783.99, 0.27, "triangle")],
  tick: [note(0, 0.095, 660, 0.19, "sine")],
  "tick-urgent": [note(0, 0.11, 880, 0.22, "square")],
};

function oscillator(phase, wave) {
  if (wave === "sine") return Math.sin(phase);
  if (wave === "triangle") return 2 * Math.asin(Math.sin(phase)) / Math.PI;
  if (wave === "saw") return 2 * (phase / (2 * Math.PI) - Math.floor(phase / (2 * Math.PI) + 0.5));
  return Math.sin(phase) >= 0 ? 1 : -1;
}

function render(events, peakLevel = 0.82) {
  const duration = Math.max(...events.map(event => event.start + event.duration)) + 0.035;
  const samples = new Float64Array(Math.ceil(duration * sampleRate));
  for (const event of events) {
    const first = Math.floor(event.start * sampleRate);
    const count = Math.floor(event.duration * sampleRate);
    let phase = 0;
    for (let index = 0; index < count; index += 1) {
      const progress = index / Math.max(1, count - 1);
      const frequency = event.frequency + event.slide * progress;
      phase += 2 * Math.PI * frequency / sampleRate;
      const attack = Math.min(1, progress / event.attack);
      const release = Math.min(1, (1 - progress) / event.release);
      samples[first + index] += oscillator(phase, event.wave) * event.volume * attack * release;
    }
  }
  const peak = samples.reduce((value, sample) => Math.max(value, Math.abs(sample)), 0) || 1;
  const pcm = new Int16Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) pcm[index] = Math.round(samples[index] / peak * peakLevel * 32767);
  return pcm;
}

function wav(pcm) {
  const dataSize = pcm.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0); buffer.writeUInt32LE(36 + dataSize, 4); buffer.write("WAVE", 8);
  buffer.write("fmt ", 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22); buffer.writeUInt32LE(sampleRate, 24); buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34); buffer.write("data", 36); buffer.writeUInt32LE(dataSize, 40);
  for (let index = 0; index < pcm.length; index += 1) buffer.writeInt16LE(pcm[index], 44 + index * 2);
  return buffer;
}

for (const [name, events] of Object.entries(sounds)) {
  const peakLevel = name === "tap" ? 0.36 : 0.82;
  writeFileSync(resolve(output, `${name}.wav`), wav(render(events, peakLevel)));
}
writeFileSync(resolve(output, "README.md"), "# 数学でGO 効果音\n\n`scripts/audio/generate_game_sfx.mjs`で生成したプロジェクト専用のモノラルWAVです。外部素材・生成AIモデル・第三者ライセンスは使用していません。\n\nクリック音は、展示会場で繰り返し聞いても驚きにくいよう、低めの正弦波と緩い包絡、控えめなピークで生成します。\n");
console.log(`Generated ${Object.keys(sounds).length} sound effects in ${output}`);
