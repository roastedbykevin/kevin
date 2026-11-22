import { readTester, friendLink, readCard, cardLink, HOME, shareText } from '/link.js?v=5a8d1c1324';
import { holdToTalk, canRecord, forSpeech } from '/hear.js?v=5a8d1c1324';
import { drawCard } from '/card.js?v=5a8d1c1324';

const $ = id => document.getElementById(id);
// Read once, up front: what kind of link this page was opened from (functions below use these).
const GIFT = new URLSearchParams(location.search).get('g');
const JURY = new URLSearchParams(location.search).get('j');
let giftIn = null;
const kev = $('kev'), says = $('says'), you = $('you'), msg = $('msg'), mic = $('mic'), mute = $('mute');
const history = [];
let busy = false, lastRoast = '', soundOn = true;
const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
soundOn = store.get('kevin-sound') !== 'off';

const set = s => { kev.dataset.s = s; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const toast = t => { const el = $('toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 5000); };
const LINK = /^[0-9a-f]{18}$/.test(new URLSearchParams(location.search).get('k') || '') ? new URLSearchParams(location.search).get('k') : (/^[0-9a-f]{18}$/.test(store.get('kevin-link') || '') ? store.get('kevin-link') : null);
if (LINK) store.set('kevin-link', LINK);
const T0 = Date.now();
async function goneNow(j) {
  document.body.classList.add('gone');
  $('goneMsg').textContent = j.message || 'Kevin switched himself off.';
  $('gone').hidden = false;
  if (j.deadLink) { try { localStorage.removeItem('kevin-link'); } catch {} }
  throw new Error('gone');
}
const post = (url, body) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, link: LINK, ...(url === '/api/roast' ? { voice: soundOn, ...(PACK?.token ? { pack: PACK.token } : {}) } : {}) }) })
  .then(async r => { const j = await r.json().catch(() => ({})); if (r.status === 410) await goneNow(j); return j; });
const ENTRY = GIFT ? 'gift' : JURY ? 'jury' : location.search.includes('c=') ? 'card' : location.search.includes('for=') ? 'tester' : location.search.includes('p=') ? 'remix' : /\/wall/.test(document.referrer) ? 'wall' : 'direct';
const SURFACE = matchMedia('(display-mode: standalone)').matches || navigator.standalone ? 'installed' : /iPhone|Android.*Mobile/.test(navigator.userAgent) ? 'phone' : 'web';
fetch(`/api/hello?entry=${ENTRY}&surface=${SURFACE}${LINK ? '&link=' + LINK : ''}`).then(async r => { if (r.status === 410) await goneNow(await r.json()); }).catch(() => {});
async function shareOrCopy(title, text, url, file) {
  const full = url ? shareText(text, url) : text; // every link share says why, how to install, and why it's safe
  if (file && navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title, text: full }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  if (navigator.share) { try { await navigator.share({ title, text: full }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(full); toast('Copied. Paste it anywhere.'); }
  catch { toast('Copy failed. Select the text and copy it.'); }
}
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => { $(b.dataset.close).hidden = true; }));

// ---- tester mode: ?for=<name>&age=&loves=&from= (kept on this device so the installed app opens the same way)
let tester = readTester(location.search);
if (tester) store.set('kevin-tester', JSON.stringify(tester));
else if (matchMedia('(display-mode: standalone)').matches) { try { tester = JSON.parse(store.get('kevin-tester')); } catch {} }
// ---- roast-for-two: started from the front door, or answering back to a card link (?c=)
let pairing = null, lastSame = null, cardNo = null, cardId = null, riffing = false, roasting = false;
const relKind = r => /\b(mom|mum|dad|mother|father|grand|aunt|uncle|cousin|sister|brother|son|daughter|niece|nephew|wife|husband|family|kid|parent)/i.test(r || '') ? 'family' : /friend|roommate|coworker|colleague|neighbor|classmate|buddy|pal/i.test(r || '') ? 'friend' : 'other';
const answering = readCard(location.search);
if (tester || GIFT || JURY || location.search.includes('c=')) document.body.classList.remove('fresh');
if (tester) document.body.classList.add('tester');
else if (answering) {
  pairing = { a: answering.b, b: answering.a, years: answering.n, rel: '', card: { line: answering.line, path: answering.path } };
  document.body.classList.add('answering');
  says.textContent = `${answering.a} sent you this: "${answering.line}" Tap Answer back and defend yourself.`;
}
const TOPIC_LABEL = { who: 'Who would download it', share: 'Would share it with', tomorrow: 'Would open it tomorrow if', pay: 'Would pay', cringe: 'Cringe', missing: 'Missing' };
const verdict = { insights: [], matters: [], relevant: [], answers: {}, landed: [] };
if (tester) {
  says.textContent = `${tester.name}! There you are. ${tester.from ? tester.from + ' says' : 'Word is'} you're my new market tester. Tap Riff it and let's see if you can take it.`;
  $('vTitle').textContent = `${tester.name}'s verdict`;
  $('vSend').textContent = tester.from ? `Send my verdict to ${tester.from}` : "Send my verdict to Kevin's maker";
}
const openTopics = () => ['who', 'share', 'tomorrow', 'pay', 'cringe', 'missing', 'matters', 'relevant']
  .filter(k => !(k === 'matters' || k === 'relevant' ? verdict[k].length : verdict.answers[k]?.length));

