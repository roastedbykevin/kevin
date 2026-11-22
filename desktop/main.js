// Desktop Kevin: a frameless, transparent, always-on-top window that shows the live https://roastedbykevin.com/sprite.
// Same brain, charter and safety as the site (nothing of Kevin runs locally). No secrets, no file access beyond its own
// small settings file, every permission denied (no mic, camera or location), and links open in the normal browser.
const { app, BrowserWindow, Tray, Menu, shell, clipboard, session, screen } = require('electron');
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
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false }
  });
  win.setAlwaysOnTop(true, 'floating');
  win.on('moved', () => { state.bounds = win.getBounds(); save(state); });
  // Only Kevin's own pages load here; anything else opens in the person's browser.
  win.webContents.setWindowOpenHandler(({ url }) => { if (url.startsWith('https://')) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(HOME + '/sprite')) { e.preventDefault(); if (url.startsWith('https://')) shell.openExternal(url); } });
  win.loadURL(spriteUrl());
}

function menu() {
  return Menu.buildFromTemplate([
    { label: 'Show Kevin', click: () => { win.showInactive(); } },
    { label: 'Hide Kevin', click: () => win.hide() },
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

// Smoke test: hidden window, the live sprite must load Kevin's face, then exit 0 (1 on failure). No sound (smoke=1).
async function smoke() {
  const t0 = Date.now();
  await new Promise(r => win.webContents.once('did-finish-load', r));
  for (let i = 0; i < 40; i++) {
    const ok = await win.webContents.executeJavaScript('!!(window.kevinReady && document.getElementById("kev"))').catch(() => false);
    if (ok) { console.log(`SMOKE OK: ${spriteUrl()} loaded Kevin in ${Date.now() - t0} ms`); app.exit(0); return; }
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
  if (SMOKE) { smoke(); return; }
  tray = new Tray(path.join(__dirname, process.platform === 'darwin' ? 'tray-16.png' : 'tray.png'));
  tray.setToolTip('Kevin'); tray.setContextMenu(menu());
});
app.on('window-all-closed', () => app.quit());
