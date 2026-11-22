// Desktop Kevin: a frameless, transparent, always-on-top window that shows the live https://roastedbykevin.com/sprite.
// Same brain, charter and safety as the site (nothing of Kevin runs locally). No secrets, no file access beyond its own
// small settings file, every permission denied except the mic as described below, and links open in the normal browser.
// "Hey Kevin" is opt-in (off by default): a hidden local ear window with no network scores the mic on this computer
// and drops the audio; only what is said right after the wake goes to Kevin's page, like a hold-to-talk clip.
// Now playing is opt-in (one switch): only a title, an allow-listed app and play state are read, and only sent to
// Kevin's own page, which sends them only to roastedbykevin.com/api.
const { app, BrowserWindow, Tray, Menu, shell, clipboard, session, screen, ipcMain, globalShortcut, systemPreferences, powerMonitor } = require('electron');
const { nowPlaying } = require('./media');
const path = require('path');
const fs = require('fs');

const HOME = 'https://roastedbykevin.com';
const SMOKE = process.env.KEVIN_SMOKE === '1';
const W = 220, H = 260;
const stateFile = () => path.join(app.getPath('userData'), 'kevin.json');
const load = () => { try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch { return {}; } };
const save = s => { try { fs.writeFileSync(stateFile(), JSON.stringify(s)); } catch {} };
let state = {}, win = null, tray = null;

// A tester or friend link carries over: only its Kevin parameters, and only from Kevin's own home.
const KEEP = ['for', 'loves', 'age', 'from', 'k', 'p'];
function spriteUrl() {
  const q = new URLSearchParams({ app: '1', ...(SMOKE ? { smoke: '1' } : {}) });
  for (const [k, v] of Object.entries(state.link || {})) if (KEEP.includes(k)) q.set(k, v);
  return `${HOME}/sprite?${q}`;
}

function create() {
  const area = screen.getPrimaryDisplay().workArea;
  const b = state.bounds && state.bounds.x != null ? state.bounds : { x: area.x + area.width - W - 24, y: area.y + area.height - H - 24 };
  win = new BrowserWindow({
    x: b.x, y: b.y, width: W, height: H, frame: false, transparent: true, resizable: false, alwaysOnTop: true,
    skipTaskbar: true, hasShadow: false, show: false, // hidden until something plays or he is called backgroundColor: '#00000000', title: 'Kevin',
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false, preload: path.join(__dirname, 'preload.js') }
  });
  win.setAlwaysOnTop(true, 'floating');
  win.on('moved', () => { state.bounds = win.getBounds(); save(state); });
  // Only Kevin's own pages load here; anything else opens in the person's browser.
  win.webContents.setWindowOpenHandler(({ url }) => { if (url.startsWith('https://')) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(HOME + '/sprite')) { e.preventDefault(); if (url.startsWith('https://')) shell.openExternal(url); } });
  win.webContents.on('did-finish-load', () => { last = ''; }); // a fresh page hears the current title on the next poll
  win.loadURL(spriteUrl());
}

function menu() {
  return Menu.buildFromTemplate([
    { label: process.platform === 'darwin' ? 'Call Kevin (Cmd+Shift+K)' : 'Call Kevin (Ctrl+Shift+K)', click: call },
    { label: 'Hide Kevin', click: () => win.hide() },
    { label: "Let Kevin see what's playing", type: 'checkbox', checked: state.media === true, click: item => { state.media = item.checked; save(state); if (!item.checked) send(null); } },
    { label: 'Not during this', click: () => win.webContents.executeJavaScript("document.getElementById('notThis') && document.getElementById('notThis').click()").catch(() => {}) },
    { label: 'Mute Kevin', type: 'checkbox', checked: !!state.muted, click: item => { state.muted = item.checked; save(state); win.webContents.executeJavaScript(`window.kevinMute && window.kevinMute(${item.checked})`).catch(() => {}); } },
    { label: "Let Kevin listen for 'Hey Kevin'", type: 'checkbox', checked: state.wake === true, click: item => setWake(item.checked) },
    { label: 'Quiet for an hour', click: () => { quietUntil = Date.now() + 3600000; earSync(); win.webContents.executeJavaScript('window.kevinQuiet && window.kevinQuiet(3600000)').catch(() => {}); } },
    { label: 'Use my Kevin link (copy it first)', click: () => {
      try {
        const u = new URL(clipboard.readText().trim());
        if (u.hostname !== 'roastedbykevin.com' && u.hostname !== 'www.roastedbykevin.com') return;
        state.link = Object.fromEntries([...u.searchParams].filter(([k]) => KEEP.includes(k))); save(state); win.loadURL(spriteUrl());
      } catch {}
    } },
    { type: 'separator' },
    { label: 'Start when I log in', type: 'checkbox', checked: !!state.openAtLogin, click: item => {
      state.openAtLogin = item.checked; save(state);
      app.setLoginItemSettings({ openAtLogin: item.checked, path: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath });
    } },
    { label: 'About Kevin', click: () => shell.openExternal(`${HOME}/install`) },
    { type: 'separator' },
    { label: 'Quit', role: 'quit' }
  ]);
}