function addNotes(notes) {
  for (const { k, text } of notes || []) {
    if (k === 'insight') verdict.insights.push(text);
    else if (k === 'matters' || k === 'relevant') verdict[k].push(text);
    else (verdict.answers[k] ||= []).push(text);
  }
  paintVerdict();
}
function verdictText() {
  const out = [`${tester?.name || 'My'}'s verdict on Kevin`];
  const sec = (h, a) => { if (a.length) out.push('', h + ':', ...a.map(x => '- ' + x)); };
  sec('Insights', verdict.insights);
  sec('What matters to me right now', verdict.matters);
  sec('What feels relevant at my age', verdict.relevant);
  for (const [k, a] of Object.entries(verdict.answers)) sec(TOPIC_LABEL[k] || k, a);
  sec('Jokes that landed', verdict.landed);
  return out.join('\n');
}
function paintVerdict() {
  const n = verdict.insights.length + verdict.matters.length + verdict.relevant.length + Object.values(verdict.answers).flat().length + verdict.landed.length;
  $('verdict').hidden = !tester || !n;
  $('vCount').textContent = n ? `${8 - openTopics().length} of 8 answered` : '';
  const body = $('vBody'); body.textContent = '';
  const sec = (h, a) => {
    if (!a.length) return;
    const h3 = document.createElement('h3'); h3.textContent = h;
    const ul = document.createElement('ul'); for (const x of a) { const li = document.createElement('li'); li.textContent = x; ul.append(li); }
    body.append(h3, ul);
  };
  sec('Insights', verdict.insights);
  sec('What matters to them', verdict.matters);
  sec('What feels relevant at their age', verdict.relevant);
  for (const [k, a] of Object.entries(verdict.answers)) sec(TOPIC_LABEL[k] || k, a);
  sec('Jokes that landed', verdict.landed);
}
$('vCopy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(verdictText()); toast('Verdict copied.'); } catch { toast('Copy failed. Select the text and copy it.'); } });
$('vShare').addEventListener('click', () => shareOrCopy(`${tester?.name}'s verdict on Kevin`, verdictText()));
$('vSend').addEventListener('click', async () => {
  const b = $('vSend'); b.disabled = true;
  try {
    const r = await post('/api/feedback', { kind: 'verdict', name: tester?.name, verdict });
    if (!r.ok) throw new Error(r.error);
    b.textContent = 'Sent. Thank you!'; toast('Verdict sent.');
  } catch { b.disabled = false; toast("Didn't send. Try again in a minute."); }
});

// ---- the mute switch
function paintMute() {
  mute.setAttribute('aria-pressed', String(soundOn));
  mute.setAttribute('aria-label', soundOn ? "Kevin's voice is on. Turn it off" : "Kevin's voice is off. Turn it on");
}
paintMute();
mute.addEventListener('click', () => {
  soundOn = !soundOn; paintMute(); store.set('kevin-sound', soundOn ? 'on' : 'off');
  if (!soundOn && window.speechSynthesis) speechSynthesis.cancel();
});

// ---- voice out: pick the warmest English voice the device has
const synth = window.speechSynthesis;
let voice = null;
const LIKE = [/andrew.*natural/i, /guy.*natural/i, /davis.*natural/i, /brian.*natural/i, /natural/i, /premium/i, /enhanced/i,
  /google us english/i, /aaron/i, /reed/i, /evan/i, /nathan/i, /tom\b/i, /alex\b/i, /daniel/i, /fred/i];
function pickVoice() {
  if (!synth) return;
  const en = synth.getVoices().filter(v => /^en(-|_|$)/i.test(v.lang));
  for (const re of LIKE) { const v = en.find(v => re.test(v.name) && /en-us/i.test(v.lang)) || en.find(v => re.test(v.name)); if (v) { voice = v; return; } }
  voice = en.find(v => /en-us/i.test(v.lang)) || en[0] || null;
}
if (synth) { pickVoice(); synth.addEventListener?.('voiceschanged', pickVoice); }
let unlocked = false;
const unlock = () => { // iOS only speaks after a speak() inside a tap
  if (unlocked || !synth) return; unlocked = true;
  const u = new SpeechSynthesisUtterance(' '); u.volume = 0; synth.speak(u);
};
addEventListener('pointerdown', unlock, { capture: true });
addEventListener('keydown', unlock, { capture: true });
// Names Kevin was given here; he never says them out loud. The listener is "you", others "your friend".
let juryNames = [];
const spokenNames = () => ({
  you: [tester?.name, giftIn?.to, pairing?.a, pairing?.b, answering?.a, answering?.b, ...juryNames],
  others: [tester?.from, giftIn?.from]
});
function speak(said) {
  const text = forSpeech(said, spokenNames());
  return new Promise(done => {
    const fallback = () => { set('talking'); setTimeout(() => { set('idle'); done(); }, Math.min(6000, 900 + text.length * 45)); };
    if (!soundOn || !synth) return fallback();
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice;
    u.lang = voice?.lang || 'en-US'; u.rate = 1.06; u.pitch = 1.08;
    let started = false;
    u.onstart = () => { started = true; set('talking'); };
    u.onend = u.onerror = () => { set('idle'); done(); };
    synth.speak(u);
    setTimeout(() => { if (!started) { synth.cancel(); fallback(); } }, 2500); // a blocked voice never starts
  });
}

// ---- the conversation
async function send(text, face) {
  text = (text || '').trim().slice(0, 300);
  if (!text || busy) return;
  busy = true; $('send').disabled = true; document.body.classList.add('chatting'); document.body.classList.remove('fresh');
  you.textContent = ''; const b = document.createElement('b'); b.textContent = 'You: '; you.append(b, text);
  says.innerHTML = '<span class="dots" aria-label="Kevin is thinking"><i></i><i></i><i></i></span>';
  $('balloonFoot').hidden = true; $('rate').hidden = true;
  set(face === 'listening' ? 'listening' : 'thinking');
  history.push({ role: 'user', content: text });
  let reply, capped = false, notes = [];
  try {
    const j = await post('/api/roast', { messages: history.slice(tester || pairing || riffing || giftIn || roasting ? -16 : -8), ...(tester ? { tester, open: openTopics() } : giftIn && !giftIn.done ? { gift: GIFT } : pairing ? { pair: pairing } : riffing ? { riff: true } : {}) });
    if (giftIn?.from && !giftIn.revealed && history.length >= 1) { giftIn.revealed = true; setTimeout(() => toast(`It was ${giftIn.from}!`), 1800); }
    if (j.riff) { lastSame = { thing: 'riff', riff: true, line: j.riff, core: j.riff, roast: '' }; cardNo = null; }
    roasting = !tester && !pairing && /^(roast me|harder)/i.test(text) && !j.capped && !j.blocked;
    if (roasting) { const first = (j.reply.match(/^[^.!?]*[.!?]/) || [j.reply])[0]; lastSame = { thing: 'roast', riff: true, roastCard: true, line: first, core: first, roast: j.reply.slice(first.length).trim() }; cardNo = null; }
    reply = j.reply; capped = !!j.capped || !!j.slow; notes = j.notes || [];
    if (j.same && pairing) { lastSame = { ...j.same, gap: j.gap || null, core: `Same ${j.same.thing}${j.gap ? `, ${j.gap} years apart` : ''}.`, lang: j.lang || lastSame?.lang }; cardNo = null; }
    if (/quest/i.test(text) && !capped) logQuest(j.reply);
    if (!reply) throw new Error(j.error || 'empty');
  } catch (e) {
    if (e.message === 'gone') { busy = false; return; }
    reply = 'My Wi-Fi just roasted me instead. Try that again.'; capped = true;
  }
  history.push({ role: 'assistant', content: reply });
  if (lastSame && !lastSame.roast) lastSame.roast = reply.replace(/[^.!?]*\bsame [^.!?]*apart[.!?]/i, '').trim() || reply;
  if (!capped) { lastRoast = reply; set('laughing'); await sleep(650); }
  says.textContent = reply;
  if (!capped) { $('balloonFoot').hidden = false; $('report').disabled = false; $('report').textContent = 'Report'; for (const id of ['up', 'down']) $(id).setAttribute('aria-pressed', 'false'); }
  addNotes(notes);
  busy = false; $('send').disabled = false;
  if (lastSame && (pairing || lastSame.riff)) paintCard();
  paintChips();
  await speak(reply);
}
let patch = { catchphrases: [{ say: 'Riff it', face: 'laughing' }, { say: 'Roast me', face: 'laughing' }, { say: 'Riff along', face: 'listening' }, { say: 'Same what?', face: 'thinking' }, { say: 'Kevin, quest', face: 'listening' }, { say: 'Who riffed it better?', face: 'talking' }] };
function paintChips() {
  const box = $('chips'); box.textContent = '';
  const list = answering && !history.length ? [{ say: 'Answer back', face: 'laughing' }, ...patch.catchphrases.filter(c => c.say !== 'Riff it')]
    : giftIn && !history.length ? [{ say: 'Riff back', face: 'laughing' }, ...patch.catchphrases.filter(c => c.say !== 'Riff it')]
    : giftIn && !giftIn.done && history.length >= 4 ? [{ say: 'Roast us both', face: 'laughing' }, ...patch.catchphrases]
    : roasting ? [{ say: 'Harder', face: 'laughing' }, ...patch.catchphrases] : patch.catchphrases;
  for (const c of list) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = c.say; if (['Answer back', 'Riff back', 'Harder', 'Roast us both'].includes(c.say)) b.className = 'go';
    b.addEventListener('click', () => { if (c.say === 'Roast us both' && giftIn) { giftIn.done = true; pairing = { a: giftIn.to, b: giftIn.from || 'your mystery friend', shared: giftIn.shared, years: null }; document.body.classList.add('paired'); send(`Roast us both on how we watched ${giftIn.shared}.`); return; } if (c.say === 'Answer back') { paintChips.used = true; send('Answer back.'); paintChips(); } else { if (/riff along/i.test(c.say) && !tester && !pairing) riffing = true; send(c.say, c.face); } });
    box.append(b);
  }
}
paintChips();
fetch('/api/world').then(r => r.json()).then(w => {
  if (w.patch?.catchphrases?.length) { patch = w.patch; paintChips(); if (PACK?.pack) applyPack(PACK.pack); }
  if (!tester && !answering && !GIFT && !JURY && w.patch?.opener) says.textContent = w.patch.opener;
  const l = w.lore || {};
  const n = (k, one, many) => `${k || 0} ${k === 1 ? one : many}`;
  $('lore').textContent = [`Patch ${w.patch?.version || '1.0'}`, l.chains && `${n(l.chains, 'chain', 'chains')} started`, l.bridged && `${n(l.bridged, 'generation gap', 'generation gaps')} bridged`, l.languages && `${n(l.languages, 'language', 'languages')} heard`].filter(Boolean).join(' · ') + '.';
}).catch(() => {});

