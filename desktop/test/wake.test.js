// The "Hey Kevin" release gate, run through the same wake.js the app ships:
// - recall: held-out "Hey Kevin" clips in voices never used for training, clean and under background audio
// - false accepts: about an hour of speech and music with no wake phrase, under 1 false wake per hour
// The big fixtures live outside the repo: KEVIN_WAKE_HELDOUT (a folder of 16 kHz wavs) and KEVIN_WAKE_FA (one wav).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ort = require('onnxruntime-web');
const { createWake, trigger, THRESHOLD: SHIPPED } = require('../wake.js');
ort.env.wasm.numThreads = 1;

const M = path.join(__dirname, '..', 'models');
const models = { mel: path.join(M, 'melspectrogram.onnx'), emb: path.join(M, 'embedding_model.onnx'), kw: path.join(M, 'hey_kevin.onnx') };
const THRESHOLD = Number(process.env.KEVIN_WAKE_THRESHOLD) || SHIPPED;
const HELD = process.env.KEVIN_WAKE_HELDOUT, FA = process.env.KEVIN_WAKE_FA;

function pcm(file) { // 16-bit mono wav -> Int16Array
  const b = fs.readFileSync(file), d = b.indexOf('data');
  const n = b.readUInt32LE(d + 4) >> 1, off = b.byteOffset + d + 8;
  return new Int16Array(b.buffer.slice(off, off + n * 2));
}
async function wakes(samples) {
  const w = await createWake(ort, models), fire = trigger({ threshold: THRESHOLD });
  let n = 0, top = 0;
  for (let i = 0; i < samples.length; i += 16000) for (const s of await w.push(samples.subarray(i, i + 16000))) { top = Math.max(top, s); if (fire(s)) n++; }
  return { n, top };
}
const pad = (x, under) => { // 1 s of lead-in and 1 s after; optional background mixed under at about 10 dB below
  const o = new Int16Array(x.length + 32000); o.set(x, 16000);
  if (under) { const g = rms(x) / (rms(under) || 1) / 3.16; for (let i = 0; i < o.length; i++) o[i] = Math.max(-32768, Math.min(32767, o[i] + under[i % under.length] * g)); }
  return o;
};
const rms = x => Math.sqrt(x.reduce((a, v) => a + v * v, 0) / x.length);

test('the model files ship with the app', () => {
  for (const f of Object.values(models)) assert.ok(fs.statSync(f).size > 50000, f);
});

test('the small fixture wakes Kevin once, and silence never does', async () => {
  assert.equal((await wakes(pcm(path.join(__dirname, 'hey-kevin-then-ask.wav')))).n, 1);
  assert.equal((await wakes(new Int16Array(16000 * 20))).n, 0);
});

test('held-out "Hey Kevin" clips wake Kevin (recall at least 90% clean, 75% under background)', { skip: !HELD && 'set KEVIN_WAKE_HELDOUT' }, async () => {
  const files = fs.readdirSync(HELD).filter(f => f.endsWith('.wav')).sort();
  const bg = FA ? pcm(FA).subarray(16000 * 600, 16000 * 660) : null; // a minute of the speech/music fixture as background
  let clean = 0, noisy = 0; const missed = [];
  for (const f of files) {
    const x = pcm(path.join(HELD, f));
    if ((await wakes(pad(x))).n > 0) clean++; else missed.push(f);
    if (bg && (await wakes(pad(x, bg))).n > 0) noisy++;
  }
  console.log(`recall clean ${clean}/${files.length}` + (bg ? `, under background ${noisy}/${files.length}` : '') + (missed.length ? `; missed: ${missed.join(' ')}` : ''));
  assert.ok(clean / files.length >= 0.9, `clean recall ${clean}/${files.length}`);
  if (bg) assert.ok(noisy / files.length >= 0.75, `background recall ${noisy}/${files.length}`);
});

test('an hour of speech and music without the phrase: under 1 false wake per hour', { skip: !FA && 'set KEVIN_WAKE_FA' }, async () => {
  const x = pcm(FA), hours = x.length / 16000 / 3600;
  const { n, top } = await wakes(x);
  console.log(`false wakes ${n} in ${(hours * 60).toFixed(1)} min (${(n / hours).toFixed(2)}/h), top score ${top.toFixed(3)}`);
  assert.ok(hours >= 0.95, `fixture is ${(hours * 60).toFixed(1)} min`);
  assert.ok(n / hours < 1, `${n} false wakes`);
});
