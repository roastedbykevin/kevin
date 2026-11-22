// "Hey Kevin" on-device: the openWakeWord pipeline (melspectrogram -> speech embedding -> wake model) in plain JS
// over onnxruntime. Same code runs in the app's ear window (onnxruntime-web) and in the tests (Node). 16 kHz mono
// int16 audio in, one score (0..1) per 80 ms out. Nothing here touches the network.
(function (root) {
  const CHUNK = 1280; // 80 ms
  // 0.6: held-out recall 85/88 (7 voices never trained on), 0.37 false wakes/h on openWakeWord's 10.7 h validation set
  const THRESHOLD = 0.6;

  async function createWake(ort, models) {
    const opt = { executionProviders: ['wasm'] };
    const [mel, emb, kw] = await Promise.all([models.mel, models.emb, models.kw].map(m => ort.InferenceSession.create(m, opt)));
    let raw = new Float32Array(0), pending = new Float32Array(0);
    let melBuf = []; for (let i = 0; i < 76; i++) melBuf.push(new Float32Array(32).fill(1)); // openWakeWord starts with ones
    const feats = [];

    async function melFrames(x) {
      const out = await mel.run({ [mel.inputNames[0]]: new ort.Tensor('float32', x, [1, x.length]) });
      const t = out[mel.outputNames[0]], n = t.dims[2], d = t.data, frames = [];
      for (let f = 0; f < n; f++) { const r = new Float32Array(32); for (let j = 0; j < 32; j++) r[j] = d[f * 32 + j] / 10 + 2; frames.push(r); }
      return frames;
    }
    async function embed(win) {
      const x = new Float32Array(76 * 32); win.forEach((r, i) => x.set(r, i * 32));
      const out = await emb.run({ [emb.inputNames[0]]: new ort.Tensor('float32', x, [1, 76, 32, 1]) });
      return Float32Array.from(out[emb.outputNames[0]].data);
    }

    // push int16 (or float in int16 range) samples; returns the scores for every completed 80 ms chunk
    async function push(samples) {
      const s = new Float32Array(pending.length + samples.length); s.set(pending); s.set(Float32Array.from(samples), pending.length);
      const whole = s.length - (s.length % CHUNK); pending = s.slice(whole);
      const scores = [];
      for (let off = 0; off < whole; off += CHUNK) {
        const r = new Float32Array(raw.length + CHUNK); r.set(raw); r.set(s.subarray(off, off + CHUNK), raw.length);
        raw = r.slice(-(CHUNK + 480)); // 1280 new samples plus 3 hops of context, as openWakeWord does
        melBuf.push(...await melFrames(raw)); if (melBuf.length > 970) melBuf = melBuf.slice(-970);
        feats.push(await embed(melBuf.slice(-76))); if (feats.length > 120) feats.shift();
        if (feats.length < 16) { scores.push(0); continue; }
        const x = new Float32Array(16 * 96); feats.slice(-16).forEach((f, i) => x.set(f, i * 96));
        const out = await kw.run({ [kw.inputNames[0]]: new ort.Tensor('float32', x, [1, 16, 96]) });
        scores.push(out[kw.outputNames[0]].data[0]);
      }
      return scores;
    }
    return { push };
  }

  // A wake fires when the score crosses the threshold; then it stays quiet for `refractory` chunks (2 s).
  function trigger({ threshold = THRESHOLD, refractory = 25 } = {}) {
    let hold = 0;
    return score => { if (hold > 0) { hold--; return false; } if (score >= threshold) { hold = refractory; return true; } return false; };
  }

  const api = { createWake, trigger, CHUNK, THRESHOLD };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.kevinWakeLib = api;
})(typeof self !== 'undefined' ? self : this);