$('pairForm').addEventListener('submit', e => {
  e.preventDefault();
  pairing = { a: $('pA').value.trim(), b: $('pB').value.trim(), shared: $('pShared').value.trim(), years: null };
  document.body.classList.add('paired'); $('pairForm').hidden = true; shelve(pairing.b, pairing.shared);
  send(`Roast us both: me and ${pairing.b}${pairing.shared ? `. We both lived through ${pairing.shared}` : ''}.`);
});

// ---- the roast card: rendered here, numbered only when shared
async function paintCard() {
  if (!lastSame) return;
  $('cardPanel').hidden = false;
  const names = $('cNames').checked;
  $('cTitle').textContent = lastSame.riff ? `${lastSame.roastCard ? 'Roasted by Kevin' : 'Riff along'}${cardNo ? ' #' + cardNo.toLocaleString() : ''}` : `Same ${lastSame.thing}${cardNo ? ' #' + cardNo.toLocaleString() : ''}`;
  $('cSend').textContent = lastSame.roastCard ? 'Dare a friend to get roasted' : lastSame.riff ? 'Send it to one friend to riff back' : `Send it to ${pairing.b} to answer back`;
  $('cWall').hidden = !!lastSame.riff; $('cNames').parentElement.hidden = !!lastSame.riff;
  const path = names && pairing ? [...(pairing.card?.path || []), pairing.a] : [];
  const blob = await drawCard({ kev, title: $('cTitle').textContent, line: names ? lastSame.line : lastSame.core, roast: lastSame.roast, path, code: cardId, gap: lastSame.gap });
  const url = URL.createObjectURL(blob);
  $('cImg').src = url; $('cSave').href = url; paintCard.blob = blob;
}
$('cNames').addEventListener('change', paintCard);
async function numberCard() {
  if (cardNo) return;
  try { const j = await post('/api/card', { thing: lastSame.thing, years: pairing?.years, lang: lastSame.lang, depth: (pairing?.card?.path?.length || 0) + 1, parent: LINK, rel: relKind(pairing?.rel), msToShare: Date.now() - T0, text: [pairing?.a, pairing?.b, pairing?.rel, lastSame.line] }); if (j.no) { cardNo = j.no; cardId = j.id; await paintCard(); } } catch {}
}
$('cSend').addEventListener('click', async () => {
  await numberCard();
  if (!cardId) { toast("Couldn't make the link. Try again in a minute."); return; }
  if (lastSame.roastCard) { shareOrCopy('Roasted by Kevin', `Kevin roasted me: "${lastSame.line}" Your turn:`, `${HOME}/?k=${cardId}`); return; }
  if (lastSame.riff) { shareOrCopy('Riff along with Kevin', `Kevin and I riffed: "${lastSame.line}" Riff back:`, `${HOME}/?k=${cardId}`); return; }
  const names = $('cNames').checked;
  const link = cardLink(HOME, { a: pairing.a, b: pairing.b, thing: lastSame.thing, n: pairing.years, line: names ? lastSame.line : lastSame.core, path: names ? [...(pairing.card?.path || []), pairing.a] : [], no: cardNo }) + '&k=' + cardId;
  const text = `${pairing.b}, Kevin says: "${names ? lastSame.line : lastSame.core}" Answer back:`;
  const file = paintCard.blob && new File([paintCard.blob], 'kevin-roast-card.png', { type: 'image/png' });
  logQuest(`Sent the card to ${pairing.b}`);
  shareOrCopy('Kevin roasted us both', text, link, file);
});
$('cWall').addEventListener('click', async () => {
  const b = $('cWall'); b.disabled = true;
  try {
    const j = await post('/api/wall', { thing: lastSame.thing, years: pairing.years });
    if (!j.ok) throw new Error(j.error);
    b.textContent = 'On the wall'; toast(`Up on the wall: ${j.line}`);
  } catch (e) { b.disabled = false; toast(e.message && e.message.length < 80 ? e.message : "Didn't post. Try again in a minute."); }
});

