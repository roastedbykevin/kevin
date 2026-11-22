// Kevin, small: the same brain, charter and safety as the full site, on a 220x260 face that sits on a screen.
// ?app=1 when the desktop app hosts it, ?smoke=1 for its hidden smoke test; tester links (?for=...) keep working.
import { readTester } from '/link.js?v=a4ec40dee0';
const $ = id => document.getElementById(id);
const q = new URLSearchParams(location.search);
const APP = q.get('app') === '1', SMOKE = q.get('smoke') === '1';
const tester = readTester(location.search);
const LINK = /^[0-9a-f]{18}$/.test(q.get('k') || '') ? q.get('k') : null;
document.body.classList.toggle('app', APP);
document.body.classList.toggle('tab', !APP);
const history = [];
let busy = false, kev = null, quietUntil = 0, roasting = false;
const quiet = () => SMOKE || Date.now() < quietUntil;
window.kevinQuiet = ms => { quietUntil = Date.now() + ms; speechSynthesis?.cancel(); say('Fine. Quiet for an hour. I will judge silently.'); };

// Kevin's own face and only his rules, taken from the home page so every Kevin looks the same.
fetch('/').then(r => r.text()).then(html => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  kev = doc.getElementById('kev'); kev.dataset.s = 'idle';
  const tmp = new CSSStyleSheet(); tmp.replaceSync([...doc.querySelectorAll('style')].map(x => x.textContent).join('\n'));
  const keep = r => r instanceof CSSKeyframesRule || (r.selectorText || '').includes('#kev') || (r instanceof CSSMediaRule && [...r.cssRules].some(keep));
  const st = document.createElement('style'); st.textContent = [...tmp.cssRules].filter(keep).map(r => r.cssText).join('\n') + ':root{--sleeve:#F5B323;--pink:#D81B60}';
  document.head.append(st); $('kevBox').replaceWith(kev);
  window.kevinReady = true;
});
const set = s => { if (kev) kev.dataset.s = s; };
let hideT = 0;
function say(text, ms = 12000) { $('says').textContent = text; $('says').hidden = false; clearTimeout(hideT); hideT = setTimeout(() => { if (!busy) $('says').hidden = true; }, ms); }

// voice out: the warmest English voice the device has, and only when not quiet
let voice = null;
const pick = () => { const en = speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang)); voice = en.find(v => /natural|premium|enhanced/i.test(v.name)) || en.find(v => /en-us/i.test(v.lang)) || en[0] || null; };
if (window.speechSynthesis) { pick(); speechSynthesis.addEventListener?.('voiceschanged', pick); }
function speak(text) {
  if (quiet() || !window.speechSynthesis) { set('talking'); setTimeout(() => set('idle'), Math.min(5000, 800 + text.length * 40)); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text); if (voice) u.voice = voice; u.rate = 1.06; u.pitch = 1.08;
  u.onstart = () => set('talking'); u.onend = u.onerror = () => set('idle');
  speechSynthesis.speak(u);
}

async function send(text) {
  text = String(text || '').trim().slice(0, 300);
  if (!text || busy) return;
  busy = true; set('thinking'); say('...', 60000);
  history.push({ role: 'user', content: text });
  let reply;
  try {
    const r = await fetch('/api/roast', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: history.slice(-12), link: LINK, ...(tester ? { tester } : {}) }) });
    const j = await r.json();
    reply = j.reply || j.message || "My Wi-Fi just roasted me instead. Try that again.";
  } catch { reply = 'My Wi-Fi just roasted me instead. Try that again.'; }
  history.push({ role: 'assistant', content: reply });
  busy = false; set('laughing'); setTimeout(() => set('idle'), 700);
  say(reply, 20000); speak(reply);
  roasting = /^(roast me|harder)/i.test(text);
  const chip = document.querySelector('[data-say="Roast me"], [data-say="Harder"]');
  chip.dataset.say = chip.textContent = roasting ? 'Harder' : 'Roast me';
}

$('head').addEventListener('click', () => {
  $('sprite').classList.add('open'); $('ask').hidden = false; $('msg').focus();
  if (!history.length && $('says').hidden) say(tester ? `${tester.name}! Your market tester shift starts now. Tap Riff it.` : 'Tap Riff it, Roast me, or type me something you watched.');
});
$('head').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('head').click(); } });
$('ask').addEventListener('submit', e => { e.preventDefault(); const t = $('msg').value; $('msg').value = ''; send(t); });
for (const b of document.querySelectorAll('#chips [data-say]')) b.addEventListener('click', () => send(b.dataset.say));

// hold to talk: the mic listens only while the button is held (not in the desktop app, whose engine has no speech service)
const SR = !APP && (window.SpeechRecognition || window.webkitSpeechRecognition);
if (SR) {
  const t = $('talk'); t.hidden = false; let rec = null, heard = '';
  t.addEventListener('pointerdown', () => { rec = new SR(); rec.lang = 'en-US'; rec.interimResults = true; heard = ''; rec.onresult = e => { heard = [...e.results].map(r => r[0].transcript).join(' '); }; rec.onend = () => { rec = null; t.textContent = 'Hold to talk'; if (heard.trim()) send(heard); }; try { rec.start(); t.textContent = 'Listening'; set('listening'); } catch { rec = null; } });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) t.addEventListener(ev, () => rec?.stop());
}

// Now and then, an idle bit: rare (every 15 to 40 minutes), text only, never asks for anything, never while quiet.
const BITS = ["I'm judging that font.", 'That tab has been open since the last sequel.', 'Your wallpaper has the energy of a DVD menu.', 'Blink twice if this meeting is a director\'s cut.', 'Somebody approved that color scheme. Brave.', 'I give this window layout two stars. One for effort.'];
let lastBit = -1;
function idle() {
  setTimeout(() => {
    if (!quiet() && !busy && $('says').hidden && document.visibilityState === 'visible') {
      let i; do { i = Math.floor(Math.random() * BITS.length); } while (i === lastBit && BITS.length > 1);
      lastBit = i; say(BITS[i], 7000); set('laughing'); setTimeout(() => set('idle'), 700);
    }
    idle();
  }, (15 + Math.random() * 25) * 60000);
}
if (!SMOKE) idle();