// ---- hidden until there's something to riff: he comes out when media plays or when called, and tucks away after
let playing = false, hideT = 0, calledAt = 0;
function call() { calledAt = Date.now(); clearTimeout(hideT); win.showInactive(); win.focus(); win.webContents.executeJavaScript('window.kevinCall && window.kevinCall()').catch(() => {}); }
function comeOut() { if (SMOKE) return; clearTimeout(hideT); if (!win.isVisible()) win.showInactive(); }
function tuckAway() {
  win.webContents.executeJavaScript('window.kevinCredits && window.kevinCredits()').catch(() => {});
  clearTimeout(hideT); hideT = setTimeout(() => { if (!playing && Date.now() - calledAt > 120000) win.hide(); }, 6000);
}

// ---- the mic opens only for one press of the talk button: the page arms it, and only an audio request within the
// next 5 seconds is allowed. Everything else (camera, location, notifications...) is always denied.
let armedUntil = 0, micOn = false;
ipcMain.handle('mic:arm', async () => {
  // macOS asks once (the first hold of Talk); a "no" can be changed in Privacy & Security, Microphone
  if (process.platform === 'darwin' && systemPreferences.getMediaAccessStatus('microphone') === 'not-determined') await systemPreferences.askForMediaAccess('microphone');
  armedUntil = Date.now() + 5000; return true;
});
ipcMain.on('mic:state', (_e, on) => { micOn = !!on; dot(); });
// The tray says what the mic is doing: ● Kevin is recording you, ◦ he is only listening for "Hey Kevin".
function dot() {
  if (!tray) return;
  const rec = micOn || earRec;
  const t = rec ? 'Kevin is listening' : ear && earLive ? "Kevin is listening for 'Hey Kevin'" : 'Kevin';
  tray.setToolTip(t); if (process.platform === 'darwin') tray.setTitle(rec ? '●' : ear && earLive ? '◦' : '');
}

