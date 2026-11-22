// Hold to talk without the browser's own speech recognition (desktop Kevin, Firefox, iPhone when Siri dictation is
// off): record only while the button is held (at most 30 s), send the clip to /api/hear, get text back. The mic track
// is stopped the moment the button is released; nothing is kept.
export const canRecord = () => !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);

export function holdToTalk(button, { onText, onState = () => {}, beforeOpen = async () => {} }) {
  let rec = null, stream = null, chunks = [], stopT = 0, down = false;
  const stop = () => { clearTimeout(stopT); if (rec && rec.state === 'recording') rec.stop(); };
  button.addEventListener('pointerdown', async e => {
    e.preventDefault(); if (rec) return; down = true;
    try {
      await beforeOpen();
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!down) { stream.getTracks().forEach(t => t.stop()); return; } // released before the mic opened
      chunks = [];
      rec = new MediaRecorder(stream);
      rec.ondataavailable = ev => ev.data.size && chunks.push(ev.data);
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop()); stream = null; const type = rec.mimeType || 'audio/webm'; rec = null; onState('thinking');
        const blob = new Blob(chunks, { type }); chunks = [];
        if (blob.size < 1200) { onState('idle'); return onText('', 'too short'); }
        try {
          const r = await fetch('/api/hear', { method: 'POST', headers: { 'content-type': type.split(';')[0] }, body: blob });
          const j = await r.json();
          onState('idle'); onText(j.text || '', j.error);
        } catch { onState('idle'); onText('', 'Kevin is catching his breath. Try again in a minute.'); }
      };
      rec.start(); onState('listening');
      stopT = setTimeout(stop, 30000);
    } catch { rec = null; onState('idle'); onText('', "I can't hear you. Allow the microphone, or just type to me."); }
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) button.addEventListener(ev, () => { down = false; stop(); });
}

// Kevin never says anyone's name out loud (the text on screen may show it). The listener's own name becomes "you";
// anyone else's becomes "your friend". Names are the ones Kevin was given: tester, gift, pair, jury, card.
const NOT_NAMES = new Set(['a', 'an', 'the', 'and', 'my', 'your', 'our', 'mystery', 'friend', 'kevin', 'me', 'you', 'mom', 'dad']);
export function forSpeech(text, { you = [], others = [] } = {}) {
  let t = String(text || '');
  const swap = (raw, sub, possessive) => {
    for (const word of String(raw || '').split(/[\s,&]+/).filter(w => w.length > 1 && !NOT_NAMES.has(w.toLowerCase()))) {
      const name = word.charAt(0).toUpperCase() + word.slice(1); // Kevin writes names capitalized; "will" stays a verb
      const n = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), B = '(?<![\\p{L}])', E = '(?![\\p{L}])';
      t = t.replace(new RegExp(`^\\s*${n}${E}\\s*[,!:]+\\s*`, 'u'), '')                          // "Sadaf! ..." -> "..."
        .replace(new RegExp(`,\\s*${n}${E}(?=[\\s]*[,.!?]|\\s*$)`, 'gu'), '')                   // "..., Sadaf." -> "..."
        .replace(new RegExp(`${B}${n}['’]s${E}`, 'gu'), possessive)                            // "Sadaf's" -> "your"
        .replace(new RegExp(`${B}${n}${E}`, 'gu'), sub);                                      // "Sadaf" -> "you"
    }
  };
  for (const n of you) swap(n, 'you', 'your');
  for (const n of others) swap(n, 'your friend', "your friend's");
  t = t.replace(/\s{2,}/g, ' ').replace(/\s+([,.!?])/g, '$1').replace(/([.!?]\s+)(\p{Ll})/gu, (_, a, b) => a + b.toUpperCase()).trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// ---- Kevin's own voice: Kokoro-82M (Apache-2.0) runs on this device (WebGPU where it can, else WASM), so his voice