// ---- quests: Kevin hands them out; sending a card to that person completes one
const quests = (() => { try { return JSON.parse(store.get('kevin-quests')) || []; } catch { return []; } })();
function logQuest(text) {
  quests.unshift({ text, at: new Date().toISOString().slice(0, 10) }); quests.length = Math.min(quests.length, 20);
  store.set('kevin-quests', JSON.stringify(quests)); paintQuests();
}
function paintQuests() {
  $('questlog').hidden = !quests.length; $('qCount').textContent = `(${quests.length})`;
  const ul = $('qList'); ul.textContent = '';
  for (const q of quests) { const li = document.createElement('li'); li.textContent = `${q.at}: ${q.text}`; ul.append(li); }
}
paintQuests();
$('type').addEventListener('submit', e => { e.preventDefault(); const t = msg.value; msg.value = ''; send(t); });

// ---- rate a line: stored only when they tap Send rating
let rating = null;
for (const id of ['up', 'down']) $(id).addEventListener('click', () => {
  rating = { up: id === 'up', line: lastRoast };
  $('up').setAttribute('aria-pressed', String(id === 'up')); $('down').setAttribute('aria-pressed', String(id === 'down'));
  $('rate').hidden = false; $('rateNote').focus();
});
$('rate').addEventListener('submit', async e => {
  e.preventDefault();
  if (!rating) return;
  const r = rating; rating = null; $('rate').hidden = true;
  if (r.up && tester && !verdict.landed.includes(r.line)) { verdict.landed.push(r.line); paintVerdict(); }
  try { const j = await post('/api/feedback', { kind: 'thumb', ...r, note: $('rateNote').value }); toast(j.ok ? 'Thanks. Kevin is taking notes.' : "Didn't send. Try again in a minute."); }
  catch { toast("Didn't send. Try again in a minute."); }
  $('rateNote').value = '';
});

