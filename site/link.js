// Tester links: ?for=<first name>&age=<n>&loves=<one thing>&from=<who sent it>. Shared by the page and the tests.
const name = s => String(s || '').replace(/[^\p{L}' -]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 20);
const thing = s => String(s || '').replace(/[^\p{L}\p{N} ,&'.-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 60);

export function readTester(search) {
  const q = new URLSearchParams(search);
  const n = name(q.get('for'));
  if (!n) return null;
  const a = parseInt(q.get('age'), 10);
  return { name: n, age: a >= 13 && a <= 99 ? a : null, loves: thing(q.get('loves')), from: name(q.get('from')) };
}

export function friendLink(origin, { name: n, loves, age, from }) {
  const q = new URLSearchParams();
  if (!name(n)) throw new Error('first name needed');
  q.set('for', name(n));
  if (thing(loves)) q.set('loves', thing(loves));
  const a = parseInt(age, 10);
  if (a >= 13 && a <= 99) q.set('age', String(a));
  if (name(from)) q.set('from', name(from));
  return origin.replace(/\/+$/, '') + '/?' + q.toString();
}

// Answer-back links: ?c=<base64url JSON>. The two first names ride in the link (the game needs them); the card's
// line and lineage path carry names only when the players allowed it. Nothing of this is stored on the server.
const b64 = s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = s => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
const line = s => String(s || '').replace(/[^\p{L}\p{N} ,'.:!?-]/gu, '').trim().slice(0, 120);

export function cardLink(origin, { a, b, thing: th, n, line: l, path = [], no }) {
  const c = { a: name(a), b: name(b), t: thing(th).toLowerCase(), l: line(l), p: path.map(name).filter(Boolean).slice(-6) };
  if (!c.a || !c.b || !c.t || !c.l) throw new Error('card needs both names, the thing and the line');
  const y = parseInt(n, 10); if (y >= 1 && y <= 90) c.n = y;
  if (Number.isInteger(no) && no > 0) c.no = no;
  return origin.replace(/\/+$/, '') + '/?c=' + b64(JSON.stringify(c));
}

export function readCard(search) {
  try {
    const c = JSON.parse(unb64(new URLSearchParams(search).get('c') || ''));
    const out = { a: name(c.a), b: name(c.b), thing: thing(c.t).toLowerCase(), line: line(c.l), path: (Array.isArray(c.p) ? c.p : []).map(name).filter(Boolean).slice(-6) };
    if (!out.a || !out.b || !out.thing || !out.line) return null;
    const y = parseInt(c.n, 10); out.n = y >= 1 && y <= 90 ? y : null;
    out.no = Number.isInteger(c.no) && c.no > 0 ? c.no : null;
    return out;
  } catch { return null; }
}

// Kevin's one home, and the three lines every share carries after its link: why, how to install, why it's safe.
export const HOME = 'https://roastedbykevin.com';
export const SHARE_LINES = [
  'A roast comic who riffs the craft, never you. Takes 30 seconds.',
  'Open the link, tap Get the Kevin app.',
  'Nothing you say is saved. The real Kevin lives only at roastedbykevin.com; check the stamp.'
];
export const shareText = (text, url) => `${text} ${url}\n\n${SHARE_LINES.join('\n')}`;
// /verify: only Kevin's own host is the original.
export function isOriginal(link) {
  try { const u = new URL(String(link).trim()); return u.protocol === 'https:' && (u.hostname === 'roastedbykevin.com' || u.hostname === 'www.roastedbykevin.com'); }
  catch { return false; }
}