// costs nothing at any scale and no words leave for speech. About 86 MB once (q8), then the browser keeps it. Until it
// is ready, and on slow devices, older iPhones or data saver, the device's own voice speaks.
export const KEVIN_VOICE = 'am_fenrir'; // listening proxy 97 of 100 (voice-samples/README.md); the owner's pick overrides
const KOKORO = 'onnx-community/Kokoro-82M-v1.0-ONNX';
let tts = null, loading = null, ctx = null, playing = null, turn = 0;
export function kokoroWorthy() {
  if (typeof window === 'undefined' || !window.AudioContext || /[?&]voice=os\b/.test(location.search) || navigator.connection?.saveData) return false;
  const ios = navigator.userAgent.match(/(?:iPhone|iPad|iPod).* OS (\d+)_/);
  if (ios) return +ios[1] >= 18; // older iPhones keep the system voice
  return (navigator.hardwareConcurrency || 2) >= 4 && (navigator.deviceMemory || 8) >= 4;
}
// Call from a tap: starts the one-time download. note() shows "Kevin's voice is loading…" only when it isn't cached yet.
export function loadKevinVoice(note = () => {}) {
  if (!kokoroWorthy()) return Promise.resolve(null);
  ctx ||= new AudioContext(); ctx.resume?.();
  return loading ||= (async () => {
    const cached = await caches.open('transformers-cache').then(c => c.keys()).then(k => k.length > 0).catch(() => false);
    if (!cached) note("Kevin's voice is loading…");
    const { KokoroTTS } = await import('/vendor/kokoro-1.2.1.web.js');
    try { tts = await KokoroTTS.from_pretrained(KOKORO, { dtype: 'q8', device: navigator.gpu ? 'webgpu' : 'wasm' }); await tts.generate('Hm.', { voice: KEVIN_VOICE }); }
    catch { tts = await KokoroTTS.from_pretrained(KOKORO, { dtype: 'q8', device: 'wasm' }); } // WebGPU said no
    return tts;
  })().catch(() => (tts = null)); // stays on the device voice
}
export const kevinVoiceReady = () => !!tts;
// Stops whatever Kevin is saying, in either voice.
export function hush() { turn++; try { playing?.stop(); } catch {} playing = null; window.speechSynthesis?.cancel(); }
function play(a, my) {
  return new Promise(done => {
    if (my !== turn) return done(false);
    const b = ctx.createBuffer(1, a.audio.length, a.sampling_rate); b.copyToChannel(a.audio, 0);
    const src = ctx.createBufferSource(); src.buffer = b; src.connect(ctx.destination);
    src.onended = () => done(my === turn); playing = src; src.start();
  });
}
// Speaks in Kevin's own voice with the comic beat (Kokoro pads each part, so 250 ms lands about half a second).
// Resolves false when the voice isn't ready, so the caller uses the device voice instead.
export async function speakKevin(text, { beat = 250, onStart = () => {}, onEnd = () => {} } = {}) {
  if (!tts || !ctx) return false;
  hush(); const my = turn;
  const { setup, punch } = comicParts(text);
  try {
    const first = tts.generate(setup, { voice: KEVIN_VOICE, speed: 0.95 });
    const second = punch ? first.then(() => tts.generate(punch, { voice: KEVIN_VOICE, speed: 0.95 })) : null;
    // audio that isn't unlocked by a tap stays suspended; then the device voice speaks instead of waiting forever
    if (ctx.state !== 'running') await Promise.race([ctx.resume?.(), new Promise(r => setTimeout(r, 400))]);
    if (ctx.state !== 'running') return false;
    const a = await first; if (my !== turn) return true;
    onStart();
    if (await play(a, my) && second) { await new Promise(r => setTimeout(r, beat)); await play(await second, my); }
  } catch { if (my === turn) { onEnd(); return false; } }
  onEnd(); return true;
}

// Kevin's delivery: deadpan, a beat before the punchline. Splits the reply at sentence ends and pauses before the last.
// Uses Kevin's own voice when it's loaded, the device's voice otherwise.
export function speakComic(text, { voice = null, beat = 450, onStart = () => {}, onEnd = () => {}, os = false } = {}) {
  if (tts && !os) { speakKevin(text, { onStart, onEnd }).then(ok => { if (!ok) speakComic(text, { voice, beat, onStart, onEnd, os: true }); }); return; }
  const synth = window.speechSynthesis; if (!synth) { onEnd(); return; }
  hush();
  const { setup, punch } = comicParts(text);
  const say = (t, done) => { const u = new SpeechSynthesisUtterance(t); if (voice) u.voice = voice; u.rate = 1.0; u.pitch = 0.92; u.onend = u.onerror = done; synth.speak(u); };
  onStart();
  say(setup, () => punch ? setTimeout(() => say(punch, onEnd), beat) : onEnd());
}
// Voices that do deadpan well, best first: the Mac order is from the listening test in voice-samples/ (Daniel 98,
// Rocko 97, Eddy 97, Reed 89, Fred 84); Windows and Chrome voices follow. The OS picks what it has.
export const DEADPAN = [/^Daniel/, /^Rocko/, /^Eddy/, /^Reed/, /^Fred\b/, /^Alex\b/, /Guy.*Natural/, /Davis.*Natural/, /Andrew.*Natural/, /^Microsoft David/, /^Microsoft Mark/, /Google UK English Male/, /Google US English/];
export function pickVoice(synth = window.speechSynthesis) {
  const en = (synth?.getVoices() || []).filter(v => /^en/i.test(v.lang));
  for (const re of DEADPAN) { const v = en.find(v => re.test(v.name)); if (v) return v; }
  return en.find(v => /en-us/i.test(v.lang)) || en[0] || null;
}

// The beat goes before the last sentence (or after a dash or ellipsis): setup, pause, punch.
export function comicParts(text) {
  const t = String(text || '').trim();
  const dash = t.match(/^(.*?)(\s*(?:—|…|\.\.\.|--)\s*)([^—…]+)$/);
  if (dash && dash[1].length > 8 && dash[3].trim().length > 2) return { setup: dash[1].trim(), punch: dash[3].trim() };
  const parts = t.match(/[^.!?]+[.!?]*\s*/g)?.map(s => s.trim()).filter(Boolean) || [t];
  return parts.length > 1 ? { setup: parts.slice(0, -1).join(' '), punch: parts.at(-1) } : { setup: t, punch: null };
}
