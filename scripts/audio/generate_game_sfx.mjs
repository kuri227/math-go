import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sampleRate = 44_100;
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const output = resolve(root, "game/public/audio");
mkdirSync(output, { recursive: true });

const note = (start, duration, frequency, volume = 0.3, wave = "sine", slide = 0, attack = 0.08, release = 0.5) =>
  ({ start, duration, frequency, volume, wave, slide, attack, release });

// A quiet, rounded palette for repeated use in a classroom or exhibition.
// Sine/triangle partials avoid the sharp high-frequency edges of square/saw waves.
const sounds = {
  tap: [note(0, 0.105, 330, 0.2, "sine", -28, 0.12, 0.72), note(0, 0.07, 660, 0.035, "sine", -45, 0.08, 0.8)],
  start: [note(0, 0.15, 392, 0.2), note(0.11, 0.19, 493.88, 0.21), note(0.23, 0.29, 587.33, 0.22, "triangle")],
  correct: [note(0, 0.22, 523.25, 0.22), note(0.1, 0.25, 659.25, 0.21), note(0.21, 0.38, 783.99, 0.2, "triangle")],
  wrong: [note(0, 0.25, 293.66, 0.2, "sine", -28), note(0.16, 0.34, 246.94, 0.18, "sine", -18)],
  timeout: [note(0, 0.3, 261.63, 0.2, "sine", -16), note(0.23, 0.42, 220, 0.18, "sine", -12)],
  finish: [note(0, 0.21, 392, 0.19), note(0.12, 0.24, 523.25, 0.2), note(0.24, 0.27, 659.25, 0.2), note(0.38, 0.46, 783.99, 0.21, "triangle")],
  tick: [note(0, 0.12, 320, 0.2, "sine", -24, 0.1, 0.76), note(0, 0.075, 640, 0.035, "sine", -40, 0.08, 0.82)],
  "tick-urgent": [note(0, 0.13, 392, 0.21, "sine", -28, 0.1, 0.74), note(0, 0.08, 784, 0.04, "sine", -48, 0.08, 0.82)],
};

const peakLevels = {
  tap: 0.24,
  start: 0.46,
  correct: 0.54,
  wrong: 0.4,
  timeout: 0.4,
  finish: 0.54,
  tick: 0.22,
  "tick-urgent": 0.27,
};

function oscillator(phase, wave) {
  if (wave === "sine") return Math.sin(phase);
  if (wave === "triangle") return 2 * Math.asin(Math.sin(phase)) / Math.PI;
  throw new Error(`Unsupported waveform: ${wave}`);
}

function render(events, peakLevel) {
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
  const peakLevel = peakLevels[name];
  if (!Number.isFinite(peakLevel)) throw new Error(`Missing peak level for sound: ${name}`);
  writeFileSync(resolve(output, `${name}.wav`), wav(render(events, peakLevel)));
}
writeFileSync(resolve(output, "README.md"), "# 数学でGO 効果音\n\n`scripts/audio/generate_game_sfx.mjs`で事前生成した、プロジェクト専用のモノラルWAVです。ゲーム中に音を合成する処理はありません。外部素材・生成AIモデル・第三者ライセンスも使用していません。\n\n全8音を、展示会場で繰り返し聞いても驚きにくい柔らかなマレット音として統一しています。角の立つ矩形波・のこぎり波は使わず、正弦波と控えめな三角波、緩やかな減衰、用途ごとの低いピーク値で生成します。残り5秒の`tick.wav`と残り2秒の`tick-urgent.wav`も同じ音色に揃え、緊急音だけが急に鋭くならない設計です。\n");
console.log(`Generated ${Object.keys(sounds).length} sound effects in ${output}`);