// ---- share the roast
$('share').addEventListener('click', () => shareOrCopy('Kevin wants to roast you',
  lastRoast ? `Kevin roasted me: "${lastRoast}" Your turn:` : 'This little cartoon guy will roast you out loud. Try him:', HOME + '/'));

// ---- send Kevin to a friend: their own tester link
$('friendOpen').addEventListener('click', () => { $('friend').hidden = false; $('fName').focus(); });
let made = '';
$('friend').addEventListener('submit', e => {
  e.preventDefault();
  try { made = friendLink(HOME, { name: $('fName').value, loves: $('fLoves').value, age: $('fAge').value, from: tester?.name }); }
  catch { toast('Add their first name first.'); return; }
  const myAge = tester?.age, theirs = parseInt($('fAge').value, 10);
  post('/api/link', { parent: LINK, kind: 'tester', gap: myAge && theirs ? Math.abs(myAge - theirs) : null, rel: 'friend', text: [$('fName').value, $('fLoves').value, tester?.name] })
    .then(j => { if (!j.id) { toast(j.error || "Couldn't make the link. Try again in a minute."); $('fLink').hidden = true; $('fShare').hidden = true; return; } made += '&k=' + j.id; $('fLink').textContent = made; })
    .catch(() => {});
  $('fLink').textContent = made; $('fLink').hidden = false; $('fShare').hidden = false; $('fMake').textContent = 'Make it again';
});
$('fShare').addEventListener('click', () => shareOrCopy('Kevin wants to roast you',
  `${$('fName').value.trim()}, a tiny cartoon comic wants to roast you and hear what you think. Tap:`, made));

// ---- voice in: hold to talk, or tap to start and it stops when you pause
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!SR && !canRecord()) document.body.classList.add('no-voice');
// No speech recognition (Firefox), or it fails (iPhone with dictation off): record a clip for /api/hear instead.
let clipMode = false;
function useClips() {
  if (clipMode || !canRecord()) return; clipMode = true;
  const fresh = mic.cloneNode(true); mic.replaceWith(fresh);
  holdToTalk(fresh, {
    onState: st => { set(st); fresh.toggleAttribute('data-on', st === 'listening'); $('micLabel').textContent = st === 'listening' ? 'Listening' : 'Hold to talk'; },
    onText: (t, err) => { if (t) send(t); else if (err) { says.textContent = err === 'too short' ? 'Hold the button while you talk.' : err; you.textContent = ''; } }
  });
}
if (!SR) useClips();
let rec = null, heard = '', downAt = 0;
function listen() {
  if (!SR || rec || busy) return;
  if (synth) synth.cancel();
  rec = new SR(); rec.lang = 'en-US'; rec.interimResults = true; rec.continuous = false; heard = '';
  rec.onresult = e => { heard = [...e.results].map(r => r[0].transcript).join(' '); msg.value = heard; };
  rec.onerror = e => {
    if (e.error === 'service-not-allowed' || e.error === 'network') { useClips(); says.textContent = 'Hold the talk button again. I switched how I listen.'; you.textContent = ''; }
    else if (e.error === 'not-allowed') { says.textContent = "I can't hear you. Allow the microphone, or just type to me."; you.textContent = ''; }
  };
  rec.onend = () => {
    rec = null; mic.removeAttribute('data-on'); $('micLabel').textContent = 'Hold to talk';
    if (kev.dataset.s === 'listening') set('idle');
    const t = heard.trim(); msg.value = ''; if (t) send(t);
  };
  try { rec.start(); } catch { rec = null; return; }
  mic.setAttribute('data-on', ''); $('micLabel').textContent = 'Listening'; set('listening');
}
const stop = () => { if (rec) rec.stop(); };
mic.addEventListener('pointerdown', e => { e.preventDefault(); downAt = Date.now(); if (rec) stop(); else listen(); });
mic.addEventListener('pointerup', () => { if (Date.now() - downAt > 450) stop(); }); // a quick tap keeps listening until you pause
mic.addEventListener('pointercancel', stop);
mic.addEventListener('contextmenu', e => e.preventDefault());
mic.addEventListener('click', e => { if (e.detail === 0) (rec ? stop() : listen()); }); // keyboard