// ---- "Hey Kevin": the ear window exists only while the switch is on and Kevin isn't quieted. Closing it stops the mic.
const EAR_FIXTURE = process.env.KEVIN_EAR_FIXTURE || ''; // tests only: a 16 kHz wav fed to the ear instead of the mic
let ear = null, earLive = false, earRec = false, quietUntil = 0, quietT = 0;
async function setWake(on) {
  if (on && process.platform === 'darwin' && systemPreferences.getMediaAccessStatus('microphone') !== 'granted') on = await systemPreferences.askForMediaAccess('microphone');
  state.wake = !!on; save(state); if (tray) tray.setContextMenu(menu()); earSync();
}
function earSync() {
  const want = (state.wake === true || !!EAR_FIXTURE) && Date.now() >= quietUntil;
  if (want && !ear) {
    const s = session.fromPartition('kevin-ear'); // its own in-memory session: no network at all, mic only
    s.webRequest.onBeforeRequest((d, cb) => cb({ cancel: !d.url.startsWith('file://') }));
    s.setPermissionRequestHandler((_wc, perm, cb, details) => cb(perm === 'media' && (details?.mediaTypes || ['audio']).every(t => t === 'audio')));
    s.setPermissionCheckHandler((_wc, perm, _o, details) => perm === 'media' && (!details?.mediaType || details.mediaType === 'audio'));
    ear = new BrowserWindow({ show: false, width: 100, height: 100, skipTaskbar: true, webPreferences: { session: s, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, preload: path.join(__dirname, 'ear-preload.js') } });
    ear.loadFile(path.join(__dirname, 'ear.html'));
    ear.webContents.on('render-process-gone', () => { if (ear && !ear.isDestroyed()) ear.close(); });
    // closing ends any recording in progress (the page leaves "listening"), and reopens if it should still listen
    ear.on('closed', () => { ear = null; earLive = false; if (earRec) { earRec = false; win.webContents.send('heard', null); } dot(); setTimeout(earSync, 1000); });
  }
  if (!want && ear) ear.close();
  clearTimeout(quietT); if (state.wake && quietUntil > Date.now()) quietT = setTimeout(earSync, quietUntil - Date.now() + 500);
  dot();
}
ipcMain.handle('ear:threshold', () => Number(process.env.KEVIN_WAKE_THRESHOLD) || null); // null: wake.js's tested default
ipcMain.handle('ear:fixture?', () => !!EAR_FIXTURE);
ipcMain.on('ear:ready', e => {
  earLive = true; dot();
  if (EAR_FIXTURE) (async () => {
    // the ear must have no network: a request from it to Kevin's own site has to fail
    const net = await e.sender.executeJavaScript("fetch('https://roastedbykevin.com/api/hello').then(() => 'reached', () => 'blocked')").catch(() => 'blocked');
    if (net !== 'blocked') { console.log('SMOKE FAIL: the ear reached the network'); app.exit(1); return; }
    console.log('SMOKE ear has no network');
    const b = fs.readFileSync(EAR_FIXTURE), d = b.indexOf('data') + 8; e.sender.send('ear:fixture', b.buffer.slice(b.byteOffset + d, b.byteOffset + b.length - ((b.length - d) % 2)));
  })();
});
// The mic was refused: turn the switch off and say so. Anything else (device gone, model error): reopen in a few seconds.
let earFails = 0, lastFail = 0;
ipcMain.on('ear:failed', (_e, why) => {
  earLive = false; dot();
  if (SMOKE) { console.log('SMOKE FAIL: ear: ' + why); app.exit(1); return; }
  if (Date.now() - lastFail > 600000) earFails = 0; // only failures close together count
  lastFail = Date.now();
  if (/^denied/.test(why) || ++earFails > 3) {
    state.wake = false; save(state); if (tray) tray.setContextMenu(menu());
    win.webContents.executeJavaScript(`window.kevinSay && window.kevinSay(${JSON.stringify(/^denied/.test(why) ? "I can't hear you. To use 'Hey Kevin', allow the microphone for Kevin in your settings." : "My ear stopped working, so 'Hey Kevin' is off. Hold Talk instead.")})`).catch(() => {});
  }
  if (ear && !ear.isDestroyed()) ear.close();
});
let wokeAt = 0;
ipcMain.on('ear:woke', (_e, score) => {
  wokeAt = Date.now(); earRec = true; dot();
  if (SMOKE) console.log(`SMOKE wake at score ${score.toFixed(3)}`);
  if (!SMOKE) { calledAt = Date.now(); clearTimeout(hideT); win.showInactive(); }
  win.webContents.executeJavaScript('window.kevinWoke && window.kevinWoke()').catch(() => {});
});
ipcMain.on('ear:heard', (_e, clip) => {
  earRec = false; dot();
  if (SMOKE && EAR_FIXTURE) {
    const ok = clip && clip.byteLength > 16044 && Buffer.from(clip.slice(0, 4)).toString() === 'RIFF' && new DataView(clip).getUint32(24, true) === 16000;
    console.log(ok ? `SMOKE OK: woke on "Hey Kevin" and handed over a ${((clip.byteLength - 44) / 32000).toFixed(1)} s 16 kHz wav` : 'SMOKE FAIL: the clip is not a 16 kHz wav'); app.exit(ok ? 0 : 1); return;
  }
  win.webContents.send('heard', Date.now() - wokeAt < 15000 && clip && clip.byteLength > 1200 ? clip : null); // null: nothing usable, leave "listening"
});
const micAllowed = (perm, details) => perm === 'media' && Date.now() < armedUntil && (details?.mediaTypes || ['audio']).every(t => t === 'audio');

