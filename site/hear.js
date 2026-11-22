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

// Kevin's delivery: deadpan, a beat before the punchline. Splits the reply at sentence ends and pauses before the last.
export function speakComic(text, { voice = null, beat = 450, onStart = () => {}, onEnd = () => {} } = {}) {
  const synth = window.speechSynthesis; if (!synth) { onEnd(); return; }
  synth.cancel();
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
