// Kevin's ear: a hidden local window with no network. It listens for "Hey Kevin" on this computer only. Audio is
// scored in memory and dropped; nothing is kept or sent anywhere until the wake fires. Then it records what you say
// next (until you stop talking, at most 8 s) and hands that one clip to Kevin, who sends it to /api/hear like hold-to-talk.
(async () => {
  const ear = window.kevinEar, lib = window.kevinWakeLib;
  ort.env.wasm.numThreads = 1; ort.env.wasm.wasmPaths = new URL('node_modules/onnxruntime-web/dist/', location.href).href;
  const wake = await lib.createWake(ort, { mel: 'models/melspectrogram.onnx', emb: 'models/embedding_model.onnx', kw: 'models/hey_kevin.onnx' });
  const fire = lib.trigger({ threshold: (await ear.threshold()) || lib.THRESHOLD });
  let recording = null, quietFor = 0, queue = Promise.resolve(), waiting = 0;

  function wav(chunks) {
    const n = chunks.reduce((a, c) => a + c.length, 0), b = new ArrayBuffer(44 + n * 2), v = new DataView(b);
    const s = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    s(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); s(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); s(36, 'data'); v.setUint32(40, n * 2, true);
    let o = 44; for (const c of chunks) for (const x of c) { v.setInt16(o, Math.max(-32768, Math.min(32767, x)), true); o += 2; }
    return b;
  }
  // after the wake: keep what's said until 0.9 s of quiet (after at least 0.8 s), at most 8 s
  function keep(pcm) {
    recording.chunks.push(pcm); recording.n += pcm.length;
    const rms = Math.sqrt(pcm.reduce((a, x) => a + x * x, 0) / pcm.length);
    quietFor = rms < recording.floor ? quietFor + pcm.length : 0;
    if ((recording.n > 12800 && quietFor > 14400) || recording.n > 128000) { const clip = wav(recording.chunks); recording = null; ear.heard(clip); }
  }
  // A slow computer drops blocks rather than falling behind (more than ~1 s waiting); a model error stops the ear.
  function hear(pcm, live = true) {
    if (live && waiting > 4 && !recording) return;
    waiting++;
    queue = queue.then(async () => {
      if (recording) return keep(pcm);
      const scores = await wake.push(pcm);
      // the whole block goes into the clip, so the start of the ask right after "Kevin" is not lost
      for (const sc of scores) if (fire(sc)) { recording = { chunks: [], n: 0, floor: 500 }; quietFor = 0; ear.woke(sc); keep(pcm); break; }
    }).catch(e => ear.failed('model: ' + (e && e.message || e))).finally(() => { waiting--; });
  }

  if (await ear.fixture()) { ear.onFixture(pcm => { for (let i = 0; i < pcm.length; i += 4096) hear(Int16Array.from(pcm.subarray(i, i + 4096)), false); }); ear.ready(); return; }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: false, autoGainControl: true } });
  const ctx = new AudioContext({ sampleRate: 16000 });
  const node = ctx.createScriptProcessor(4096, 1, 1); // shortcut: ScriptProcessor is deprecated but needs no extra file; move to an AudioWorklet if Chromium drops it
  node.onaudioprocess = e => { const f = e.inputBuffer.getChannelData(0), x = new Int16Array(f.length); for (let i = 0; i < f.length; i++) x[i] = Math.max(-1, Math.min(1, f[i])) * 32767; hear(x); };
  ctx.createMediaStreamSource(stream).connect(node); node.connect(ctx.destination);
  stream.getAudioTracks()[0].onended = () => ear.failed('mic ended'); // unplugged, switched device or taken away
  ear.ready();
})().catch(e => window.kevinEar?.failed((e && e.name === 'NotAllowedError' ? 'denied: ' : '') + String(e && e.message || e)));