// ---- now playing: poll the allow-listed apps every 8 s while the switch is on; tell the page only when it changes
let last = '';
const send = m => { const k = JSON.stringify(m); if (k !== last && win && !win.isDestroyed()) { last = k; win.webContents.send('media', m ? { title: m.title, app: m.app, playing: m.playing, fullscreen: !!m.fullscreen } : null); } };
let slidFor = '';
async function poll() {
  if (state.media === true || process.env.KEVIN_MOCK_MEDIA) {
    const m = await nowPlaying().catch(() => null);
    send(m && m.title ? m : null);
    const now = !!(m && m.title && m.playing && !m.fullscreen);
    if (now && !playing) comeOut();
    if (!now && playing && !(m && m.fullscreen)) tuckAway();
    playing = now;
    // Slide next to the playing window when a new title starts (Windows tells us where it is; Mac stays put).
    if (m && m.rect && m.playing && !m.fullscreen && m.title !== slidFor && win.isVisible()) {
      slidFor = m.title;
      const area = screen.getDisplayNearestPoint({ x: m.rect[2], y: m.rect[3] }).workArea;
      const x = Math.max(area.x, Math.min(m.rect[2] - W - 12, area.x + area.width - W)), y = Math.max(area.y, Math.min(m.rect[3] - H - 12, area.y + area.height - H));
      win.setBounds({ x, y, width: W, height: H }, true);
    }
  }
  setTimeout(poll, 8000);
}
ipcMain.handle('consent:get', () => (state.media === true ? true : state.media === false ? false : null));
ipcMain.handle('consent:set', (_e, v) => { state.media = !!v; save(state); if (tray) tray.setContextMenu(menu()); if (!v) send(null); return state.media; });

// Smoke test: hidden window, the live sprite must load Kevin's face, then exit 0 (1 on failure). No sound (smoke=1).
async function smoke() {
  const t0 = Date.now();
  await new Promise(r => win.webContents.once('did-finish-load', r));
  for (let i = 0; i < 40; i++) {
    const ok = await win.webContents.executeJavaScript('!!(window.kevinReady && document.getElementById("kev"))').catch(() => false);
    if (ok && !process.env.KEVIN_MOCK_MEDIA) { console.log(`SMOKE OK: ${spriteUrl()} loaded Kevin in ${Date.now() - t0} ms`); app.exit(0); return; }
    if (ok) { // with mocked now-playing data: Kevin must riff the mocked title through the live brain
      for (let k = 0; k < 60; k++) {
        const riff = await win.webContents.executeJavaScript('window.kevinLastMediaRiff || ""').catch(() => '');
        if (riff) { console.log(`SMOKE OK: Kevin riffed the mocked "${JSON.parse(process.env.KEVIN_MOCK_MEDIA).title || 'title'}": ${riff.slice(0, 140)}`); app.exit(0); return; }
        await new Promise(r => setTimeout(r, 1000));
      }
      console.log('SMOKE FAIL: no riff on the mocked title'); app.exit(1); return;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  console.log('SMOKE FAIL: Kevin did not load'); app.exit(1);
}

if (!SMOKE && !app.requestSingleInstanceLock()) app.quit();
app.whenReady().then(() => {
  if (SMOKE && process.platform === 'darwin') app.dock?.hide();
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb, details) => cb(micAllowed(perm, details)));
  session.defaultSession.setPermissionCheckHandler((_wc, perm) => perm === 'media' && Date.now() < armedUntil);
  state = load();
  if (!SMOKE && process.platform === 'darwin') app.dock?.hide(); // a menu-bar app, not a dock app
  create();
  setTimeout(poll, 1500);
  if (EAR_FIXTURE) { earSync(); setTimeout(() => { console.log('SMOKE FAIL: no wake on the fixture'); app.exit(1); }, 90000); return; }
  if (SMOKE) { smoke(); return; }
  earSync();
  powerMonitor.on('resume', () => { if (ear && !ear.isDestroyed()) ear.close(); else earSync(); });
  if (state.media == null) win.once('ready-to-show', () => win.showInactive()); // first run: show the one consent question
  if (state.muted) win.webContents.once('did-finish-load', () => win.webContents.executeJavaScript('window.kevinMute && window.kevinMute(true)').catch(() => {}));
  globalShortcut.register('CommandOrControl+Shift+K', call);
  tray = new Tray(path.join(__dirname, process.platform === 'darwin' ? 'tray-16.png' : 'tray.png'));
  tray.setToolTip('Kevin'); tray.setContextMenu(menu());
  tray.on('click', call);
});
app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => globalShortcut.unregisterAll());
