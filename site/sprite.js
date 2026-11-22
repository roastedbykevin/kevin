// Kevin, small: the same brain, charter and safety as the full site, on a 220x260 face that sits on a screen.
// ?app=1 when the desktop app hosts it, ?smoke=1 for its hidden smoke test; tester links (?for=...) keep working.
import { readTester } from '/link.js?v=47d79208ee';
import { holdToTalk, canRecord, speakComic, pickVoice } from '/hear.js?v=47d79208ee';
import { cadence } from '/cadence.js?v=47d79208ee';
const $ = id => document.getElementById(id);
const q = new URLSearchParams(location.search);
const APP = q.get('app') === '1', SMOKE = q.get('smoke') === '1';
const tester = readTester(location.search);
const LINK = /^[0-9a-f]{18}$/.test(q.get('k') || '') ? q.get('k') : null;
document.body.classList.toggle('app', APP);
document.body.classList.toggle('tab', !APP);
const history = [];
let busy = false, kev = null, quietUntil = 0, roasting = false, lastReply = '';
const cad = cadence(SMOKE ? { baseMs: 0, jitter: 0 } : {});
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

// voice out: a deadpan voice with a beat before the punchline; muted on request; never over full-screen video unless tapped
let voice = null, muted = false, tappedAt = 0;
try { muted = localStorage.getItem('kevin-sprite-mute') === '1'; } catch {}
if (window.speechSynthesis) { voice = pickVoice(); speechSynthesis.addEventListener?.('voiceschanged', () => { voice = pickVoice(); }); }
window.kevinMute = on => { muted = !!on; try { localStorage.setItem('kevin-sprite-mute', muted ? '1' : '0'); } catch {} if (muted) speechSynthesis?.cancel(); paintMute(); };
function speak(text) {
  const overVideo = typeof media !== 'undefined' && media?.fullscreen && Date.now() - tappedAt > 60000;
  if (quiet() || muted || overVideo || !window.speechSynthesis) { set('talking'); setTimeout(() => set('idle'), Math.min(5000, 800 + text.length * 40)); return; }
  speakComic(text, { voice, onStart: () => set('talking'), onEnd: () => set('idle') });
}

async function send(text, media = null) {
  text = String(text || '').trim().slice(0, 300);
  if (!text || busy) return null;
  if (!media) cad.engaged();
  busy = true; set('thinking'); say('...', 60000);
  history.push({ role: 'user', content: text });
  let reply;
  try {
    const r = await fetch('/api/roast', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: history.slice(-12), link: LINK, voice: !muted && !SMOKE, ...(tester ? { tester } : {}), ...(media ? { media } : {}) }) });
    const j = await r.json();
    if (j.skip) { history.pop(); busy = false; set('idle'); $('says').hidden = true; return null; }
    reply = j.reply || j.message || "My Wi-Fi just roasted me instead. Try that again.";
  } catch { reply = 'My Wi-Fi just roasted me instead. Try that again.'; }
  history.push({ role: 'assistant', content: reply });
  busy = false; set('laughing'); setTimeout(() => set('idle'), 700);
  say(reply, 20000); speak(reply);
  lastReply = reply;
  roasting = /^(roast me|harder)/i.test(text);
  const chip = document.querySelector('[data-say="Roast me"], [data-say="Harder"]');
  chip.dataset.say = chip.textContent = roasting ? 'Harder' : 'Roast me';
  return reply;
}

$('head').addEventListener('click', () => {
  $('sprite').classList.add('open'); $('ask').hidden = false; $('msg').focus();
  if (!history.length && $('says').hidden) say(tester ? `${tester.name}! Your market tester shift starts now. Tap Riff it.` : 'Tap Riff it, Roast me, or type me something you watched.');
});
$('head').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('head').click(); } });
let telling = false; // the form either talks to Kevin or tells him what's playing
$('ask').addEventListener('submit', e => { e.preventDefault(); const t = $('msg').value; $('msg').value = ''; if (telling) { telling = false; $('msg').placeholder = 'Type to Kevin'; if (t.trim()) { onMedia({ title: t.trim(), app: 'Told by you', playing: true }); riffMedia('tick'); } return; } send(t); });
for (const b of document.querySelectorAll('#chips [data-say]')) b.addEventListener('click', () => send(b.dataset.say));