// ---- the app: install where the browser can, steps where it can't
if (matchMedia('(display-mode: standalone)').matches || navigator.standalone) document.body.classList.add('standalone');
let installEvent = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvent = e; });
addEventListener('appinstalled', () => { document.body.classList.add('standalone'); toast('Kevin is installed.'); });
export function osOf(ua = navigator.userAgent, touch = navigator.maxTouchPoints > 1) {
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touch)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  if (/Firefox\//.test(ua)) return 'firefox';
  if (/Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome|Chromium|Edg\//.test(ua)) return 'macsafari';
  return 'chromium';
}
$('getApp').addEventListener('click', async () => {
  if (installEvent) { installEvent.prompt(); const { outcome } = await installEvent.userChoice; installEvent = null; if (outcome === 'accepted') return; }
  const os = osOf();
  document.querySelectorAll('#installHelp li').forEach(li => li.classList.toggle('you-are-here', li.dataset.os === os));
  $('installHelp').hidden = false;
});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

// pupils follow the pointer while Kevin is idle
const pupils = kev.querySelector('.pupils');
addEventListener('pointermove', e => {
  if (kev.dataset.s !== 'idle') { pupils.style.transform = ''; return; }
  const r = kev.getBoundingClientRect();
  const dx = (e.clientX - (r.left + r.width / 2)) / r.width, dy = (e.clientY - (r.top + r.height / 2)) / r.height;
  pupils.style.transform = `translate(${Math.max(-1, Math.min(1, dx)) * 8}px, ${Math.max(-1, Math.min(1, dy)) * 8}px)`;
}, { passive: true });
new MutationObserver(() => { if (kev.dataset.s !== 'idle') pupils.style.transform = ''; }).observe(kev, { attributes: true, attributeFilter: ['data-s'] });

// ---- Report: any reply that crossed a line goes to the harm monitor at home
$('report').addEventListener('click', async () => {
  const b = $('report'); b.disabled = true;
  try { await post('/api/report', { line: lastRoast }); b.textContent = 'Reported. Thank you.'; } catch { b.disabled = false; }
});
// The ten-year leap: after a verdict is sent, the natural next step is one or two friends a decade either side.
$('vSend').addEventListener('click', () => setTimeout(() => { $('friend').hidden = false; $('friendNudge').hidden = false; }, 800));

// ==== Remixes: a style pack changes the look, language and humor; the charter stays whole ====
const PALETTES = { marigold: ['#f5b323', '#d81b60'], teal: ['#5cc8be', '#b0154f'], lilac: ['#cdb0ee', '#b0154f'], mint: ['#a3e4b9', '#b0154f'], sky: ['#9fd8fb', '#b0154f'], peach: ['#ffb38a', '#1f1206'], bubblegum: ['#ffa8cf', '#1f1206'] };
let PACK = null; // { pack, token }
function applyPack(p) {
  const [sleeve, accent] = PALETTES[p.palette] || PALETTES.marigold;
  document.documentElement.style.setProperty('--sleeve', sleeve);
  document.documentElement.style.setProperty('--pink', accent);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', sleeve);
  kev.dataset.hat = p.hat; kev.dataset.prop = p.prop;
  $('stamp').textContent = `Original Kevin ✓ · remix by ${p.maker}`;
  let r = document.querySelector('.remix'); if (!r) { r = document.createElement('span'); r.className = 'remix'; $('stamp').after(r); }
  r.textContent = `${p.name}: ${p.style}, in ${p.language}. `;
  const back = document.createElement('a'); back.href = '/?kevin=original'; back.className = 'remixback'; back.textContent = 'Back to the original Kevin'; r.append(back);
  if (p.catchphrases.length) { patch.catchphrases = [...patch.catchphrases.slice(0, 2), ...p.catchphrases.map(say => ({ say, face: 'laughing' }))]; paintChips(); }
}
(async () => {
  const q = new URLSearchParams(location.search);
  try {
    if (/^[0-9a-f]{18}$/.test(q.get('p') || '')) { const r = await fetch('/api/pack?id=' + q.get('p')); const j = await r.json(); if (j.token) { PACK = j; store.set('kevin-pack', JSON.stringify(j)); } }
    else if (q.get('kevin') === 'original') { try { localStorage.removeItem('kevin-pack'); } catch {} }
    else PACK = JSON.parse(store.get('kevin-pack') || 'null');
  } catch {}
  if (PACK?.pack) applyPack(PACK.pack);
})();

// ==== Shared experience: the Riff gift is the front door ====
const STUCK = ['a movie you quoted for a year', 'the worst movie you saw in a theater together', 'the song at every family wedding',
  'the trend you both tried', 'the game you rage-quit together', 'the group chat meme that will not die', 'a show you binged in one weekend',
  'a concert you both survived', 'the YouTuber you both still watch', 'a road trip playlist'];
function paintStuck() {
  const box = $('stuck'); box.textContent = '';
  for (const t of [...STUCK].sort(() => Math.random() - 0.5).slice(0, 3)) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = t;
    b.addEventListener('click', () => { $('gShared').placeholder = `e.g. ${t}`; $('gShared').focus(); });
    box.append(b);
  }
}
paintStuck();
$('gShared').placeholder = ['EuroTrip', 'Team America: World Police', 'Mars Attacks!', 'Anchorman', 'that one concert', 'the group chat meme'][Math.floor(Math.random() * 6)];

