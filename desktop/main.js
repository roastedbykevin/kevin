// Desktop Kevin: a frameless, transparent, always-on-top window that shows the live https://roastedbykevin.com/sprite.
// Same brain, charter and safety as the site (nothing of Kevin runs locally). No secrets, no file access beyond its own
// small settings file, every permission denied (no mic, camera or location), and links open in the normal browser.
// Now playing is opt-in (one switch): only a title, an allow-listed app and play state are read, and only sent to
// Kevin's own page, which sends them only to roastedbykevin.com/api.
const { app, BrowserWindow, Tray, Menu, shell, clipboard, session, screen, ipcMain } = require('electron');
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
    skipTaskbar: true, hasShadow: false, show: !SMOKE, backgroundColor: '#00000000', title: 'Kevin',
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
    { label: 'Show Kevin', click: () => { win.showInactive(); } },
    { label: 'Hide Kevin', click: () => win.hide() },
    { label: "Let Kevin see what's playing", type: 'checkbox', checked: state.media === true, click: item => { state.media = item.checked; save(state); if (!item.checked) send(null); } },
    { label: 'Not during this', click: () => win.webContents.executeJavaScript("document.getElementById('notThis') && document.getElementById('notThis').click()").catch(() => {}) },
    { label: 'Quiet for an hour', click: () => win.webContents.executeJavaScript('window.kevinQuiet && window.kevinQuiet(3600000)').catch(() => {}) },
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

// ---- now playing: poll the allow-listed apps every 8 s while the switch is on; tell the page only when it changes
let last = '';
const send = m => { const k = JSON.stringify(m); if (k !== last && win && !win.isDestroyed()) { last = k; win.webContents.send('media', m ? { title: m.title, app: m.app, playing: m.playing, fullscreen: !!m.fullscreen } : null); } };
let slidFor = '';
async function poll() {
  if (state.media === true || process.env.KEVIN_MOCK_MEDIA) {
    const m = await nowPlaying().catch(() => null);
    send(m && m.title ? m : null);
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
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false)); // no mic, camera, location, notifications
  state = load();
  if (!SMOKE && process.platform === 'darwin') app.dock?.hide(); // a menu-bar app, not a dock app
  create();
  setTimeout(poll, 1500);
  if (SMOKE) { smoke(); return; }
  tray = new Tray(path.join(__dirname, process.platform === 'darwin' ? 'tray-16.png' : 'tray.png'));
  tray.setToolTip('Kevin'); tray.setContextMenu(menu());
});
app.on('window-all-closed', () => app.quit());