// hold to talk: the mic opens only while the button is held. Desktop Kevin and browsers without speech recognition
// record a short clip for /api/hear; browsers with it use their own.
const SR = !APP && (window.SpeechRecognition || window.webkitSpeechRecognition);
const t = $('talk');
const ring = on => { $('sprite').classList.toggle('listening', on); DESK?.micState?.(on); };
if (SR) {
  t.hidden = false; let rec = null, heard = '';
  t.addEventListener('pointerdown', () => { tappedAt = Date.now(); rec = new SR(); rec.lang = 'en-US'; rec.interimResults = true; heard = ''; rec.onresult = e => { heard = [...e.results].map(r => r[0].transcript).join(' '); }; rec.onerror = e => { if (/network|service-not-allowed/.test(e.error)) useClip(); }; rec.onend = () => { rec = null; ring(false); t.textContent = 'Hold to talk'; if (heard.trim()) send(heard); }; try { rec.start(); ring(true); t.textContent = 'Listening'; set('listening'); } catch { rec = null; } });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) t.addEventListener(ev, () => rec?.stop());
} else if (canRecord()) useClip();
function useClip() {
  const fresh = t.cloneNode(true); t.replaceWith(fresh); fresh.hidden = false; fresh.textContent = 'Hold to talk';
  holdToTalk(fresh, {
    beforeOpen: async () => { tappedAt = Date.now(); await DESK?.micArm?.(); },
    onState: st => { set(st); ring(st === 'listening'); fresh.textContent = st === 'listening' ? 'Listening' : 'Hold to talk'; },
    onText: (text, err) => { if (text) send(text); else if (err) say(err === 'too short' ? 'Hold the button while you talk.' : err); }
  });
}

// Mute, the credits line when the show ends, and a call from the hotkey or the tray (desktop Kevin).
function paintMute() { const b = $('muteBtn'); if (b) b.textContent = muted ? 'Sound on' : 'Mute'; }
$('muteBtn')?.addEventListener('click', () => window.kevinMute(!muted));
paintMute();
window.kevinCredits = () => { if (!busy) { say("That's it? Roll credits.", 5000); speak("That's it? Roll credits."); } };
window.kevinCall = () => { tappedAt = Date.now(); $('head').click(); };
for (const el of [$('head'), $('chips')]) el.addEventListener('pointerdown', () => { tappedAt = Date.now(); });

// ==== Riffing along with what's playing (the theater row, on your screen) ====
const DESK = window.kevinDesktop || null; // only inside desktop Kevin (its preload); a browser tab cannot see other apps
let media = null, skip = new Set(), popT = 0, tickT = 0;
function paintMedia() {
  const on = !!(media && media.playing && !skip.has(media.title));
  $('watch').hidden = !media; if (media) $('watch').textContent = `${media.playing ? 'watching' : 'paused'}: ${media.title}`;
  for (const id of ['along', 'cardBtn', 'notThis']) $(id).hidden = !on;
  $('chips').classList.toggle('media', on); // what's playing comes first in the row
  $('tell').hidden = !!DESK || on; // telling is for when nothing is playing yet
}
async function riffMedia(event) {
  if (!media || !media.playing || skip.has(media.title) || busy) return;
  if (event !== 'along' && (Date.now() < quietUntil || media.fullscreen)) return; // nothing during full-screen video unless they tap Kevin in
  const r = await send(event === 'change' ? `Now playing: ${media.title}` : event === 'along' ? 'Riff along with this one.' : "Riff what's playing.", { title: media.title, app: media.app, playing: media.playing, event });
  if (SMOKE && r) window.kevinLastMediaRiff = r;
  if (r && event !== 'along') { clearTimeout(popT); popT = setTimeout(() => cad.ignored(), 15000); } // no tap within 15 s counts as ignored
}
function schedule() { clearTimeout(tickT); tickT = setTimeout(async () => { await riffMedia('tick'); schedule(); }, cad.next()); }
function onMedia(m) {
  const prev = media;
  media = m && m.title ? { title: String(m.title).slice(0, 100), app: m.app, playing: m.playing !== false, fullscreen: !!m.fullscreen } : null;
  paintMedia();
  if (media && media.playing && (!prev || prev.title !== media.title)) { if (prev) riffMedia('change'); schedule(); }
  if (!media) clearTimeout(tickT);
}
for (const el of [$('head'), $('chips'), $('ask')]) el.addEventListener('pointerdown', () => { clearTimeout(popT); cad.engaged(); });
$('along').addEventListener('click', () => riffMedia('along'));
$('notThis').addEventListener('click', () => { if (media) { skip.add(media.title); paintMedia(); say("Fine. I'll sit this one out. Silently judging."); } });
$('cardBtn').addEventListener('click', () => { if (media) window.open(`https://roastedbykevin.com/?riffcard=${encodeURIComponent(media.title)}&line=${encodeURIComponent(lastReply || media.title)}`, '_blank'); });
$('tell').addEventListener('click', () => {
  $('sprite').classList.add('open'); $('ask').hidden = false; $('msg').value = ''; $('msg').placeholder = 'What are you watching?'; telling = true; $('msg').focus();
});
if (DESK) {
  DESK.onMedia(onMedia);
  DESK.consent().then(c => { if (c === null && !SMOKE) $('consent').hidden = false; });
  $('cYes').addEventListener('click', () => { DESK.setConsent(true); $('consent').hidden = true; say("Deal. Play something and I'll heckle it. Quiet for an hour is in my menu."); });
  $('cNo').addEventListener('click', () => { DESK.setConsent(false); $('consent').hidden = true; say('Fine. I will only judge your font.'); });
}
paintMedia();