// The shared shelf: what you have riffed and with whom, kept only on this device.
const shelf = (() => { try { return JSON.parse(store.get('kevin-shelf')) || []; } catch { return []; } })();
function shelve(withWho, thing) {
  if (!thing) return;
  shelf.unshift({ with: withWho || 'someone', thing, at: new Date().toISOString().slice(0, 10) }); shelf.length = Math.min(shelf.length, 30);
  store.set('kevin-shelf', JSON.stringify(shelf)); paintShelf();
}
function paintShelf() {
  $('shelf').hidden = !shelf.length; $('shelfCount').textContent = `(${shelf.length})`;
  const ul = $('shelfList'); ul.textContent = '';
  for (const x of shelf) { const li = document.createElement('li'); li.textContent = `${x.thing}, with ${x.with} (${x.at})`; ul.append(li); }
}
paintShelf();
$('talkOpen').addEventListener('click', () => { document.body.classList.remove('fresh'); $('msg').focus(); });
$('pairOpen').addEventListener('click', () => { $('giftForm').hidden = true; $('pairForm').hidden = false; $('pA').focus(); });

let gift = null; // what the sender made: { token, id, riff, to, shared }
$('giftForm').addEventListener('submit', async e => {
  e.preventDefault();
  const b = $('gGo'); b.disabled = true; b.textContent = 'Kevin is riffing...'; set('thinking'); $('gStatus').textContent = '';
  try {
    const to = $('gTo').value.trim(), shared = $('gShared').value.trim();
    const j = await post('/api/gift', { to, shared, from: $('gFrom').value.trim(), reveal: $('gReveal').checked, parent: LINK });
    if (!j.token) throw new Error(j.error || "Kevin couldn't riff that one.");
    gift = { ...j, to, shared }; shelve(to, shared);
    says.textContent = j.riff; set('laughing'); setTimeout(() => set('idle'), 900);
    const blob = await drawCard({ kev, title: shared.slice(0, 22), line: `${to} and someone: same ${shared}.`, roast: j.riff, code: j.id, badge: j.n > 1 ? `Riffed with ${j.n} pairs · Roasted by Kevin` : 'Roasted by Kevin' });
    const url = URL.createObjectURL(blob);
    $('giftImg').src = url; $('giftSave').href = url; gift.blob = blob;
    $('giftTitle').textContent = `Your Riff gift for ${to}`; $('giftSend').textContent = `Send it to ${to}`;
    $('giftPanel').hidden = false; $('giftPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) { if (err.message !== 'gone') $('gStatus').textContent = err.message.length < 200 ? err.message : 'Kevin is catching his breath. Try again in a minute. Your gift is still filled in.'; set('idle'); }
  b.disabled = false; b.textContent = 'Make the Riff gift';
});
$('giftSend').addEventListener('click', () => {
  if (!gift) return;
  const file = gift.blob && new File([gift.blob], 'kevin-riff-gift.png', { type: 'image/png' });
  logQuest(`Sent a Riff gift about ${gift.shared}`);
  shareOrCopy('A Riff gift from Kevin', `${gift.to}, someone who watched ${gift.shared} with you sent you Kevin. Guess who:`, `${HOME}/?g=${gift.token}&k=${gift.id}`, file);
});

// ---- receiving a gift: the mystery, then riff back on the same thing
if (GIFT) {
  document.body.classList.add('receiving');
  says.textContent = 'Opening your Riff gift...';
  fetch(`/api/gift?g=${encodeURIComponent(GIFT)}`).then(async r => {
    const j = await r.json(); if (r.status === 410) return goneNow(j);
    if (!j.riff) { says.textContent = "This gift link got changed on the way, so Kevin won't open it. Ask the person who sent it for a fresh link, or make your own."; document.body.classList.remove('receiving'); $('gTo').focus(); return; }
    giftIn = j; shelve(j.from || 'a mystery friend', j.shared);
    you.textContent = '';
    says.textContent = `${j.to}, someone who watched ${j.shared} with you sent you Kevin. Here's my riff: ${j.riff} Who do you think sent it? Tap Riff back and tell me.`;
    paintChips();
  }).catch(() => { says.textContent = 'This gift did not open. Try the link again.'; });
}

// ==== The jury: let 3 friends decide who riffed it better ====
let juryMine = (() => { try { return JSON.parse(store.get('kevin-jury')); } catch { return null; } })();
$('cJury').addEventListener('click', async () => {
  try {
    const j = await post('/api/jury', { a: pairing.a, b: pairing.b, line: lastSame.line, parent: LINK, q: 'roast' });
    if (!j.token) throw new Error(j.error);
    juryMine = { token: j.token, id: j.id }; store.set('kevin-jury', JSON.stringify(juryMine));
    logQuest(`Called a jury on ${pairing.a} vs ${pairing.b}`);
    shareOrCopy('Kevin needs a jury', `Who got roasted harder, ${pairing.a} or ${pairing.b}? One tap, you decide:`, `${HOME}/?j=${j.token}&k=${j.id}`);
    setTimeout(() => toast('Send it to up to 3 people. Two votes decide it.'), 2600);
  } catch (e) { if (e.message !== 'gone') toast("Couldn't call the jury. Try again in a minute."); }
});
async function juryStatus(token, mine) {
  const r = await fetch(`/api/jury?j=${encodeURIComponent(token)}`);
  const j = await r.json(); if (r.status === 410) return goneNow(j);
  if (!j.a) { says.textContent = 'This jury link got changed on the way. Ask whoever sent it for a fresh one, or start your own Riff gift below.'; document.body.classList.remove('jury'); return; }
  paintJury(j, token, mine);
}
function paintJury(j, token, mine) {
  juryNames = [j.a, j.b];
  $('juryPanel').hidden = false;
  $('juryLine').textContent = `Kevin's line: "${j.line}"`;
  const verb = j.q === 'roast' ? 'got roasted harder' : 'riffed it better';
  $('juryTitle').textContent = j.q === 'roast' ? 'Who got roasted harder?' : 'Who riffed it better?';
  $('voteA').textContent = `${j.a} ${verb}`; $('voteB').textContent = `${j.b} ${verb}`;
  $('juryVote').hidden = !!j.decided || mine || voted(token);
  $('juryTally').textContent = j.decided ? `Decided: ${j.winner}, ${Math.max(j.votes.a, j.votes.b)} votes to ${Math.min(j.votes.a, j.votes.b)}.` : `Votes so far: ${j.a} ${j.votes.a}, ${j.b} ${j.votes.b}. Two votes decide it.`;
  if (j.ruling) {
    says.textContent = `Kevin's ruling: ${j.ruling}`;
    drawCard({ kev, title: "Kevin's ruling", line: `${j.winner} ${verb}.`, roast: j.ruling, code: j.id }).then(blob => {
      const url = URL.createObjectURL(blob); $('rulingImg').src = url; $('rulingImg').hidden = false; $('rulingShare').hidden = false; paintJury.blob = blob;
    });
  }
  $('juryStart').hidden = mine || !(j.decided || voted(token));
}
const voted = token => { try { return (JSON.parse(store.get('kevin-voted')) || []).includes(token.slice(-12)); } catch { return false; } };
for (const side of ['a', 'b']) $('vote' + side.toUpperCase()).addEventListener('click', async () => {
  try {
    const j = await post('/api/jury', { vote: JURY, pick: side });
    const list = (() => { try { return JSON.parse(store.get('kevin-voted')) || []; } catch { return []; } })();
    list.push(JURY.slice(-12)); store.set('kevin-voted', JSON.stringify(list.slice(-50)));
    paintJury(j, JURY, false);
  } catch {}
});
$('rulingShare').addEventListener('click', () => shareOrCopy("Kevin's ruling", $('says').textContent, HOME + '/', paintJury.blob && new File([paintJury.blob], 'kevins-ruling.png', { type: 'image/png' })));
$('juryStart').addEventListener('click', () => { document.body.classList.remove('jury'); $('juryPanel').hidden = true; $('giftForm').hidden = false; $('gTo').focus(); });
if (JURY) {
  document.body.classList.add('jury');
  says.textContent = 'You are on the jury. Read the line, then one tap.';
  juryStatus(JURY, false).catch(() => {});
} else if (juryMine) {
  // a player who called a jury sees the verdict and Kevin's ruling when it lands
  fetch(`/api/jury?j=${encodeURIComponent(juryMine.token)}`).then(r => r.json()).then(j => { if (j.decided) paintJury(j, juryMine.token, true); }).catch(() => {});
}

// A card made from desktop Kevin riffing what's playing: ?riffcard=<title>&line=<his riff>
{
  const q = new URLSearchParams(location.search), title = (q.get('riffcard') || '').slice(0, 60), line = (q.get('line') || '').slice(0, 300);
  if (title && line) {
    document.body.classList.remove('fresh');
    lastSame = { thing: 'riff', riff: true, line, core: line, roast: '' }; cardNo = null;
    says.textContent = `Your riff card on ${title}. Send it to someone who watched it with you.`;
    setTimeout(paintCard, 300);
  }
}
